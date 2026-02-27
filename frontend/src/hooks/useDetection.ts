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

export function useDetection(send: (msg: WsOutgoing) => boolean) {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<TargetSelection | null>(
    null,
  );
  const [inferenceMs, setInferenceMs] = useState(0);

  const modelRef = useRef<CocoModel | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inferenceRunning = useRef(false);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLImageElement | null>(null);

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

  // Preload model in background so "Enable Detection" is instant
  useEffect(() => {
    loadModel(true);
  }, [loadModel]);

  const runInference = useCallback(async () => {
    if (inferenceRunning.current || !modelRef.current) return;
    const video = videoRef.current;
    const canvas = detectCanvasRef.current;
    if (!video || !canvas || !video.naturalWidth) return;

    inferenceRunning.current = true;
    try {
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
    } catch (e) {
      console.error("Detection error:", e);
    }
    inferenceRunning.current = false;
  }, []);

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
      const model = await loadModel();
      if (model) startDetection();
    }
  }, [isActive, loadModel, startDetection, stopDetection]);

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

  return {
    isActive,
    isLoading,
    detections,
    selectedTarget,
    inferenceMs,
    setRefs,
    toggleDetection,
    selectDetection,
    sendTarget,
    clearTarget,
  };
}
