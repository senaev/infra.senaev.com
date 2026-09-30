#!/usr/bin/env bash
set -euo pipefail

# Syntax checks for the files that no package toolchain covers.
# Usage: bash scripts/check-syntax.sh <python|shell|helm>

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Untracked files are included so a new file is checked before it is first committed.
list_files() {
  git ls-files --cached --others --exclude-standard -- "$@" | while IFS= read -r file; do
    [[ -f "$file" ]] && echo "$file"
  done
}

check_python() {
  local files=()
  while IFS= read -r file; do files+=("$file"); done < <(list_files '*.py')

  # ast.parse instead of py_compile, so no __pycache__ is written into the chart directories.
  python3 -c '
import ast, sys
failed = False
for path in sys.argv[1:]:
    with open(path, encoding="utf-8") as source:
        try:
            ast.parse(source.read(), path)
        except SyntaxError as error:
            print(f"{path}:{error.lineno}:{error.offset}: {error.msg}", file=sys.stderr)
            failed = True
sys.exit(1 if failed else 0)
' "${files[@]}"
  echo "Python syntax OK: ${#files[@]} file(s)"
}

check_shell() {
  local failed=0 count=0 interpreter
  while IFS= read -r file; do
    count=$((count + 1))
    # POSIX sh scripts run in busybox/alpine images, so check them with sh, not bash.
    if head -n1 "$file" | grep -Eq '^#!(/usr)?/bin/(env )?sh$'; then
      interpreter=sh
    else
      interpreter=bash
    fi
    "$interpreter" -n "$file" || { echo "Syntax error ($interpreter): $file" >&2; failed=1; }
  done < <(list_files '*.sh')

  [[ $failed -eq 0 ]] || exit 1
  echo "Shell syntax OK: $count file(s)"
}

# Same values as upgrade-namespace.sh passes to helm upgrade.
check_helm() {
  local failed=0 chart_dir
  local common_values="provisioning/helm/common-values.yaml"
  for chart_dir in provisioning/helm/*/; do
    chart_dir="${chart_dir%/}"
    [[ -f "$chart_dir/Chart.yaml" ]] || continue

    local values_args=(-f "$common_values")
    [[ -f "$chart_dir/values.yaml" ]] && values_args+=(-f "$chart_dir/values.yaml")

    helm lint "$chart_dir" --quiet "${values_args[@]}" || failed=1
  done

  [[ $failed -eq 0 ]] || exit 1
  echo "Helm charts OK"
}

case "${1:-}" in
  python) check_python ;;
  shell) check_shell ;;
  helm) check_helm ;;
  *)
    echo "Usage: $0 <python|shell|helm>" >&2
    exit 1
    ;;
esac
