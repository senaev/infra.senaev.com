# Project worklog

## 2026-11-14 21:40 UTC — Complete migration and move documentation into projects

The user confirmed that everything works after the fresh Madrid start. The
workspace was disabled in #188, re-enabled by commit 4f1a144e, and explicit
required enable flags were added in #189. GitHub reported successful deployments
for both the re-enable and #189 revisions. Code Tools passed filesystem, command,
git and GitHub operations; Grafana confirmed all three workspace pods on Madrid.

The user supplied the following cleanup output:

```text
persistentvolume "pvc-b70b3527-6ab1-4332-aa13-1765c2604f3b" deleted
persistentvolume "pvc-e73f0873-e3c8-46db-9f5f-dec208926ef5" deleted
persistentvolume "pvc-8c2c8049-f656-49d5-90a2-6f2cff1f7ee9" deleted
```

The user also reported running the command to remove these old Hetzner data
directories and OpenCode's host directory. The migration intentionally discards
the old state; those copies must no longer be described as rollback backups.

At the user's request, moved the completion document from docs/ into this project,
added this worklog, and updated the repository instructions link. No migration
work remains.
