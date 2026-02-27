"""FastAPI server for MechArm 270 remote control."""

import atexit
import asyncio
import subprocess
import threading
import time
from pathlib import Path

import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .arm import ArmController
from .camera import CameraManager
from .wifi import WiFiManager

STATIC_DIR = Path(__file__).parent / "static"
HEARTBEAT_TIMEOUT = 5.0  # seconds without ping → safe position

app = FastAPI()
arm: ArmController = None
cam: CameraManager = None
wifi: WiFiManager = None
_shutting_down = threading.Event()

# Track connected WebSocket clients and their last heartbeat
_clients: dict[WebSocket, float] = {}


# --- Lifecycle ---

@app.on_event("startup")
async def startup():
    global arm, cam, wifi
    print("Initializing arm controller...")
    arm = ArmController()
    print(f"  Angles: {arm.current_angles}")
    print(f"  Gripper: {arm.gripper_value}%")
    print("Initializing camera...")
    cam = CameraManager()
    print("Initializing WiFi manager...")
    wifi = WiFiManager()
    # atexit ensures camera releases even if uvicorn's shutdown event is skipped
    def _atexit_cleanup():
        print("[atexit] Running atexit camera cleanup...", flush=True)
        if cam:
            cam.shutdown()
        print("[atexit] Done.", flush=True)
    atexit.register(_atexit_cleanup)
    print("Starting heartbeat monitor...")
    asyncio.create_task(_heartbeat_monitor())
    print("Ready.")


@app.on_event("shutdown")
async def shutdown():
    print("[shutdown] ASGI shutdown event fired", flush=True)
    _shutting_down.set()
    if arm:
        print("[shutdown] Shutting down arm...", flush=True)
        arm.shutdown()
    if cam:
        print("[shutdown] Shutting down camera...", flush=True)
        cam.shutdown()
    print("[shutdown] Shutdown complete.", flush=True)


# --- Heartbeat monitor ---

async def _heartbeat_monitor():
    """Check all clients every second. If none have pinged within timeout, go safe."""
    while True:
        await asyncio.sleep(1.0)
        if not _clients:
            continue
        now = time.monotonic()
        all_stale = all(now - ts > HEARTBEAT_TIMEOUT for ts in _clients.values())
        if all_stale:
            print("Heartbeat timeout — moving arm to safe position")
            arm.go_safe()


# --- WebSocket (control + heartbeat) ---

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    _clients[ws] = time.monotonic()
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                _clients[ws] = time.monotonic()
                await ws.send_json({"type": "pong"})

            elif msg_type == "angles":
                joints = data.get("joints", {})
                arm.set_angles(joints)
                last_j = list(joints.keys())[-1] if joints else "?"
                last_a = joints.get(last_j, "")
                await ws.send_json({"type": "ack", "m": f"J{last_j} → {last_a}°"})

            elif msg_type == "gripper":
                value = data.get("value", 0)
                arm.set_gripper(value)
                status = "Open" if value > 50 else "Close"
                await ws.send_json({"type": "ack", "m": f"Gripper {status} → {value}%"})

            elif msg_type == "reset":
                arm.reset()
                await ws.send_json({"type": "ack", "m": "All Reset"})

            elif msg_type == "target":
                center = data.get("center", [0, 0])
                obj_class = data.get("class", "unknown")
                confidence = data.get("confidence", 0)
                print(f"Target: {obj_class} ({confidence:.0%}) at pixel ({center[0]}, {center[1]})")
                await ws.send_json({
                    "type": "target_ack",
                    "m": f"Target: {obj_class} at ({center[0]}, {center[1]})",
                    "status": "received",
                })

            elif msg_type == "sync":
                result = await asyncio.to_thread(arm.sync)
                await ws.send_json({"type": "sync", **result})

    except WebSocketDisconnect:
        pass
    finally:
        _clients.pop(ws, None)


# --- MJPEG video stream ---

def _generate_mjpeg():
    """Yield MJPEG frames from camera with OSD overlay and adaptive quality."""
    while not _shutting_down.is_set():
        frame = cam.get_frame()
        if frame is not None:
            y = 30
            for i, a in enumerate(arm.current_angles):
                cv2.putText(frame, f"J{i+1}:{a:.1f}", (10, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                y += 25
            cv2.putText(frame, f"Gripper:{arm.gripper_value}%", (10, y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            jpg = cam.encode_jpeg(frame)
            if jpg:
                cam.record_frame_sent(len(jpg))
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n")
            else:
                cam.record_frame_skipped()
        cam.adapt()
        time.sleep(1.0 / cam.fps)


@app.get("/video")
async def video():
    return StreamingResponse(
        _generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# --- HTTP fallback endpoints (same as original Flask app) ---

class UpdateRequest(BaseModel):
    joints: dict = {}

class GripperRequest(BaseModel):
    value: int = 0

class ResetRequest(BaseModel):
    pass


@app.post("/update")
async def update(req: UpdateRequest):
    arm.set_angles(req.joints)
    last_j = list(req.joints.keys())[-1] if req.joints else "?"
    last_a = req.joints.get(last_j, "")
    return {"m": f"J{last_j} → {last_a}°"}


@app.post("/gripper")
async def gripper(req: GripperRequest):
    arm.set_gripper(req.value)
    status = "Open" if req.value > 50 else "Close"
    return {"m": f"Gripper {status} → {req.value}%"}


@app.post("/reset")
async def reset(req: ResetRequest = ResetRequest()):
    arm.reset()
    return {"m": "All Reset"}


@app.get("/sync")
async def sync():
    return await asyncio.to_thread(arm.sync)


# --- Diagnostics ---

@app.get("/diagnostics")
async def diagnostics():
    video_stats = cam.get_stats()
    return {
        "arm": {
            "angles": arm.current_angles,
            "gripper": arm.gripper_value,
        },
        "video": video_stats,
        "clients": len(_clients),
        "heartbeat_timeout_s": HEARTBEAT_TIMEOUT,
    }


# --- WiFi management ---

class WiFiConnectRequest(BaseModel):
    ssid: str
    password: str


@app.get("/api/wifi/status")
async def wifi_status():
    return await asyncio.to_thread(wifi.status)


@app.post("/api/wifi/scan")
async def wifi_scan():
    networks = await asyncio.to_thread(wifi.scan)
    return {"networks": networks}


@app.post("/api/wifi/connect")
async def wifi_connect(req: WiFiConnectRequest):
    return await asyncio.to_thread(wifi.connect, req.ssid, req.password)


@app.post("/api/wifi/disconnect")
async def wifi_disconnect():
    return await asyncio.to_thread(wifi.disconnect)


# --- System management ---

@app.post("/api/system/restart")
async def system_restart():
    """Restart via systemctl — ensures clean shutdown and restart."""
    subprocess.Popen(["sudo", "systemctl", "restart", "mecharm"])
    return {"success": True}


@app.post("/api/system/reboot")
async def system_reboot():
    """Reboot the Raspberry Pi."""
    subprocess.Popen(["sudo", "reboot"])
    return {"success": True}


# --- Static files + index ---

app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/", response_class=HTMLResponse)
async def index():
    return (STATIC_DIR / "index.html").read_text()


# --- Entry point ---

def main():
    import uvicorn
    print("=" * 50)
    print("MechArm Control System (FastAPI)")
    print("=" * 50)
    print("Browser: http://192.168.3.2:8080")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="warning",
                timeout_graceful_shutdown=3)


if __name__ == "__main__":
    main()
