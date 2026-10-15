"""Synthetic regressions for reply attribution; no live sources or model calls."""
import unittest
import importlib.util
from pathlib import Path


class ReplyAttributionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / 'scripts' / 'reddit_pipeline.py'
        spec = importlib.util.spec_from_file_location('reddit_pipeline', path)
        cls.pipeline = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.pipeline)

    def dataset(self, names, replies):
        def comment(cid, body, children=(), parent='root', depth=1):
            return {'id': cid, 'body': body, 'author': 'synthetic', 'score': 3,
                    'depth': depth, 'parent_id': parent, 'permalink': 'https://example.test/'+cid,
                    'created_utc': '', 'replies': [comment(*c, parent=cid, depth=depth+1) for c in children]}
        root = comment('root', ', '.join(names), replies, None, 0)
        parsed = {'post': {'id': 'synthetic', 'subreddit': 'example', 'url': 'https://example.test', 'title': 'Synthetic'},
                  'comments': [root]}
        records = [{'comment_id': 'root', 'entities': [{'name': n, 'location': 'Irvine'} for n in names]}]
        data = self.pipeline.build_thread_dataset(parsed, records)
        return {r['name']: [e['id'] for e in r['endorsements']] for r in data['restaurants']}

    def test_named_question_scopes_nested_dish_answers(self):
        result = self.dataset(['Ember BBQ', 'Hokkaido Ramen Lantern'], [
            ('q', 'which ramen do you get at Lantern', [('dish', 'The spicy miso ramen with rice.')])])
        self.assertEqual(result['Ember BBQ'], [])
        self.assertEqual(result['Hokkaido Ramen Lantern'], ['dish'])

    def test_single_business_keeps_unnamed_endorsement(self):
        result = self.dataset(['Ember BBQ'], [('praise', 'Highly recommend!')])
        self.assertEqual(result['Ember BBQ'], ['praise'])

    def test_ambiguous_list_reply_is_not_copied_to_every_business(self):
        result = self.dataset(['Ember BBQ', 'Lantern Pho'], [('praise', 'A lot of my favorites on that list!')])
        self.assertEqual(result, {'Ember BBQ': [], 'Lantern Pho': []})

    def test_sibling_topics_do_not_leak(self):
        result = self.dataset(['Ember BBQ', 'Lantern Pho'], [
            ('one', 'Ember is amazing', [('one_dish', 'The pork ribs are so good.')]),
            ('two', 'Lantern is amazing', [('two_dish', 'Their pho is so good.')])])
        self.assertEqual(result['Ember BBQ'], ['one', 'one_dish'])
        self.assertEqual(result['Lantern Pho'], ['two', 'two_dish'])

    def test_shared_name_word_does_not_choose_multiple_businesses(self):
        result = self.dataset(['Tasty Garden', 'Tasty Noodle House'], [('praise', 'Tasty is amazing')])
        self.assertTrue(all(not replies for replies in result.values()))

    def test_negative_business_does_not_receive_other_business_praise(self):
        result = self.dataset(['Ember BBQ', 'Lantern Pho'], [('contrast', 'Ember is terrible. Lantern is amazing.')])
        self.assertEqual(result['Ember BBQ'], [])
        self.assertEqual(result['Lantern Pho'], ['contrast'])

    def test_non_recommendations_are_excluded(self):
        bodies = ['which ramen do you get at Lantern', 'Their burgers are terrible',
                  'Thanks for the tips! Ramen sounds nice.', 'I will try their pizza next week',
                  '[Lantern Pizza Menu](https://example.test/menu)',
                  'I do not recommend their pizza', 'I’ll try their ramen soon',
                  "I'm going to try their ramen tomorrow", 'I’m going to try their ramen tomorrow',
                  'Their ramen is not good', 'Their ramen was bad', 'Their ramen is disgusting']
        for body in bodies:
            with self.subTest(body=body):
                self.assertNotIn(self.pipeline.classify_reply(body), self.pipeline.ENDORSEMENT_TYPES)

    def test_thanks_with_actual_praise_is_preserved(self):
        self.assertEqual(self.pipeline.classify_reply('Thanks! Their tacos were amazing.'), 'endorsement')

    def test_city_word_is_not_a_business_subject(self):
        result = self.dataset(['Lantern Irvine', 'Ember BBQ'], [('reply', 'Irvine has the best ramen')])
        self.assertTrue(all(not replies for replies in result.values()))

    def test_positive_and_personal_stories_survive_exclusion_gates(self):
        examples = {
            'Thanks, their ramen is incredible': 'endorsement',
            'Thanks, been coming here since I was a kid': 'personal_story',
            'Their tacos are delicious, my favorite item on the menu.': 'endorsement',
            'Their ramen is not bad': 'dish_rec',
            'Order the off-menu birria tacos.': 'dish_rec',
            'Their tacos are delicious, best item on the menu.': 'dish_rec',
        }
        for body, expected in examples.items():
            with self.subTest(body=body):
                self.assertEqual(self.pipeline.classify_reply(body), expected)

    def test_incredible_praise_is_not_lost_in_negative_comparison(self):
        result = self.dataset(['Ember BBQ', 'Lantern Pho'], [('contrast', 'Ember is awful but Lantern is incredible.')])
        self.assertEqual(result['Ember BBQ'], [])
        self.assertEqual(result['Lantern Pho'], ['contrast'])
