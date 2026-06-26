import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { apiFetch } from "../utils/api";
import Logo from "../components/Logo";
import type { DoctorQueueEntry } from "../types";
import { LogOut, Bell, AlertTriangle, Users } from "lucide-react";

const BOOT_ID_STORAGE_KEY = "medico_last_boot_id";

const DoctorTerminal: React.FC = () => {
  const { user, token, logout } = useAuth();
  const socketContext = useSocket();
  const navigate = useNavigate();

  const [queue, setQueue] = useState<DoctorQueueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [restartWarning, setRestartWarning] = useState(false);

  const fetchQueue = useCallback(async () => {
    const res = await apiFetch("/api/doctor-queue/mine", {
      token,
      onUnauthorized: logout,
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setQueue(data);
  }, [token, logout]);

  useEffect(() => {
    if (!user || !token) {
      navigate("/login");
      return;
    }
    fetchQueue();
  }, [user, token, navigate, fetchQueue]);

  useEffect(() => {
    if (!socketContext || !socketContext.socket) return;

    const handleQueueUpdated = (payload: { doctor_id: number }) => {
      if (payload.doctor_id !== user?.doctor_id) return;
      fetchQueue();
    };

    const handleServerBoot = (payload: { bootId: string }) => {
      const lastSeen = localStorage.getItem(BOOT_ID_STORAGE_KEY);
      if (lastSeen && lastSeen !== payload.bootId) {
        setRestartWarning(true);
        fetchQueue();
      }
      localStorage.setItem(BOOT_ID_STORAGE_KEY, payload.bootId);
    };

    socketContext.on("doctor:queue-updated", handleQueueUpdated);
    socketContext.on("server:boot", handleServerBoot);
    return () => {
      socketContext.off("doctor:queue-updated", handleQueueUpdated);
      socketContext.off("server:boot", handleServerBoot);
    };
  }, [socketContext, user, fetchQueue]);

  const callNext = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/doctor-queue/call-next", {
        method: "POST",
        token,
        onUnauthorized: logout,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.message || "Erro ao chamar paciente");
        return;
      }
      await fetchQueue();
    } finally {
      setLoading(false);
    }
  };

  const callSpecific = async (entryId: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/doctor-queue/call/${entryId}`, {
        method: "POST",
        token,
        onUnauthorized: logout,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.message || "Erro ao chamar paciente");
        return;
      }
      await fetchQueue();
    } finally {
      setLoading(false);
    }
  };

  const formatWaitTime = (forwardedAt: string) => {
    const start = new Date(
      forwardedAt.includes("Z") ? forwardedAt : forwardedAt + "Z",
    ).getTime();
    const diffMin = Math.max(0, Math.floor((Date.now() - start) / 60000));
    return `${diffMin} min`;
  };

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col">
      <header className="bg-white shadow-sm p-4 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-4">
          <Logo theme="dark" />
          <div>
            <p className="text-sm font-bold text-gray-800">{user?.username}</p>
            <p className="text-xs text-gray-500 uppercase">Médico</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Sair"
        >
          <LogOut className="w-6 h-6" />
        </button>
      </header>

      {restartWarning && (
        <div className="bg-yellow-100 border-b border-yellow-300 text-yellow-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">
              O servidor foi reiniciado — a fila pode ter sido perdida. Confira
              com a recepção quem já foi encaminhado.
            </span>
          </div>
          <button
            onClick={() => setRestartWarning(false)}
            className="text-yellow-800 hover:text-yellow-900 font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      <main className="flex-1 p-6 max-w-3xl w-full mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-5 h-5" /> Minha fila ({queue.length})
          </h1>
          <button
            onClick={callNext}
            disabled={loading || queue.length === 0}
            className="bg-primary text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            <Bell className="w-5 h-5" /> CHAMAR PRÓXIMO
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {queue.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              Nenhum paciente encaminhado.
            </div>
          ) : (
            queue.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="font-black text-xl text-gray-800 w-20">
                    {entry.ticketNumber}
                  </span>
                  <div>
                    <div className="font-bold text-gray-800">
                      {entry.patientName}
                    </div>
                    <div className="text-xs text-gray-400">
                      Esperando há {formatWaitTime(entry.forwardedAt)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => callSpecific(entry.id)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-bold rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  CHAMAR
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default DoctorTerminal;
