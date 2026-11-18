#!/usr/bin/env bash
set -euo pipefail

# Git post-checkout hook, run by lefthook: installs the dependencies of a new worktree.
# Git runs this hook on every checkout and switch too, so it acts only when the previous HEAD
# is the all-zeros commit: that happens only in a new worktree (or a fresh clone).
# Skip it with SKIP_WORKTREE_INSTALL=1, or with `git worktree add --no-checkout`.
# Usage: scripts/post-checkout.sh <previous HEAD> <new HEAD> <branch checkout flag>

previous_head="${1:-}"

if [[ ! "$previous_head" =~ ^0+$ ]]; then
  exit 0
fi

if [[ -n "${SKIP_WORKTREE_INSTALL:-}" ]]; then
  echo "⏭️ SKIP_WORKTREE_INSTALL is set, not installing dependencies"
  exit 0
fi

echo "📦 New worktree: installing dependencies"
exec bash "$(dirname "$0")/ci-all.sh"
