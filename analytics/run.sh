#!/usr/bin/env bash
# Entry point of the analytics job: the chat export, then the page-view counts.
# The second step runs even when the first fails, and the job fails if either did.
set -uo pipefail

status=0
/app/export.sh || status=1
/app/pageviews.sh || status=1
exit "$status"
