import unittest
import sys
import os
from unittest import mock

# Ensure we can import from the scripts directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/scripts")
import reddit_pipeline as rp
import dedupe_restaurants as dr

class TestDedupeLogic(unittest.TestCase):

    def test_is_match_exact_name_same_location(self):
        r1 = {"name": "Mo Ran Gak", "location": "Garden Grove", "lat": 33.77, "lng": -117.94}
        r2 = {"name": "Mo Ran Gak", "location": "Garden Grove", "lat": 33.77, "lng": -117.94}
        self.assertTrue(rp.is_match(r1, r2))

    def test_is_match_normalization_variations(self):
        r1 = {"name": "Mo Ran Gak", "location": "Garden Grove"}
        r2 = {"name": "Morangak", "location": "Garden Grove"}
        self.assertTrue(rp.is_match(r1, r2))

    def test_is_match_substring_variations(self):
        r1 = {"name": "Mo Ran Gak", "location": "Garden Grove"}
        r2 = {"name": "Mo Ran Gak Restaurant", "location": "Garden Grove"}
        self.assertTrue(rp.is_match(r1, r2))

    def test_is_match_proximity(self):
        # Within ~200m (0.002 degrees)
        r1 = {"name": "Mo Ran Gak", "lat": 33.770, "lng": -117.940}
        r2 = {"name": "Morangak", "lat": 33.771, "lng": -117.941}
        self.assertTrue(rp.is_match(r1, r2))

    def test_is_match_not_matching_different_location(self):
        r1 = {"name": "Mo Ran Gak", "location": "Garden Grove", "lat": 33.77, "lng": -117.94}
        r2 = {"name": "Mo Ran Gak", "location": "Irvine", "lat": 33.68, "lng": -117.82}
        self.assertFalse(rp.is_match(r1, r2))

    def test_is_match_with_ampersand(self):
        r1 = {"name": "A & B Restaurant", "location": "Irvine"}
        r2 = {"name": "A&B", "location": "Irvine"}
        self.assertTrue(rp.is_match(r1, r2))

    def test_connected_components(self):
        nodes = [1, 2, 3, 4, 5]
        adjacency = {
            1: [2],
            2: [1, 3],
            3: [2],
            4: [5],
            5: [4]
        }
        components = dr.get_connected_components(nodes, adjacency)
        self.assertEqual(len(components), 2)
        self.assertIn([1, 2, 3], components)
        self.assertIn([4, 5], components)

    def test_winner_selection(self):
        # Higher mention count wins
        group = [1, 2, 3]
        mention_counts = {1: 10, 2: 20, 3: 5}
        id_to_restaurant = {
            1: {"name": "Short"},
            2: {"name": "Medium Name"},
            3: {"name": "The Longest Name Ever"}
        }

        def winner_key(rid):
            r = id_to_restaurant[rid]
            return (mention_counts.get(rid, 0), len(r['name']), -rid)

        sorted_group = sorted(group, key=winner_key, reverse=True)
        self.assertEqual(sorted_group[0], 2)

        # Equal mention counts, longer name wins
        mention_counts = {1: 10, 2: 10, 3: 10}
        sorted_group = sorted(group, key=winner_key, reverse=True)
        self.assertEqual(sorted_group[0], 3)

if __name__ == "__main__":
    unittest.main()
