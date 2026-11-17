#!/bin/sh
# Render the S3 identities from env, then start SeaweedFS (master+volume+filer+S3) in one process.
set -e
mkdir -p /etc/seaweedfs
cat > /etc/seaweedfs/s3.json <<JSON
{
  "identities": [
    { "name": "kup", "credentials": [ { "accessKey": "${S3_ACCESS_KEY}", "secretKey": "${S3_SECRET_KEY}" } ],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"] },
    { "name": "anonymous", "actions": ["Read:${S3_BUCKET}"] }
  ]
}
JSON
exec weed server -dir=/data -ip.bind=0.0.0.0 -master.volumeSizeLimitMB=1024 -volume.max=0 \
  -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json
