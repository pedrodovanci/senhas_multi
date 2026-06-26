import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { WS_URL } from '../config';
import { useAuth } from './AuthContext';

// Define the interface for the context
interface SocketContextType {
  socket: WebSocket | null;
  on: <T>(event: string, callback: (data: T) => void) => void;
  off: <T>(event: string, callback: (data: T) => void) => void;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [listeners] = useState(new Map<string, Array<(data: unknown) => void>>());
  const [isConnected, setIsConnected] = useState(false);
  const auth = useAuth();

  useEffect(() => {
    // Sob StrictMode (ou em maquinas/conexoes mais lentas), o React monta
    // este efeito, limpa, e monta de novo imediatamente. Se a PRIMEIRA
    // conexao terminar o handshake e abrir DEPOIS desse ciclo de limpeza
    // (ws.close() chamado em CONNECTING nao garante abortar antes do
    // 'open'), ela publica um segundo socket vivo processando os mesmos
    // broadcasts — cada chamada de senha soa/pisca em dobro (ou mais, se
    // acontecer de novo numa reconexao). `cancelled` bloqueia isso checando
    // no exato momento de uso (onopen/onmessage/onclose), não confiando só
    // no timing do close().
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectInterval: ReturnType<typeof setTimeout> | null = null;
    let isFirst = true;

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(WS_URL);
      ws = socket;

      socket.onopen = () => {
        if (cancelled) {
          socket.close();
          return;
        }
        console.log('Connected to WebSocket');
        setSocket(socket);
        setIsConnected(true);
        const wsData = auth.workstation;
        const token = auth.token;
        if (token && wsData) {
          socket.send(JSON.stringify({ type: 'auth', token, workstation_id: wsData.id }));
        }
        if (!isFirst) {
          const callbacks = listeners.get('ws:reconnected');
          callbacks?.forEach(cb => cb(undefined));
        }
        isFirst = false;
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        if (cancelled) return;
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

      socket.onclose = () => {
        if (cancelled) return;
        console.log('Disconnected from WebSocket');
        setSocket(null);
        setIsConnected(false);
        reconnectInterval = setTimeout(connect, 3000);
      };

      socket.onerror = (event: Event) => {
        console.error('WebSocket error:', event);
        socket.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (ws) ws.close();
      if (reconnectInterval) clearTimeout(reconnectInterval);
    };
  }, [listeners, auth.user, auth.workstation, auth.token]);

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

  const value = useMemo(() => ({ socket, on, off, isConnected }), [socket, on, off, isConnected]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  return useContext(SocketContext);
};
