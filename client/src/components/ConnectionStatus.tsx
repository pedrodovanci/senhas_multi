import React from 'react';
import { useSocket } from '../contexts/SocketContext';

export const ConnectionStatus: React.FC = () => {
  const ctx = useSocket();
  if (!ctx || ctx.isConnected) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg animate-pulse">
      <span className="w-2 h-2 bg-white rounded-full"></span>
      <span className="text-sm font-bold">Reconectando...</span>
    </div>
  );
};

export default ConnectionStatus;
