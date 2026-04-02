import { useEffect, useRef, useState } from "react";

interface Props {
  isConnected: boolean;
  angles: number[];
  gripper: number;
  lastStatus: string;
}

const ROBOT_INFO = {
  name: "Unit-842",
  type: "MechArm 270 Pi",
  model: "Alpha Contract v2",
  deployedAt: "Oct 2023",
  version: "v1.1.4-stable",
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-700">{value}</span>
    </div>
  );
}

export function RobotBasicInfo({ isConnected, angles, gripper, lastStatus }: Props) {
  const [uptime, setUptime] = useState(0);
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setUptime(Math.floor((Date.now() - mountedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const activeJoints = angles.filter((a) => Math.abs(a) > 1).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Robot Arm</p>
          <h2 className="text-sm font-bold text-gray-800 mt-0.5">{ROBOT_INFO.name}</h2>
          <p className="text-xs text-gray-500">{ROBOT_INFO.type}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${
            isConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          {isConnected ? "Active" : "Offline"}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 px-4 py-3">
        <Row label="Model" value={ROBOT_INFO.model} />
        <Row label="Deployed" value={ROBOT_INFO.deployedAt} />
        <Row label="Version" value={ROBOT_INFO.version} />
        <Row label="Uptime" value={formatUptime(uptime)} />
        <Row label="Active Joints" value={`${activeJoints} / 6`} />
        <Row label="Gripper" value={`${gripper}%`} />
      </div>

      {/* Status */}
      <div className="px-4 pb-4">
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-400">Last Status</p>
          <p className="text-xs font-medium text-gray-700 mt-0.5 truncate">{lastStatus}</p>
        </div>
      </div>
    </div>
  );
}
