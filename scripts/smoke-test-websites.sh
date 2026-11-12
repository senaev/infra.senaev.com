#!/bin/sh
# Manual public website checks: ./scripts/smoke-test-websites.sh
# Runs from any host; no Kubernetes context or credentials required.
set -u

failures=0
check_url() {
    url=$1
    expected_url=$2
    if response=$(curl --disable --silent --show-error --location \
        --proto '=https' --proto-redir '=https' \
        --connect-timeout 5 --max-time 15 --max-redirs 5 \
        --output /dev/null --write-out '%{http_code} %{url_effective}' "$url"); then
        status=${response%% *}
        final_url=${response#* }
        if [ "$status" = 200 ] && [ "$final_url" = "$expected_url" ]; then
            printf 'PASS %s -> %s\n' "$url" "$final_url"
            return
        fi
        printf 'FAIL %s: expected 200 %s; got %s\n' "$url" "$expected_url" "$response" >&2
    else
        printf 'FAIL %s: curl request failed\n' "$url" >&2
    fi
    failures=$((failures + 1))
}

check_url https://senaev.ru https://senaev.ru/
check_url https://senaev.com https://senaev.com/
check_url https://s.senaev.com/1bxsl9 https://senaev.com/cv/5min
check_url https://static.senaev.com/hello-world/ https://static.senaev.com/hello-world/
check_url https://senaev.com/notes/my_blog_post_senaev_speaks_12 https://senaev.com/notes/my_blog_post_senaev_speaks_12

if [ "$failures" -ne 0 ]; then
    printf '%s smoke check(s) failed\n' "$failures" >&2
    exit 1
fi
printf 'All 5 website smoke checks passed\n'
