"""Descriptor-relative file publication; never follow a live tree's symlinks."""
import json
import base64
import hashlib
import os
import secrets
import stat
import sys

DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


class ForbiddenPath(Exception):
    """The verified directory changed, or the requested name is not a plain basename."""


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


class FileChanged(Exception):
    """The opened file was modified while its bytes were being hashed."""


class TooLarge(Exception):
    """The bounded read exceeded its byte limit."""


def open_relative(root, path, flags):
    parts = path.split('/')
    if any(part in ('', '.', '..') for part in parts) or path.startswith('/'):
        raise ForbiddenPath('Invalid relative file path')
    parent = os.dup(root)
    try:
        for part in parts[:-1]:
            next_fd = os.open(part, DIR_FLAGS, dir_fd=parent)
            os.close(parent)
            parent = next_fd
        return os.open(parts[-1], flags | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    except OSError as error:
        raise ForbiddenPath('File cannot be opened without symlinks') from error
    finally:
        os.close(parent)


def read_file(request):
    root = open_directory(os.path.realpath(request['root']))
    try:
        fd = open_relative(root, request['path'], os.O_RDONLY)
    finally:
        os.close(root)
    try:
        initial = os.fstat(fd)
        if not stat.S_ISREG(initial.st_mode):
            raise ForbiddenPath('Downloads require a regular file')
        maximum = request['maxBytes']
        if initial.st_size > maximum:
            raise TooLarge(f'File exceeds {maximum} byte read limit')
        start = request.get('offset', 0)
        end = start + request.get('length', maximum)
        digest = hashlib.sha256()
        chunks = []
        size = 0
        while True:
            chunk = os.read(fd, min(65536, maximum - size + 1))
            if not chunk:
                break
            if size + len(chunk) > maximum:
                raise TooLarge(f'File exceeds {maximum} byte read limit')
            digest.update(chunk)
            left, right = max(0, start - size), min(len(chunk), end - size)
            if right > left:
                chunks.append(chunk[left:right])
            size += len(chunk)
        final = os.fstat(fd)
        if (initial.st_size, initial.st_mtime_ns, initial.st_ctime_ns) != (final.st_size, final.st_mtime_ns, final.st_ctime_ns):
            raise FileChanged('File changed during download; request fresh metadata')
        return {'bytes': base64.b64encode(b''.join(chunks)).decode('ascii'), 'size': size, 'hash': digest.hexdigest()}
    finally:
        os.close(fd)


def search(root_path, project, arguments):
    # Only the configured projects parent is trusted. The project itself may be
    # replaced between Node validation and process launch, so open it with NOFOLLOW.
    if '/' in project or project in ('', '.', '..'):
        raise ForbiddenPath('Invalid project name')
    parent = open_directory(os.path.realpath(root_path))
    try:
        directory = os.open(project, DIR_FLAGS, dir_fd=parent)
    except OSError as error:
        raise ForbiddenPath('Project directory changed before search') from error
    finally:
        os.close(parent)
    try:
        os.fchdir(directory)
    finally:
        os.close(directory)
    os.execvp('rg', arguments)


def publish(request):
    directory = 3  # Inherited from the verified Node directory descriptor.
    try:
        parent = open_directory(os.path.realpath(request['root']))
    except OSError as error:
        raise ForbiddenPath('CSV publication root cannot be opened without symlinks') from error
    try:
        for component in request['parent'].split('/'):
            if component and component != '.':
                try:
                    next_fd = os.open(component, DIR_FLAGS, dir_fd=parent)
                except OSError as error:
                    raise ForbiddenPath('CSV publication directory changed') from error
                os.close(parent)
                parent = next_fd
        expected = os.fstat(parent)
        opened = os.fstat(directory)
        if (opened.st_dev, opened.st_ino) != (expected.st_dev, expected.st_ino):
            raise ForbiddenPath('CSV publication directory changed')
    finally:
        os.close(parent)
    name = request['name']
    if not name or name in ('.', '..') or '/' in name or '\\' in name:
        raise ForbiddenPath('Invalid publication basename')
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


def error_code(error):
    if isinstance(error, TooLarge):
        return 'file_too_large'
    if isinstance(error, FileChanged):
        return 'conflict'
    if isinstance(error, FileExistsError):
        return 'conflict'
    if isinstance(error, ForbiddenPath):
        return 'forbidden_path'
    return 'command_failed'


def main():
    try:
        request = json.load(sys.stdin)
        result = None
        if request['operation'] == 'publish':
            publish(request)
        elif request['operation'] == 'read':
            result = read_file(request)
        else:
            raise ValueError('Unknown filesystem operation')
        print(json.dumps({'ok': True, 'result': result}))
    except Exception as error:
        code = error_code(error)
        message = 'File already exists; read its current hash before editing' if isinstance(error, FileExistsError) else str(error)
        print(json.dumps({'error': code, 'message': message, 'details': {'reason': 'version_changed', 'retryable': False} if isinstance(error, FileChanged) else None}))
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--search':
        try:
            search(sys.argv[2], sys.argv[3], json.loads(sys.argv[4]))
        except Exception:
            print('Project directory cannot be opened safely', file=sys.stderr)
            sys.exit(77)
    else:
        main()
