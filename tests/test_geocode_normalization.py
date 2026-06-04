import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import reddit_pipeline as rp  # noqa: E402


class NormalizeLocationTests(unittest.TestCase):
    def test_abbreviations_and_partials(self):
        self.assertEqual(rp.normalize_location("HB"), "Huntington Beach")
        self.assertEqual(rp.normalize_location("Huntington"), "Huntington Beach")
        self.assertEqual(rp.normalize_location("Newport"), "Newport Beach")
        self.assertEqual(rp.normalize_location("Aliso"), "Aliso Viejo")
        self.assertEqual(rp.normalize_location("SNA"), "Santa Ana")
        self.assertEqual(rp.normalize_location("BP"), "Buena Park")
        self.assertEqual(rp.normalize_location("San Juan"), "San Juan Capistrano")

    def test_multi_city_takes_first(self):
        self.assertEqual(rp.normalize_location("Santa Ana/Garden Grove"), "Santa Ana")
        self.assertEqual(rp.normalize_location("Seal Beach or Los Alamitos"), "Seal Beach")

    def test_neighborhood_and_street_map_to_city(self):
        self.assertEqual(rp.normalize_location("Old Town Tustin"), "Tustin")
        self.assertEqual(rp.normalize_location("Anaheim Blvd"), "Anaheim")

    def test_landmarks_map_to_city(self):
        self.assertEqual(rp.normalize_location("Disneyland"), "Anaheim")
        self.assertEqual(rp.normalize_location("downtown Disney"), "Anaheim")
        self.assertEqual(rp.normalize_location("Little Arabia"), "Anaheim")
        self.assertEqual(rp.normalize_location("Fashion Island"), "Newport Beach")
        self.assertEqual(rp.normalize_location("Crystal Cove"), "Newport Beach")

    def test_canonical_passthrough_and_empty(self):
        self.assertEqual(rp.normalize_location("Costa Mesa"), "Costa Mesa")
        self.assertEqual(rp.normalize_location(" santa ana "), "Santa Ana")
        self.assertIsNone(rp.normalize_location(""))
        self.assertIsNone(rp.normalize_location(None))

    def test_invented_cities_return_none(self):
        # street intersections, restaurant names, abbreviations without mappings
        # — all must return None rather than a made-up city name
        self.assertIsNone(rp.normalize_location("Katella & Tustin"))
        self.assertIsNone(rp.normalize_location("Mitasie"))
        self.assertIsNone(rp.normalize_location("Laguna"))  # ambiguous between 4 cities


class CityFromAddressStringTests(unittest.TestCase):
    """_city_from_address_string extracts the canonical city from a geocoder address."""

    def test_nominatim_display_name(self):
        self.assertEqual(
            rp._city_from_address_string("Taco Place, 410 N Bristol St, Santa Ana, California, 92703, United States"),
            "Santa Ana",
        )

    def test_mapbox_full_address(self):
        self.assertEqual(
            rp._city_from_address_string("mapbox: Claro's Italian Market, 2795 Cabot Dr, Newport Beach, CA"),
            "Newport Beach",
        )

    def test_longest_match_wins(self):
        # "Rancho Santa Margarita" must win over "Santa Ana" (substring risk)
        self.assertEqual(
            rp._city_from_address_string("456 Oso Pkwy, Rancho Santa Margarita, CA 92688"),
            "Rancho Santa Margarita",
        )

    def test_unrecognized_or_empty_returns_none(self):
        self.assertIsNone(rp._city_from_address_string("no results"))
        self.assertIsNone(rp._city_from_address_string(""))
        self.assertIsNone(rp._city_from_address_string(None))


