import { useCallback, useEffect, useRef, useState } from "react";
import { HEARTBEAT_MS, RECONNECT_MS } from "../constants";
import type { WsIncoming, WsOutgoing } from "../types";

type MessageHandler = (msg: WsIncoming) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const send = useCallback((msg: WsOutgoing): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (!alive) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (evt) => {
        const msg: WsIncoming = JSON.parse(evt.data);
        onMessageRef.current(msg);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (alive) {
          reconnectTimer = setTimeout(connect, RECONNECT_MS);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    // Heartbeat
    const heartbeat = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_MS);

    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeat);
      wsRef.current?.close();
    };
  }, []);

  return { send, isConnected };
}
