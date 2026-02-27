"""MCP server for MechArm 270 — proxies tool calls to the Pi's FastAPI backend."""

import os

import httpx
from mcp.server.fastmcp import FastMCP, Image

MECHARM_URL = os.environ.get("MECHARM_URL", "http://mecharm.local")
TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)

JOINT_LIMITS = {
    1: (-160, 160),
    2: (-90, 90),
    3: (-180, 45),
    4: (-160, 160),
    5: (-100, 100),
    6: (-180, 180),
}

mcp = FastMCP("mecharm")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=MECHARM_URL, timeout=TIMEOUT)


def _api_error(e: Exception) -> str:
    if isinstance(e, httpx.ConnectError):
        return f"Connection failed — is the MechArm on and reachable at {MECHARM_URL}? ({e})"
    if isinstance(e, httpx.TimeoutException):
        return f"Request timed out talking to {MECHARM_URL}. ({e})"
    return f"Unexpected error: {e}"


# --- Tools ---


@mcp.tool()
async def get_arm_state() -> str:
    """Read the current hardware state: joint angles (J1-J6) and gripper percentage."""
    try:
        async with _client() as client:
            r = await client.get("/sync")
            r.raise_for_status()
            data = r.json()
            angles = data["a"]
            gripper = data["g"]
            lines = [f"J{i+1}: {a}°" for i, a in enumerate(angles)]
            lines.append(f"Gripper: {gripper}%")
            return "\n".join(lines)
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def move_joints(joints: dict[str, float]) -> str:
    """Set one or more joint angles. Pass a dict mapping joint number (\"1\"-\"6\") to degrees.

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
        async with _client() as client:
            r = await client.post("/update", json={"joints": validated})
            r.raise_for_status()
            return r.json()["m"]
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def set_gripper(value: int) -> str:
    """Set gripper position: 0 (fully open) to 100 (fully closed)."""
    if not (0 <= value <= 100):
        return f"Gripper value {value} out of range [0, 100]."
    try:
        async with _client() as client:
            r = await client.post("/gripper", json={"value": value})
            r.raise_for_status()
            return r.json()["m"]
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def reset_arm() -> str:
    """Reset all joints to 0° and open the gripper."""
    try:
        async with _client() as client:
            r = await client.post("/reset", json={})
            r.raise_for_status()
            return r.json()["m"]
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def capture_image():
    """Capture a single frame from the arm's camera. Returns a JPEG image."""
    try:
        async with _client() as client:
            async with client.stream("GET", "/video") as stream:
                buf = bytearray()
                soi = -1
                async for chunk in stream.aiter_bytes(4096):
                    buf.extend(chunk)
                    if soi < 0:
                        soi = buf.find(b"\xff\xd8")
                    if soi >= 0:
                        eoi = buf.find(b"\xff\xd9", soi + 2)
                        if eoi >= 0:
                            jpeg_data = bytes(buf[soi : eoi + 2])
                            return Image(data=jpeg_data, format="jpeg")
                return "No complete JPEG frame found in stream."
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def get_diagnostics() -> str:
    """Get system diagnostics: camera stats, client count, arm state."""
    try:
        async with _client() as client:
            r = await client.get("/diagnostics")
            r.raise_for_status()
            d = r.json()
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
        async with _client() as client:
            r = await client.get("/api/wifi/status")
            r.raise_for_status()
            d = r.json()
            if d.get("connected"):
                return f"Connected to \"{d['ssid']}\" — IP: {d['ip']}"
            return "Not connected to any WiFi network."
    except Exception as e:
        return _api_error(e)


@mcp.tool()
async def wifi_scan() -> str:
    """Scan for nearby WiFi networks visible to the MechArm."""
    try:
        async with _client() as client:
            r = await client.post("/api/wifi/scan")
            r.raise_for_status()
            networks = r.json().get("networks", [])
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
