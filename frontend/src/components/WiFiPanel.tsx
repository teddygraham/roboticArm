import { useState } from "react";
import type { WiFiNetwork, WiFiStatus } from "../types";

interface Props {
  networks: WiFiNetwork[];
  status: WiFiStatus;
  isScanning: boolean;
  isConnecting: boolean;
  error: string | null;
  onScan: () => void;
  onConnect: (ssid: string, password: string) => void;
  onDisconnect: () => void;
  onRestartServer: () => void;
  onRebootPi: () => void;
  labels: {
    connectedTo: string;
    notConnected: string;
    scan: string;
    scanning: string;
    connect: string;
    disconnect: string;
    connecting: string;
    password: string;
    noNetworks: string;
    error: string;
    restartServer: string;
    restartHint: string;
    rebootPi: string;
    rebootHint: string;
    systemTitle: string;
  };
}

export function WiFiPanel({
  networks,
  status,
  isScanning,
  isConnecting,
  error,
  onScan,
  onConnect,
  onDisconnect,
  onRestartServer,
  onRebootPi,
  labels,
}: Props) {
  const [selectedSsid, setSelectedSsid] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const handleConnect = () => {
    if (selectedSsid) {
      onConnect(selectedSsid, password);
      setPassword("");
      setSelectedSsid(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
        {status.connected ? (
          <p className="text-emerald-400 text-sm">
            {labels.connectedTo} <span className="font-bold">{status.ssid}</span>
            {status.ip && <span className="text-slate-400"> ({status.ip})</span>}
          </p>
        ) : (
          <p className="text-slate-400 text-sm">{labels.notConnected}</p>
        )}
        {status.connected && (
          <button
            onClick={onDisconnect}
            className="mt-2 bg-red-500 hover:bg-red-600 text-white font-bold py-1.5 px-4 rounded-md text-xs transition-colors"
          >
            {labels.disconnect}
          </button>
        )}
      </div>

      {/* Scan */}
      <button
        onClick={onScan}
        disabled={isScanning}
        className={`w-full font-bold py-2 px-4 rounded-md text-sm transition-colors ${
          isScanning
            ? "bg-slate-600 text-slate-400 cursor-wait"
            : "bg-emerald-500 hover:bg-emerald-600 text-slate-900"
        }`}
      >
        {isScanning ? labels.scanning : labels.scan}
      </button>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded p-2">
          {labels.error}: {error}
        </p>
      )}

      {/* Network list */}
      {networks.length > 0 ? (
        <div className="space-y-1">
          {networks.map((net) => {
            const isSelected = net.ssid === selectedSsid;
            return (
              <div key={net.ssid}>
                <button
                  onClick={() => {
                    setSelectedSsid(isSelected ? null : net.ssid);
                    setPassword("");
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                    net.active
                      ? "bg-emerald-500/20 border border-emerald-500/40"
                      : isSelected
                        ? "bg-slate-700 border border-emerald-500/50 rounded-t-md"
                        : "bg-slate-800 border border-slate-600 hover:border-slate-500 rounded-md"
                  } ${net.active ? "rounded-md" : ""}`}
                >
                  <span className="flex items-center gap-2 text-slate-200 truncate">
                    {net.secured && <span className="text-amber-400 text-xs">&#x1F512;</span>}
                    {net.ssid}
                  </span>
                  <SignalBars signal={net.signal} />
                </button>
                {isSelected && (
                  <div className="bg-slate-700 border border-t-0 border-emerald-500/50 rounded-b-md px-3 py-3 space-y-2">
                    {net.secured && (
                      <div>
                        <label className="text-slate-400 text-xs block mb-1">
                          {labels.password}
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                          autoFocus
                          className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}
                    <button
                      onClick={handleConnect}
                      disabled={isConnecting || (net.secured && !password)}
                      className={`w-full font-bold py-2 px-4 rounded-md text-sm transition-colors ${
                        isConnecting
                          ? "bg-slate-600 text-slate-400 cursor-wait"
                          : "bg-emerald-500 hover:bg-emerald-600 text-slate-900"
                      }`}
                    >
                      {isConnecting ? labels.connecting : labels.connect}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !isScanning && (
          <p className="text-slate-500 text-xs text-center">{labels.noNetworks}</p>
        )
      )}

      {/* System */}
      <h2 className="text-emerald-400 text-sm font-semibold mb-3 pb-1 border-b border-slate-700 mt-2">
        {labels.systemTitle}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center">
          <button
            onClick={onRestartServer}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-500 font-bold py-2 px-4 rounded-md text-sm transition-colors"
          >
            {labels.restartServer}
          </button>
          <p className="text-slate-500 text-[10px] mt-1 text-center">{labels.restartHint}</p>
        </div>
        <div className="flex flex-col items-center">
          <button
            onClick={onRebootPi}
            className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 font-bold py-2 px-4 rounded-md text-sm transition-colors"
          >
            {labels.rebootPi}
          </button>
          <p className="text-slate-500 text-[10px] mt-1 text-center">{labels.rebootHint}</p>
        </div>
      </div>
    </div>
  );
}

function SignalBars({ signal }: { signal: number }) {
  const bars = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
  return (
    <span className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-1 rounded-sm ${
            i <= bars ? "bg-emerald-400" : "bg-slate-600"
          }`}
          style={{ height: `${i * 25}%` }}
        />
      ))}
    </span>
  );
}
