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

The Pi 4 (4x A72 @ 1.5GHz, 1.8GB RAM, no GPU) handles only arm control and video streaming. All heavy computation (YOLO inference, Claude CLI) runs on a separate machine via the inference server.

## Prerequisites

| What | Where | Why |
|---|---|---|
| MechArm 270 Pi | Connected to Pi via serial (`/dev/ttyAMA0`) | The robotic arm |
| Raspberry Pi 4 | On your network, SSH enabled | Runs the arm control server |
| USB camera | Plugged into Pi (`/dev/video0`) | Live video feed |
| Node.js 18+ | Your dev machine | Build the frontend |
| Python 3.10+ | Your dev machine (for inference server) | YOLO + Claude |
| Python 3.x | On the Pi | Runs the backend |

**Optional** (for advanced features):
- YOLO weights file (`weights.pt`) for custom object detection
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) for natural language arm commands

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/teddygraham/roboticArm.git
cd roboticArm
```

### 2. Set up the Raspberry Pi

Your Pi needs to be on the same network as your dev machine with SSH access.

**Set the Pi hostname** (so `mecharm.local` resolves via mDNS):

```bash
ssh pi@<pi-ip-address>
sudo hostnamectl set-hostname mecharm
sudo reboot
```

After reboot, verify you can reach it:

```bash
ping mecharm.local
ssh pi@mecharm.local
```

> If `mecharm.local` doesn't resolve, use the Pi's IP address directly and update `deploy.sh` and `frontend/vite.config.ts` to match.

**Install Pi dependencies:**

```bash
ssh pi@mecharm.local
pip install pymycobot opencv-python fastapi 'uvicorn[standard]'
```

**Verify the arm and camera are connected:**

```bash
# Check serial port
ls /dev/ttyAMA0

# Check camera
ls /dev/video0
```

### 3. Configure the inference URL (optional)

If you plan to use the inference server for YOLO detection, find your dev machine's local IP and edit `mecharm.service`:

```bash
# Find your IP (macOS)
ipconfig getifaddr en0

# Find your IP (Linux)
hostname -I | awk '{print $1}'
```

Edit `mecharm.service` and set:

```
Environment=INFERENCE_URL=http://<your-ip>:5001
```

If you skip this, everything works except the "Server Parts" detection mode will be hidden in the UI.

### 4. Build and deploy

```bash
# Install frontend dependencies
cd frontend && npm install && cd ..

# Deploy to Pi (builds frontend, copies server files, installs systemd service, restarts)
./deploy.sh
```

The deploy script will:
- Build the React frontend
- Copy `server/` and built assets to `pi@mecharm.local:~/`
- Install and start the `mecharm` systemd service

### 5. Open the dashboard

Navigate to **http://mecharm.local** in any browser on your network.

You should see:
- Live camera feed from the Pi
- Joint sliders that move the arm in real-time
- 3D arm visualization synced to actual joint positions
- COCO-SSD detection (works immediately, runs in-browser)

### 6. Set up the inference server (optional)

The inference server runs YOLO object detection and natural language commands on your dev machine, keeping heavy compute off the Pi.

```bash
cd inference-server

# Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate    # Linux/macOS
# .venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Add your YOLO weights (not included in repo — see "Training" section below)
# cp /path/to/your/weights.pt ./weights.pt

# Start the server
python inference_server.py
```

The server starts on `http://0.0.0.0:5001`. If you configured `INFERENCE_URL` in step 3, the dashboard will show a "Server Parts" detection mode that sends frames to this server.

**Override model path:**

```bash
YOLO_MODEL=/path/to/custom/weights.pt python inference_server.py
```

### 7. Set up the MCP server (optional)

