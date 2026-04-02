import { useCallback, useEffect, useRef } from "react";
import { DETECT_CANVAS_H, DETECT_CANVAS_W } from "../constants";
import type { Detection, TargetSelection } from "../types";
import type { DetectionMode } from "../hooks/useDetection";

interface Props {
  streamUrl: string;
  isConnected: boolean;
  detections: Detection[];
  selectedTarget: TargetSelection | null;
  isDetecting: boolean;
  detectLoading: boolean;
  inferenceMs: number;
  detectMode: DetectionMode;
  hasInferenceServer: boolean;
  onCanvasClick: (canvasX: number, canvasY: number) => void;
  onRefs: (video: HTMLImageElement, canvas: HTMLCanvasElement) => void;
  onSetDetectMode: (mode: DetectionMode) => void;
  onToggleDetection: () => void;
  onSendTarget: () => void;
  onClearTarget: () => void;
  t: (key: string) => string;
}

export function LiveCameraView({
  streamUrl,
  isConnected,
  detections,
  selectedTarget,
  isDetecting,
  detectLoading,
  inferenceMs,
  detectMode,
  hasInferenceServer,
  onCanvasClick,
  onRefs,
  onSetDetectMode,
  onToggleDetection,
  onSendTarget,
  onClearTarget,
  t,
}: Props) {
  const videoRef = useRef<HTMLImageElement>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wasConnected = useRef(true);

  useEffect(() => {
    if (isConnected && !wasConnected.current && videoRef.current) {
      videoRef.current.src = `${streamUrl}?t=${Date.now()}`;
    }
    wasConnected.current = isConnected;
  }, [isConnected, streamUrl]);

  useEffect(() => {
    if (videoRef.current && detectCanvasRef.current) {
      onRefs(videoRef.current, detectCanvasRef.current);
    }
  }, [onRefs]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const det of detections) {
      const [x, y, w, h] = det.bbox;
      const isSelected = selectedTarget?.detection === det;
      const color = isSelected ? "#f59e0b" : "#3b82f6";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      const label = `${det.class} ${Math.round(det.score * 100)}%`;
      ctx.font = "12px ui-monospace, monospace";
      const textW = ctx.measureText(label).width + 8;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 18, textW, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 4, y - 4);
    }
  }, [detections, selectedTarget]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDetecting || detections.length === 0) return;
      const canvas = overlayCanvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      onCanvasClick((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    },
    [isDetecting, detections.length, onCanvasClick],
  );

  const handleSnapshot = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `snapshot-${Date.now()}.png`;
    a.click();
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
          <h2 className="text-sm font-semibold text-gray-800">Live Camera View</h2>
          {isDetecting && (
            <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
              Detection ON
            </span>
          )}
        </div>
        <button
          onClick={handleSnapshot}
          title="Snapshot"
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Camera */}
      <div className="flex-1 flex items-center justify-center bg-gray-900 overflow-hidden">
        <div className="relative inline-block">
          <img
            ref={videoRef}
            src={streamUrl}
            alt="Camera feed"
            className="block max-w-full max-h-[calc(100vh-320px)]"
          />
          <canvas ref={detectCanvasRef} width={DETECT_CANVAS_W} height={DETECT_CANVAS_H} className="hidden" />
          <canvas
            ref={overlayCanvasRef}
            width={DETECT_CANVAS_W}
            height={DETECT_CANVAS_H}
            className={`absolute top-0 left-0 w-full h-full ${isDetecting ? "cursor-crosshair" : "pointer-events-none"}`}
            onClick={handleClick}
          />
        </div>
      </div>

      {/* Detection controls */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          {/* Model selector */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
            <button
              onClick={() => onSetDetectMode("coco")}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                detectMode === "coco" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              COCO-SSD
            </button>
            {hasInferenceServer && (
              <button
                onClick={() => onSetDetectMode("roboflow")}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  detectMode === "roboflow" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                Server Parts
              </button>
            )}
          </div>

          {/* Toggle */}
          <button
            onClick={onToggleDetection}
            disabled={detectLoading}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              detectLoading
                ? "bg-gray-100 text-gray-400 cursor-wait"
                : isDetecting
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {detectLoading ? t("loadingModel") : isDetecting ? t("disableDetect") : t("enableDetect")}
          </button>

          {isDetecting && inferenceMs > 0 && (
            <span className="text-xs text-gray-400 flex-shrink-0">{inferenceMs}ms</span>
          )}
        </div>

        {/* Target */}
        {selectedTarget && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
            <p className="text-xs font-medium text-amber-700">
              {selectedTarget.detection.class} {Math.round(selectedTarget.detection.score * 100)}%
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={onSendTarget}
                className="bg-amber-400 hover:bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors"
              >
                {t("moveToTarget")}
              </button>
              <button
                onClick={onClearTarget}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold px-2.5 py-1 rounded transition-colors"
              >
                {t("clearTarget")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
