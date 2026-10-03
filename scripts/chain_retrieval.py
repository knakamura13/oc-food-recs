"""Bounded, cached public lookup and same-publisher branch acquisition.

Every discovered URL is a retrieval hint, never verified business identity.
"""
from __future__ import annotations
import concurrent.futures
import hashlib
import ipaddress
import json
import re
import time
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit, urldefrag, parse_qsl, urlunsplit
import requests
from chain_scorer import website_domain, name_tokens
from chain_sources import public_url, website_text, write_json

MAX_PAGES = 12
MAX_DEPTH = 2
HEADERS = {'User-Agent': 'OCFoodRecs-research/1.0 (https://github.com/knakamura13/oc-food-recs)'}


def candidate_domain(url):
    try:
        p = urlsplit(url)
    except ValueError:
        return None
    if p.scheme not in {'http', 'https'} or not p.hostname or p.username or p.password:
        return None
    if p.hostname == 'localhost' or p.hostname.endswith(('.local', '.localhost')):
        return None
    try:
        if not ipaddress.ip_address(p.hostname).is_global:
            return None
    except ValueError:
        pass
    return website_domain(url)


def fetch_document(url, cache):
    path = cache / 'retrieval-v1' / (hashlib.sha256(url.encode()).hexdigest()+'.json')
    if path.exists():
        return json.loads(path.read_text())
    record = {'requested_url': url, 'fetched_at': time.time()}
    try:
        current = url
        for _ in range(5):
            public_url(current)
            with requests.get(current, headers=HEADERS, timeout=(8,15),
                allow_redirects=False, stream=True) as response:
                if response.is_redirect:
                    current = urljoin(current,response.headers['Location'])
                    continue
                response.raise_for_status()
                if not any(t in response.headers.get('Content-Type','').lower()
                    for t in ('xml','html','text')):
                    raise ValueError('Nontext retrieval document')
                chunks=[]; size=0
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > 1_000_000:
                        raise ValueError('Oversized retrieval document')
                    chunks.append(chunk)
                record.update(url=current,body=b''.join(chunks).decode('utf-8'))
                break
        else:
            raise ValueError('Too many retrieval redirects')
    except Exception as exc:
        record['error'] = type(exc).__name__+': '+str(exc)
    write_json(path,record)
    return record


def lookup_websites(row, cache):
    query = ' '.join(str(x) for x in ('"'+row['name'].replace('"','')+'"',row.get('location'),
        'restaurant official website locations') if x)
    url = 'https://www.bing.com/search?'+urlencode({'q':query,'format':'rss'})
    document = fetch_document(url,cache)
    record = {'query':query,'lookup_url':url,'identity_verified':False,'urls':[],
        'document':document}
    if document.get('error'):
        record['error']=document['error']; return record
    try:
        root = ET.fromstring(document['body'])
        domains=set()
        for item in root.findall('./channel/item')[:10]:
            link=item.findtext('link') or ''
            domain=candidate_domain(link)
            title_tokens=set(name_tokens(item.findtext('title') or ''))
            if not name_tokens(row['name']) or not set(name_tokens(row['name'])) <= title_tokens:
                continue
            if domain and domain not in domains:
                domains.add(domain); record['urls'].append(urldefrag(link)[0])
                if len(domains)==3:break
        if not record['urls']:
            record['error']='No candidate URLs in search response'
    except (ET.ParseError,KeyError,ValueError) as exc:
        record['error']=type(exc).__name__+': '+str(exc)
    return record


def location_link(url):
    p=urlsplit(url).path.lower().rstrip('/')
    return bool(re.search(r'/(?:locations?|stores?|our-locations|our-cafes)(?:/|$)',p)) and not re.search(r'/(?:menu|menus|order|catering)(?:/|$)',p)


