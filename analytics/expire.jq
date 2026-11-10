# Builds the DeleteObjects request for the chat analytics files that have
# reached the end of their retention. File names carry the date the job wrote
# them, so the keys are computed, and the job needs no read access to the bucket.
#
# Arguments: $now (epoch seconds), $keep (days a file is kept) and $window (how
# many days before that to delete again, so a file survives no gap of failed runs
# shorter than the window).
{
  Objects: [
    range($keep; $keep + $window) as $d
    | (($now - $d * 86400) | todate | .[0:10]) as $day
    | ("analytics-\($day).jsonl", "analytics-\($day).csv")
    | { Key: . }
  ],
  Quiet: true
}
