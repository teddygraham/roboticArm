import { useEffect, useRef } from "react";
import type { LogEntry, LogCategory } from "../hooks/useActivityLog";

interface Props {
  entries: LogEntry[];
}

const CATEGORY_STYLES: Record<LogCategory, { border: string; dot: string; text: string }> = {
  connection: { border: "border-l-blue-500",   dot: "bg-blue-500",   text: "text-blue-600" },
  joint:      { border: "border-l-green-500",  dot: "bg-green-500",  text: "text-green-600" },
  gripper:    { border: "border-l-amber-500",  dot: "bg-amber-500",  text: "text-amber-600" },
  detection:  { border: "border-l-purple-500", dot: "bg-purple-500", text: "text-purple-600" },
  system:     { border: "border-l-red-400",    dot: "bg-red-400",    text: "text-red-500" },
};

const CATEGORY_ICONS: Record<LogCategory, string> = {
  connection: "⚡",
  joint:      "🦾",
  gripper:    "✊",
  detection:  "👁",
  system:     "⚙️",
};

function fmt(ts: Date): string {
  return ts.toLocaleTimeString("en-GB", { hour12: false });
}

export function ActivityLog({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Activity Log</h2>
        <span className="text-xs text-gray-400">{entries.length} events</span>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {entries.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-4">No activity yet</p>
        ) : (
          entries.map((entry) => {
            const style = CATEGORY_STYLES[entry.category];
            return (
              <div
                key={entry.id}
                className={`border-l-2 ${style.border} pl-2 py-1`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                  <span className="text-xs text-gray-400 font-mono">{fmt(entry.ts)}</span>
                  <span className="text-xs">{CATEGORY_ICONS[entry.category]}</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5 pl-3">{entry.message}</p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
