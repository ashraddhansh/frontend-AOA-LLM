#!/bin/sh
set -eu

envsubst '${API_BASE_URL} ${GOOGLE_CLIENT_ID}' \
  < /etc/nginx/runtime-config.js.template \
  > /tmp/runtime-config.js.tmp
mv /tmp/runtime-config.js.tmp /tmp/runtime-config.js
