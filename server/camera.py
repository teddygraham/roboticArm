"""CameraManager — threaded capture with adaptive quality/fps."""

import threading
import time
import cv2

MIN_QUALITY = 40
MAX_QUALITY = 75
MIN_FPS = 5
MAX_FPS = 15

CAMERA_OPEN_RETRIES = 5
CAMERA_OPEN_DELAY = 2  # seconds between retries


def _log(msg: str):
    """Print and flush immediately so journalctl sees it."""
    print(msg, flush=True)


class CameraManager:
    def __init__(self, device=0, width=480, height=360, fps=12, quality=65):
        self.fps = fps
        self.quality = quality
        self._frame = None
        self._lock = threading.Lock()
        self._running = True

        # Adaptive video stats
        self._frames_sent = 0
        self._frames_skipped = 0
        self._bytes_sent = 0
        self._last_stats_reset = time.monotonic()
        self._last_deliver_time = 0.0
        self._stats_lock = threading.Lock()

        self._cap = self._open_camera(device, width, height)

        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()

    def _open_camera(self, device, width, height):
        """Open camera with retries — handles device still locked from previous process."""
        for attempt in range(1, CAMERA_OPEN_RETRIES + 1):
            _log(f"Opening camera (attempt {attempt}/{CAMERA_OPEN_RETRIES})...")
            cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                _log(f"Camera opened on attempt {attempt}.")
                return cap
            _log(f"Camera not available (attempt {attempt}), retrying in {CAMERA_OPEN_DELAY}s...")
            cap.release()
            time.sleep(CAMERA_OPEN_DELAY)
        _log("ERROR: Could not open camera after all retries. Starting without video.")
        return None

    def _capture_loop(self):
        """Continuously grab frames at target fps."""
        if self._cap is None:
            return
        while self._running:
            interval = 1.0 / self.fps
            t0 = time.monotonic()
            ret, frame = self._cap.read()
            if ret:
                with self._lock:
                    self._frame = frame
            elapsed = time.monotonic() - t0
            if elapsed < interval:
                time.sleep(interval - elapsed)

    def get_frame(self):
        """Return the latest captured frame (or None)."""
        with self._lock:
            return self._frame.copy() if self._frame is not None else None

    def encode_jpeg(self, frame, quality=None):
        """Encode a frame as JPEG bytes."""
        q = quality if quality is not None else self.quality
        ret, jpg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, q])
        return jpg.tobytes() if ret else None

    def record_frame_sent(self, nbytes: int):
        """Record a successfully delivered frame for adaptive tracking."""
        with self._stats_lock:
            self._frames_sent += 1
            self._bytes_sent += nbytes
            self._last_deliver_time = time.monotonic()

    def record_frame_skipped(self):
        """Record a frame that couldn't be delivered in time."""
        with self._stats_lock:
            self._frames_skipped += 1

    def adapt(self):
        """Adjust quality/fps based on delivery success rate. Call periodically."""
        with self._stats_lock:
            now = time.monotonic()
            elapsed = now - self._last_stats_reset
            if elapsed < 5.0:
                return  # adapt every 5 seconds
            total = self._frames_sent + self._frames_skipped
            if total == 0:
                self._last_stats_reset = now
                return
            success_rate = self._frames_sent / total
            self._frames_sent = 0
            self._frames_skipped = 0
            self._bytes_sent = 0
            self._last_stats_reset = now

        # If delivery rate < 80%, reduce quality/fps
        if success_rate < 0.8:
            self.quality = max(MIN_QUALITY, self.quality - 5)
            self.fps = max(MIN_FPS, self.fps - 1)
        elif success_rate > 0.95 and self.quality < MAX_QUALITY:
            self.quality = min(MAX_QUALITY, self.quality + 3)
            self.fps = min(MAX_FPS, self.fps + 1)

    def get_stats(self) -> dict:
        """Return current stats for diagnostics."""
        with self._stats_lock:
            return {
                "fps": self.fps,
                "quality": self.quality,
                "frames_sent": self._frames_sent,
                "frames_skipped": self._frames_skipped,
                "bytes_sent": self._bytes_sent,
            }

    def shutdown(self):
        if not self._running:
            _log("Camera shutdown: already shut down, skipping.")
            return
        _log("Camera shutdown: stopping capture thread...")
        self._running = False
        self._thread.join(timeout=2)
        if self._thread.is_alive():
            _log("Camera shutdown: WARNING — capture thread did not stop in 2s")
        else:
            _log("Camera shutdown: capture thread stopped.")
        if self._cap is not None:
            self._cap.release()
            _log("Camera shutdown: device released.")
        _log("Camera shutdown: complete.")
