import { useCallback, useEffect, useRef, useState } from "react";
import { DEBOUNCE_MS, JOINTS, SYNC_INTERVAL_MS } from "../constants";
import type { WsIncoming, WsOutgoing } from "../types";

export function useArm(
  send: (msg: WsOutgoing) => boolean,
  isConnected: boolean,
) {
  const [angles, setAngles] = useState<number[]>(() => JOINTS.map(() => 0));
  const [gripper, setGripper] = useState(0);
  const [lastStatus, setLastStatus] = useState("Ready");

  // Debounced joint sending
  const pendingJoints = useRef<Record<number, number>>({});
  const jointTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gripTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushJoints = useCallback(() => {
    const joints = pendingJoints.current;
    pendingJoints.current = {};
    jointTimer.current = null;
    if (send({ type: "angles", joints })) return;
    // HTTP fallback
    fetch("/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joints }),
    })
      .then((r) => r.json())
      .then((d: { m: string }) => setLastStatus(d.m));
  }, [send]);

  const setJoint = useCallback(
    (id: number, value: number) => {
      setAngles((prev) => {
        const next = [...prev];
        next[id - 1] = value;
        return next;
      });
      pendingJoints.current[id] = value;
      if (!jointTimer.current) {
        jointTimer.current = setTimeout(flushJoints, DEBOUNCE_MS);
      }
    },
    [flushJoints],
  );

  const setGripperValue = useCallback(
    (value: number) => {
      setGripper(value);
      if (gripTimer.current) clearTimeout(gripTimer.current);
      gripTimer.current = setTimeout(() => {
        gripTimer.current = null;
        if (send({ type: "gripper", value })) return;
        fetch("/gripper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        })
          .then((r) => r.json())
          .then((d: { m: string }) => setLastStatus(d.m));
      }, DEBOUNCE_MS);
    },
    [send],
  );

  const openGripper = useCallback(() => {
    setGripper(100);
    if (send({ type: "gripper", value: 100 })) return;
    fetch("/gripper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: 100 }),
    })
      .then((r) => r.json())
      .then((d: { m: string }) => setLastStatus(d.m));
  }, [send]);

  const closeGripper = useCallback(() => {
    setGripper(0);
    if (send({ type: "gripper", value: 0 })) return;
    fetch("/gripper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: 0 }),
    })
      .then((r) => r.json())
      .then((d: { m: string }) => setLastStatus(d.m));
  }, [send]);

  const reset = useCallback(() => {
    setAngles(JOINTS.map(() => 0));
    setGripper(0);
    if (send({ type: "reset" })) return;
    fetch("/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((d: { m: string }) => setLastStatus(d.m));
  }, [send]);

  const requestSync = useCallback(() => {
    if (send({ type: "sync" })) return;
    fetch("/sync")
      .then((r) => r.json())
      .then((d: { a?: number[]; g?: number }) => {
        if (d.a) setAngles(d.a.map(Math.round));
        if (d.g !== undefined) setGripper(d.g);
        setLastStatus("Synced");
      });
  }, [send]);

  // Handle incoming WS messages relevant to arm
  const handleMessage = useCallback(
    (msg: WsIncoming) => {
      if (msg.type === "sync") {
        if (msg.a) setAngles(msg.a.map(Math.round));
        if (msg.g !== undefined) setGripper(msg.g);
        setLastStatus("Synced");
      } else if (msg.type === "ack") {
        setLastStatus(msg.m);
      } else if (msg.type === "target_ack") {
        setLastStatus(msg.m);
      }
    },
    [],
  );

  // Sync on connect and periodically
  useEffect(() => {
    if (isConnected) requestSync();
  }, [isConnected, requestSync]);

  useEffect(() => {
    const interval = setInterval(requestSync, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [requestSync]);

  return {
    angles,
    gripper,
    lastStatus,
    setJoint,
    setGripperValue,
    openGripper,
    closeGripper,
    reset,
    requestSync,
    handleMessage,
  };
}
