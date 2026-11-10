# Minimal image for the analytics Serverless Job: the chat export, the page-view counts
# and the deletion of expired chat files.
# Ships only the scripts + their CLI deps (curl, jq, aws CLI as an S3 client).
FROM alpine:3.21

RUN apk add --no-cache bash curl jq aws-cli ca-certificates

WORKDIR /app
COPY run.sh export.sh pageviews.sh pageviews.jq expire.sh expire.jq /app/
RUN chmod +x /app/run.sh /app/export.sh /app/pageviews.sh /app/expire.sh

ENTRYPOINT ["/app/run.sh"]
