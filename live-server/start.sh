#!/bin/bash
set -e
mkdir -p /tmp/rl-hls
# Start Nginx-RTMP
nginx
# Start Node.js chat/API
exec node /app/server.js
# deployed: 2026-06-03 02:00:28 UTC
