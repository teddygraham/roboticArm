import type { JointConfig } from "./types";

export const JOINTS: JointConfig[] = [
  { id: 1, label: "j1", min: -160, max: 160 },
  { id: 2, label: "j2", min: -90, max: 90 },
  { id: 3, label: "j3", min: -180, max: 45 },
  { id: 4, label: "j4", min: -160, max: 160 },
  { id: 5, label: "j5", min: -100, max: 100 },
  { id: 6, label: "j6", min: -180, max: 180 },
];

export const GRIPPER_MIN = 0;
export const GRIPPER_MAX = 100;

export const DEBOUNCE_MS = 40;
export const HEARTBEAT_MS = 2000;
export const RECONNECT_MS = 2000;
export const SYNC_INTERVAL_MS = 30000;
export const DETECT_INTERVAL_MS = 200; // 5fps
export const DETECT_CANVAS_W = 480;
export const DETECT_CANVAS_H = 360;
export const DETECT_MIN_SCORE = 0.5;
