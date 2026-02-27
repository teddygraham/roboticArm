# MechArm 270 Remote Control

Web-based remote control for the MechArm 270 Pi robotic arm, optimized for low-latency operation over VPN.

## Hardware

- MechArm 270 Pi (6-DOF + gripper)
- Raspberry Pi 4 (1.8GB RAM)
- USB camera

## Architecture

```
server/
  app.py          # FastAPI routes, MJPEG streaming, WebSocket heartbeat
  arm.py          # ArmController — serial comm, command loop, safe position
  camera.py       # CameraManager — threaded capture, adaptive quality/fps
  static/
    index.html    # Control UI (sliders, video feed, connection indicator)
mecharm_full_control.py   # Legacy Flask app (Phase 0 optimizations applied)
```

### Control Flow

```
Browser (WebSocket) → FastAPI → ArmController command loop (25ms) → serial → servos
Browser (MJPEG)     ← FastAPI ← CameraManager capture thread (adaptive 5-15fps)
```

### Safety

- **Heartbeat monitor**: Frontend pings every 2s over WebSocket. If all clients go silent for 5s, the arm returns to safe position (all joints zero, gripper open).
- **Adaptive video**: Server tracks frame delivery rate and auto-adjusts JPEG quality (40-75) and fps (5-15) if the client can't keep up.

## Setup

### On the Pi

```bash
pip install pymycobot opencv-python fastapi 'uvicorn[standard]'
```

### Deploy

```bash
./deploy.sh              # deploy server/ to Pi
./deploy.sh legacy       # deploy Flask backup instead
```

### Run

```bash
# On the Pi
python -m server.app
```

Open `http://192.168.3.2:8080` in a browser.

## Endpoints

| Endpoint | Protocol | Purpose |
|---|---|---|
| `/` | GET | Control UI |
| `/ws` | WebSocket | Control channel (angles, gripper, reset, sync, heartbeat) |
| `/video` | GET | MJPEG stream |
| `/diagnostics` | GET | Arm state, video stats, client count |
| `/update` | POST | Joint angles (HTTP fallback) |
| `/gripper` | POST | Gripper value (HTTP fallback) |
| `/reset` | POST | Zero all joints (HTTP fallback) |
| `/sync` | GET | Read current angles from hardware (HTTP fallback) |

## Key Optimizations

| What | Before | After |
|---|---|---|
| Firmware mode | Queued (plays back old positions) | `set_fresh_mode(1)` — tracks latest |
| Servo speed | 80 | 100 |
| Command loop | 50ms | 25ms |
| Frontend throttle | 60ms | 40ms |
| Camera resolution | 640x480 | 480x360 |
| JPEG quality | ~95% | 65 (adaptive 40-75) |
| Framerate | Uncapped | 12fps (adaptive 5-15) |
| Transport | HTTP POST per command | WebSocket (~50 bytes vs ~500) |
| Sync interval | 10s | 30s |
| Framework | Flask (synchronous) | FastAPI + uvicorn (async) |
