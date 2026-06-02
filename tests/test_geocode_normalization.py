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

    def test_multi_city_takes_first(self):
        self.assertEqual(rp.normalize_location("Santa Ana/Garden Grove"), "Santa Ana")
        self.assertEqual(rp.normalize_location("Seal Beach or Los Alamitos"), "Seal Beach")

    def test_neighborhood_and_street_map_to_city(self):
        self.assertEqual(rp.normalize_location("Old Town Tustin"), "Tustin")
        self.assertEqual(rp.normalize_location("Anaheim Blvd"), "Anaheim")

    def test_canonical_passthrough_and_empty(self):
        self.assertEqual(rp.normalize_location("Costa Mesa"), "Costa Mesa")
        self.assertEqual(rp.normalize_location(" santa ana "), "Santa Ana")
        self.assertIsNone(rp.normalize_location(""))
        self.assertIsNone(rp.normalize_location(None))


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
                with mock.patch.object(rp.urllib.request, "urlopen", fake_urlopen):
                    r1 = rp.default_geocode("Nonexistent Spot", "Santa Ana")
                    r2 = rp.default_geocode("Nonexistent Spot", "Santa Ana")
                self.assertEqual(r1, (None, None, "no results"))
                self.assertEqual(r2, (None, None, "no results"))
                self.assertEqual(calls["n"], 2)  # not cached -> queried both times
            finally:
                rp.GEOCODE_CACHE_PATH = orig
                rp._geocode_cache = None
                rp._last_geocode_ts = 0.0


if __name__ == "__main__":
    unittest.main()
