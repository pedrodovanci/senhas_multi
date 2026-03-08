import React, { useEffect, useState } from "react";
import { BaseModal } from "./BaseModal";
import { API_URL } from "../config";
import type { Ticket } from "../types";
import { Play } from "lucide-react";

interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  refreshTrigger: number;
  onCall: (ticketId: number) => void;
  queueSector?: string;
}

export const AttendanceModal: React.FC<AttendanceModalProps> = ({
  isOpen,
  onClose,
  refreshTrigger,
  onCall,
  queueSector,
}) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (isOpen) {
      fetchTickets();
      const interval = setInterval(() => setNow(new Date()), 1000); // Update timers
      return () => clearInterval(interval);
    }
  }, [isOpen, refreshTrigger, queueSector]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({ status: 'waiting' });
      if (queueSector) {
        queryParams.append('queue_sector', queueSector);
      }
      const res = await fetch(
        `${API_URL}/api/tickets?${queryParams.toString()}`,
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setTickets(data);
      } else {
        console.error("Invalid waiting tickets data:", data);
        setTickets([]);
      }
    } catch (error) {
      console.error("Error fetching waiting tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const getWaitTime = (createdAt: string) => {
    // Ensure UTC interpretation
    const dateStr = createdAt.includes("Z")
      ? createdAt
      : createdAt.replace(" ", "T") + "Z";
    const start = new Date(dateStr).getTime();
    const current = now.getTime();
    const diff = current - start;

    if (diff < 0) return { text: "00:00", isLong: false };

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    return {
      text: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      isLong: minutes >= 10,
    };
  };

  const groupedTickets = tickets.reduce(
    (acc, ticket) => {
      const doctorName = ticket.doctor_name || "Sem Médico / Apoio";
      if (!acc[doctorName]) {
        acc[doctorName] = [];
      }
      acc[doctorName].push(ticket);
      return acc;
    },
    {} as Record<string, Ticket[]>,
  );

  // Sort doctors alphabetically? Or maybe specific order. Alphabetical is fine.
  const doctorNames = Object.keys(groupedTickets).sort();

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Senhas Aguardando Atendimento"
      width="620px"
      maxHeight="75vh"
    >
      <div className="p-4 space-y-6">
        {loading && tickets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Carregando...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-8 text-gray-500 italic">
            Nenhuma senha aguardando no momento.
          </div>
        ) : (
          doctorNames.map((doctorName) => (
            <div key={doctorName}>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">
                {doctorName}
              </h3>
              <div className="space-y-2">
                {groupedTickets[doctorName].map((ticket) => {
                  const waitTime = getWaitTime(ticket.created_at);
                  return (
                    <div
                      key={ticket.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-black text-lg text-gray-800 w-16">
                          {ticket.number}
                        </span>
                        <span
                          className={`text-sm font-mono font-medium ${waitTime.isLong ? "text-red-600" : "text-gray-600"}`}
                        >
                          Espera: {waitTime.text}
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          onCall(ticket.id);
                          onClose();
                        }}
                        className="flex items-center px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition-colors"
                      >
                        <Play size={12} className="mr-1" /> CHAMAR
                      </button>
                    </div>
                  );
                })}
                {groupedTickets[doctorName].length === 0 && (
                  <div className="text-sm text-gray-400 italic pl-2">
                    (fila vazia)
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </BaseModal>
  );
};
