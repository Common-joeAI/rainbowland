#!/bin/bash
set -e
mkdir -p /tmp/rl-hls
# Start Nginx-RTMP
nginx
# Start Node.js chat/API
exec node /app/server.js
# deployed: 2026-06-03 02:00:28 UTC
# redeploy: 2026-06-03 02:18:17 UTC
# graceful-video-boot: 2026-06-03 02:20:06 UTC
# clean-boot: 2026-06-03 02:23:32
# fix-deploy: 2026-06-03 02:25:09
