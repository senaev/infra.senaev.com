#!/bin/sh
set -eu

RETRY_INTERVAL_SECONDS=3

# Arguments are passed as a single pipe-delimited string:
# <event>|<name>|<category>|<tags>|<contentPath>|<rootPath>|<savePath>|<fileCount>|<sizeBytes>|<tracker>
IFS='|' read -r EVENT NAME CATEGORY TAGS CONTENT_PATH ROOT_PATH SAVE_PATH FILE_COUNT SIZE_BYTES TRACKER <<EOF
$1
EOF

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

JSON=$(printf '{"event":"%s","name":"%s","category":"%s","tags":"%s","contentPath":"%s","rootPath":"%s","savePath":"%s","fileCount":"%s","sizeBytes":"%s","tracker":"%s"}' \
  "$(json_escape "$EVENT")" \
  "$(json_escape "$NAME")" \
  "$(json_escape "$CATEGORY")" \
  "$(json_escape "$TAGS")" \
  "$(json_escape "$CONTENT_PATH")" \
  "$(json_escape "$ROOT_PATH")" \
  "$(json_escape "$SAVE_PATH")" \
  "$(json_escape "$FILE_COUNT")" \
  "$(json_escape "$SIZE_BYTES")" \
  "$(json_escape "$TRACKER")")

until curl -fsS -X POST cluster-helper/qbittorrent/torrent-event \
  -H "Content-Type: application/json" \
  -d "$JSON"; do
  echo "❌ Failed to send qBittorrent event to cluster-helper, retrying in ${RETRY_INTERVAL_SECONDS}s..." >&2
  sleep "$RETRY_INTERVAL_SECONDS"
done
