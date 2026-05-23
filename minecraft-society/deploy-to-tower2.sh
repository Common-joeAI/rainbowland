#!/bin/bash
# Deploy OSociety to Tower2
# Run this from your local machine

TOWER="root@38.77.171.81"
TOWER_PORT="5897"
DEST="/mnt/user/Data/minecraft"

echo "==> Creating directories on Tower2..."
ssh -p $TOWER_PORT $TOWER "mkdir -p $DEST/{agent-server,plugins,world,config,agent-data}"

echo "==> Copying agent server..."
scp -P $TOWER_PORT -r agent-server/* $TOWER:$DEST/agent-server/

echo "==> Copying docker-compose..."
scp -P $TOWER_PORT docker-compose.yml $TOWER:$DEST/

echo "==> Starting containers..."
ssh -p $TOWER_PORT $TOWER "cd $DEST && docker compose up -d"

echo ""
echo "==> Build the Java plugin:"
echo "  cd plugin && mvn clean package"
echo "  scp -P $TOWER_PORT target/OSociety-1.0.0.jar $TOWER:$DEST/plugins/"
echo "  ssh -p $TOWER_PORT $TOWER 'docker restart osociety-minecraft'"
echo ""
echo "==> Done! Server will be at: $(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP'):25565"
echo "==> Agent API at: http://$(hostname):7432/status"