The MCP server lets [Claude Code](https://docs.anthropic.com/en/docs/claude-code) control the arm via tool calls.

```bash
cd mcp-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Add to your Claude Code MCP config (`.mcp.json` in the project root):

```json
{
  "mcpServers": {
    "mecharm": {
      "type": "stdio",
      "command": "/absolute/path/to/mcp-server/.venv/bin/python",
      "args": ["/absolute/path/to/mcp-server/mecharm_mcp.py"],
      "env": {
        "MECHARM_URL": "http://mecharm.local"
      }
    }
  }
}
```

Then in Claude Code you can say things like "move joint 1 to 45 degrees" or "capture an image from the arm camera".

## Training Your Own YOLO Model

The `weights.pt` file is not included in this repo (it's ~5.5MB and gitignored). To train your own model for server part detection:

1. Collect training images using the `/snapshot` endpoint on the Pi
2. Label them with a tool like [Roboflow](https://roboflow.com) or [Label Studio](https://labelstud.io)
3. Train with [Ultralytics YOLOv11](https://docs.ultralytics.com):
   ```bash
   pip install ultralytics
   yolo detect train data=your_dataset.yaml model=yolo11n.pt epochs=100
   ```
4. Copy the best weights to `inference-server/weights.pt`

The default model detects: Server, Bezel, Bezel-lock, Bezel-latch, Power Button, HDD.

## Project Structure

```
roboticArm/
├── server/                    # Pi backend (FastAPI)
│   ├── app.py                 #   Routes, WebSocket, MJPEG, /config
│   ├── arm.py                 #   ArmController (serial, command loop)
│   ├── camera.py              #   CameraManager (V4L2, MJPG, adaptive)
│   ├── wifi.py                #   WiFiManager (nmcli wrapper)
│   └── static/                #   Built frontend (generated, gitignored)
├── frontend/                  # React dashboard
│   ├── src/
│   │   ├── App.tsx            #   Root component, config fetch
│   │   ├── components/        #   UI components (camera, sliders, 3D viewer...)
│   │   └── hooks/             #   useWebSocket, useArm, useDetection...
│   ├── public/mecharm/        #   URDF + 3D mesh assets
│   └── vite.config.ts         #   Build config, dev proxy to Pi
├── inference-server/          # YOLO + NL commands (runs on Mac/GPU)
│   ├── inference_server.py    #   FastAPI server (:5001)
│   ├── requirements.txt
│   └── weights.pt             #   YOLO model (gitignored, bring your own)
├── mcp-server/                # Claude Code integration
│   ├── mecharm_mcp.py         #   FastMCP tool definitions
│   └── requirements.txt
├── deploy.sh                  # Build + deploy to Pi
├── mecharm.service            # systemd unit file
├── CLAUDE.md                  # AI assistant context
└── HARDWARE.md                # Detailed hardware specs
```

## Endpoints

### Pi (`mecharm.local:80`)

| Endpoint | Protocol | Purpose |
|---|---|---|
| `/` | GET | Dashboard UI |
| `/ws` | WebSocket | Control channel (angles, gripper, reset, sync, coords, heartbeat) |
| `/video` | GET | MJPEG stream (cached JPEG passthrough) |
| `/snapshot` | GET | Single JPEG frame for inference |
| `/config` | GET | Runtime config (`inference_url`) |
| `/sync` | GET | Current arm state (angles + gripper) |
| `/coords` | GET/POST | Cartesian coordinates |
| `/diagnostics` | GET | Arm state, video stats, client count |
| `/api/wifi/*` | GET/POST | WiFi scan, connect, disconnect, status |
| `/api/system/restart` | POST | Restart the mecharm service |
| `/api/system/reboot` | POST | Reboot the Pi |
| `/update`, `/gripper`, `/reset` | POST | HTTP fallback control |

### Inference Server (`:5001`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/detect` | POST | YOLO object detection (base64 JPEG in, predictions out) |
| `/command` | POST | Natural language arm control (SSE streaming response) |

## Troubleshooting

### Pi not reachable at `mecharm.local`
- Make sure the Pi hostname is set to `mecharm` (`hostnamectl set-hostname mecharm`)
- Your dev machine needs mDNS support (built into macOS; install `avahi-daemon` on Linux)
- As a fallback, use the Pi's IP address directly

### `deploy.sh` fails with SSH errors
- Ensure SSH key is set up: `ssh-copy-id pi@mecharm.local`
- Add the Pi's host key: `ssh-keyscan -H mecharm.local >> ~/.ssh/known_hosts`

### Camera not opening
- Check the camera is plugged in: `ls /dev/video0`
- Another process may hold the device. The systemd service runs `fuser -k /dev/video0` on stop, but you can run it manually: `sudo fuser -k /dev/video0`
- Check logs: `sudo journalctl -u mecharm -f`

### Inference server errors
- **"Numpy is not available"**: Install `numpy<2` (`pip install "numpy<2"`) — required for torch 2.x compatibility
- **Model not found**: Ensure `weights.pt` exists in `inference-server/` or set `YOLO_MODEL` env var
- **Connection refused from browser**: The inference server binds to `0.0.0.0:5001` — make sure your firewall allows it

### "Server Parts" button not showing in UI
- The Pi needs `INFERENCE_URL` set in `mecharm.service` and the service restarted
- Verify: `curl http://mecharm.local/config` should return a non-empty `inference_url`
- The inference server must be running and reachable from the browser (not just from the Pi)

## Safety

- **Heartbeat monitor**: Frontend pings every 2s over WebSocket. If all clients go silent for 5s, the arm returns to safe position (all joints zero).
- **Adaptive video**: Camera auto-adjusts JPEG quality (40-75) and fps (5-15) based on delivery success rate.
- **Camera release**: systemd `ExecStopPost` runs `fuser -k /dev/video0` to force-release the camera on service stop.

## License

MIT
