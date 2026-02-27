# Hardware Spec Sheet

## Robotic Arm

| Spec | Value |
|---|---|
| Model | Elephant Robotics MechArm 270 Pi |
| DOF | 6 axes + gripper |
| Reach | 270mm |
| Payload | 250g |
| Repeatability | +/- 0.5mm |
| Power | 12V / 5A |
| Communication | UART serial (`/dev/ttyAMA0` @ 1,000,000 baud) |
| Firmware | v1.3 |
| Control Library | pymycobot 4.0.4 |

### Joint Limits

| Joint | Min | Max | Role |
|---|---|---|---|
| J1 | -160° | +160° | Base rotation |
| J2 | -90° | +90° | Shoulder |
| J3 | -180° | +45° | Elbow |
| J4 | -160° | +160° | Wrist roll |
| J5 | -100° | +100° | Wrist pitch |
| J6 | -180° | +180° | End effector rotation |
| Gripper | 0 (closed) | 100 (open) | Adaptive gripper |

### Servo Configuration

- Speed: 100 (max) for joints, 80 for gripper
- Mode: `set_fresh_mode(1)` — real-time tracking (latest target, no queue)
- Command rate: 25ms cycle (40 Hz)

---

## Compute

| Spec | Value |
|---|---|
| Board | Raspberry Pi 4 Model B Rev 1.5 |
| SoC | Broadcom BCM2711, Cortex-A72 (ARMv8-a) |
| CPU | 4x ARM Cortex-A72 @ 1.5 GHz, 64-bit |
| RAM | 1.8 GB |
| Storage | 32 GB microSD (29 GB partition, 28% used) |
| OS | Debian 13 (trixie) |
| Kernel | 6.12.62+rpt-rpi-v8 aarch64, PREEMPT |
| Python | 3.13.5 |
| Hostname | raspberrypi |
| IP | 192.168.3.2 |

### Thermals

- Idle temp: ~44°C

---

## Camera

| Spec | Value |
|---|---|
| Model | Realtek USB 2.0 Camera |
| VID:PID | 0bda:5a63 |
| Serial | 20220523 |
| Driver | uvcvideo (V4L2) |
| Bus | USB 2.0 (usb-0000:01:00.0-1.1) |
| Interface | `/dev/video0` |

### Supported Resolutions

| Resolution | MJPEG | YUYV |
|---|---|---|
| 2592x1944 | 30 fps | 3 fps |
| 2560x1440 | 30 fps | 3 fps |
| 2048x1536 | 30 fps | 3 fps |
| 1920x1080 | 30 fps | 5 fps |
| 1600x1200 | 30 fps | 5 fps |
| 1280x960 | 30 fps | 5 fps |
| 1280x720 | 30 fps | 10 fps |
| 1024x768 | 30 fps | 15 fps |
| 800x600 | 30 fps | 20 fps |
| 640x480 | 30 fps | 30 fps |
| 640x360 | 30 fps | 30 fps |
| 352x288 | 30 fps | 30 fps |
| 320x240 | 30 fps | 30 fps |
| 176x144 | 30 fps | 30 fps |

### Current Configuration

- Resolution: 480x360 (nearest supported: 640x360)
- JPEG quality: 65 (adaptive range: 40-75)
- FPS cap: 12 (adaptive range: 5-15)
- Buffer size: 1 (minimize stale frames)

---

## Software Stack

| Package | Version | Purpose |
|---|---|---|
| pymycobot | 4.0.4 | MechArm serial protocol |
| opencv | 4.10.0 | Camera capture + JPEG encoding |
| FastAPI | 0.133.1 | Async web server |
| uvicorn | 0.41.0 | ASGI server (with uvloop) |
| Flask | 3.1.1 | Legacy server (backup) |

---

## Network

| Spec | Value |
|---|---|
| Server port | 8080 |
| WebSocket | `/ws` (control + heartbeat) |
| Heartbeat timeout | 5 seconds |
| Frontend throttle | 40ms |
| Sync interval | 30 seconds |
