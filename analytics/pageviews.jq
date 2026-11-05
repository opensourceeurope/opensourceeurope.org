# Turns one Loki instant-query response into page-view totals for one day.
#
# Input: the response of `sum by (host, path) (count_over_time(...[1d]))`.
# Arguments: $date (YYYY-MM-DD) and $hosts (JSON array of the site's host names).
# Output: one {date, host, path, views} object per line. Nothing else from the
# log entry reaches the output, because the Loki query keeps only host and path.
.data.result[]?
| { host: (.metric.host // "" | ascii_downcase),
    path: (.metric.path // "" | if . == "" then "/" else . end),
    views: (.value[1] | tonumber) }
| select(.host as $h | $hosts | index($h))
| select(.path | startswith("/.well-known/") | not)
| { date: $date, host, path, views }
