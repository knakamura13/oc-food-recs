import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import backfill_streets as bs  # noqa: E402


class ParseDetailTests(unittest.TestCase):
    def test_us_address(self):
        self.assertEqual(
            bs.parse_detail("Cafe Rae, 1421 N El Camino Real, San Clemente, CA 92672, USA"),
            ("Cafe Rae", "1421 N El Camino Real", "San Clemente"),
        )

    def test_unit_suffix_is_dropped(self):
        self.assertEqual(bs.parse_detail("Lupe's, 33621 Del Obispo St Suite F, Dana Point, CA 92629, USA")[1], "33621 Del Obispo St")
        self.assertEqual(bs.parse_detail("Tasty Noodle House, 15333 Culver Dr #320, Irvine, CA 92604, USA")[1], "15333 Culver Dr")

    def test_unit_in_its_own_comma_part(self):
        self.assertEqual(bs.parse_detail("Foo, 12 Main St, Suite 100, Irvine, CA 92604, USA")[1], "12 Main St")

    def test_street_without_number(self):
        self.assertEqual(bs.parse_detail("Cafe, Airport Way, Santa Ana, CA 92705, USA")[1], "Airport Way")

    def test_no_street_part(self):
        self.assertEqual(bs.parse_detail("Laguna Beach, CA, USA"), (None, None, None))
        self.assertEqual(bs.parse_detail("Foo, Irvine, CA 92604, USA"), ("Foo", None, "Irvine"))

    def test_place_name_with_commas_is_not_a_street(self):
        self.assertEqual(
            bs.parse_detail("Katella Deli, Deli and Restaurant, 1 Katella Ave, Los Alamitos, CA 90720, USA")[1],
            "1 Katella Ave",
        )

    def test_non_google_or_missing_detail(self):
        self.assertEqual(bs.parse_detail(None), (None, None, None))
        self.assertEqual(bs.parse_detail("google: closed permanently"), (None, None, None))
        self.assertEqual(
            bs.parse_detail("Foo, 12, Main Street, Irvine, Orange County, California, 92604, United States"),
            (None, None, None),
        )


class ClassifyTests(unittest.TestCase):
    CAFE = ("Cafe Rae, 1421 N El Camino Real, San Clemente, CA 92672, USA", "San Clemente")

    def test_single_match_sets_street(self):
        self.assertEqual(bs.classify("Cafe Rae", "San Clemente", [self.CAFE]), ("set", "1421 N El Camino Real", ""))

    def test_duplicate_rows_same_street_still_set(self):
        self.assertEqual(bs.classify("Cafe Rae", "San Clemente", [self.CAFE, self.CAFE])[0], "set")

    def test_different_streets_are_ambiguous(self):
        other = ("Cafe Rae, 5 Main St, San Clemente, CA 92672, USA", "San Clemente")
        self.assertEqual(bs.classify("Cafe Rae", "San Clemente", [self.CAFE, other])[0], "ambiguous")

    def test_city_mismatch_is_ambiguous(self):
        self.assertEqual(bs.classify("Cafe Rae", "Irvine", [self.CAFE])[0], "ambiguous")

    def test_wrong_business_is_ambiguous(self):
        lab = ("The LAB Anti-Mall, 2930 Bristol St, Costa Mesa, CA 92626, USA", "Costa Mesa")
        self.assertEqual(bs.classify("Bob's", "Costa Mesa", [lab])[0], "ambiguous")

    def test_other_city_row_is_ignored_when_local_one_exists(self):
        far = ("Cafe Rae, 9 Far Rd, Irvine, CA 92604, USA", "Irvine")
        self.assertEqual(bs.classify("Cafe Rae", "San Clemente", [self.CAFE, far]), ("set", "1421 N El Camino Real", ""))

    def test_no_candidates(self):
        self.assertEqual(bs.classify("Cafe Rae", "San Clemente", [])[0], "none")


if __name__ == "__main__":
    unittest.main()
