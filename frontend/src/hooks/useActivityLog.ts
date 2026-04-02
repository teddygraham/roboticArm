import { useCallback, useRef, useState } from "react";

export type LogCategory = "connection" | "joint" | "gripper" | "detection" | "system";

export interface LogEntry {
  id: number;
  ts: Date;
  category: LogCategory;
  message: string;
}

const MAX_ENTRIES = 100;

export function useActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const counter = useRef(0);

  const addEvent = useCallback((category: LogCategory, message: string) => {
    const entry: LogEntry = {
      id: counter.current++,
      ts: new Date(),
      category,
      message,
    };
    setEntries((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  return { entries, addEvent };
}
