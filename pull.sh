#!/bin/bash
# Pull Python files from mecArm Pi
# Usage: ./pull.sh [filename]  — pull one file, or no args to pull all .py files

REMOTE="pi@192.168.3.2"
REMOTE_DIR="~/"

if [ -n "$1" ]; then
    scp "$REMOTE:$REMOTE_DIR$1" . && echo "Pulled $1"
else
    scp "$REMOTE:$REMOTE_DIR*.py" . && echo "Pulled all .py files"
fi
