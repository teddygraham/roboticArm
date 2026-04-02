import type { WiFiStatus } from "../types";

interface Props {
  wifiStatus: WiFiStatus;
  isConnected: boolean;
  onManageSystem: () => void;
}

// Configurable server info — update to match your actual deployment
const SERVER_INFO = {
  name: "Server Node-042",
  model: "Dell PowerEdge R740",
  datacenter: "Data Center A-01",
  rack: "Rack Center A-03",
  piIp: "192.168.3.2",
};

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-700">{value}</span>
    </div>
  );
}

export function TargetSystemInfo({ wifiStatus, isConnected, onManageSystem }: Props) {
  const ip = wifiStatus.ip ?? SERVER_INFO.piIp;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-blue-600 px-4 py-3">
        <p className="text-xs text-blue-200 uppercase tracking-wide">Target System</p>
        <h2 className="text-sm font-bold text-white mt-0.5">{SERVER_INFO.name}</h2>
        <p className="text-xs text-blue-300">{SERVER_INFO.model}</p>
      </div>

      {/* Info rows */}
      <div className="flex-1 px-4 py-3">
        <Row label="Data Center" value={SERVER_INFO.datacenter} />
        <Row label="Rack Location" value={SERVER_INFO.rack} />
        <Row label="IP Address" value={ip} />
        <Row label="WiFi" value={wifiStatus.ssid ?? "Not connected"} />

        <div className="flex justify-between items-center py-1.5 mt-1">
          <span className="text-xs text-gray-400">Power Status</span>
          <StatusBadge ok={isConnected} label={isConnected ? "ONLINE" : "OFFLINE"} />
        </div>
      </div>

      {/* Action */}
      <div className="px-4 pb-4">
        <button
          onClick={onManageSystem}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Manage System
        </button>
      </div>
    </div>
  );
}
