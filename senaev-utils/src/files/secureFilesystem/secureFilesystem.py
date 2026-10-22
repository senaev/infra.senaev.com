"""Descriptor-relative filesystem operations; never follow a live tree's symlinks."""
import errno
import json
import os
import secrets
import stat
import subprocess
import sys

DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
MAX_FILE = 1024 * 1024
MAX_ENTRIES = 200000
MAX_BYTES = 256 * 1024 * 1024


def open_directory(path):
    """Resolve every absolute component with openat + O_NOFOLLOW."""
    fd = os.open('/', DIR_FLAGS)
    try:
        for component in os.path.abspath(path).split('/'):
            if component:
                next_fd = os.open(component, DIR_FLAGS, dir_fd=fd)
                os.close(fd)
                fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_file(root, path):
    parts = path.split('/')
    parent = os.dup(root)
    try:
        for part in parts[:-1]:
            next_fd = os.open(part, DIR_FLAGS, dir_fd=parent)
            os.close(parent)
            parent = next_fd
        fd = os.open(parts[-1], FILE_FLAGS, dir_fd=parent)
        try:
            metadata = os.fstat(fd)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_FILE:
                return None
            with os.fdopen(fd, 'rb', closefd=False) as source:
                content = source.read(MAX_FILE + 1)
            return content if len(content) <= MAX_FILE else None
        finally:
            os.close(fd)
    finally:
        os.close(parent)


def snapshot(root_path, project, destination, glob=None):
    # The configured projects folder is trusted; each project and every descendant
    # is opened relative to it without following a symlink (including during races).
    parent = open_directory(os.path.realpath(root_path))
    try:
        root = os.open(project, DIR_FLAGS, dir_fd=parent)
    finally:
        os.close(parent)
    entries = 0
    copied = 0
    try:
        def walk(directory, relative=''):
            nonlocal entries, copied
            for name in os.listdir(directory):
                entries += 1
                if entries > MAX_ENTRIES:
                    raise ValueError('Search tree exceeds 200000 entries')
                if name == '.git':
                    continue
                path = f'{relative}/{name}' if relative else name
                metadata = os.stat(name, dir_fd=directory, follow_symlinks=False)
                target = os.path.join(destination, path)
                if stat.S_ISDIR(metadata.st_mode):
                    try:
                        child = os.open(name, DIR_FLAGS, dir_fd=directory)
                    except OSError as error:
                        if error.errno in (errno.ELOOP, errno.ENOTDIR, errno.ENOENT):
                            continue
                        raise
                    try:
                        os.mkdir(target)
                        walk(child, path)
                    finally:
                        os.close(child)
                elif stat.S_ISREG(metadata.st_mode) and metadata.st_size <= MAX_FILE:
                    # Empty placeholders let rg apply its own ignore semantics without
                    # reading any live path. Only ignore rules are copied at this stage.
                    content = read_file(root, path) if name in ('.gitignore', '.ignore', '.rgignore') else b''
                    if content is not None:
                        copied += len(content)
                        if copied > MAX_BYTES:
                            raise ValueError('Search snapshot exceeds 256 MiB')
                        with open(target, 'xb') as output:
                            output.write(content)
        walk(root)
        os.mkdir(os.path.join(destination, '.git'))
        # Preserve repository-local exclusions without copying git's private data.
        try:
            exclude = read_file(root, '.git/info/exclude')
        except OSError as error:
            if error.errno not in (errno.ENOENT, errno.ELOOP, errno.ENOTDIR):
                raise
            exclude = None
        if exclude is not None:
            os.mkdir(os.path.join(destination, '.git', 'info'))
            with open(os.path.join(destination, '.git', 'info', 'exclude'), 'xb') as output:
                output.write(exclude)
        arguments = ['rg', '--no-config', '--files', '--hidden', '--glob', '!.git']
        if glob is not None:
            arguments.extend(['--glob-case-insensitive', '--glob', glob])
        result = subprocess.run([*arguments, '-0', '.'],
                                cwd=destination, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20, check=False)
        if result.returncode not in (0, 1):
            raise ValueError('Cannot enumerate search snapshot')
        for raw in result.stdout.split(b'\0'):
            if not raw:
                continue
            path = os.fsdecode(raw)
            if path.startswith('./'):
                path = path[2:]
            if os.path.basename(path) in ('.gitignore', '.ignore', '.rgignore'):
                continue  # Freeze the rules used to select this snapshot.
            try:
                content = read_file(root, path)
            except OSError as error:
                if error.errno in (errno.ENOENT, errno.ELOOP, errno.ENOTDIR):
                    content = None
                else:
                    raise
            target = os.path.join(destination, path)
            if content is None:
                os.unlink(target)
                continue
            copied += len(content)
            if copied > MAX_BYTES:
                raise ValueError('Search snapshot exceeds 256 MiB')
            with open(target, 'wb') as output:
                output.write(content)
    finally:
        os.close(root)


def publish(request):
    directory = 3  # Inherited from the verified Node directory descriptor.
    parent = open_directory(os.path.realpath(request['root']))
    try:
        for component in request['parent'].split('/'):
            if component and component != '.':
                next_fd = os.open(component, DIR_FLAGS, dir_fd=parent)
                os.close(parent)
                parent = next_fd
        expected = os.fstat(parent)
        opened = os.fstat(directory)
        if (opened.st_dev, opened.st_ino) != (expected.st_dev, expected.st_ino):
            raise ValueError('CSV publication directory changed')
    finally:
        os.close(parent)
    name = request['name']
    if not name or name in ('.', '..') or '/' in name or '\\' in name:
        raise ValueError('Invalid publication basename')
    temporary = '.' + name + '.' + secrets.token_hex(12) + '.tmp'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o666, dir_fd=directory)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(request['content'].encode('utf-8'))
            if not request['exclusive']:
                try:
                    metadata = os.stat(name, dir_fd=directory, follow_symlinks=False)
                    os.fchmod(output.fileno(), stat.S_IMODE(metadata.st_mode))
                except FileNotFoundError:
                    pass
        if request['exclusive']:
            os.link(temporary, name, src_dir_fd=directory, dst_dir_fd=directory, follow_symlinks=False)
        else:
            os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass



def main():
    try:
        request = json.load(sys.stdin)
        if request['operation'] == 'snapshot':
            snapshot(request['root'], request['project'], request['destination'], request.get('glob'))
        elif request['operation'] == 'publish':
            publish(request)
        else:
            raise ValueError('Unknown filesystem operation')
        print(json.dumps({'ok': True}))
    except Exception as error:
        code = 'conflict' if isinstance(error, FileExistsError) else 'forbidden_path'
        print(json.dumps({'error': code, 'message': str(error)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
