#!/usr/bin/env bash
set -euo pipefail

# Installs the dependencies of the root toolchain and of every package, each from its own
# lockfile. There is no workspace hoisting, so a fresh clone needs all of them before lint,
# typecheck and the tests can run. A package is any folder with a committed package-lock.json.
# Usage: npm run ci:all

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Read into an array first: npm ci (its `prepare` script) reads stdin, so a `while read` loop
# over a pipe would stop after the first package.
mapfile -t lockfiles < <(git ls-files -- 'package-lock.json' '*/package-lock.json')

for lockfile in "${lockfiles[@]}"; do
  folder="$(dirname "$lockfile")"
  # The root `prepare` script installs the lefthook git hooks. That is a separate, manual step
  # (see "Git hooks" in AGENTS.md): it fails where core.hooksPath is managed, and in the
  # opencode-serve container it would add the full checks to every `git push`.
  ignore_scripts=()
  [[ "$folder" == "." ]] && ignore_scripts=(--ignore-scripts)

  echo "📦 npm ci in ${folder}"
  npm ci --prefix "$folder" --no-audit --no-fund "${ignore_scripts[@]}" < /dev/null
done
