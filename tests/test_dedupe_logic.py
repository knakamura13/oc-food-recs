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

    def test_is_match_no_location_or_coords(self):
        r1 = {"name": "Mo Ran Gak", "location": None}
        r2 = {"name": "Morangak", "location": None}
        self.assertFalse(rp.is_match(r1, r2))

    def test_is_match_location_alias_hb(self):
        r1 = {"name": "Wahoo's", "location": "HB"}
        r2 = {"name": "Wahoo's Fish Taco", "location": "Huntington Beach"}
        self.assertTrue(rp.is_match(r1, r2))

    def test_is_match_proximity_boundary_outside(self):
        r1 = {"name": "Mo Ran Gak", "lat": 33.770, "lng": -117.940}
        r2 = {"name": "Morangak", "lat": 33.773, "lng": -117.943}
        self.assertFalse(rp.is_match(r1, r2))

    def test_is_match_partial_coords(self):
        r1 = {"name": "Mo Ran Gak", "location": "Garden Grove", "lat": 33.77, "lng": -117.94}
        r2 = {"name": "Morangak", "location": "Garden Grove", "lat": None, "lng": None}
        self.assertTrue(rp.is_match(r1, r2))

    def test_assign_slugs_reuses_existing_db_slug(self):
        existing = [{
            "name": "Mo Ran Gak",
            "slug": "mo-ran-gak",
            "location": "Garden Grove",
            "lat": 33.77,
            "lng": -117.94,
        }]
        incoming = [{
            "name": "Morangak",
            "location": "Garden Grove",
            "lat": 33.77,
            "lng": -117.94,
        }]
        assigned = rp.assign_slugs(incoming, existing=existing)
        self.assertEqual(assigned[0][1], "mo-ran-gak")

    def test_assign_slugs_within_batch_match(self):
        restaurants = [
            {
                "name": "Mo Ran Gak",
                "location": "Garden Grove",
                "lat": 33.77,
                "lng": -117.94,
            },
            {
                "name": "Morangak Restaurant",
                "location": "Garden Grove",
                "lat": 33.77,
                "lng": -117.94,
            },
        ]
        assigned = rp.assign_slugs(restaurants, existing=[])
        self.assertEqual(assigned[0][1], assigned[1][1])

    def test_assign_slugs_third_suffix_for_non_matches(self):
        assigned = rp.assign_slugs([
            {"name": "Alpha Cafe", "location": "Irvine", "lat": None, "lng": None},
            {"name": "Alpha Cafe!", "location": "Costa Mesa", "lat": None, "lng": None},
            {"name": "Alpha Cafe!!", "location": "Fullerton", "lat": None, "lng": None},
        ], existing=[])
        slugs = [slug for _, slug in assigned]
        self.assertEqual(slugs, ["alpha-cafe", "alpha-cafe-2", "alpha-cafe-3"])

    def test_collapse_duplicate_restaurants_transitive(self):
        restaurants = [
            {
                "name": "Mo Ran Gak",
                "location": "Garden Grove",
                "lat": 33.770,
                "lng": -117.940,
                "primary_comment": {"id": "c1", "score": 10},
                "endorsements": [],
                "aggregate_score": 10,
                "mention_count": 1,
            },
            {
                "name": "Morangak",
                "location": "Garden Grove",
                "lat": 33.771,
                "lng": -117.941,
                "primary_comment": {"id": "c2", "score": 5},
                "endorsements": [],
                "aggregate_score": 5,
                "mention_count": 1,
            },
            {
                "name": "Mo Ran Gak Restaurant",
                "location": "Garden Grove",
                "lat": 33.7705,
                "lng": -117.9405,
                "primary_comment": {"id": "c3", "score": 8},
                "endorsements": [],
                "aggregate_score": 8,
                "mention_count": 1,
            },
        ]
        collapsed = rp.collapse_duplicate_restaurants(restaurants)
        self.assertEqual(len(collapsed), 1)
        self.assertEqual(collapsed[0]["name"], "Mo Ran Gak Restaurant")
        self.assertEqual(collapsed[0]["mention_count"], 3)

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

    def test_merge_winner_fields(self):
        winner = {"name": "Mo Ran Gak", "location": None, "cuisine": None, "lat": None, "lng": None}
        loser = {
            "name": "Mo Ran Gak Restaurant",
            "location": "Garden Grove",
            "cuisine": "Korean",
            "lat": 33.77,
            "lng": -117.94,
        }
        merged = dr._merge_winner_fields(winner, loser)
        self.assertEqual(merged["name"], "Mo Ran Gak Restaurant")
        self.assertEqual(merged["location"], "Garden Grove")
        self.assertEqual(merged["cuisine"], "Korean")
        self.assertEqual(merged["lat"], 33.77)

    def test_dedupe_apply_sequence(self):
        restaurants = [
            {"id": 1, "name": "Mo Ran Gak", "slug": "mo-ran-gak", "location": "Garden Grove", "cuisine": None, "lat": None, "lng": None},
            {"id": 2, "name": "Morangak", "slug": "morangak", "location": "Garden Grove", "cuisine": None, "lat": 33.77, "lng": -117.94},
        ]
        executions = []

        cursor = mock.MagicMock()
        cursor.description = [("id",), ("name",), ("slug",), ("location",), ("cuisine",), ("lat",), ("lng",)]

        def fetchall_side_effect():
            sql = executions[-1][0] if executions else ""
            if "FROM restaurants" in sql and "SELECT id" in sql:
                return [tuple(r[c] for c in ("id", "name", "slug", "location", "cuisine", "lat", "lng")) for r in restaurants]
            if "FROM mentions GROUP BY" in sql:
                return [(1, 5), (2, 2)]
            return []

        def execute(sql, params=None):
            executions.append((sql, params))

        cursor.execute.side_effect = execute
        cursor.fetchall.side_effect = fetchall_side_effect

        conn = mock.MagicMock()
        conn.cursor.return_value = cursor

        with mock.patch("dedupe_restaurants.b._connect", return_value=conn), \
             mock.patch.object(sys, "argv", ["dedupe_restaurants.py", "--apply"]):
            code = dr.main()

        self.assertEqual(code, 0)
        sqls = [sql for sql, _ in executions]
        self.assertTrue(any("DELETE FROM mentions" in sql for sql in sqls))
        self.assertTrue(any("UPDATE mentions SET restaurant_id" in sql for sql in sqls))
        self.assertTrue(any("DELETE FROM restaurants" in sql for sql in sqls))
        self.assertTrue(any("UPDATE restaurants" in sql and "COALESCE(location" in sql for sql in sqls))


if __name__ == "__main__":
    unittest.main()
