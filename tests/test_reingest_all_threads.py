#!/usr/bin/env python3
"""Tests for scripts/reingest_all_threads.py (thin wrapper around reddit_pipeline reingest)."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def load_reingest_module():
    spec = importlib.util.spec_from_file_location(
        "reingest_all_threads",
        SCRIPTS / "reingest_all_threads.py",
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["reingest_all_threads"] = module
    spec.loader.exec_module(module)
    return module


class ReingestWrapperTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_reingest_module()

    def test_main_delegates_to_reddit_pipeline_reingest(self):
        with mock.patch.object(self.mod.rp, "main", return_value=0) as fake_main:
            code = self.mod.rp.main(["reingest", "--dry-run"])
        self.assertEqual(code, 0)
        fake_main.assert_called_once_with(["reingest", "--dry-run"])

    def test_module_exposes_rp(self):
        self.assertTrue(hasattr(self.mod, "rp"))


if __name__ == "__main__":
    unittest.main()
