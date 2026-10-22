"""Descriptor-relative file publication; never follow a live tree's symlinks."""
import json
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
    if isinstance(error, FileExistsError):
        return 'conflict'
    if isinstance(error, ForbiddenPath):
        return 'forbidden_path'
    return 'command_failed'


def main():
    try:
        request = json.load(sys.stdin)
        if request['operation'] != 'publish':
            raise ValueError('Unknown filesystem operation')
        publish(request)
        print(json.dumps({'ok': True}))
    except Exception as error:
        code = error_code(error)
        message = 'File already exists; read its current hash before editing' if code == 'conflict' else str(error)
        print(json.dumps({'error': code, 'message': message}))
        sys.exit(1)


if __name__ == "__main__":
    main()
