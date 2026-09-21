"""Unit tests for scripts/db_backup.py."""

import json
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

# Ensure scripts directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../scripts")))

import db_backup


class DbBackupTest(unittest.TestCase):
    def test_tables_coverage(self):
        """Verify TABLES contains all 5 database schema tables in FK-safe order."""
        expected = ["threads", "restaurants", "mentions", "excluded_brands", "geocode_cache"]
        self.assertEqual(db_backup.TABLES, expected)

    @patch("db_backup._connect")
    def test_backup_writes_all_tables(self, mock_connect):
        """Verify backup dumps all 5 tables to a JSON file."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cur

        # Mock description and fetchall for each table
        mock_cur.description = [("id", None), ("name", None)]
        mock_cur.fetchall.return_value = [(1, "Test Row")]

        with tempfile.TemporaryDirectory() as tmpdir:
            orig_cwd = os.getcwd()
            try:
                os.chdir(tmpdir)
                filepath = db_backup.backup()
                self.assertTrue(os.path.exists(filepath))
                with open(filepath, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                for table in db_backup.TABLES:
                    self.assertIn(table, data)
                    self.assertEqual(data[table]["columns"], ["id", "name"])
                    self.assertEqual(data[table]["rows"], [{"id": 1, "name": "Test Row"}])
            finally:
                os.chdir(orig_cwd)

    @patch("db_backup._connect")
    def test_restore_safety_check_blocks_small_backups(self, mock_connect):
        """Verify restore raises SystemExit if live DB has >10 restaurants and backup has <50% without --force."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cur

        # Live DB has 100 restaurants
        mock_cur.fetchone.return_value = [100]

        # Backup file has only 2 restaurants (like e2e fixture)
        backup_data = {
            "restaurants": {"columns": ["id"], "rows": [{"id": 1}, {"id": 2}]}
        }

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump(backup_data, fh)
            temp_path = fh.name

        try:
            with self.assertRaises(SystemExit) as cm:
                db_backup.restore(temp_path, force=False)
            self.assertIn("Safety check failed", str(cm.exception))
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    @patch("db_backup._connect")
    def test_restore_force_bypasses_safety_check(self, mock_connect):
        """Verify restore proceeds when force=True even if backup file is significantly smaller."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value = mock_cur

        # Live DB has 100 restaurants
        mock_cur.fetchone.return_value = [100]

        backup_data = {
            "threads": {"columns": ["id"], "rows": []},
            "restaurants": {"columns": ["id"], "rows": [{"id": 1}]},
            "mentions": {"columns": ["id"], "rows": []},
            "excluded_brands": {"columns": ["id"], "rows": []},
            "geocode_cache": {"columns": ["id"], "rows": []},
        }

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump(backup_data, fh)
            temp_path = fh.name

        try:
            # Should complete without error when force=True
            db_backup.restore(temp_path, force=True)
            self.assertTrue(mock_cur.execute.called)
            self.assertTrue(mock_conn.commit.called)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)


if __name__ == "__main__":
    unittest.main()
