import React, { useEffect, useState } from "react";
import { BaseModal } from "./BaseModal";
import type { Ticket } from "../types";
import { useToast } from "../contexts/ToastContext";
import { RotateCcw, AlertCircle } from "lucide-react";

interface RequeueModalProps {
  isOpen: boolean;
  onClose: () => void;
  refreshTrigger: number;
}

export const RequeueModal: React.FC<RequeueModalProps> = ({
  isOpen,
  onClose,
  refreshTrigger,
}) => {
  const { addToast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmTicket, setConfirmTicket] = useState<Ticket | null>(null);
  const [currentQueueSize, setCurrentQueueSize] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTickets();
      setConfirmTicket(null);
    }
  }, [isOpen, refreshTrigger]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3000/api/tickets/no-show");
      const data = await res.json();
      if (Array.isArray(data)) {
        setTickets(data);
      } else {
        console.error("Invalid no-show tickets data:", data);
        setTickets([]);
      }
    } catch (error) {
      console.error("Error fetching no-show tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequeueClick = async (ticket: Ticket) => {
    setConfirmTicket(ticket);
    // Fetch queue size for this doctor
    try {
      const res = await fetch(
        "http://localhost:3000/api/tickets/waiting-stats",
      );
      const stats = await res.json();
      const doctorStat = stats.find(
        (s: any) => s.doctor_id === ticket.doctor_id,
      );
      setCurrentQueueSize(doctorStat ? doctorStat.count : 0);
    } catch (e) {
      console.error(e);
      setCurrentQueueSize(null);
    }
  };

  const confirmRequeue = async () => {
    if (!confirmTicket) return;

    try {
      const res = await fetch(
        `http://localhost:3000/api/tickets/${confirmTicket.id}/requeue`,
        {
          method: "POST",
        },
      );

      if (!res.ok) {
        throw new Error("Erro ao reingressar senha");
      }

      addToast(
        `Senha ${confirmTicket.number} reingressada com sucesso!`,
        "success",
      );
      setConfirmTicket(null);
      fetchTickets();
    } catch (error) {
      console.error("Error requeueing ticket:", error);
      addToast("Erro ao reingressar senha", "error");
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "--:--";
    const date = new Date(
      dateString.includes("Z") ? dateString : dateString + "Z",
    );
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        confirmTicket
          ? "Confirmar Reingresso"
          : "Senhas Não Comparecidas — Hoje"
      }
      width="600px"
    >
      <div className="p-4">
        {confirmTicket ? (
          <div className="space-y-6">
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-center">
              <h3 className="text-lg font-bold text-gray-800 mb-1">
                Reinserir senha {confirmTicket.number}?
              </h3>
              <p className="text-gray-600">
                {confirmTicket.doctor_name || "Sem Médico"}
              </p>
              <div className="mt-4 inline-flex items-center px-3 py-1 bg-white rounded border border-yellow-200 text-sm font-medium text-gray-600">
                Fila atual:{" "}
                {currentQueueSize !== null ? currentQueueSize : "--"}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmTicket(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded hover:bg-gray-200 transition-colors"
              >
                CANCELAR
              </button>
              <button
                onClick={confirmRequeue}
                className="px-4 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 transition-colors flex items-center"
              >
                <RotateCcw size={16} className="mr-2" /> REINGRESSAR
              </button>
            </div>
          </div>
        ) : (
          <>
            {loading && tickets.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Carregando...
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-8 text-gray-500 italic">
                Nenhuma senha não comparecida hoje.
              </div>
            ) : (
              <div className="space-y-2">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-black text-lg text-gray-800 w-16">
                        {ticket.number}
                      </span>

                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide truncate max-w-[150px]">
                          {ticket.doctor_name || "Sem Médico"}
                        </span>
                        <span className="text-xs text-gray-500">
                          Não compareceu às {formatTime(ticket.finished_at)}
                        </span>
                      </div>

                      {(ticket.requeue_count || 0) > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded border border-yellow-200">
                          ↩ {(ticket.requeue_count || 0) + 1}ª vez
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleRequeueClick(ticket)}
                      className="flex items-center px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      <RotateCcw size={12} className="mr-1" /> REINGRESSAR
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </BaseModal>
  );
};
