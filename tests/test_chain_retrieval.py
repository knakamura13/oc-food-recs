"""Bounded candidate discovery and source context tests."""
import json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import chain_retrieval as cr

class RetrievalTest(unittest.TestCase):
    def test_document_redirect_rechecks_public_destination_and_caches_failure(self):
        class Response:
            is_redirect=True
            headers={'Location':'http://127.0.0.1/secret'}
            def __enter__(self):return self
            def __exit__(self,*args):pass
        def public(url):
            if '127.0.0.1' in url:raise ValueError('Nonpublic')
        with tempfile.TemporaryDirectory() as d, patch.object(cr,'public_url',side_effect=public), patch.object(cr.requests,'get',return_value=Response()) as get:
            first=cr.fetch_document('https://example.com/sitemap.xml',Path(d))
            again=cr.fetch_document('https://example.com/sitemap.xml',Path(d))
        self.assertIn('Nonpublic',first['error'])
        self.assertEqual(first,again)
        self.assertEqual(get.call_count,1)

    def test_malformed_search_does_not_assert_identity(self):
        with tempfile.TemporaryDirectory() as d, patch.object(cr,'fetch_document',return_value={'body':'<rss>'}):
            result=cr.lookup_websites(dict(name='Example'),Path(d))
        self.assertEqual(result['urls'],[])
        self.assertIn('error',result)
        self.assertFalse(result['identity_verified'])

    def test_search_rejects_results_missing_business_name_tokens(self):
        rss='<rss><channel><item><title>Texas State</title><link>https://www.texas.gov/</link></item><item><title>Texas de Brazil locations</title><link>https://texasdebrazil.com/</link></item></channel></rss>'
        with tempfile.TemporaryDirectory() as d, patch.object(cr,'fetch_document',return_value={'body':rss}):
            result=cr.lookup_websites(dict(name='Texas de Brazil'),Path(d))
        self.assertEqual(result['urls'],['https://texasdebrazil.com/'])

    def test_search_deduplicates_domains_and_rejects_invalid_urls(self):
        rss='<rss><channel>'+''.join(f'<item><title>Example</title><link>{url}</link></item>' for url in [
            'https://example.com/','https://example.com/locations','file:///tmp/a',
            'https://u:p@example.net/','https://b.example.org/','https://c.example.edu/',
            'https://d.example.gov/'])+'</channel></rss>'
        with tempfile.TemporaryDirectory() as d, patch.object(cr,'fetch_document',return_value={'body':rss}):
            r=cr.lookup_websites(dict(name='Example',location='Tustin'),Path(d))
        self.assertEqual(r['urls'],['https://example.com/','https://b.example.org/','https://c.example.edu/'])
        self.assertFalse(r['identity_verified'])

    def test_crawl_gets_six_branches_and_ignores_other_publisher(self):
        home='https://example.com/'
        def page(url,cache):
            links=[home+'locations/'+str(i) for i in range(30)]+['https://other.net/locations'] if url==home else []
            return dict(requested_url=url,url=url,text='Address',links=links)
        with tempfile.TemporaryDirectory() as d, patch.object(cr,'website_text',side_effect=page), patch.object(cr,'sitemap_links',return_value=[]):
            r=cr.crawl_websites([home],Path(d),1)
        self.assertEqual(len(r['pages']),12)
        self.assertTrue(all(p['url'].startswith(home) for p in r['pages']))
        self.assertEqual(r['max_pages_per_publisher'],12)

    def test_tracking_urls_do_not_consume_separate_page_slots(self):
        home='https://example.com/'
        def page(url,cache):
            links=[home+'locations?_gl='+str(i) for i in range(15)] if url==home else []
            return dict(requested_url=url,url=url,text='Address',links=links)
        with tempfile.TemporaryDirectory() as d, patch.object(cr,'website_text',side_effect=page), patch.object(cr,'sitemap_links',return_value=[]):
            result=cr.crawl_websites([home],Path(d),1)
        self.assertEqual(len(result['pages']),2)

    def test_redirect_aliases_share_the_final_publisher_page_budget(self):
        seeds=[f'https://alias{i}.com/locations/{j}' for i in range(3) for j in range(12)]
        def page(url,cache):
            path=url.split('.com',1)[1]
            return dict(requested_url=url,url='https://publisher.com'+path,
                text='Address',links=['https://publisher.com/locations/more'])
        with tempfile.TemporaryDirectory() as d, patch.object(cr,'website_text',side_effect=page), patch.object(cr,'sitemap_links',return_value=[]):
            result=cr.crawl_websites(seeds,Path(d),3)
        self.assertLessEqual(len(result['pages']),12)
        self.assertEqual(result['max_pages_per_publisher'],12)

    def test_locator_excerpts_are_original_contiguous_windows(self):
        text='Publisher '+ ' '.join(f'{100+i} Main St, Tustin, CA 92780 Open daily. ' for i in range(6))
        excerpts=cr.address_excerpts(text)
        self.assertEqual(len(excerpts),6)
        for e in excerpts:
            self.assertEqual(e['text'],text[e['start']:e['end']])
        self.assertEqual(cr.address_excerpts('2026 menu prices and six future restaurants'),[])

    def test_sitemap_keeps_publisher_and_bounds_child_maps(self):
        root='https://example.com/sitemap.xml'
        def fetch(url,cache):
            if url==root:
                return {'body':'<sitemapindex>'+''.join('<sitemap><loc>https://example.com/'+x+'</loc></sitemap>' for x in ['locations.xml','pages.xml','products.xml'])+'</sitemapindex>'}
            return {'body':'<urlset><url><loc>https://example.com/locations/a</loc></url><url><loc>https://other.net/locations/b</loc></url></urlset>'}
        with tempfile.TemporaryDirectory() as d, patch.object(cr,'fetch_document',side_effect=fetch) as f:
            links=cr.sitemap_links('https://example.com/',Path(d))
        self.assertEqual(links,['https://example.com/locations/a'])
        self.assertEqual(f.call_count,3)

