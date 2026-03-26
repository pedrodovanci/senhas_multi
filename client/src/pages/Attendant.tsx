import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import type { Ticket } from "../types";
import {
  Monitor,
  User,
  Clock,
  Bell,
  CheckCircle,
  Play,
  LogOut,
  UserX,
  Activity,
  History,
  ClipboardList,
  RotateCcw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import Logo from "../components/Logo";
import DoctorQueueGrid from "../components/DoctorQueueGrid";
import { HistoryModal } from "../components/HistoryModal";
import { AttendanceModal } from "../components/AttendanceModal";
import { RequeueModal } from "../components/RequeueModal";

const TicketTimer: React.FC<{ startTime: string }> = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Ensure UTC interpretation if no timezone
    const dateStr = startTime.includes("Z")
      ? startTime
      : startTime.replace(" ", "T") + "Z";
    const start = new Date(dateStr).getTime();

    const update = () => {
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((now - start) / 1000));
      setElapsed(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-lg">
      <Clock className="w-4 h-4 text-gray-500" />
      <span className="font-mono text-xl font-bold text-gray-800">
        {formatTime(elapsed)}
      </span>
    </div>
  );
};

const Attendant: React.FC = () => {
  const { user, workstation, token, logout } = useAuth();
  const socketContext = useSocket();
  const navigate = useNavigate();

  const queueSector = user?.role === "cirurgia" ? "cirurgia" : "recepcao";

  const [tickets, setTickets] = useState<Ticket[]>([]); // Waiting tickets for global counter
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isRequeueOpen, setIsRequeueOpen] = useState(false);

  useEffect(() => {
    if (!user || !token) navigate("/login");

    // Initial fetch
    fetchData();

    // Socket listeners
    if (socketContext && socketContext.socket) {
      const handleCreated = (newTicket: Ticket) => {
        if (newTicket.queue_sector !== queueSector) return;
        setTickets((prev) => {
          if (prev.find((t) => t.id === newTicket.id)) return prev;
          return [...prev, newTicket];
        });
        setRefreshTrigger((prev) => prev + 1);
      };

      const handleUpdated = (updatedTicket: Ticket) => {
        setTickets((prev) => {
          if (updatedTicket.status !== "waiting") {
            return prev.filter((t) => t.id !== updatedTicket.id);
          }
          if (updatedTicket.queue_sector !== queueSector) {
             return prev.filter((t) => t.id !== updatedTicket.id);
          }
          return prev.map((t) =>
            t.id === updatedTicket.id ? updatedTicket : t,
          );
        });
        setRefreshTrigger((prev) => prev + 1);

        // If updated ticket is mine, update currentTicket
        if (currentTicket && currentTicket.id === updatedTicket.id) {
          setCurrentTicket(updatedTicket);
        }
      };

      const handleCalling = (callingTicket: Ticket) => {
        setTickets((prev) => prev.filter((t) => t.id !== callingTicket.id));
        setRefreshTrigger((prev) => prev + 1);

        if (callingTicket.workstation_id === workstation?.id) {
          setCurrentTicket(callingTicket);
        }
      };

      const handleFinished = (ticket: Ticket) => {
        setRefreshTrigger((prev) => prev + 1);
        if (currentTicket && currentTicket.id === ticket.id) {
          setCurrentTicket(null);
        }
      };

      // Handle Requeued (treat as created/updated to add to waiting list)
      const handleRequeued = (ticket: Ticket) => {
        if (ticket.queue_sector !== queueSector) return;
        setTickets((prev) => {
          if (prev.find((t) => t.id === ticket.id)) return prev;
          return [...prev, ticket];
        });
        setRefreshTrigger((prev) => prev + 1);
      };

      socketContext.on("ticket:created", handleCreated);
      socketContext.on("ticket:updated", handleUpdated);
      socketContext.on("ticket:calling", handleCalling);
      socketContext.on("ticket:started", handleUpdated);
      socketContext.on("ticket:finished", handleFinished);
      socketContext.on("ticket:missed", handleUpdated);
      socketContext.on("ticket:requeued", handleRequeued);
      const handleReconnected = () => {
        fetchData();
      };
      socketContext.on("ws:reconnected", handleReconnected);

      return () => {
        socketContext.off("ticket:created", handleCreated);
        socketContext.off("ticket:updated", handleUpdated);
        socketContext.off("ticket:calling", handleCalling);
        socketContext.off("ticket:started", handleUpdated);
        socketContext.off("ticket:finished", handleFinished);
        socketContext.off("ticket:missed", handleUpdated);
        socketContext.off("ticket:requeued", handleRequeued);
        socketContext.off("ws:reconnected", handleReconnected);
      };
    }
  }, [socketContext, user, navigate, currentTicket, workstation]);

  const fetchData = async () => {
    try {
      const ticketsRes = await apiFetch(
        `/api/tickets?status=waiting&queue_sector=${queueSector}`,
        { token, onUnauthorized: logout },
      );
      const ticketsData = await ticketsRes.json();
      if (Array.isArray(ticketsData)) {
        setTickets(ticketsData);
      } else {
        console.error("Invalid tickets data:", ticketsData);
        setTickets([]);
      }

      const myActiveRes = await apiFetch(`/api/tickets?queue_sector=${queueSector}`, {
        token,
        onUnauthorized: logout,
      });
      const allTickets = await myActiveRes.json();

      if (Array.isArray(allTickets)) {
        const myActive = allTickets.find(
          (t: Ticket) =>
            (t.status === "calling" || t.status === "in_attendance") &&
            t.workstation_id === workstation?.id,
        );

        if (myActive) {
          setCurrentTicket(myActive);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const handleCallNext = async (doctorId: number | null = null) => {
    if (currentTicket) {
      alert("Finalize o atendimento atual antes de chamar o próximo.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`/api/tickets/call-next`, {
        method: "POST",
        token,
        onUnauthorized: logout,
        body: JSON.stringify({
          workstation_id: workstation?.id,
          user_id: user?.id,
          doctor_id: doctorId,
          queue_sector: queueSector,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.message || "Erro ao chamar senha");
        return;
      }

      const data = await res.json();
      setCurrentTicket(data);
    } catch (err) {
      console.error(err);
      alert("Erro ao chamar senha");
    } finally {
      setLoading(false);
    }
  };

  const handleCallSpecific = async (ticketId: number) => {
    if (currentTicket) {
      alert("Finalize o atendimento atual antes de chamar o próximo.");
      return;
    }

    if (!workstation || !user) {
      alert(
        "Erro de sessão: Guichê ou Usuário não identificados. Tente recarregar a página.",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/tickets/call-specific`,
        {
          method: "POST",
          token,
          onUnauthorized: logout,
          body: JSON.stringify({
            workstation_id: workstation?.id,
            user_id: user?.id,
            ticket_id: ticketId,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        alert(err.message || "Erro ao chamar senha");
        return;
      }

      const data = await res.json();
      setCurrentTicket(data);
    } catch (err) {
      console.error(err);
      alert("Erro ao chamar senha");
    } finally {
      setLoading(false);
    }
  };

  const handleRecall = async () => {
    if (!currentTicket) return;

    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/tickets/${currentTicket.id}/recall`,
        {
          method: "POST",
          token,
          onUnauthorized: logout,
        },
      );

      if (!res.ok) {
        throw new Error("Erro ao chamar novamente");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao chamar novamente");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (
    status: "in_attendance" | "finished" | "missed",
  ) => {
    if (!currentTicket) return;

    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/tickets/${currentTicket.id}/status`,
        {
          method: "PUT",
          token,
          onUnauthorized: logout,
          body: JSON.stringify({ status }),
        },
      );

      const data = await res.json();

      if (status === "finished" || status === "missed") {
        setCurrentTicket(null);
      } else {
        setCurrentTicket(data);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar status");
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats
  const waitingCount = tickets.filter((t) => t.status === "waiting").length;

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 flex justify-between items-center border-b border-gray-200 sticky top-0 z-10 h-20">
        <div className="flex items-center gap-6">
          <div className="hidden md:block">
            <Logo theme="dark" />
          </div>
          <div className="h-10 w-px bg-gray-200 hidden md:block"></div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right mr-4 hidden sm:block">
            <p className="text-sm font-bold text-gray-800">{user?.username}</p>
            <p className="text-xs text-gray-500 uppercase">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Sair"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Current Ticket Bar */}
      {currentTicket && (
        <div className="bg-gray-800 text-white px-6 py-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-4 sticky top-20 z-20">
          <div className="flex items-center gap-4">
            <div
              className={`p-2 rounded-full ${
                currentTicket.status === "calling"
                  ? "bg-yellow-500 animate-pulse"
                  : currentTicket.status === "in_attendance"
                    ? "bg-green-500"
                    : "bg-gray-500"
              }`}
            >
              {currentTicket.status === "calling" ? (
                <Bell className="w-6 h-6 text-white" />
              ) : currentTicket.status === "in_attendance" ? (
                <Activity className="w-6 h-6 text-white" />
              ) : (
                <Monitor className="w-6 h-6 text-white" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-black tracking-tight">
                  {currentTicket.number}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    currentTicket.status === "calling"
                      ? "bg-yellow-100 text-yellow-800"
                      : currentTicket.status === "in_attendance"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-600 text-gray-200"
                  }`}
                >
                  {currentTicket.status === "calling"
                    ? "CHAMANDO"
                    : currentTicket.status === "in_attendance"
                      ? "EM ATENDIMENTO"
                      : currentTicket.status}
                </span>
              </div>
              {currentTicket.doctor_name && (
                <div className="text-sm text-gray-300 font-medium">
                  {currentTicket.doctor_name}
                </div>
              )}
            </div>
            {currentTicket.status === "in_attendance" &&
              currentTicket.started_at && (
                <div className="ml-4 pl-4 border-l border-gray-600">
                  <TicketTimer startTime={currentTicket.started_at} />
                </div>
              )}
          </div>

          <div className="flex items-center gap-3">
            {currentTicket.status === "calling" && (
              <>
                <button
                  onClick={() => updateStatus("in_attendance")}
                  disabled={loading}
                  className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" /> INICIAR
                </button>
                <button
                  onClick={() => updateStatus("missed")}
                  disabled={loading}
                  className="bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                >
                  <UserX className="w-4 h-4" /> NÃO COMPARECEU
                </button>
                <button
                  onClick={handleRecall}
                  disabled={loading}
                  className="bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-200 border border-yellow-500/50 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                >
                  <Bell className="w-4 h-4" /> CHAMAR NOVAMENTE
                </button>
              </>
            )}

            {currentTicket.status === "in_attendance" && (
              <button
                onClick={() => updateStatus("finished")}
                disabled={loading}
                className="bg-white text-gray-900 hover:bg-gray-100 px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg"
              >
                <CheckCircle className="w-5 h-5 text-green-600" /> FINALIZAR
                ATENDIMENTO
              </button>
            )}
          </div>
        </div>
      )}

      {/* Global Waiting Bar (New Layout) */}
      <div
        className="bg-[#0097b2] text-white px-6 py-2 flex items-center justify-between shadow-sm sticky top-[var(--stats-top)] z-10"
        style={
          {
            "--stats-top": currentTicket ? "160px" : "80px",
          } as React.CSSProperties
        }
      >
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 opacity-80" />
          <span className="font-bold tracking-wide text-sm">
            SENHAS AGUARDANDO ATENDIMENTO:
          </span>
          <span className="font-black text-xl">
            {waitingCount.toString().padStart(2, "0")}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Action Buttons */}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-2 px-3 py-1 bg-white/20 hover:bg-white/30 border border-white/40 rounded transition-colors text-white font-bold text-xs"
          >
            <History size={14} /> HISTÓRICO
          </button>

          <button
            onClick={() => setIsAttendanceOpen(true)}
            className="flex items-center gap-2 px-3 py-1 bg-white/20 hover:bg-white/30 border border-white/40 rounded transition-colors text-white font-bold text-xs"
          >
            <ClipboardList size={14} /> ATENDIMENTO
          </button>

          <button
            onClick={() => setIsRequeueOpen(true)}
            className="flex items-center gap-2 px-3 py-1 bg-white/20 hover:bg-white/30 border border-white/40 rounded transition-colors text-white font-bold text-xs"
          >
            <RotateCcw size={14} /> NÃO COMPARECIDOS
          </button>

          <div className="h-6 w-px bg-white/30 mx-2"></div>

          <div className="text-xs font-medium opacity-70 uppercase tracking-wider">
            Terminal: {workstation?.code}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-hidden">
        {/* Main Area: Doctor Grid (Full Width) */}
        <div className="h-full overflow-y-auto pb-20">
          <DoctorQueueGrid
            onCall={handleCallNext}
            disabled={loading || !!currentTicket}
            refreshTrigger={refreshTrigger}
            queueSector={queueSector}
          />
        </div>
      </main>

      {/* Modals */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        refreshTrigger={refreshTrigger}
        queueSector={queueSector}
      />
      <AttendanceModal
        isOpen={isAttendanceOpen}
        onClose={() => setIsAttendanceOpen(false)}
        refreshTrigger={refreshTrigger}
        onCall={handleCallSpecific}
        queueSector={queueSector}
      />
      <RequeueModal
        isOpen={isRequeueOpen}
        onClose={() => setIsRequeueOpen(false)}
        refreshTrigger={refreshTrigger}
        queueSector={queueSector}
      />
    </div>
  );
};

export default Attendant;
