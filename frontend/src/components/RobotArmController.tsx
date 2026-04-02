import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp,
  Crosshair, Home, Minus, MoreHorizontal,
  OctagonAlert, Plus, RotateCcw, SlidersHorizontal, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { JOINTS } from "../constants";
import { ArmViewer } from "./ArmViewer";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  observation?: string;
  strategy?: string;
}

interface Props {
  t: (key: string) => string;
  angles: number[];
  gripper: number;
  coords: number[];
  onJointChange: (id: number, value: number) => void;
  onGripperChange: (value: number) => void;
  onGripperOpen: () => void;
  onGripperClose: () => void;
  onReset: () => void;
  onSync: () => void;
  onSendCoords: (coords: number[]) => void;
  onSyncCoords: () => void;
  isConnected: boolean;
  lastStatus: string;
}

type Tab = "manual" | "tasks" | "language";

const ROT_AXES = [
  { label: "RX", idx: 3, step: 5 },
  { label: "RY", idx: 4, step: 5 },
  { label: "RZ", idx: 5, step: 5 },
];

const XY_STEP = 10;
const Z_STEP = 10;

// ── Small icon button used in D-pad ─────────────────────────
function DBtn({
  Icon,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/80 border border-slate-200/60 text-slate-600 hover:bg-blue-50 hover:border-[#306ee8] hover:text-[#306ee8] active:scale-95 transition-all shadow-sm"
    >
      <Icon size={16} />
    </button>
  );
}

// ── Joint slider row ─────────────────────────────────────────
function JointControl({
  label, value, min, max, id, onChange,
}: {
  label: string; value: number; min: number; max: number; id: number;
  onChange: (id: number, value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-slate-700 font-semibold text-xs">{label}</span>
        <span className="text-[#306ee8] font-mono text-xs font-bold bg-blue-50 px-1.5 py-0.5 rounded">
          {value.toFixed(1)}°
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(id, Math.max(min, value - 1))}
          className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex-shrink-0"
        >
          <Minus size={11} />
        </button>
        <div className="flex-1 relative">
          <input
            type="range" min={min} max={max} value={value}
            onInput={(e) => onChange(id, parseInt((e.target as HTMLInputElement).value))}
            className="w-full opacity-0 absolute inset-0 h-full cursor-pointer z-10"
          />
          <div className="h-1.5 bg-slate-200 rounded-full relative pointer-events-none">
            <div className="absolute inset-y-0 left-0 bg-[#306ee8] rounded-full" style={{ width: `${pct}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-[#306ee8] rounded-full shadow"
              style={{ left: `calc(${pct}% - 7px)` }}
            />
          </div>
        </div>
        <button
          onClick={() => onChange(id, Math.min(max, value + 1))}
          className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex-shrink-0"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export function RobotArmController({
  t, angles, gripper, coords,
  onJointChange, onGripperOpen, onGripperClose,
  onReset, isConnected,
  onSendCoords, onSyncCoords,
}: Props) {
  const [tab, setTab] = useState<Tab>("manual");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onSyncCoords(); }, []);

  const moveXY = (dx: number, dy: number) => {
    const next = [...coords];
    next[0] = parseFloat(((next[0] ?? 0) + dx).toFixed(1));
    next[1] = parseFloat(((next[1] ?? 0) + dy).toFixed(1));
    onSendCoords(next);
  };

  const moveZ = (dz: number) => {
    const next = [...coords];
    next[2] = parseFloat(((next[2] ?? 0) + dz).toFixed(1));
    onSendCoords(next);
  };

  const moveRot = (idx: number, delta: number) => {
    const next = [...coords];
    next[idx] = parseFloat(((next[idx] ?? 0) + delta).toFixed(1));
    onSendCoords(next);
  };

  const executeCommand = async (command: string) => {
    setChatLoading(true);
    try {
      const resp = await fetch("http://localhost:5001/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const data = JSON.parse(payload);
            if (data.error) {
              setChatHistory((prev) => [...prev, { role: "assistant", text: `Error: ${data.error}` }]);
              continue;
            }
            if (data.joints) {
              Object.entries(data.joints as Record<string, number>).forEach(([id, angle]) => {
                onJointChange(parseInt(id), angle);
              });
            }
            if (data.gripper !== undefined) {
              if (data.gripper > 50) onGripperOpen(); else onGripperClose();
            }
            setChatHistory((prev) => [...prev, {
              role: "assistant",
              text: data.message ?? "Done.",
              observation: data.observation,
              strategy: data.strategy,
            }]);
            setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setChatHistory((prev) => [...prev, {
        role: "assistant",
        text: "Cannot connect to inference server. Make sure it's running.",
      }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const sendCommand = async () => {
    const command = chatInput.trim();
    if (!command || chatLoading) return;
    setChatInput("");
    setChatHistory((prev) => [...prev, { role: "user", text: command }]);
    await executeCommand(command);
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden rounded-xl shadow-xl border border-slate-200 relative"
      style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      {/* ── Header — exactly 60px ── */}
      <header className="h-[60px] flex items-center justify-between px-6 border-b border-slate-200/60 flex-shrink-0">
        <h2 className="text-slate-900 font-bold text-sm">Robot Arm Controller</h2>
        <nav className="flex gap-1 bg-slate-100/50 p-1 rounded-lg border border-slate-200/50">
          {(["manual", "tasks", "language"] as Tab[]).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${
                tab === tb
                  ? "bg-white text-[#306ee8] shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tb.charAt(0).toUpperCase() + tb.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Content area ── */}
      <div className="flex-1 relative overflow-hidden min-h-0">

        {/* ══ Manual tab ══ */}
        {tab === "manual" && (
          <>
            {/* Background gradient */}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}
            />

            {/* 3D URDF viewer — right portion */}
            <div className="absolute right-0 top-0 bottom-0 left-[40%]">
              <ArmViewer angles={angles} gripper={gripper} />
            </div>

            {/* D-pad + Z: side by side, vertically centered (leave bottom space for floating controls) */}
            <div className="absolute left-0 top-0 bottom-14 w-[48%] flex items-center justify-start pl-7 gap-4">

              {/* D-pad glass panel */}
              <div
                className="rounded-xl p-4 border shadow-sm flex flex-col gap-3"
                style={{
                  background: "rgba(255,255,255,0.70)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderColor: "rgba(255,255,255,0.30)",
                }}
              >
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center leading-none">
                  Forward / Backward
                </p>
                <div className="grid grid-cols-3 gap-1">
                  <div />
                  <DBtn Icon={ArrowUp}    onClick={() => moveXY(XY_STEP, 0)} />
                  <div />
                  <DBtn Icon={ArrowLeft}  onClick={() => moveXY(0, XY_STEP)} />
                  {/* Center: XY value display */}
                  <div className="w-9 h-9 flex flex-col items-center justify-center bg-slate-50/80 rounded-lg border border-slate-100">
                    <span className="text-[9px] text-slate-500 font-mono font-semibold leading-tight">
                      {(coords[0] ?? 0).toFixed(0)}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono leading-tight">
                      {(coords[1] ?? 0).toFixed(0)}
                    </span>
                  </div>
                  <DBtn Icon={ArrowRight} onClick={() => moveXY(0, -XY_STEP)} />
                  <div />
                  <DBtn Icon={ArrowDown}  onClick={() => moveXY(-XY_STEP, 0)} />
                  <div />
                </div>
              </div>

              {/* Z glass panel */}
              <div
                className="rounded-xl border shadow-sm flex flex-col items-center gap-3 py-4 px-3"
                style={{
                  background: "rgba(255,255,255,0.60)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderColor: "rgba(255,255,255,0.50)",
                }}
              >
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">High</p>
                <DBtn Icon={ArrowUp} onClick={() => moveZ(Z_STEP)} />
                <div className="w-full flex items-center justify-center bg-slate-50/80 rounded-lg border border-slate-100 py-1 px-2">
                  <span className="text-[10px] text-slate-500 font-mono font-semibold">
                    {(coords[2] ?? 0).toFixed(0)}
                  </span>
                </div>
                <DBtn Icon={ArrowDown} onClick={() => moveZ(-Z_STEP)} />
              </div>
            </div>

            {/* ── Floating bottom controls ── */}

            {/* Reset + Advanced — bottom left */}
            <div className="absolute bottom-4 left-5 flex gap-1.5 z-10">
              <button
                onClick={onReset}
                title="Reset all joints"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur border border-slate-200/60 text-slate-500 hover:bg-slate-50 hover:text-slate-700 active:scale-95 transition-all shadow-sm"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={() => setShowAdvanced(true)}
                title="Advanced controls"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur border border-slate-200/60 text-slate-500 hover:bg-slate-50 hover:text-slate-700 active:scale-95 transition-all shadow-sm"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>

            {/* Gripper pill — bottom center, floating glass */}
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full px-3 py-2 border shadow-lg"
              style={{
                background: "rgba(255,255,255,0.60)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                borderColor: "rgba(255,255,255,0.50)",
              }}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${isConnected && gripper > 50 ? "bg-emerald-400" : "bg-slate-300"}`} />
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Gripper</span>
              <div className="flex bg-slate-100/80 rounded-full p-0.5 ml-1">
                <button
                  onClick={onGripperClose}
                  className={`px-3 py-1 text-xs font-bold rounded-full transition-colors whitespace-nowrap ${
                    gripper <= 50 ? "bg-white text-[#306ee8] shadow-sm" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  CLOSE
                </button>
                <button
                  onClick={onGripperOpen}
                  className={`px-3 py-1 text-xs font-bold rounded-full transition-colors whitespace-nowrap ${
                    gripper > 50 ? "bg-white text-[#306ee8] shadow-sm" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  OPEN
                </button>
              </div>
            </div>

            {/* Emergency stop — bottom right */}
            <button
              onClick={onReset}
              title="Emergency stop"
              className="absolute bottom-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-red-50/90 hover:bg-red-100 border border-red-200/60 text-red-500 active:scale-95 transition-all shadow-sm backdrop-blur"
            >
              <OctagonAlert size={14} />
            </button>
          </>
        )}

        {/* ══ Tasks tab ══ */}
        {tab === "tasks" && (
          <div className="grid grid-cols-2 gap-3 p-5">
            <button
              onClick={onReset}
              className="p-4 bg-white border border-slate-200 rounded-xl hover:border-[#306ee8] transition-all flex flex-col items-center gap-2"
            >
              <Home size={24} className="text-[#306ee8]" />
              <span className="font-bold text-slate-700 text-xs">Reset All</span>
            </button>
            <button className="p-4 bg-white border border-slate-200 rounded-xl hover:border-[#306ee8] transition-all flex flex-col items-center gap-2">
              <Crosshair size={24} className="text-[#306ee8]" />
              <span className="font-bold text-slate-700 text-xs">Sync Status</span>
            </button>
          </div>
        )}

        {/* ══ Language tab ══ */}
        {tab === "language" && (
          <div className="flex flex-col h-full gap-3 p-5">
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {chatHistory.length === 0 ? (
                <div>
                  <p className="text-xs text-slate-400 mb-3">Try a command:</p>
                  {["Open the gripper", "Reset all joints to zero", "Rotate J1 to 45 degrees"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setChatInput(s)}
                      className="block w-full text-left px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-50 mb-1.5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[90%] px-3 py-2 rounded-xl text-xs ${
                      msg.role === "user"
                        ? "bg-[#306ee8] text-white rounded-br-sm"
                        : "bg-slate-100 text-slate-700 rounded-bl-sm"
                    }`}>
                      {msg.observation && <p className="text-slate-500 mb-1"><span className="font-semibold">👁 </span>{msg.observation}</p>}
                      {msg.strategy && <p className="text-slate-500 mb-1"><span className="font-semibold">⚙ </span>{msg.strategy}</p>}
                      <p className={msg.observation || msg.strategy ? "font-semibold text-slate-800 border-t border-slate-200 pt-1 mt-1" : ""}>{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 px-3 py-2 rounded-xl rounded-bl-sm">
                    <span className="text-xs text-slate-400">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
            <div className="relative flex-shrink-0">
              <input
                type="text" value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCommand()}
                placeholder="Command robot arm..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-20 text-sm focus:ring-2 focus:ring-[#306ee8]/20 focus:border-[#306ee8] outline-none transition-all"
              />
              <button
                onClick={sendCommand}
                disabled={chatLoading || !chatInput.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#306ee8] disabled:bg-slate-200 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              >
                SEND
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Advanced Controls overlay — covers full card ── */}
      {showAdvanced && (
        <div
          className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-xl"
          style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)" }}
        >
          <div className="h-[60px] flex items-center justify-between px-5 border-b border-slate-200/50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-slate-400" />
              <h3 className="text-sm font-bold text-slate-800">Advanced Controls</h3>
            </div>
            <button
              onClick={() => setShowAdvanced(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
            {/* Rotation */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">End Effector Rotation (±5°)</p>
              <div className="space-y-2.5">
                {ROT_AXES.map(({ label, idx, step }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-slate-600 font-semibold text-xs w-7 flex-shrink-0">{label}</span>
                    <button
                      onClick={() => moveRot(idx, -step)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex-shrink-0"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-[#306ee8] font-mono text-sm font-bold bg-blue-50 px-2 py-0.5 rounded flex-1 text-center">
                      {(coords[idx] ?? 0).toFixed(1)}°
                    </span>
                    <button
                      onClick={() => moveRot(idx, step)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex-shrink-0"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Joint angles */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Joint Angles</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {JOINTS.map((joint, i) => (
                  <JointControl
                    key={joint.id}
                    id={joint.id}
                    label={`J${joint.id} ${t(joint.label)}`}
                    value={angles[i] ?? 0}
                    min={joint.min}
                    max={joint.max}
                    onChange={onJointChange}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