class TransientNetworkErrorTests(unittest.TestCase):
    """A transient network error must still return a 4-tuple (lat, lng, detail, geocoded_city)
    so callers that destructure the result don't crash."""

    def test_urlopen_exception_returns_four_tuple(self):
        def boom(request, timeout=10):
            raise ConnectionError("network unreachable")

        with tempfile.TemporaryDirectory() as tmp:
            orig = rp.GEOCODE_CACHE_PATH
            try:
                rp.GEOCODE_CACHE_PATH = Path(tmp) / "cache.json"
                rp._geocode_cache = None
                rp._last_geocode_ts = 0.0
                rp._mapbox_token_value = ""  # disable Mapbox so we exercise only the failing path
                with mock.patch.object(rp.urllib.request, "urlopen", boom):
                    result = rp.default_geocode("Some Spot", "Santa Ana")
                self.assertEqual(len(result), 4)
                lat, lng, detail, geocoded_city = result
                self.assertIsNone(lat)
                self.assertIsNone(lng)
                self.assertIn("network unreachable", detail)
                self.assertIsNone(geocoded_city)
            finally:
                rp.GEOCODE_CACHE_PATH = orig
                rp._geocode_cache = None
                rp._last_geocode_ts = 0.0
                rp._mapbox_token_value = None


class NameOnlyGeocodeTests(unittest.TestCase):
    """allow_name_only=True bypasses the missing-location early-return and issues
    a name-only OC-bounded query as a last-resort retry tier."""

    def test_default_behavior_unchanged_when_no_city(self):
        # Without the flag, an empty/unrecognizable location still short-circuits.
        result = rp.default_geocode("Porto's", "")
        self.assertEqual(result, (None, None, "missing location", None))
        result = rp.default_geocode("Porto's", "Katella & Tustin")  # not recognized
        self.assertEqual(result, (None, None, "missing location", None))

    def test_allow_name_only_falls_through_to_mapbox(self):
        # Nominatim returns empty so we exercise the Mapbox path with no city hint.
        class _Resp:
            def __init__(self, body): self._body = body
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self): return self._body

        mapbox_payload = json.dumps({
            "features": [{
                "geometry": {"coordinates": [-117.998, 33.829]},  # in-OC
                "properties": {
                    "name": "Porto's Bakery & Cafe",
                    "full_address": "7640 Beach Blvd, Buena Park, CA 90620",
                },
            }],
        }).encode()
        calls: list[str] = []

        def fake_urlopen(request, timeout=10):
            url = request.full_url if hasattr(request, "full_url") else str(request)
            calls.append(url)
            if "nominatim" in url:
                return _Resp(b"[]")  # Nominatim: no results, force Mapbox fallback
            return _Resp(mapbox_payload)

        with tempfile.TemporaryDirectory() as tmp:
            orig = rp.GEOCODE_CACHE_PATH
            try:
                rp.GEOCODE_CACHE_PATH = Path(tmp) / "cache.json"
                rp._geocode_cache = None
                rp._last_geocode_ts = 0.0
                rp._last_mapbox_ts = 0.0
                rp._mapbox_token_value = "fake-token"  # enable Mapbox
                with mock.patch.object(rp.urllib.request, "urlopen", fake_urlopen):
                    result = rp.default_geocode("Porto's Bakery", None, allow_name_only=True)
                lat, lng, detail, geocoded_city = result
                self.assertAlmostEqual(lat, 33.829, places=2)
                self.assertAlmostEqual(lng, -117.998, places=2)
                self.assertIn("Porto's Bakery", detail)
                self.assertEqual(geocoded_city, "Buena Park")
                # Cache key uses "" for the city so it doesn't collide with city-hint runs.
                cached = json.loads(rp.GEOCODE_CACHE_PATH.read_text())
                self.assertIn("porto's bakery|", cached)
            finally:
                rp.GEOCODE_CACHE_PATH = orig
                rp._geocode_cache = None
                rp._last_geocode_ts = 0.0
                rp._last_mapbox_ts = 0.0
                rp._mapbox_token_value = None


