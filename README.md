# MechArm 270 Remote Control

Web-based remote control for the MechArm 270 Pi robotic arm (6-DOF + gripper) on a Raspberry Pi 4. Features live video streaming, real-time joint control, object detection (client-side COCO-SSD and server-side YOLO), natural language commands via Claude, 3D URDF visualization, and WiFi management.

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

**Key constraint**: The Pi 4 (4x A72 @ 1.5GHz, 1.8GB RAM, no GPU) is the bottleneck. All heavy computation (YOLO inference, Claude CLI) runs on a separate machine via the inference server.

## Hardware

| Item | Value |
|---|---|
| Arm | Elephant Robotics MechArm 270 Pi |
| Compute | Raspberry Pi 4 Model B (1.8GB RAM) |
| Camera | Realtek USB 2.0 (V4L2, 640x360 MJPG) |
| Serial | `/dev/ttyAMA0` @ 1,000,000 baud |

Joint limits: J1 +/-160, J2 +/-90, J3 -180/+45, J4 +/-160, J5 +/-100, J6 +/-180. Gripper: 0 (open) - 100 (closed).

## Components

### Pi Backend (`server/`)

FastAPI server running directly on the arm's Raspberry Pi.

- **`app.py`** -- WebSocket control, MJPEG video streaming (JPEG passthrough), HTTP fallback endpoints, `/config` discovery, `/snapshot` for inference, WiFi/system management, heartbeat safety monitor
- **`arm.py`** -- `ArmController` with 25ms command loop. `set_fresh_mode(1)` ensures only the latest target is sent (no queue buildup)
- **`camera.py`** -- V4L2 capture with MJPG fourcc at 640x360. Encodes JPEG once in the capture thread; `get_raw_jpeg()` serves cached bytes for zero-copy streaming. Adaptive quality (40-75) and fps (5-15)
- **`wifi.py`** -- nmcli wrapper for WiFi scan/connect/disconnect

### Frontend (`frontend/`)

React 19 + TypeScript + Tailwind CSS dashboard.

- **Dashboard layout**: 4-column grid with live camera, 3D arm viewer, joint sliders, detection controls, activity log, rack navigator
- **3D visualization**: URDF-based robot model via Three.js + React Three Fiber with real-time joint sync
- **Detection modes**: COCO-SSD (client-side via TensorFlow.js) and Server Parts (network YOLO inference). Server Parts auto-hidden when inference server is not configured.
- **Natural language**: Chat interface that sends commands to the inference server's `/command` endpoint, streaming multi-step autonomous arm control via SSE
- **i18n**: English and Chinese with localStorage persistence
- **Hooks**: `useWebSocket` (auto-reconnect, heartbeat), `useArm` (debounced control), `useDetection` (dual-mode inference), `useWiFi`, `useActivityLog`, `useI18n`

### Inference Server (`inference-server/`)

Runs on a Mac or GPU-capable machine. Handles compute-heavy tasks off the Pi.

- **`/detect`** -- YOLOv11 object detection (server parts: bezel, power button, HDD, latch, lock)
- **`/command`** -- Natural language arm control via Claude CLI with vision. Streams SSE responses with multi-step autonomous execution.
- Model path configurable via `YOLO_MODEL` env var (defaults to `weights.pt` beside the script)

### MCP Server (`mcp-server/`)

FastMCP server for Claude Code integration. Exposes tools: `get_arm_state`, `move_joints`, `set_gripper`, `reset_arm`, `capture_image`, `get_diagnostics`, `wifi_status`, `wifi_scan`.

## Setup

### Pi Dependencies

```bash
pip install pymycobot opencv-python fastapi 'uvicorn[standard]'
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # dev server with proxy to mecharm.local
npm run build        # build -> server/static/
```

### Inference Server

```bash
cd inference-server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Place your YOLO weights at inference-server/weights.pt
python inference_server.py   # starts on 0.0.0.0:5001
```

### Deploy to Pi

```bash
./deploy.sh          # build frontend + rsync to Pi + restart service
```

### Configure Inference URL

Set the inference server IP in `mecharm.service` before deploying:

```
Environment=INFERENCE_URL=http://<your-mac-ip>:5001
```

If left empty, the frontend gracefully hides the "Server Parts" detection mode.

## Endpoints

### Pi (`mecharm.local:80`)

| Endpoint | Protocol | Purpose |
|---|---|---|
| `/` | GET | Dashboard UI |
| `/ws` | WebSocket | Control channel (angles, gripper, reset, sync, coords, heartbeat) |
| `/video` | GET | MJPEG stream (cached JPEG passthrough) |
| `/snapshot` | GET | Single JPEG frame for inference |
| `/config` | GET | Runtime config (`inference_url`) |
| `/sync` | GET | Current arm state |
| `/coords` | GET/POST | Cartesian coordinates |
| `/diagnostics` | GET | Arm state, video stats, client count |
| `/api/wifi/*` | GET/POST | WiFi management |
| `/api/system/*` | POST | Server restart, Pi reboot |
| `/update`, `/gripper`, `/reset` | POST | HTTP fallback control |

### Inference Server (`:5001`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/detect` | POST | YOLO object detection (base64 JPEG input) |
| `/command` | POST | Natural language arm control (SSE stream) |

## Safety

- **Heartbeat monitor**: Frontend pings every 2s over WebSocket. If all clients go silent for 5s, the arm returns to safe position (all joints zero). The `go_safe()` call runs in a thread to avoid blocking the async event loop.
- **Adaptive video**: Camera tracks frame delivery rate and auto-adjusts JPEG quality (40-75) and fps (5-15) every 5 seconds.
- **Camera release**: systemd `ExecStopPost` runs `fuser -k /dev/video0` to force-release the camera on service stop, preventing device lock on restart.

## Optimizations

| Area | Detail |
|---|---|
| Camera fourcc | V4L2 MJPG -- camera hardware encodes JPEG |
| Resolution | 640x360 (camera's native, was 480x360) |
| JPEG passthrough | Encoded once in capture thread, served from cache |
| No OSD overlay | Removed per-frame `cv2.putText()` calls |
| No Roboflow | Removed cloud detection endpoint from Pi |
| Async safety | `arm.go_safe()` wrapped in `asyncio.to_thread()` |
| Inference offload | YOLO + Claude CLI run on Mac, not Pi |
| Fresh mode | `set_fresh_mode(1)` -- tracks latest target only |
| Command loop | 25ms cycle (40 Hz) |
| WebSocket | ~50 bytes vs ~500 for HTTP |
