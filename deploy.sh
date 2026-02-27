#!/bin/bash
# Deploy MechArm control server to Raspberry Pi
# Usage:
#   ./deploy.sh              — build frontend + deploy server/ directory
#   ./deploy.sh legacy       — deploy mecharm_full_control.py (Flask backup)
#   ./deploy.sh <file>       — deploy a specific file

REMOTE="pi@192.168.3.2"
REMOTE_DIR="~/"

if [ "$1" = "legacy" ]; then
    scp mecharm_full_control.py "$REMOTE:$REMOTE_DIR" && echo "Deployed legacy Flask app"
elif [ -n "$1" ]; then
    scp "$1" "$REMOTE:$REMOTE_DIR" && echo "Deployed $1"
else
    # Build frontend
    echo "Building frontend..."
    (cd frontend && npm run build) || { echo "Frontend build failed"; exit 1; }
    echo ""

    # Deploy the FastAPI server package + built frontend
    ssh "$REMOTE" "mkdir -p ~/server/static/assets"
    scp server/__init__.py server/app.py server/arm.py server/camera.py server/wifi.py "$REMOTE:~/server/"
    scp server/static/index.html "$REMOTE:~/server/static/"
    scp server/static/assets/* "$REMOTE:~/server/static/assets/"
    echo "Deployed server/ to Pi"

    # Install systemd service (idempotent)
    scp mecharm.service "$REMOTE:/tmp/mecharm.service"
    ssh "$REMOTE" "sudo cp /tmp/mecharm.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable mecharm"
    echo "Installed systemd service"

    # Restart the service
    ssh "$REMOTE" "sudo systemctl restart mecharm"
    echo "Restarted mecharm service"
    echo ""
    echo "Server running at http://192.168.3.2:8080"
    echo "  sudo systemctl status mecharm   — check status"
    echo "  sudo journalctl -u mecharm -f   — view logs"
fi
