#!/usr/bin/env python3
"""Tests for scripts/reingest_all_threads.py."""
from __future__ import annotations

import importlib.util
import io
import os
import sys
import tempfile
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


class ReingestAllThreadsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_reingest_module()

    def _make_threads_dir(self, tmp_path: Path, filenames: list[str]) -> Path:
        threads = tmp_path / "data" / "threads"
        threads.mkdir(parents=True)
        for name in filenames:
            (threads / name).write_text(f"<html>{name}</html>", encoding="utf-8")
        return threads

    def test_dry_run_lists_files_without_side_effects(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            names = ["orangecounty-bbb222.html", "orangecounty-aaa111.html"]
            threads = self._make_threads_dir(tmp_path, names)

            with mock.patch.object(self.mod, "b") as fake_b, \
                mock.patch.object(self.mod, "rp") as fake_rp:
                code = self.mod.reingest_all(
                    threads_root=threads,
                    dry_run=True,
                )

            self.assertEqual(code, 0)
            fake_b.backup.assert_not_called()
            fake_b._connect.assert_not_called()
            fake_rp.ingest.assert_not_called()

    def test_missing_yes_exits_before_db_changes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            threads = self._make_threads_dir(tmp_path, ["orangecounty-aaa111.html"])

            with mock.patch.object(self.mod, "b") as fake_b, \
                mock.patch.object(self.mod, "rp") as fake_rp:
                code = self.mod.reingest_all(
                    threads_root=threads,
                    confirmed=False,
                )

            self.assertEqual(code, 2)
            fake_b.backup.assert_not_called()
            fake_b._connect.assert_not_called()
            fake_rp.ingest.assert_not_called()

    def test_no_html_files_exits_before_db_changes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            threads = tmp_path / "data" / "threads"
            threads.mkdir(parents=True)

            with mock.patch.object(self.mod, "b") as fake_b, \
                mock.patch.object(self.mod, "rp") as fake_rp:
                code = self.mod.reingest_all(
                    threads_root=threads,
                    confirmed=True,
                )

            self.assertEqual(code, 1)
            fake_b.backup.assert_not_called()
            fake_b._connect.assert_not_called()
            fake_rp.ingest.assert_not_called()

    def test_successful_rebuild_orders_backup_purge_and_ingest(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            names = ["orangecounty-bbb222.html", "orangecounty-aaa111.html"]
            threads = self._make_threads_dir(tmp_path, names)

            fake_conn = mock.MagicMock()
            fake_cursor = mock.MagicMock()
            fake_conn.cursor.return_value.__enter__.return_value = fake_cursor

            with mock.patch.object(self.mod, "b") as fake_b, \
                mock.patch.object(self.mod, "rp") as fake_rp, \
                mock.patch.dict(os.environ, {"DATABASE_URL": "postgres://stub"}):
                fake_b.backup.return_value = "data/backups/db-backup-test.json"
                fake_b._url.return_value = "postgres://from-env"
                fake_b._connect.return_value = fake_conn

                code = self.mod.reingest_all(
                    threads_root=threads,
                    confirmed=True,
                )

                self.assertEqual(code, 0)
                fake_b.backup.assert_called_once()
                fake_b._connect.assert_called_once()
                fake_cursor.execute.assert_called_once_with(self.mod.PURGE_SQL)
                fake_conn.commit.assert_called_once()
                self.assertEqual(fake_rp.ingest.call_count, 2)
                self.assertEqual(
                    [call.args[0].name for call in fake_rp.ingest.call_args_list],
                    sorted(names),
                )
                self.assertEqual(os.environ["DATABASE_URL"], "postgres://from-env")

    def test_ingest_failure_stops_and_reports_backup_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            good, bad = "orangecounty-good11.html", "orangecounty-bad222.html"
            threads = self._make_threads_dir(tmp_path, [good, bad])

            fake_conn = mock.MagicMock()
            fake_cursor = mock.MagicMock()
            fake_conn.cursor.return_value.__enter__.return_value = fake_cursor

            def side_effect(html_path, **_kwargs):
                if html_path.name == bad:
                    raise RuntimeError("boom")

            backup_path = "data/backups/db-backup-failure.json"

            with mock.patch.object(self.mod, "b") as fake_b, \
                mock.patch.object(self.mod, "rp") as fake_rp, \
                mock.patch.dict(os.environ, {"DATABASE_URL": "postgres://stub"}), \
                mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
                fake_b.backup.return_value = backup_path
                fake_b._url.return_value = "postgres://from-env"
                fake_b._connect.return_value = fake_conn
                fake_rp.ingest.side_effect = side_effect

                code = self.mod.reingest_all(
                    threads_root=threads,
                    confirmed=True,
                )

            self.assertEqual(code, 1)
            self.assertEqual(fake_rp.ingest.call_count, 1)
            self.assertEqual(fake_rp.ingest.call_args.args[0].name, bad)
            self.assertIn(backup_path, stderr.getvalue())

    def test_main_dry_run_flag(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            threads = self._make_threads_dir(tmp_path, ["orangecounty-aaa111.html"])

            with mock.patch.object(self.mod, "THREADS_ROOT", threads), \
                mock.patch.object(self.mod, "b") as fake_b, \
                mock.patch.object(self.mod, "rp") as fake_rp:
                code = self.mod.main(["--dry-run"])

            self.assertEqual(code, 0)
            fake_b.backup.assert_not_called()
            fake_rp.ingest.assert_not_called()


if __name__ == "__main__":
    unittest.main()
