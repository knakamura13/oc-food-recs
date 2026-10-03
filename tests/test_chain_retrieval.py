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

    def test_locator_windows_do_not_begin_inside_hours_or_previous_branch(self):
        text='Locations | Example Bakery '+ ' '.join(
            f'10a-2p {100+i} Main St, Tustin, CA 92780 Dine-in Hours Daily 6:30a - 8:30p '
            for i in range(6))
        excerpts=cr.address_excerpts(text)
        self.assertEqual(len(excerpts),6)
        for i,e in enumerate(excerpts):
            self.assertTrue(e['text'].startswith(f'{100+i} Main St'))
            self.assertIn('Dine-in Hours',e['text'])

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
    def test_compact_repair_keeps_verified_quote_windows_and_original_indices(self):
        import chain_evaluate as ce
        entries=[dict(source=i,quote=f'{100+i} Main St, Tustin Open daily',
            address=f'{100+i} Main St',city='Tustin',operating=True) for i in range(8)]
        sources=[dict(index=i,kind='S5',url=f'https://example.com/locations/{i}',
            text='Example Bakery Navigation '+ 'x'*1000+' '+entry['quote']+' Hours daily.',
            official_source=True) for i,entry in enumerate(entries)]
        original=dict(restaurant=dict(name='Example Bakery',city='Tustin'),sources=sources,
            observed_evidence=[dict(kind='S3',count=100)])
        parsed=dict(decision='chain',count=8,locations=entries)
        feedback=dict(invalid_entries=[0],invalid_details={0:'Exact quote required'},
            duplicate_pairs=[],count_matches_entries=True)
        compact,suffix,ranges=ce.compact_repair_payload(original,parsed,feedback)
        self.assertEqual([s['index'] for s in compact['sources']],[1,2,3,4,5,6])
        self.assertNotIn('observed_evidence',compact)
        for src in compact['sources']:
            start,end=ranges[src['index']]
            self.assertEqual(src['text'],sources[src['index']]['text'][start:end])
            self.assertIn(entries[src['index']]['quote'],src['text'])
            self.assertEqual(src['publisher_context'],sources[src['index']]['text'][:100])
        prompt,texts=ce.budget_repair_prompt(ce.REPAIR_INSTRUCTIONS,compact,suffix,8)
        self.assertIsNotNone(prompt)
        self.assertLessEqual(len(prompt.encode()),8192-2048-256)
        self.assertEqual(len(texts),8)
        self.assertEqual(texts[0],'')
        self.assertEqual(texts[7],'')

    def test_compact_repair_does_not_promote_prior_nonoperating_entries(self):
        import chain_evaluate as ce
        entries=[dict(source=i,quote=f'{100+i} Main St, Tustin',address=f'{100+i} Main St',
            city='Tustin',operating=i!=0) for i in range(7)]
        original=dict(restaurant=dict(name='Example',city='Tustin'),sources=[
            dict(index=i,kind='S5',url=f'https://example.com/{i}',text=entry['quote'])
            for i,entry in enumerate(entries)])
        feedback=dict(invalid_entries=[0],invalid_details={0:'operating must be true'},
            duplicate_pairs=[],count_matches_entries=True)
        compact,suffix,ranges=ce.compact_repair_payload(original,
            dict(decision='chain',count=7,locations=entries),feedback)
        self.assertEqual([s['index'] for s in compact['sources']],[1,2,3,4,5,6])
        prior=json.loads(suffix.split('Previous output: ',1)[1].split('\n',1)[0])
        self.assertTrue(all(e['operating'] is True for e in prior['entries']))
        for entry in entries:entry['operating']=False
        compact,suffix,ranges=ce.compact_repair_payload(original,
            dict(decision='chain',count=7,locations=entries),feedback)
        self.assertEqual(compact['sources'],[])


    def test_compact_repair_never_treats_an_uncontained_quote_as_source_text(self):
        import chain_evaluate as ce
        text='Example Open daily 100 Main St, Tustin'
        original=dict(restaurant=dict(name='Example',city='Tustin'),sources=[
            dict(index=0,kind='S5',url='https://example.com/',text=text)])
        parsed=dict(decision='chain',count=6,locations=[dict(source=0,
            quote='Invented phrase 999 Fake Street, Somewhere',address='999 Fake Street',
            city='Somewhere',operating=True)])
        feedback=dict(invalid_entries=[0],invalid_details={0:'Exact quote required'},
            duplicate_pairs=[],count_matches_entries=False)
        compact,suffix,ranges=ce.compact_repair_payload(original,parsed,feedback)
        self.assertEqual(compact['sources'],[])
        self.assertEqual(ranges,{})

    def test_complete_repair_prompt_has_a_conservative_context_budget(self):
        import chain_evaluate as ce
        entries=[dict(source=i,quote=f'{100+i} Main St, Tustin Open daily',
            address=f'{100+i} Main St',city='Tustin',operating=True) for i in range(6)]
        class Model:
            def __init__(self):self.prompts=[]
            def gemma(self,prompt):
                self.prompts.append(prompt)
                result=dict(decision='chain',count=6,locations=[entries[0]]*6,
                    identity_verified=True,complete=False,source=None,quote=None)
                return {'seconds':0,'response':{'done':True,'message':{'content':json.dumps(result)}}}
        model=Model()
        sources=[dict(kind='S5',id=str(i),url='https://example.com/locations/'+str(i),
            text='語'*1200+' '+e['quote'],truncated=False) for i,e in enumerate(entries)]
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:sources},model,Path(d))
        self.assertEqual(len(model.prompts),2)
        self.assertLessEqual(len(model.prompts[1].encode('utf-8')),8192-2048-256)
        self.assertEqual(row['decision'],'unknown')

    def test_repair_cannot_ground_quotes_removed_by_its_budget(self):
        import chain_evaluate as ce
        entries=[dict(source=i,quote=f'{100+i} Main St, Tustin Open daily',
            address=f'{100+i} Main St',city='Tustin',operating=True) for i in range(6)]
        class Model:
            def __init__(self):self.calls=0
            def gemma(self,prompt):
                self.calls+=1
                result=dict(decision='chain',count=6,
                    locations=[entries[0]]*6 if self.calls==1 else entries,
                    identity_verified=True,complete=False,source=None,quote=None)
                return {'seconds':0,'response':{'done':True,'message':{'content':json.dumps(result)}}}
        model=Model()
        sources=[dict(kind='S5',id=str(i),url='https://example.com/locations/'+str(i),
            text='x'*1400+' '+e['quote'],truncated=False) for i,e in enumerate(entries)]
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:sources},model,Path(d))
        self.assertEqual(model.calls,2)
        self.assertEqual(row['decision'],'unknown')

    def test_repair_truncation_cannot_establish_complete_negative_evidence(self):
        import chain_evaluate as ce
        entry=dict(source=0,quote='100 Main St, Tustin Open daily',
            address='100 Main St',city='Tustin',operating=True)
        class Model:
            def __init__(self):self.calls=0
            def gemma(self,prompt):
                self.calls+=1
                result=(dict(decision='chain',count=6,locations=[entry]*6,
                    identity_verified=True,complete=False,source=None,quote=None)
                    if self.calls==1 else dict(decision='independent',count=1,
                        identity_verified=True,complete=True,source=0,
                        quote='Only one location worldwide.'))
                return {'seconds':0,'response':{'done':True,'message':{'content':json.dumps(result)}}}
        model=Model()
        source=dict(kind='S5',id='0',url='https://example.com/',official_source=True,
            text='Only one location worldwide. '+ 'x'*4500+' '+entry['quote'],truncated=False)
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:[source]},model,Path(d))
        self.assertEqual(model.calls,2)
        self.assertEqual(row['decision'],'unknown')
        self.assertEqual(row['evidence'],[])

    def test_complete_claim_from_a_selected_repair_bundle_still_abstains(self):
        import chain_evaluate as ce
        entry=dict(source=0,quote='100 Main St, Tustin Open daily',
            address='100 Main St',city='Tustin',operating=True)
        class Model:
            def __init__(self):self.calls=0
            def gemma(self,prompt):
                self.calls+=1
                result=(dict(decision='chain',count=6,locations=[entry]*6,
                    identity_verified=True,complete=False,source=None,quote=None)
                    if self.calls==1 else dict(decision='independent',count=1,
                        identity_verified=True,complete=True,source=0,
                        quote='Only one location worldwide.'))
                return {'seconds':0,'response':{'done':True,'message':{'content':json.dumps(result)}}}
        model=Model()
        source=dict(kind='S5',id='0',url='https://example.com/',official_source=True,
            text='Only one location worldwide. '+entry['quote'],truncated=False)
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:[source]},model,Path(d))
        self.assertEqual(model.calls,2)
        self.assertEqual(row['decision'],'unknown')
        self.assertFalse(row['evidence'][0]['complete'])

    def test_oversized_fixed_repair_payload_skips_the_retry(self):
        import chain_evaluate as ce
        class Model:
            def __init__(self):self.calls=0
            def gemma(self,prompt):
                self.calls+=1
                result=dict(decision='chain',count=6,locations=[],identity_verified=True,
                    complete=False,source=None,quote='語'*6000)
                return {'seconds':0,'response':{'done':True,'message':{'content':json.dumps(result)}}}
        model=Model()
        source=dict(kind='S5',id='1',url='https://example.com/',text='Open daily',truncated=False)
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:[source]},model,Path(d))
        self.assertEqual(model.calls,1)
        self.assertEqual(row['decision'],'unknown')

    def test_invalid_location_output_gets_one_repair_with_validator_feedback(self):
        import chain_evaluate as ce
        entries=[dict(source=0,quote=f'{100+i} Main St, Tustin Open daily',
            address=f'{100+i} Main St',city='Tustin',operating=True) for i in range(6)]
        text=' '.join(e['quote'] for e in entries)
        bad=[entries[0]]*6
        class Model:
            def __init__(self,persist=False):self.prompts=[];self.persist=persist
            def gemma(self,prompt):
                self.prompts.append(prompt)
                locations=bad if self.persist or len(self.prompts)==1 else entries
                return {'seconds':0,'response':{'done':True,'message':{'content':json.dumps(
                    dict(decision='chain',count=6,complete=False,identity_verified=True,
                        source=None,quote=None,locations=locations))}}}
        model=Model()
        source=dict(kind='S5',id='locator',url='https://example.com/locations',
            text=text,truncated=False)
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:[source]},model,Path(d))
            record=json.loads((Path(d)/'gemma-results.json').read_text())[0]
        self.assertEqual(len(model.prompts),2)
        self.assertIn('duplicate_pairs',model.prompts[1])
        self.assertEqual(row['decision'],'chain')
        self.assertEqual(len(record['attempts']),2)
        model=Model(persist=True)
        row=dict(id=2,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{2:[source]},model,Path(d))
        self.assertEqual(len(model.prompts),2)
        self.assertEqual(row['decision'],'unknown')

    def test_locator_context_preserves_publisher_and_separate_quote_windows(self):
        import chain_evaluate as ce
        class Model:
            def gemma(self,prompt):
                self.bundle=json.loads(prompt.rsplit('\n',1)[1])
                return {'error':'capture only','seconds':0}
        model=Model()
        text='Locations | Example Bakery Open daily. '+ ' '.join(
            f'{100+i} Main St, Tustin, CA 92780 Open daily. ' for i in range(6))
        source=dict(kind='S5',id='locator',url='https://example.com/locations',
            text=text,address_excerpts=cr.address_excerpts(text),truncated=False)
        row=dict(id=1,name='Example Bakery',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:[source]},model,Path(d))
            record=json.loads((Path(d)/'gemma-results.json').read_text())[0]
        self.assertEqual(len(model.bundle['sources']),6)
        for src in model.bundle['sources']:
            self.assertEqual(src['publisher_context'],text[:200])
        for src in record['prompt_sources']:
            start,end=src['excerpt_range']
            self.assertEqual(text[start:end],model.bundle['sources'][src['index']]['text'])
            self.assertEqual(src['parent_text_sha256'],__import__('hashlib').sha256(text.encode()).hexdigest())

    def test_twelve_branches_fit_when_some_cannot_supply_valid_streets(self):
        import chain_evaluate as ce
        class Model:
            def gemma(self,prompt):
                self.bundle=json.loads(prompt.rsplit('\n',1)[1])
                return {'error':'capture only','seconds':0}
        model=Model()
        sources=[dict(kind='S5',id=str(i),url='https://example.com/locations/'+str(i),
            text='Open daily '+ 'x'*2000,truncated=False) for i in range(12)]
        row=dict(id=1,name='Example',location='Tustin',decision='unknown',evidence=[])
        with tempfile.TemporaryDirectory() as d:
            ce.gemma_unresolved([row],{1:sources},model,Path(d))
        self.assertEqual(len(model.bundle['sources']),12)
        self.assertLessEqual(sum(len(s['text'])+len(s.get('publisher_context',''))
            for s in model.bundle['sources']),20000)

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