class PromptBudgetTest(unittest.TestCase):
    def test_branch_pages_are_not_displaced_by_menu_or_home_pages(self):
        import chain_evaluate as ce
        class Model:
            def gemma(self,prompt):
                self.bundle=json.loads(prompt.rsplit('\n',1)[1])
                return {'error':'capture only','seconds':0}
        model=Model()
        sources=[dict(kind='S5',id=str(i),url='https://example.com/menu/'+str(i),
            text='Menu costs $16',truncated=False) for i in range(10)]
        sources += [dict(kind='S5',id='branch'+str(i),
            url='https://example.com/locations/'+str(i),text='Operating branch',
            truncated=False) for i in range(6)]
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:sources},model,Path(d))
        self.assertEqual(sum('/locations/' in s['url'] for s in model.bundle['sources']),6)

    def test_six_long_branch_pages_share_budget_and_block_complete_claim(self):
        import chain_evaluate as ce
        class Model:
            def gemma(self,prompt):
                self.bundle=json.loads(prompt.rsplit('\n',1)[1])
                return {'seconds':0,'response':{'done':True,'message':{'content':json.dumps(
                    dict(decision='independent',count=1,complete=True,identity_verified=True,
                        source=0,quote='Only one location worldwide.'))}}}
        model=Model()
        sources=[dict(kind='S5',id=str(i),url='https://example.com/'+str(i),
            text='Only one location worldwide. '+'x'*4500,official_source=True,
            truncated=False) for i in range(6)]
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:sources},model,Path(d))
        self.assertEqual(len(model.bundle['sources']),6)
        self.assertLessEqual(sum(len(s['text']) for s in model.bundle['sources']),20000)
        self.assertEqual(row['decision'],'unknown')

if __name__=='__main__':unittest.main()
