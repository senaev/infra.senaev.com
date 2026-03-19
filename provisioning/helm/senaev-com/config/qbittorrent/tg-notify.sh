#!/bin/sh
set -eu

# Arguments are passed as a single pipe-delimited string:
# <event>|<name>|<category>|<tags>|<contentPath>|<rootPath>|<savePath>|<fileCount>|<sizeBytes>|<tracker>
IFS='|' read -r EVENT NAME CATEGORY TAGS CONTENT_PATH ROOT_PATH SAVE_PATH FILE_COUNT SIZE_BYTES TRACKER <<EOF
$1
EOF

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

JSON=$(printf '{"records":[{"value":{"event":"%s","name":"%s","category":"%s","tags":"%s","contentPath":"%s","rootPath":"%s","savePath":"%s","fileCount":"%s","sizeBytes":"%s","tracker":"%s"}}]}' \
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

curl -s -X POST redpanda/topics/tg-send-to-media-server-topic \
  -H "Content-Type: application/vnd.kafka.json.v2+json" \
  -d "$JSON"
