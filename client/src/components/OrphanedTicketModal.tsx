import React from "react";
import {
  AlertTriangle,
  Bell,
  Play,
  UserX,
  CheckCircle,
  Stethoscope,
} from "lucide-react";
import type { Ticket, Doctor } from "../types";

interface OrphanedTicketModalProps {
  ticket: Ticket;
  loading: boolean;
  doctors: Doctor[];
  onInitiate: () => void;
  onMissed: () => void;
  onRecall: () => void;
  onFinish: () => void;
  onForwardOpen: () => void;
}

export const OrphanedTicketModal: React.FC<OrphanedTicketModalProps> = ({
  ticket,
  loading,
  doctors,
  onInitiate,
  onMissed,
  onRecall,
  onFinish,
  onForwardOpen,
}) => (
  <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-amber-100 p-3 rounded-full flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            Sessão anterior com senha aberta
          </h2>
          <p className="text-sm text-gray-500">
            Resolva esta senha para continuar.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-6 mb-6 text-center">
        <div className="text-7xl font-black text-gray-800 tracking-tight mb-3">
          {ticket.number}
        </div>
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
            ticket.status === "calling"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {ticket.status === "calling" ? "CHAMANDO" : "EM ATENDIMENTO"}
        </span>
        {ticket.doctor_name && (
          <div className="text-sm text-gray-500 mt-2 font-medium">
            {ticket.doctor_name}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {ticket.status === "calling" && (
          <>
            <button
              onClick={onInitiate}
              disabled={loading}
              className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" /> INICIAR ATENDIMENTO
            </button>
            <button
              onClick={onRecall}
              disabled={loading}
              className="w-full bg-yellow-100 hover:bg-yellow-200 disabled:opacity-50 text-yellow-800 border border-yellow-300 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Bell className="w-4 h-4" /> CHAMAR NOVAMENTE
            </button>
            <button
              onClick={onMissed}
              disabled={loading}
              className="w-full bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 border border-red-200 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <UserX className="w-4 h-4" /> NÃO COMPARECEU
            </button>
          </>
        )}
        {ticket.status === "in_attendance" && (
          <>
            <button
              onClick={onFinish}
              disabled={loading}
              className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <CheckCircle className="w-4 h-4" /> FINALIZAR ATENDIMENTO
            </button>
            {doctors.length > 0 && (
              <button
                onClick={onForwardOpen}
                disabled={loading}
                className="w-full bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 border border-blue-200 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Stethoscope className="w-4 h-4" /> ENCAMINHAR PARA MÉDICO
              </button>
            )}
          </>
        )}
      </div>
    </div>
  </div>
);
