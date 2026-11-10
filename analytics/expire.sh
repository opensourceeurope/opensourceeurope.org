#!/usr/bin/env bash
# Deletes the chat analytics files whose oldest record is 12 months old, as the
# privacy policy promises.
#
# The bucket lifecycle rule also deletes every file 365 days after it was
# written. That is not enough on its own: copying a file resets that date, so a
# file copied from another bucket would outlive its records by months. This step
# goes by the date in the file name instead.
#
# A file named analytics-D holds the records of the LOOKBACK_DAYS before D, and
# the job runs every CADENCE_DAYS. Deleting it KEEP_DAYS after D, at the latest
# one run later, keeps no record longer than RETENTION_DAYS.
#
# Required env: ANALYTICS_BUCKET, SCW_REGION, SCW_ACCESS_KEY, SCW_SECRET_KEY (as
# export.sh). The IAM application needs the ObjectStorageObjectsDelete permission
# set. Optional: LOOKBACK_DAYS (default 6, as export.sh).

set -euo pipefail

: "${ANALYTICS_BUCKET:?ANALYTICS_BUCKET is required}"
: "${SCW_REGION:?SCW_REGION is required}"
: "${SCW_ACCESS_KEY:?SCW_ACCESS_KEY is required}"
: "${SCW_SECRET_KEY:?SCW_SECRET_KEY is required}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RETENTION_DAYS=365
CADENCE_DAYS=3
LOOKBACK_DAYS="${LOOKBACK_DAYS:-6}"
KEEP_DAYS=$(( RETENTION_DAYS - LOOKBACK_DAYS - CADENCE_DAYS ))
# 30 days of names per run: a file still goes when the job fails for up to a month.
WINDOW_DAYS=30

request="$(jq -cn --argjson now "$(date -u +%s)" --argjson keep "$KEEP_DAYS" \
  --argjson window "$WINDOW_DAYS" -f "${SCRIPT_DIR}/expire.jq")"

export AWS_ACCESS_KEY_ID="$SCW_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SCW_SECRET_KEY"
export AWS_DEFAULT_REGION="$SCW_REGION"

# A key that does not exist counts as deleted, so the same names can be sent again.
# The call succeeds even when single keys fail, so the errors are checked here.
result="$(aws s3api delete-objects --bucket "$ANALYTICS_BUCKET" --delete "$request" \
  --endpoint-url "https://s3.${SCW_REGION}.scw.cloud" --output json)"
errors="$(printf '%s' "$result" | jq -r '.Errors // [] | .[] | "\(.Key): \(.Code)"')"
if [ -n "$errors" ]; then
  echo "Could not delete expired chat analytics files:"
  echo "$errors"
  exit 1
fi

echo "Deleted chat analytics files written ${KEEP_DAYS} to $(( KEEP_DAYS + WINDOW_DAYS - 1 )) days ago, if any."
