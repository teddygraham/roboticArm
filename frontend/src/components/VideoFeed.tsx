import { useCallback, useEffect, useRef } from "react";
import { DETECT_CANVAS_H, DETECT_CANVAS_W } from "../constants";
import type { Detection, TargetSelection } from "../types";

interface Props {
  streamUrl: string;
  headerText: string;
  isConnected: boolean;
  detections: Detection[];
  selectedTarget: TargetSelection | null;
  isDetecting: boolean;
  onCanvasClick: (canvasX: number, canvasY: number) => void;
  onRefs: (video: HTMLImageElement, canvas: HTMLCanvasElement) => void;
}

export function VideoFeed({
  streamUrl,
  headerText,
  isConnected,
  detections,
  selectedTarget,
  isDetecting,
  onCanvasClick,
  onRefs,
}: Props) {
  const videoRef = useRef<HTMLImageElement>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wasConnected = useRef(true);

  // Reload MJPEG stream when WebSocket reconnects (false → true)
  useEffect(() => {
    if (isConnected && !wasConnected.current && videoRef.current) {
      videoRef.current.src = `${streamUrl}?t=${Date.now()}`;
    }
    wasConnected.current = isConnected;
  }, [isConnected, streamUrl]);

  // Register refs with detection hook
  useEffect(() => {
    if (videoRef.current && detectCanvasRef.current) {
      onRefs(videoRef.current, detectCanvasRef.current);
    }
  }, [onRefs]);

  // Draw bounding boxes on overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const det of detections) {
      const [x, y, w, h] = det.bbox;
      const isSelected =
        selectedTarget?.detection === det;
      const color = isSelected ? "#fbbf24" : "#34d399";

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      const label = `${det.class} ${Math.round(det.score * 100)}%`;
      ctx.font = "13px ui-monospace, monospace";
      const textW = ctx.measureText(label).width + 6;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 18, textW, 18);
      ctx.fillStyle = "#000";
      ctx.fillText(label, x + 3, y - 4);
    }
  }, [detections, selectedTarget]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDetecting || detections.length === 0) return;
      const canvas = overlayCanvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      onCanvasClick(cx, cy);
    },
    [isDetecting, detections.length, onCanvasClick],
  );

  return (
    <div className="flex flex-col bg-black">
      <div className="bg-emerald-500 text-slate-900 px-4 py-3 text-center text-lg font-bold">
        {headerText}
      </div>
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="relative inline-block border-2 border-slate-600 rounded-lg overflow-hidden">
          <img
            ref={videoRef}
            src={streamUrl}
            alt="Camera feed"
            className="block max-w-full max-h-[70vh]"
          />
          <canvas
            ref={detectCanvasRef}
            width={DETECT_CANVAS_W}
            height={DETECT_CANVAS_H}
            className="hidden"
          />
          <canvas
            ref={overlayCanvasRef}
            width={DETECT_CANVAS_W}
            height={DETECT_CANVAS_H}
            className={`absolute top-0 left-0 w-full h-full ${
              isDetecting ? "cursor-crosshair" : "pointer-events-none"
            }`}
            onClick={handleClick}
          />
        </div>
      </div>
    </div>
  );
}
