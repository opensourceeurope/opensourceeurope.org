#!/usr/bin/env bash
# Counts page views per page and per day from the Scaleway Edge Services request
# logs in Cockpit, and writes only these totals to the private analytics bucket.
#
# Loki does the counting. The query extracts four fields from each log entry
# (method, status code, content type, URL) and returns one total per host and
# path, so the client IP and the other fields never leave Cockpit. The Edge
# Services log entry holds no referrer and no user agent, so there is nothing to
# count per referring website.
#
# Only complete UTC days are counted. Each run writes the last LOOKBACK_DAYS days,
# so consecutive files overlap and a missed run loses no day. A day has the same
# totals in every file that holds it.
#
# Required env (see analytics/README.md):
#   EDGE_LOKI_URL      Loki URL of the Cockpit logs data source that holds the
#                      Edge Services logs (fr-par). Without it the script skips.
#   ANALYTICS_BUCKET, SCW_REGION, SCW_ACCESS_KEY, SCW_SECRET_KEY  as in export.sh
# Optional:
#   EDGE_COCKPIT_TOKEN read_only_logs token for EDGE_LOKI_URL. Default COCKPIT_TOKEN,
#                      which only works when both data sources are in one region.
#   SITE_HOSTS         space-separated host names to count
#                      (default "opensourceeurope.org www.opensourceeurope.org")
#   LOOKBACK_DAYS      complete days per run (default 6, below the 7-day retention)

set -euo pipefail

if [ -z "${EDGE_LOKI_URL:-}" ]; then
  echo "Page views skipped: EDGE_LOKI_URL is not set (see analytics/README.md)."
  exit 0
fi

EDGE_COCKPIT_TOKEN="${EDGE_COCKPIT_TOKEN:-${COCKPIT_TOKEN:-}}"
: "${EDGE_COCKPIT_TOKEN:?EDGE_COCKPIT_TOKEN or COCKPIT_TOKEN is required}"
: "${ANALYTICS_BUCKET:?ANALYTICS_BUCKET is required}"
: "${SCW_REGION:?SCW_REGION is required}"
: "${SCW_ACCESS_KEY:?SCW_ACCESS_KEY is required}"
: "${SCW_SECRET_KEY:?SCW_SECRET_KEY is required}"

LOOKBACK_DAYS="${LOOKBACK_DAYS:-6}"
SITE_HOSTS="${SITE_HOSTS:-opensourceeurope.org www.opensourceeurope.org}"
HOSTS_JSON="$(jq -nc --arg h "$SITE_HOSTS" '$h | split(" ") | map(select(. != ""))')"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# A page view is a GET answered with 200 and an HTML page. Images, scripts, fonts,
# redirects and the 404 answers to scanners do not count.
# shellcheck disable=SC2016 # the backticks and ${1} belong to LogQL, not to the shell
QUERY='sum by (host, path) (count_over_time({resource_type="edge_content_delivery_service"}
  | json method="http_request_method", status="http_response_code_client", ctype="http_response_content_type", url="http_client_request_url"
  | method="GET" | status="200" | ctype=~"text/html.*"
  | label_format host=`{{ regexReplaceAll "^[a-zA-Z]+://([^/:?#]+).*$" .url "${1}" | lower }}`, path=`{{ regexReplaceAll "^[a-zA-Z]+://[^/?#]*([^?#]*).*$" .url "${1}" }}`
  [1d]))'

NOW_S="$(date -u +%s)"
TODAY_S="$(( NOW_S - NOW_S % 86400 ))"
RUN_DATE="$(date -u +%F)"
JSONL_FILE="pageviews-${RUN_DATE}.jsonl"
CSV_FILE="pageviews-${RUN_DATE}.csv"
: > "$JSONL_FILE"

echo "Counting page views for the last ${LOOKBACK_DAYS} complete days, hosts: ${SITE_HOSTS}"

for i in $(seq "$LOOKBACK_DAYS" -1 1); do
  # The instant query at the end of day D counts the entries of day D.
  end_s="$(( TODAY_S - (i - 1) * 86400 ))"
  day="$(jq -rn --argjson t "$(( end_s - 86400 ))" '$t | todate | .[0:10]')"
  curl -fsSG "${EDGE_LOKI_URL}/loki/api/v1/query" \
    -H "X-Token: ${EDGE_COCKPIT_TOKEN}" \
    --data-urlencode "query=${QUERY}" \
    --data-urlencode "time=${end_s}000000000" \
    | jq -c --arg date "$day" --argjson hosts "$HOSTS_JSON" -f "${SCRIPT_DIR}/pageviews.jq" \
    >> "$JSONL_FILE"
done

rows="$(wc -l < "$JSONL_FILE" | tr -d ' ')"
total="$(jq -s 'map(.views) | add // 0' "$JSONL_FILE")"
echo "Collected ${rows} row(s), ${total} page view(s), into ${JSONL_FILE}"

{
  printf 'date,host,path,views\n'
  jq -r '[.date, .host, .path, .views] | @csv' "$JSONL_FILE"
} > "$CSV_FILE"

export AWS_ACCESS_KEY_ID="$SCW_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SCW_SECRET_KEY"
export AWS_DEFAULT_REGION="$SCW_REGION"
ENDPOINT="https://s3.${SCW_REGION}.scw.cloud"

for f in "$JSONL_FILE" "$CSV_FILE"; do
  aws s3 cp "$f" "s3://${ANALYTICS_BUCKET}/${f}" --endpoint-url "$ENDPOINT"
done

echo "Uploaded ${JSONL_FILE} + ${CSV_FILE} to s3://${ANALYTICS_BUCKET}/"
