"""Local YOLOv11 inference server for server parts detection and NL control."""

import asyncio
import base64
import io
import json
import os
import re
import subprocess
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ultralytics import YOLO
from PIL import Image

MODEL_PATH = os.environ.get("YOLO_MODEL", str(Path(__file__).parent / "weights.pt"))
MECHARM_URL = "http://mecharm.local"
CLAUDE_BIN = os.path.expanduser("~/.local/bin/claude")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"Loading model from {MODEL_PATH}...")
model = YOLO(str(MODEL_PATH))
print("Model ready.")


# --- YOLO detection ---

class DetectRequest(BaseModel):
    image: str  # base64-encoded JPEG


@app.post("/detect")
async def detect(req: DetectRequest):
    img_bytes = base64.b64decode(req.image)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    results = model(img, verbose=False)[0]

    CLASS_THRESHOLDS: dict[str, float] = {
        "Power Button": 0.2,
        "Bezel-lock": 0.2,
    }
    DEFAULT_THRESHOLD = 0.3

    predictions = []
    for box in results.boxes:
        class_name = results.names[int(box.cls)]
        score = round(float(box.conf), 3)
        threshold = CLASS_THRESHOLDS.get(class_name, DEFAULT_THRESHOLD)
        if score < threshold:
            continue
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        predictions.append({
            "class": class_name,
            "score": score,
            "bbox": [x1, y1, x2 - x1, y2 - y1],
        })

    return {
        "predictions": predictions,
        "image_size": [img.width, img.height],
    }


# --- Pi helpers (direct HTTP, no MCP needed) ---

def _fetch_snapshot() -> str | None:
    """Fetch a JPEG snapshot from the Pi and return as base64."""
    try:
        proc = subprocess.run(
            ["curl", "-s", "-f", "--connect-timeout", "5", "--max-time", "8",
             f"{MECHARM_URL}/snapshot"],
            capture_output=True, timeout=10,
        )
        if proc.returncode != 0 or not proc.stdout:
            return None
        return base64.b64encode(proc.stdout).decode()
    except Exception:
        return None


def _fetch_arm_state() -> dict | None:
    """Fetch current joint angles and gripper from Pi."""
    try:
        proc = subprocess.run(
            ["curl", "-s", "-f", "--connect-timeout", "5", "--max-time", "5",
             f"{MECHARM_URL}/sync"],
            capture_output=True, text=True, timeout=8,
        )
        if proc.returncode != 0:
            return None
        return json.loads(proc.stdout)
    except Exception:
        return None


def _execute_joints(joints: dict, gripper: int | None):
    """Send joint and gripper commands directly to Pi."""
    if joints:
        subprocess.run(
            ["curl", "-s", "-f", "--connect-timeout", "5", "--max-time", "8",
             "-X", "POST", "-H", "Content-Type: application/json",
             "-d", json.dumps({"joints": joints}),
             f"{MECHARM_URL}/update"],
            capture_output=True, timeout=10,
        )
    if gripper is not None:
        subprocess.run(
            ["curl", "-s", "-f", "--connect-timeout", "5", "--max-time", "8",
             "-X", "POST", "-H", "Content-Type: application/json",
             "-d", json.dumps({"value": gripper}),
             f"{MECHARM_URL}/gripper"],
            capture_output=True, timeout=10,
        )


# --- Claude CLI helper ---

SYSTEM_PROMPT = """You are controlling a MechArm 270 Pi robotic arm with 6 joints and a gripper.

Joint limits: J1 ±160°, J2 ±90°, J3 -180°/+45°, J4 ±160°, J5 ±100°, J6 ±180°. Gripper: 0 (open) to 100 (closed).
The arm interacts with server equipment (bezel, power button, HDD, bezel latch, bezel lock).

You are given the current camera image and arm state. Analyze them and plan ONE step at a time.
After any movement, set has_next: true. Only set has_next: false when the task is fully complete.

Respond with ONLY a valid JSON object:
{
  "observation": "what you see in the camera image (1-2 sentences)",
  "strategy": "what you are doing in this step (1 sentence)",
  "joints": {"1": angle, "2": angle, ...},
  "gripper": value,
  "message": "brief description in the same language as the user's command",
  "has_next": true or false,
  "next_step": "description of the next planned step (only if has_next is true)"
}

Only include joints that need to change. Respond with JSON only, no other text."""