class NegativeCacheTests(unittest.TestCase):
    """A 'no results' outcome must NOT be cached, so it is retried next run."""

    def test_no_results_is_not_cached(self):
        class _Resp:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b"[]"  # Nominatim: empty -> "no results"

        calls = {"n": 0}

        def fake_urlopen(request, timeout=10):
            calls["n"] += 1
            return _Resp()

        with tempfile.TemporaryDirectory() as tmp:
            orig = rp.GEOCODE_CACHE_PATH
            try:
                rp.GEOCODE_CACHE_PATH = Path(tmp) / "cache.json"
                rp._geocode_cache = None
                rp._last_geocode_ts = 0.0
                rp._mapbox_token_value = ""  # disable Mapbox fallback to isolate Nominatim
                with mock.patch.object(rp.urllib.request, "urlopen", fake_urlopen):
                    r1 = rp.default_geocode("Nonexistent Spot", "Santa Ana")
                    r2 = rp.default_geocode("Nonexistent Spot", "Santa Ana")
                self.assertEqual(r1, (None, None, "no results", None))
                self.assertEqual(r2, (None, None, "no results", None))
                self.assertEqual(calls["n"], 2)  # not cached -> queried both times
            finally:
                rp.GEOCODE_CACHE_PATH = orig
                rp._geocode_cache = None
                rp._last_geocode_ts = 0.0
                rp._mapbox_token_value = None


class MapboxAcceptGateTests(unittest.TestCase):
    """The name+city gate must accept correct matches and reject fuzzy ones."""

    def test_name_score_subset_and_dissimilar(self):
        self.assertGreaterEqual(rp._name_score("El Indio", "El Indio Botanas y Cerveza"), 0.9)
        self.assertLess(rp._name_score("Sabroso Mexican Kitchen",
                                       "US Home Kitchen & Bathroom Remodeling"), 0.5)

    def test_accepts_correct_matches(self):
        self.assertTrue(rp._mapbox_accept("Burritos La Palma", "santaana",
                                          "Burritos La Palma", "410 N Bristol St, Santa Ana, CA"))
        self.assertTrue(rp._mapbox_accept("El Indio", "irvine",
                                          "El Indio Botanas y Cerveza", "Some St, Anaheim, CA"))
        self.assertTrue(rp._mapbox_accept("Los Grandes", "santaana",
                                          "Taqueria Los Grandes", "5th St, Santa Ana, CA"))

    def test_rejects_fuzzy_false_positives(self):
        self.assertFalse(rp._mapbox_accept("Sabroso Mexican Kitchen", "gardengrove",
                                           "US Home Kitchen & Bathroom Remodeling",
                                           "Park Ave, Garden Grove, CA"))
        self.assertFalse(rp._mapbox_accept("Bunz Burger Joint", "huntingtonbeach",
                                           "Burt's Burgers Huntington Beach",
                                           "221 Main St, Huntington Beach, CA"))
        self.assertFalse(rp._mapbox_accept("Greek Bistro", "lakeforest",
                                           "Lake Forest Preschool", "Lake Forest, CA"))

    def test_pick_prefers_city_match_for_chains(self):
        cands = [
            (33.60, -117.86, "Claro's Italian Market & Deli", "2795 Cabot Dr, Corona del Mar, CA"),
            (33.74, -117.81, "Claro's Italian Market & Deli", "1095 Old Town, Tustin, CA"),
        ]
        picked = rp._mapbox_pick(cands, "Claro's Italian Deli", "tustin")
        self.assertIn("Tustin", picked[3])  # the Tustin branch, not Corona del Mar

    def test_pick_falls_back_to_best_name_without_city(self):
        cands = [(33.80, -117.92, "Puesto Anaheim", "1040 W Katella Ave, Anaheim, CA")]
        picked = rp._mapbox_pick(cands, "Puesto", "sanjuan")  # city won't match
        self.assertEqual(picked[2], "Puesto Anaheim")
        self.assertIsNone(rp._mapbox_pick([], "X", "y"))


if __name__ == "__main__":
    unittest.main()
