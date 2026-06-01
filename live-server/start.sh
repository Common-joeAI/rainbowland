#!/bin/bash
set -e
mkdir -p /tmp/rl-hls
# Start Nginx-RTMP
nginx
# Start Node.js chat/API
exec node /app/server.js
