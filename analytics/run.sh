#!/usr/bin/env bash
# Entry point of the analytics job: the chat export, the page-view counts, then
# the deletion of expired chat files. Each step runs even when an earlier one
# fails, and the job fails if any did.
set -uo pipefail

status=0
/app/export.sh || status=1
/app/pageviews.sh || status=1
/app/expire.sh || status=1
exit "$status"
