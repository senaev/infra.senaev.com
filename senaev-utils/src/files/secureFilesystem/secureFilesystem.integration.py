"""Real descriptor and race tests; called by the Vitest integration suite."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import secureFilesystem as secure


class FilesystemTests(unittest.TestCase):
    def test_publication_remains_anchored_during_final_syscall(self):
        for exclusive in (False, True):
            with self.subTest(exclusive=exclusive), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                (root / 'target').mkdir()
                (root / 'other').mkdir()
                (root / 'target' / 'data.csv').write_text('original')
                (root / 'other' / 'data.csv').write_text('private')
                directory = os.open(root / 'target', secure.DIR_FLAGS)
                # publish consumes inherited fd 3; preserve any descriptor already there.
                try:
                    saved = os.dup(3)
                except OSError:
                    saved = None
                os.dup2(directory, 3)
                original_call = os.link if exclusive else os.replace
                name = 'new.csv' if exclusive else 'data.csv'

                def swap_then_publish(*args, **kwargs):
                    (root / 'target').rename(root / 'moved')
                    (root / 'target').symlink_to(root / 'other', target_is_directory=True)
                    return original_call(*args, **kwargs)

                try:
                    with patch.object(secure.os, 'link' if exclusive else 'replace', swap_then_publish):
                        secure.publish({'root': str(root), 'parent': 'target', 'name': name,
                                        'content': 'updated', 'exclusive': exclusive})
                    self.assertEqual((root / 'moved' / name).read_text(), 'updated')
                    self.assertEqual((root / 'other' / 'data.csv').read_text(), 'private')
                    self.assertFalse((root / 'other' / 'new.csv').exists())
                    self.assertFalse(list((root / 'moved').glob('.*.tmp')))
                finally:
                    if saved is not None:
                        os.dup2(saved, 3)
                        os.close(saved)
                    elif directory != 3:
                        os.close(3)
                    os.close(directory)

    def test_file_open_refuses_parent_swapped_after_listing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'target').mkdir()
            (root / 'other').mkdir()
            (root / 'target' / 'data.txt').write_text('ordinary')
            (root / 'other' / 'data.txt').write_text('private')
            directory = secure.open_directory(os.path.realpath(folder))
            real_open = os.open

            def swap_before_open(path, *args, **kwargs):
                if path == 'target':
                    (root / 'target').rename(root / 'moved')
                    (root / 'target').symlink_to(root / 'other', target_is_directory=True)
                return real_open(path, *args, **kwargs)

            try:
                with patch.object(secure.os, 'open', swap_before_open):
                    with self.assertRaises(OSError):
                        secure.read_file(directory, 'target/data.txt')
            finally:
                os.close(directory)

    def test_snapshot_keeps_ignore_rules_and_skips_symlinks_and_large_files(self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as destination:
            parent = Path(folder)
            root = parent / 'project'
            root.mkdir()
            (root / '.gitignore').write_text('ignored.txt\n')
            (root / 'ignored.txt').write_text('private')
            (root / 'a.txt').write_text('ordinary')
            (root / 'big.txt').write_bytes(b'x' * (secure.MAX_FILE + 1))
            (root / 'link.txt').symlink_to(root / 'ignored.txt')
            secure.snapshot(folder, 'project', destination)
            result = Path(destination)
            self.assertEqual((result / 'a.txt').read_text(), 'ordinary')
            self.assertEqual((result / 'ignored.txt').read_text(), '')
            self.assertFalse((result / 'link.txt').exists())
            self.assertFalse((result / 'big.txt').exists())


if __name__ == '__main__':
    unittest.main()