def sitemap_links(publisher, cache):
    domain=candidate_domain(publisher)
    root=urlsplit(publisher); url=root.scheme+'://'+root.netloc+'/sitemap.xml'
    links=set(); pending=[url]; seen=set()
    for _ in range(2):
        children=[]
        for source in pending:
            if source in seen:continue
            seen.add(source)
            doc=fetch_document(source,cache)
            # A cross-publisher redirect cannot supply this site's sitemap.
            if doc.get('error') or candidate_domain(doc.get('url',source))!=domain:continue
            try:tree=ET.fromstring(doc.get('body',''))
            except ET.ParseError:continue
            is_index=tree.tag.rsplit('}',1)[-1]=='sitemapindex'
            for el in tree.iter():
                if el.tag.rsplit('}',1)[-1]!='loc' or not el.text:continue
                target=urldefrag(el.text.strip())[0]
                if candidate_domain(target)!=domain:continue
                if is_index:children.append(target)
                elif location_link(target):links.add(target)
        pending=sorted(set(children),key=lambda u:(not bool(re.search('location|page',u)),u))[:2]
    return sorted(links)[:24]


def canonical_url(url):
    """Drop only known analytics parameters, preserving functional queries."""
    p = urlsplit(urldefrag(url)[0])
    query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
        if k.lower() not in {'_gl', 'gclid', 'fbclid'}
        and not k.lower().startswith('utm_')]
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(query), ''))


def crawl_websites(urls, cache, workers):
    seen = set()
    requests_by_domain = Counter()
    publisher_pages = Counter()
    aliases = {}
    pages = []
    pending = sorted({canonical_url(u) for u in urls if candidate_domain(u)})
    publishers = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for depth in range(MAX_DEPTH + 1):
            following = set()
            # Learn each redirect alias before admitting another URL from it.
            while pending:
                batch = []
                deferred = []
                batch_domains = set()
                for url in pending:
                    domain = candidate_domain(url)
                    publisher = aliases.get(domain, domain)
                    if (url in seen or requests_by_domain[domain] >= MAX_PAGES
                        or publisher_pages[publisher] >= MAX_PAGES):
                        continue
                    if domain in batch_domains or len(batch) >= workers:
                        deferred.append(url)
                        continue
                    seen.add(url)
                    requests_by_domain[domain] += 1
                    batch_domains.add(domain)
                    batch.append(url)
                pending = deferred
                fetched = list(pool.map(lambda u: website_text(u, cache), batch))
                for page in fetched:
                    requested = candidate_domain(page['requested_url'])
                    actual = page.get('url')
                    publisher = candidate_domain(actual or '')
                    if not publisher or page.get('error'):
                        pages.append(page)
                        continue
                    aliases[requested] = publisher
                    if publisher_pages[publisher] >= MAX_PAGES:
                        continue
                    publisher_pages[publisher] += 1
                    pages.append(page)
                    if publisher not in publishers:
                        publishers.add(publisher)
                        following.update(sitemap_links(actual, cache))
                    following.update(u for u in page.get('links', [])
                        if candidate_domain(u) == publisher)
            pending = sorted({canonical_url(u) for u in following} - seen,
                key=lambda u: (not location_link(u), u))
    return {'pages': pages, 'max_pages_per_publisher': MAX_PAGES,
        'max_requests_per_requested_domain': MAX_PAGES, 'max_depth': MAX_DEPTH,
        'sitemap_child_limit': 2, 'requests_by_domain': dict(requests_by_domain),
        'pages_by_publisher': dict(publisher_pages)}


def address_excerpts(text):
    # Text remains contiguous. A match locates a useful window, not an assertion
    # that the address belongs to this business or is currently operating.
    word=r"(?:[A-Za-z][A-Za-z.'-]*|[0-9]{1,3}(?:st|nd|rd|th))"
    pattern=r'\b\d+[A-Za-z]?\s+(?:'+word+r'\s+){0,8}(?:St(?:reet)?|Rd|Road|Dr(?:ive)?|Blvd|Boulevard|Ave(?:nue)?|Cir(?:cle)?|Broadway)\.?[^|,]{0,30}[|,]\s*[A-Za-z][A-Za-z .-]{1,40},\s*[A-Z]{2}\s+\d{5}\b'
    starts=sorted({m.start() for m in re.finditer(pattern,text)})
    if len(starts)<6:return []
    return [{'start':start,'end':min(start+350,starts[i+1] if i+1<len(starts) else len(text)),
        'text':text[start:min(start+350,starts[i+1] if i+1<len(starts) else len(text))]}
        for i,start in enumerate(starts[:8])]
