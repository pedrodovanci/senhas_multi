import React, { createContext, useContext, useEffect, useState } from 'react';

// Define the interface for the context
interface SocketContextType {
  socket: WebSocket | null;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback: (data: any) => void) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  // Store listeners: eventName -> array of callbacks
  const [listeners] = useState(new Map<string, Array<(data: any) => void>>());

  useEffect(() => {
    let ws: WebSocket;
    let reconnectInterval: any;

    const connect = () => {
      ws = new WebSocket('ws://localhost:3000');

      ws.onopen = () => {
        console.log('Connected to WebSocket');
        setSocket(ws);
      };

      ws.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data);
          const callbacks = listeners.get(type);
          if (callbacks) {
            callbacks.forEach(cb => cb(data));
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from WebSocket');
        setSocket(null);
        // Try to reconnect after 3 seconds
        reconnectInterval = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectInterval) clearTimeout(reconnectInterval);
    };
  }, [listeners]);

  const on = (event: string, callback: (data: any) => void) => {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event)?.push(callback);
  };

  const off = (event: string, callback: (data: any) => void) => {
    const callbacks = listeners.get(event);
    if (callbacks) {
      listeners.set(event, callbacks.filter(cb => cb !== callback));
    }
  };

  return (
    <SocketContext.Provider value={{ socket, on, off }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  return useContext(SocketContext);
};
