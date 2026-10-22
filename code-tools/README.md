# Code Tools


Search builds a private snapshot using Python 3 directory descriptors and `O_NOFOLLOW`,
then runs ripgrep against that snapshot. Live symlink replacements cannot redirect reads.
Repository ignore rules, hidden files and explicit globs are preserved. Each file keeps
its existing 1 MiB search limit; snapshots are bounded to 200,000 tree entries and
256 MiB of searchable content, with a 30 second preparation deadline. Python 3 and
ripgrep are required (both are included in the service image). Temporary snapshots are
removed after success, failure or cancellation. A snapshot is a safe copy, not a
transactional view of simultaneous in-place edits.
