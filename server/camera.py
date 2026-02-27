"""CameraManager — threaded capture with adaptive quality/fps."""

import threading
import time
import cv2

MIN_QUALITY = 40
MAX_QUALITY = 75
MIN_FPS = 5
MAX_FPS = 15


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

        self._cap = cv2.VideoCapture(device)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()

    def _capture_loop(self):
        """Continuously grab frames at target fps."""
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
        self._running = False
        self._cap.release()
