import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { WS_URL } from '../config';

// Define the interface for the context
interface SocketContextType {
  socket: WebSocket | null;
  on: <T>(event: string, callback: (data: T) => void) => void;
  off: <T>(event: string, callback: (data: T) => void) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [listeners] = useState(new Map<string, Array<(data: unknown) => void>>());

  useEffect(() => {
    let ws: WebSocket;
    let reconnectInterval: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('Connected to WebSocket');
        setSocket(ws);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(event.data) as { type?: string; data?: unknown };
          if (!parsed.type) return;
          const callbacks = listeners.get(parsed.type);
          if (callbacks) {
            callbacks.forEach(cb => cb(parsed.data));
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from WebSocket');
        setSocket(null);
        reconnectInterval = setTimeout(connect, 3000);
      };

      ws.onerror = (event: Event) => {
        console.error('WebSocket error:', event);
        ws.close();
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectInterval) clearTimeout(reconnectInterval);
    };
  }, [listeners]);

  const on = useCallback(<T,>(event: string, callback: (data: T) => void) => {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event)?.push(callback as (data: unknown) => void);
  }, [listeners]);

  const off = useCallback(<T,>(event: string, callback: (data: T) => void) => {
    const callbacks = listeners.get(event);
    if (callbacks) {
      listeners.set(
        event,
        callbacks.filter(cb => cb !== (callback as (data: unknown) => void))
      );
    }
  }, [listeners]);

  const value = useMemo(() => ({ socket, on, off }), [socket, on, off]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  return useContext(SocketContext);
};
