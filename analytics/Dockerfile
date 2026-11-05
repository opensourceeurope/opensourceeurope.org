# Minimal image for the analytics Serverless Job: the chat export and the page-view counts.
# Ships only the scripts + their CLI deps (curl, jq, aws CLI as an S3 client).
FROM alpine:3.21

RUN apk add --no-cache bash curl jq aws-cli ca-certificates

WORKDIR /app
COPY run.sh export.sh pageviews.sh pageviews.jq /app/
RUN chmod +x /app/run.sh /app/export.sh /app/pageviews.sh

ENTRYPOINT ["/app/run.sh"]
