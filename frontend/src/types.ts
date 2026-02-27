export interface JointConfig {
  id: number; // 1-6
  label: string; // i18n key
  min: number;
  max: number;
}

export interface ArmState {
  angles: number[]; // 6 values
  gripper: number; // 0-100
}

export interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // x, y, w, h
}

export interface TargetSelection {
  detection: Detection;
  center: [number, number];
}

// WebSocket message types
export type WsOutgoing =
  | { type: "ping" }
  | { type: "angles"; joints: Record<number, number> }
  | { type: "gripper"; value: number }
  | { type: "reset" }
  | { type: "sync" }
  | {
      type: "target";
      class: string;
      confidence: number;
      center: [number, number];
      image_size: [number, number];
    };

export type WsIncoming =
  | { type: "pong" }
  | { type: "ack"; m: string }
  | { type: "target_ack"; m: string; status: string }
  | { type: "sync"; a?: number[]; g?: number };
