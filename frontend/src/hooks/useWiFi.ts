import { useCallback, useEffect, useState } from "react";
import type { WiFiNetwork, WiFiStatus } from "../types";

export function useWiFi() {
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [status, setStatus] = useState<WiFiStatus>({
    connected: false,
    ssid: null,
    ip: null,
  });
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wifi/status");
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Silently fail — status will refresh on next action
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const scan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/wifi/scan", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNetworks(data.networks);
      } else {
        setError("Scan failed");
      }
    } catch {
      setError("Scan failed — network error");
    } finally {
      setIsScanning(false);
    }
  }, []);

  const connect = useCallback(
    async (ssid: string, password: string) => {
      setIsConnecting(true);
      setError(null);
      try {
        const res = await fetch("/api/wifi/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ssid, password }),
        });
        const data = await res.json();
        if (data.success) {
          await refreshStatus();
        } else {
          setError(data.message || "Connection failed");
        }
      } catch {
        setError("Connection failed — network error");
      } finally {
        setIsConnecting(false);
      }
    },
    [refreshStatus],
  );

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/wifi/disconnect", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await refreshStatus();
      } else {
        setError(data.message || "Disconnect failed");
      }
    } catch {
      setError("Disconnect failed — network error");
    }
  }, [refreshStatus]);

  return {
    networks,
    status,
    isScanning,
    isConnecting,
    error,
    scan,
    connect,
    disconnect,
    refreshStatus,
  };
}
