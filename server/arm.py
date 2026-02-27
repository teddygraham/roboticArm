"""ArmController — encapsulates pymycobot serial communication and command loop."""

import threading
import time
from pymycobot import MechArm270

SAFE_ANGLES = [0, 0, 0, 0, 0, 0]
SAFE_GRIPPER = 0


class ArmController:
    def __init__(self, port="/dev/ttyAMA0", baud=1000000):
        self.mc = MechArm270(port, baud)
        self.mc.set_fresh_mode(1)
        time.sleep(0.1)

        self.current_angles = [0, 0, 0, 0, 0, 0]
        self.gripper_value = 0

        self._target_angles = None
        self._target_gripper = None
        self._cmd_lock = threading.Lock()
        self._serial_lock = threading.Lock()
        self._running = True

        # Read initial state
        try:
            angles = self.mc.get_angles()
            if angles:
                self.current_angles = angles
        except Exception:
            pass
        try:
            grip = self.mc.get_gripper_value()
            if grip is not None:
                self.gripper_value = grip
        except Exception:
            pass

        self._thread = threading.Thread(target=self._command_loop, daemon=True)
        self._thread.start()

    def _command_loop(self):
        """Send latest target to arm every 25ms. Skips if no new command."""
        while self._running:
            angles = None
            grip = None
            with self._cmd_lock:
                if self._target_angles is not None:
                    angles = list(self._target_angles)
                    self._target_angles = None
                if self._target_gripper is not None:
                    grip = self._target_gripper
                    self._target_gripper = None
            if angles is not None or grip is not None:
                with self._serial_lock:
                    try:
                        if angles is not None:
                            self.mc.send_angles(angles, 100)
                        if grip is not None:
                            self.mc.set_gripper_value(grip, 80)
                    except Exception:
                        pass
            time.sleep(0.025)

    def set_angles(self, joints: dict):
        """Update target angles from a dict like {"1": 45, "3": -10}."""
        for j_str, angle in joints.items():
            self.current_angles[int(j_str) - 1] = angle
        with self._cmd_lock:
            self._target_angles = list(self.current_angles)

    def set_gripper(self, value: int):
        """Set gripper target (0=open, 100=closed)."""
        self.gripper_value = value
        with self._cmd_lock:
            self._target_gripper = value

    def reset(self):
        """Send all joints and gripper to zero."""
        self.current_angles = [0] * 6
        self.gripper_value = 0
        with self._cmd_lock:
            self._target_angles = [0] * 6
            self._target_gripper = 0

    def go_safe(self):
        """Move to safe position (all zeros). Used on heartbeat timeout."""
        self.current_angles = list(SAFE_ANGLES)
        self.gripper_value = SAFE_GRIPPER
        with self._cmd_lock:
            self._target_angles = list(SAFE_ANGLES)
            self._target_gripper = SAFE_GRIPPER

    def sync(self) -> dict:
        """Read current angles and gripper from hardware. Blocking serial call."""
        with self._serial_lock:
            try:
                angles = self.mc.get_angles()
                grip = self.mc.get_gripper_value()
                return {"a": angles, "g": grip}
            except Exception:
                return {"a": self.current_angles, "g": self.gripper_value}

    def shutdown(self):
        self._running = False
