#!/bin/bash
# Deploy MechArm control server to Raspberry Pi
# Usage:
#   ./deploy.sh              — deploy server/ directory (FastAPI app)
#   ./deploy.sh legacy       — deploy mecharm_full_control.py (Flask backup)
#   ./deploy.sh <file>       — deploy a specific file

REMOTE="pi@192.168.3.2"
REMOTE_DIR="~/"

if [ "$1" = "legacy" ]; then
    scp mecharm_full_control.py "$REMOTE:$REMOTE_DIR" && echo "Deployed legacy Flask app"
elif [ -n "$1" ]; then
    scp "$1" "$REMOTE:$REMOTE_DIR" && echo "Deployed $1"
else
    # Deploy the FastAPI server package
    ssh "$REMOTE" "mkdir -p ~/server/static"
    scp server/__init__.py server/app.py server/arm.py server/camera.py "$REMOTE:~/server/"
    scp server/static/index.html "$REMOTE:~/server/static/"
    echo "Deployed server/ to Pi"
    echo ""
    echo "To run on Pi:"
    echo "  pip install fastapi 'uvicorn[standard]'  # first time only"
    echo "  python -m server.app"
fi