def _call_claude(command: str, image_b64: str | None, state: dict | None) -> dict:
    """Call claude --print with image and state embedded in the prompt."""
    state_desc = ""
    if state:
        a = state.get("a", [0] * 6)
        g = state.get("g", 0)
        state_desc = (
            f"\nCurrent arm state: J1={a[0]:.1f}\u00b0, J2={a[1]:.1f}\u00b0, "
            f"J3={a[2]:.1f}\u00b0, J4={a[3]:.1f}\u00b0, J5={a[4]:.1f}\u00b0, J6={a[5]:.1f}\u00b0, "
            f"Gripper={g}%"
        )
    else:
        state_desc = "\nArm state: unavailable"

    user_text = f"{state_desc}\n\nCommand: {command}"

    if image_b64:
        content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": image_b64,
                },
            },
            {"type": "text", "text": user_text},
        ]
    else:
        content = [{"type": "text", "text": f"No camera image available.{user_text}"}]

    stream_input = json.dumps({
        "type": "user",
        "message": {"role": "user", "content": content},
    })

    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)

    try:
        result = subprocess.run(
            [
                CLAUDE_BIN,
                "--print",
                "--input-format", "stream-json",
                "--output-format", "stream-json",
                "--verbose",
                "--system-prompt", SYSTEM_PROMPT,
            ],
            input=stream_input,
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
        )
    except subprocess.TimeoutExpired:
        return {"error": "Timeout", "message": "Claude took too long to respond"}
    except FileNotFoundError:
        return {"error": "claude CLI not found", "message": "Make sure Claude Code is installed"}

    raw = result.stdout.strip()
    if not raw:
        return {"error": result.stderr[:300] or "No response", "message": "Claude CLI error"}

    # Parse stream-json output
    text_parts = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            if obj.get("type") == "result" and obj.get("result"):
                text_parts = [obj["result"]]
                break
            if obj.get("type") == "content_block_delta":
                delta = obj.get("delta", {})
                if delta.get("type") == "text_delta":
                    text_parts.append(delta.get("text", ""))
        except (json.JSONDecodeError, KeyError):
            continue

    full_text = "".join(text_parts).strip()
    if not full_text:
        return {"error": "No text in response", "message": "Empty response from Claude"}

    try:
        return json.loads(full_text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", full_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return {"error": "Invalid JSON from Claude", "message": full_text}


# --- Natural language command endpoint (streaming SSE) ---

class CommandRequest(BaseModel):
    command: str


@app.post("/command")
async def natural_language_command(req: CommandRequest):
    """Execute a natural language command with autonomous multi-step loop, streamed via SSE."""

    async def generate():
        current_command = req.command
        step = 0

        while True:
            step += 1

            # Fetch fresh image and state directly from Pi
            image_b64 = _fetch_snapshot()
            state = _fetch_arm_state()

            # Call Claude
            result = _call_claude(current_command, image_b64, state)

            if result.get("error"):
                yield f"data: {json.dumps(result)}\n\n"
                break

            # Execute joints/gripper directly on Pi
            joints = result.get("joints", {})
            gripper = result.get("gripper")
            if joints or gripper is not None:
                _execute_joints(joints, gripper)

            # Stream this step to browser
            step_result = {**result, "step": step}
            yield f"data: {json.dumps(step_result)}\n\n"

            # Stop if done or no next step
            if not result.get("has_next") or not result.get("next_step"):
                break

            # Wait for arm to physically move before next step
            await asyncio.sleep(2.5)
            current_command = result["next_step"]

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
