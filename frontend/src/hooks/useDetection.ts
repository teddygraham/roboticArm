import { useCallback, useEffect, useRef, useState } from "react";
import {
  DETECT_CANVAS_H,
  DETECT_CANVAS_W,
  DETECT_INTERVAL_MS,
  DETECT_MIN_SCORE,
} from "../constants";
import type { Detection, TargetSelection, WsOutgoing } from "../types";

// TF.js + COCO-SSD loaded from CDN, declared on window
declare global {
  interface Window {
    cocoSsd: {
      load: (config?: { base?: string }) => Promise<CocoModel>;
    };
  }
}

interface CocoModel {
  detect: (
    input: HTMLCanvasElement,
  ) => Promise<{ class: string; score: number; bbox: number[] }[]>;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export type DetectionMode = "coco" | "roboflow";

export function useDetection(send: (msg: WsOutgoing) => boolean, inferenceUrl?: string) {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<TargetSelection | null>(
    null,
  );
  const [inferenceMs, setInferenceMs] = useState(0);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>("coco");

  const modelRef = useRef<CocoModel | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inferenceRunning = useRef(false);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLImageElement | null>(null);
  const detectionModeRef = useRef<DetectionMode>("coco");

  // Keep ref in sync so runInference closure always sees current mode
  useEffect(() => {
    detectionModeRef.current = detectionMode;
  }, [detectionMode]);

  // Called by VideoFeed to register canvas/video refs
  const setRefs = useCallback(
    (video: HTMLImageElement, canvas: HTMLCanvasElement) => {
      videoRef.current = video;
      detectCanvasRef.current = canvas;
    },
    [],
  );

  const loadModel = useCallback(async (eager = false): Promise<CocoModel | null> => {
    if (modelRef.current) return modelRef.current;
    if (!eager) setIsLoading(true);
    try {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/dist/tf.min.js",
      );
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2/dist/coco-ssd.min.js",
      );
      const model = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
      modelRef.current = model;
      return model;
    } catch (e) {
      console.error("Failed to load COCO-SSD:", e);
      return null;
    } finally {
      if (!eager) setIsLoading(false);
    }
  }, []);

  // Preload COCO-SSD in background so "Enable Detection" is instant
  useEffect(() => {
    loadModel(true);
  }, [loadModel]);

  const runInferenceCoco = useCallback(async () => {
    if (!modelRef.current) return;
    const video = videoRef.current;
    const canvas = detectCanvasRef.current;
    if (!video || !canvas || !video.naturalWidth) return;

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, DETECT_CANVAS_W, DETECT_CANVAS_H);
    const t0 = performance.now();
    const predictions = await modelRef.current.detect(canvas);
    setInferenceMs(Math.round(performance.now() - t0));

    const filtered: Detection[] = predictions
      .filter((p) => p.score >= DETECT_MIN_SCORE)
      .map((p) => ({
        class: p.class,
        score: p.score,
        bbox: p.bbox as [number, number, number, number],
      }));
    setDetections(filtered);
  }, []);

  const inferenceUrlRef = useRef(inferenceUrl);
  useEffect(() => {
    inferenceUrlRef.current = inferenceUrl;
  }, [inferenceUrl]);

  const runInferenceRoboflow = useCallback(async () => {
    const url = inferenceUrlRef.current;
    if (!url) return;
    const video = videoRef.current;
    const canvas = detectCanvasRef.current;
    if (!video || !canvas || !video.naturalWidth) return;

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, DETECT_CANVAS_W, DETECT_CANVAS_H);
    const t0 = performance.now();

    const imageData = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    const resp = await fetch(`${url}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageData }),
    });
    const data = await resp.json();
    setInferenceMs(Math.round(performance.now() - t0));

    if (data.error) {
      console.error("Inference error:", data.error);
      return;
    }

    const filtered: Detection[] = (data.predictions ?? [])
      .filter((p: Detection) => p.score >= DETECT_MIN_SCORE)
      .map((p: Detection) => ({
        class: p.class,
        score: p.score,
        bbox: p.bbox as [number, number, number, number],
      }));
    setDetections(filtered);
  }, []);

  const runInference = useCallback(async () => {
    if (inferenceRunning.current) return;
    inferenceRunning.current = true;
    try {
      if (detectionModeRef.current === "roboflow") {
        await runInferenceRoboflow();
      } else {
        await runInferenceCoco();
      }
    } catch (e) {
      console.error("Detection error:", e);
    }
    inferenceRunning.current = false;
  }, [runInferenceCoco, runInferenceRoboflow]);

  const startDetection = useCallback(() => {
    setIsActive(true);
    intervalRef.current = setInterval(runInference, DETECT_INTERVAL_MS);
  }, [runInference]);

  const stopDetection = useCallback(() => {
    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDetections([]);
    setSelectedTarget(null);
    setInferenceMs(0);
  }, []);

  const toggleDetection = useCallback(async () => {
    if (isActive) {
      stopDetection();
    } else {
      if (detectionModeRef.current === "coco") {
        const model = await loadModel();
        if (model) startDetection();
      } else {
        startDetection();
      }
    }
  }, [isActive, loadModel, startDetection, stopDetection]);

  // When mode changes while active, restart detection with new mode
  const handleSetDetectionMode = useCallback(
    (mode: DetectionMode) => {
      setDetectionMode(mode);
      if (isActive) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        intervalRef.current = setInterval(runInference, DETECT_INTERVAL_MS);
      }
    },
    [isActive, runInference],
  );

  const selectDetection = useCallback(
    (canvasX: number, canvasY: number) => {
      for (const det of detections) {
        const [bx, by, bw, bh] = det.bbox;
        if (
          canvasX >= bx &&
          canvasX <= bx + bw &&
          canvasY >= by &&
          canvasY <= by + bh
        ) {
          const centerX = Math.round(bx + bw / 2);
          const centerY = Math.round(by + bh / 2);
          setSelectedTarget({ detection: det, center: [centerX, centerY] });
          return;
        }
      }
      setSelectedTarget(null);
    },
    [detections],
  );

  const sendTarget = useCallback(() => {
    if (!selectedTarget) return;
    send({
      type: "target",
      class: selectedTarget.detection.class,
      confidence:
        Math.round(selectedTarget.detection.score * 100) / 100,
      center: selectedTarget.center,
      image_size: [DETECT_CANVAS_W, DETECT_CANVAS_H],
    });
  }, [selectedTarget, send]);

  const clearTarget = useCallback(() => {
    setSelectedTarget(null);
  }, []);

  // Capture current video frame as base64 JPEG for vision commands
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.naturalWidth) return null;
    // Draw to a temporary canvas so we don't need detection to be active
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = DETECT_CANVAS_W;
    tmpCanvas.height = DETECT_CANVAS_H;
    tmpCanvas.getContext("2d")!.drawImage(video, 0, 0, DETECT_CANVAS_W, DETECT_CANVAS_H);
    return tmpCanvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? null;
  }, []);

  const hasInferenceServer = !!inferenceUrl;

  return {
    isActive,
    isLoading,
    detections,
    selectedTarget,
    inferenceMs,
    detectionMode,
    hasInferenceServer,
    setRefs,
    toggleDetection,
    selectDetection,
    sendTarget,
    clearTarget,
    setDetectionMode: handleSetDetectionMode,
    captureFrame,
  };
}
