# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web-based remote control system for the MechArm 270 Pi (6-DOF + gripper) robotic arm running on a Raspberry Pi 4 at `mecharm.local`. Three components: a FastAPI backend (runs on the Pi), a React/TypeScript frontend (builds into the backend's static directory), and an MCP server that proxies tool calls to the FastAPI backend. A separate inference server runs YOLO detection and NL commands on a more powerful machine.

## Architecture

```
Any Browser ──────> Pi (mecharm.local:80)        Mac/GPU box (inference-host:5001)
  arm control (WS)    - FastAPI: /ws, /video       - inference_server.py
  video stream        - Camera: MJPEG stream       - YOLO weights.pt
  detection results   - /snapshot for inference     - /detect endpoint
       │              - /config (inference URL)     - /command (Claude NL)
       └──────────────────────────────────────> inference server (network)
         POST /detect with JPEG frame
```

## Commands

### Frontend (local development)
```bash
cd frontend
npm install          # install deps
npm run dev          # dev server with proxy to Pi at mecharm.local
npm run build        # build → server/static/ (served by FastAPI)
```

### Deploy to Pi
```bash
./deploy.sh          # build frontend + rsync server/ to Pi, restart service
```

### Run on the Pi
```bash
python -m server.app                     # start FastAPI server on :80
sudo systemctl restart mecharm           # restart via systemd
sudo journalctl -u mecharm -f            # tail service logs
```

### Inference server (Mac-side)
```bash
cd inference-server
pip install -r requirements.txt
python inference_server.py               # starts on 0.0.0.0:5001
# or override model: YOLO_MODEL=/path/to/weights.pt python inference_server.py
```

### MCP server (local machine)
```bash
MECHARM_URL=http://mecharm.local python mcp-server/mecharm_mcp.py
```

## Backend (`server/`)
- **`app.py`** — FastAPI app: WebSocket handler, MJPEG streaming (passthrough cached JPEG), HTTP fallback endpoints, `/config` discovery, WiFi/system management API, heartbeat monitor
- **`arm.py`** — `ArmController`: background thread drains latest target angles/gripper every 25ms to serial. `set_fresh_mode(1)` disables arm's internal command queue.
- **`camera.py`** — `CameraManager`: V4L2 with MJPG fourcc at 640x360. Capture thread encodes JPEG once; `get_raw_jpeg()` returns cached bytes for zero-copy MJPEG streaming. Adaptive quality (40-75) and fps (5-15).
- **`wifi.py`** — `WiFiManager`: wraps `nmcli`

## Frontend (`frontend/src/`)
- **`App.tsx`** — root component: fetches `/config` on mount for inference URL, wires hooks together
- **`hooks/useDetection.ts`** — COCO-SSD (client-side) + Server Parts (network inference). Server Parts button hidden when `inferenceUrl` is empty (no inference server configured)
- **`hooks/useWebSocket.ts`** — WebSocket lifecycle, heartbeat pings every 2s
- **`hooks/useArm.ts`** — throttled joint/gripper changes
- Vite dev server proxies to `mecharm.local`; build output to `../server/static/`

## Inference Server (`inference-server/`)
- **`inference_server.py`** — FastAPI on 0.0.0.0:5001. YOLO detection (`/detect`), NL command (`/command` via Claude CLI + SSE streaming)
- **`weights.pt`** — YOLO model weights (gitignored)
- Model path configurable via `YOLO_MODEL` env var

## MCP Server (`mcp-server/mecharm_mcp.py`)
FastMCP server exposing tools (`get_arm_state`, `move_joints`, `set_gripper`, `reset_arm`, `capture_image`, `get_diagnostics`, `wifi_status`, `wifi_scan`) as HTTP proxies to the Pi.

## Key Design Constraints

- **Pi is the bottleneck** (4x A72 @ 1.5GHz, ~1.8GB RAM, no GPU). All heavy compute (YOLO, Claude CLI) runs on the inference server, not the Pi.
- **`set_fresh_mode(1)`** is critical — without it the arm queues commands and plays back stale positions
- **Heartbeat**: frontend pings `/ws` every 2s; if all clients go silent for 5s, arm moves to safe position. `arm.go_safe()` runs via `asyncio.to_thread` to avoid blocking the event loop.
- **Camera MJPG passthrough**: V4L2 MJPG fourcc lets the camera hardware encode JPEG. Capture thread caches encoded bytes; MJPEG stream and `/snapshot` serve cached bytes without re-encoding.
- **`/config` endpoint**: Pi returns `{"inference_url": "..."}` from `INFERENCE_URL` env var. Frontend uses this to discover the inference server. If empty, "Server Parts" detection mode is hidden.
- **Systemd service** (`mecharm.service`): `ExecStopPost` runs `fuser -k /dev/video0` to force-release camera on stop

## Hardware Reference

| Item | Value |
|---|---|
| Pi hostname | mecharm.local |
| Serial port | `/dev/ttyAMA0` @ 1,000,000 baud |
| Camera | `/dev/video0` (V4L2, 640x360 MJPG) |
| Service port | 80 |

Joint limits: J1 +/-160, J2 +/-90, J3 -180/+45, J4 +/-160, J5 +/-100, J6 +/-180. Gripper: 0 (open) - 100 (closed).
