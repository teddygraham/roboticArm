"""MCP server for MechArm 270 — proxies tool calls to the Pi's FastAPI backend.

Uses curl for HTTP requests because Python's socket module cannot reliably
connect to mDNS (.local) hosts on macOS (IPv6 link-local / NAT64 networks).
"""

import json
import os
import subprocess

from mcp.server.fastmcp import FastMCP, Image

MECHARM_URL = os.environ.get("MECHARM_URL", "http://mecharm.local")

JOINT_LIMITS = {
    1: (-160, 160),
    2: (-90, 90),
    3: (-180, 45),
    4: (-160, 160),
    5: (-100, 100),
    6: (-180, 180),
}

mcp = FastMCP("mecharm")


def _curl_get(path: str, *, timeout: int = 10) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["curl", "-s", "-f", "--connect-timeout", "5", "--max-time", str(timeout),
         f"{MECHARM_URL}{path}"],
        capture_output=True, timeout=timeout + 2,
    )


def _curl_post(path: str, data: dict, *, timeout: int = 10) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["curl", "-s", "-f", "--connect-timeout", "5", "--max-time", str(timeout),
         "-X", "POST", "-H", "Content-Type: application/json",
         "-d", json.dumps(data), f"{MECHARM_URL}{path}"],
        capture_output=True, timeout=timeout + 2,
    )


def _api_error(e: Exception) -> str:
    return f"Connection failed — is the MechArm on and reachable at {MECHARM_URL}? ({e})"


# --- Tools ---


@mcp.tool()
async def get_arm_state() -> str:
    """Read the current hardware state: joint angles (J1-J6) and gripper percentage."""
    try:
        proc = _curl_get("/sync")
        if proc.returncode != 0:
            return f"Request failed (curl exit {proc.returncode}). Is MechArm reachable at {MECHARM_URL}?"
        data = json.loads(proc.stdout)
        angles = data["a"]
        gripper = data["g"]
        lines = [f"J{i+1}: {a}°" for i, a in enumerate(angles)]
        lines.append(f"Gripper: {gripper}%")
        return "\n".join(lines)
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def move_joints(joints: dict[str, float]) -> str:
    """Set one or more joint angles. Pass a dict mapping joint number ("1"-"6") to degrees.

    Limits: J1 ±160, J2 ±90, J3 -180/+45, J4 ±160, J5 ±100, J6 ±180.
    """
    validated = {}
    for key, angle in joints.items():
        jid = int(key)
        if jid not in JOINT_LIMITS:
            return f"Invalid joint {jid} — must be 1-6."
        lo, hi = JOINT_LIMITS[jid]
        if not (lo <= angle <= hi):
            return f"J{jid} angle {angle}° out of range [{lo}, {hi}]."
        validated[str(jid)] = angle

    try:
        proc = _curl_post("/update", {"joints": validated})
        if proc.returncode != 0:
            return f"Request failed (curl exit {proc.returncode})."
        return json.loads(proc.stdout)["m"]
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def set_gripper(value: int) -> str:
    """Set gripper position: 0 (fully open) to 100 (fully closed)."""
    if not (0 <= value <= 100):
        return f"Gripper value {value} out of range [0, 100]."
    try:
        proc = _curl_post("/gripper", {"value": value})
        if proc.returncode != 0:
            return f"Request failed (curl exit {proc.returncode})."
        return json.loads(proc.stdout)["m"]
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def reset_arm() -> str:
    """Reset all joints to 0° and open the gripper."""
    try:
        proc = _curl_post("/reset", {})
        if proc.returncode != 0:
            return f"Request failed (curl exit {proc.returncode})."
        return json.loads(proc.stdout)["m"]
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def capture_image():
    """Capture a single frame from the arm's camera. Returns a JPEG image."""
    try:
        # /video is an endless MJPEG stream, so we grab ~2s of data and extract
        # the first complete JPEG frame from it.
        proc = subprocess.run(
            ["curl", "-s", "--connect-timeout", "5", "--max-time", "2",
             f"{MECHARM_URL}/video"],
            capture_output=True, timeout=5,
        )
        # curl exit 28 = timeout, which is expected since the stream never ends
        buf = proc.stdout
        if not buf:
            return f"No data received from camera. Is the camera connected?"
        soi = buf.find(b"\xff\xd8")
        if soi >= 0:
            eoi = buf.find(b"\xff\xd9", soi + 2)
            if eoi >= 0:
                return Image(data=bytes(buf[soi : eoi + 2]), format="jpeg")
        return "No complete JPEG frame found in stream."
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def get_diagnostics() -> str:
    """Get system diagnostics: camera stats, client count, arm state."""
    try:
        proc = _curl_get("/diagnostics")
        if proc.returncode != 0:
            return f"Request failed (curl exit {proc.returncode})."
        d = json.loads(proc.stdout)
        arm = d.get("arm", {})
        video = d.get("video", {})
        lines = [
            "=== Arm ===",
            f"  Angles: {arm.get('angles')}",
            f"  Gripper: {arm.get('gripper')}%",
            "=== Video ===",
            f"  FPS: {video.get('fps')}  Quality: {video.get('quality')}%",
            f"  Frames sent: {video.get('frames_sent')}  Skipped: {video.get('frames_skipped')}",
            f"  Bytes sent: {video.get('bytes_sent')}",
            f"=== Clients: {d.get('clients')} ===",
        ]
        return "\n".join(lines)
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def wifi_status() -> str:
    """Get the MechArm's WiFi connection status."""
    try:
        proc = _curl_get("/api/wifi/status")
        if proc.returncode != 0:
            return f"Request failed (curl exit {proc.returncode})."
        d = json.loads(proc.stdout)
        if d.get("connected"):
            return f"Connected to \"{d['ssid']}\" — IP: {d['ip']}"
        return "Not connected to any WiFi network."
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def wifi_scan() -> str:
    """Scan for nearby WiFi networks visible to the MechArm."""
    try:
        proc = _curl_post("/api/wifi/scan", {})
        if proc.returncode != 0:
            return f"Request failed (curl exit {proc.returncode})."
        networks = json.loads(proc.stdout).get("networks", [])
        if not networks:
            return "No networks found."
        lines = []
        for n in networks:
            lock = "secured" if n.get("secured") else "open"
            active = " (active)" if n.get("active") else ""
            lines.append(f"  {n['ssid']}  signal: {n['signal']}%  [{lock}]{active}")
        return "Networks:\n" + "\n".join(lines)
    except Exception as e:
        return _api_error(e)


if __name__ == "__main__":
    mcp.run()
