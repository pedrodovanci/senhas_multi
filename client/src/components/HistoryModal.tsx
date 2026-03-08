import React, { useEffect, useState } from "react";
import { BaseModal } from "./BaseModal";
import { API_URL } from "../config";
import type { Ticket } from "../types";
import { CheckCircle2, Clock, XCircle, PlayCircle } from "lucide-react";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  refreshTrigger: number;
  queueSector?: string;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  refreshTrigger,
  queueSector,
}) => {
  const [history, setHistory] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWorkstation, setSelectedWorkstation] = useState<string>("all");

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, refreshTrigger, queueSector]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({ limit: '50' });
      if (queueSector) {
        queryParams.append('queue_sector', queueSector);
      }
      const res = await fetch(
        `${API_URL}/api/tickets/history?${queryParams.toString()}`,
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      } else {
        console.error("Invalid history data:", data);
        setHistory([]);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  const workstations = Array.from(
    new Set(history.map((t) => t.workstation_code).filter(Boolean)),
  ).sort();

  const filteredHistory =
    selectedWorkstation === "all"
      ? history
      : history.filter((t) => t.workstation_code === selectedWorkstation);

  const getStatusBadge = (status: Ticket["status"]) => {
    switch (status) {
      case "finished":
        return (
          <span className="flex items-center text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">
            <CheckCircle2 size={12} className="mr-1" /> FINALIZADO
          </span>
        );
      case "in_attendance":
        return (
          <span className="flex items-center text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
            <PlayCircle size={12} className="mr-1" /> EM ATENDIMENTO
          </span>
        );
      case "missed":
        return (
          <span className="flex items-center text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">
            <XCircle size={12} className="mr-1" /> NÃO COMPARECEU
          </span>
        );
      case "calling":
        return (
          <span className="flex items-center text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">
            <PlayCircle size={12} className="mr-1" /> CHAMANDO
          </span>
        );
      default:
        return (
          <span className="flex items-center text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
            <Clock size={12} className="mr-1" /> {status.toUpperCase()}
          </span>
        );
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "--:--";
    // Ensure UTC interpretation if no timezone
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
      title="Histórico de Chamadas — Hoje"
      width="560px"
      maxHeight="70vh"
    >
      <div className="p-4">
        {/* Filter */}
        <div className="mb-4 flex justify-end">
          <select
            value={selectedWorkstation}
            onChange={(e) => setSelectedWorkstation(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">Todos os terminais</option>
            {workstations.map((code) => (
              <option key={code} value={code as string}>
                {code}
              </option>
            ))}
          </select>
        </div>

        {loading && history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Carregando...</div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500 italic">
            Nenhum histórico registrado hoje.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredHistory.map((ticket) => (
              <div
                key={ticket.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="font-black text-lg text-gray-800 w-16">
                    {ticket.number}
                  </span>

                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      {ticket.workstation_code || "---"}
                    </span>
                  </div>

                  <div className="h-8 w-px bg-gray-200 mx-2"></div>

                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-700">
                      {formatTime(ticket.called_at)}
                    </span>
                  </div>
                </div>

                <div>{getStatusBadge(ticket.status)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseModal>
  );
};
