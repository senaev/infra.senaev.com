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

    def test_refuses_a_directory_that_no_longer_matches_the_inherited_descriptor(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'target').mkdir()
            (root / 'other').mkdir()
            directory = os.open(root / 'other', secure.DIR_FLAGS)
            try:
                saved = os.dup(3)
            except OSError:
                saved = None
            os.dup2(directory, 3)
            try:
                with self.assertRaises(secure.ForbiddenPath):
                    secure.publish({'root': str(root), 'parent': 'target', 'name': 'data.csv',
                                    'content': 'updated', 'exclusive': True})
                self.assertFalse((root / 'other' / 'data.csv').exists())
            finally:
                if saved is not None:
                    os.dup2(saved, 3)
                    os.close(saved)
                elif directory != 3:
                    os.close(3)
                os.close(directory)

    def test_error_codes(self):
        self.assertEqual(secure.error_code(FileExistsError()), 'conflict')
        self.assertEqual(secure.error_code(secure.ForbiddenPath()), 'forbidden_path')
        self.assertEqual(secure.error_code(OSError('No space left on device')), 'command_failed')


if __name__ == '__main__':
    unittest.main()
