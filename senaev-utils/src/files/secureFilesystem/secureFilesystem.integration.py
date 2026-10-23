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

    def test_secure_read_refuses_parent_substitution_at_open(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'files').mkdir()
            (root / 'private').mkdir()
            (root / 'files' / 'a.pdf').write_text('ordinary')
            (root / 'private' / 'a.pdf').write_text('PRIVATE-FIXTURE')
            real_open = os.open

            def substitute(path, *args, **kwargs):
                if path == 'files':
                    (root / 'files').rename(root / 'moved')
                    (root / 'files').symlink_to(root / 'private', target_is_directory=True)
                return real_open(path, *args, **kwargs)

            with patch.object(secure.os, 'open', substitute):
                with self.assertRaises(secure.ForbiddenPath):
                    secure.read_file({'root': folder, 'path': 'files/a.pdf', 'maxBytes': 1024})

    def test_reads_pinned_file_when_parent_is_substituted_after_open(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'files').mkdir()
            (root / 'private').mkdir()
            (root / 'files' / 'a.pdf').write_text('ordinary')
            (root / 'private' / 'a.pdf').write_text('PRIVATE-FIXTURE')
            read = os.read
            replaced = False

            def substitute(*args):
                nonlocal replaced
                if not replaced:
                    (root / 'files').rename(root / 'moved')
                    (root / 'files').symlink_to(root / 'private', target_is_directory=True)
                    replaced = True
                return read(*args)

            with patch.object(secure.os, 'read', substitute):
                result = secure.read_file({'root': folder, 'path': 'files/a.pdf', 'maxBytes': 1024})
            self.assertEqual(result['bytes'], 'b3JkaW5hcnk=')

    def test_read_version_and_size_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'a.pdf'
            path.write_text('ordinary')
            with self.assertRaises(secure.TooLarge):
                secure.read_file({'root': folder, 'path': 'a.pdf', 'maxBytes': 2})
            read = os.read
            changed = False

            def modify(*args):
                nonlocal changed
                content = read(*args)
                if not changed:
                    path.write_text('modified')
                    os.utime(path, (1, 1))
                    changed = True
                return content

            with patch.object(secure.os, 'read', modify):
                with self.assertRaises(secure.FileChanged):
                    secure.read_file({'root': folder, 'path': 'a.pdf', 'maxBytes': 1024})

    def test_search_pins_project_directory_before_exec(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'project').mkdir()
            (root / 'private').mkdir()
            previous = os.open('.', secure.DIR_FLAGS)
            fchdir = os.fchdir
            visited = []

            def replace_then_chdir(directory):
                (root / 'project').rename(root / 'moved')
                (root / 'project').symlink_to(root / 'private', target_is_directory=True)
                fchdir(directory)

            def record_exec(*args):
                visited.append(os.getcwd())
                raise RuntimeError('exec intercepted')

            try:
                with patch.object(secure.os, 'fchdir', replace_then_chdir), patch.object(secure.os, 'execvp', record_exec):
                    with self.assertRaisesRegex(RuntimeError, 'exec intercepted'):
                        secure.search(folder, 'project', ['rg', '.'])
                self.assertEqual(visited, [str((root / 'moved').resolve())])
            finally:
                fchdir(previous)
                os.close(previous)

    def test_error_codes(self):
        self.assertEqual(secure.error_code(FileExistsError()), 'conflict')
        self.assertEqual(secure.error_code(secure.FileChanged()), 'conflict')
        self.assertEqual(secure.error_code(secure.TooLarge()), 'file_too_large')
        self.assertEqual(secure.error_code(secure.ForbiddenPath()), 'forbidden_path')
        self.assertEqual(secure.error_code(OSError('No space left on device')), 'command_failed')


if __name__ == '__main__':
    unittest.main()
