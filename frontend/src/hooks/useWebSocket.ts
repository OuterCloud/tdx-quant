import { useCallback, useEffect, useRef, useState } from "react";

export function useWebSocket(url: string) {
  const [messages, setMessages] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelay = useRef(3000);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}${url}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      retryDelay.current = 3000; // reset backoff on success
    };
    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      // Reconnect with exponential backoff (max 30s)
      retryTimer.current = setTimeout(() => {
        connect();
      }, retryDelay.current);
      retryDelay.current = Math.min(retryDelay.current * 1.5, 30000);
    };
    ws.onerror = () => {
      // Let onclose handle reconnect
      ws.close();
    };
    ws.onmessage = (event) => {
      setMessages((prev) => [...prev.slice(-200), event.data]);
    };

    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isConnected, clear };
}
