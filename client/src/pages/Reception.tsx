import React, { useState, useEffect, useRef } from "react";
import type { Doctor, Ticket } from "../types";
import {
  CheckCircle,
  Stethoscope,
  LayoutGrid,
  Headphones,
  Scissors,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";

const Reception: React.FC = () => {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [lastTicket, setLastTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [ticketType, setTicketType] = useState<"consulta" | "outros">(
    "consulta",
  );

  useEffect(() => {
    if (lastTicket) {
      const timer = setTimeout(() => {
        setLastTicket(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [lastTicket]);

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    apiFetch(`/api/doctors`, {
      token,
      onUnauthorized: logout,
    })
      .then((res) => {
        return res.json();
      })
      .then((data) => {
        if (data) setDoctors(data);
      });
  }, [token, navigate, logout]);

  const generateTicket = async (doctorId: number | null, subtype?: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const typeToSend = subtype ? "outros" : ticketType;
      const res = await apiFetch(`/api/tickets`, {
        method: "POST",
        token,
        onUnauthorized: () => {
          logout();
          navigate("/login");
        },
        body: JSON.stringify({
          doctor_id: doctorId,
          type: typeToSend,
          ...(subtype && { subtype }),
        }),
      });

      if (!res.ok) {
        throw new Error("Falha na requisição");
      }

      const data = await res.json();
      setLastTicket(data);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar senha");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-200 p-10 pt-14 relative">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
            
          </h1>

          {/* Ticket Type Selection */}
          <div className="flex justify-center mb-12 gap-6 flex-wrap mt-6">
            <button
              onClick={() => setTicketType("consulta")}
              className={`flex items-center px-10 py-6 rounded-2xl text-3xl font-black transition-all shadow-md active:scale-[0.98] ${
                ticketType === "consulta"
                  ? "bg-primary text-white scale-105 ring-4 ring-primary/20"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Stethoscope className="mr-4 w-8 h-8" />
              CONSULTAS
            </button>

            <button
              onClick={() => setTicketType("outros")}
              className={`hidden flex items-center px-10 py-6 rounded-2xl text-3xl font-black transition-all shadow-md active:scale-[0.98] ${
                ticketType === "outros"
                  ? "bg-secondary text-white scale-105 ring-4 ring-secondary/20"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              <LayoutGrid className="mr-4 w-8 h-8" />
              OUTROS
            </button>
          </div>

          {lastTicket && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
              <div className="bg-white p-12 rounded-2xl shadow-2xl text-center max-w-md w-full transform transition-all scale-100">
                <div className="flex justify-center mb-6">
                  <CheckCircle className="w-20 h-20 text-green-500 animate-bounce" />
                </div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">
                  SENHA GERADA
                </h2>
                <p className="text-gray-500 mb-6 uppercase tracking-wider font-semibold">
                  {lastTicket.type}
                </p>

                <div className="bg-gray-100 rounded-xl p-8 mb-8 border-2 border-dashed border-gray-300">
                  <div className="text-7xl font-black text-primary tracking-tighter">
                    {lastTicket.number}
                  </div>
                </div>

                <p className="text-gray-600 mb-8 text-lg">
                  Aguarde ser chamado no painel.
                </p>

                <div className="mb-2 text-green-600 font-medium text-sm flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Senha enviada para
                  impressão
                </div>
              </div>
            </div>
          )}

          {ticketType === "consulta" ? (
            <div
              className="grid gap-6"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              }}
            >
              <button
                onClick={() => generateTicket(null, "apoio")}
                disabled={loading}
                className="bg-white py-6 px-6 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all border border-gray-100 flex items-center group relative overflow-hidden min-h-[130px]"
              >
                <div className="absolute top-0 left-0 w-2.5 h-full bg-gray-400 transition-colors duration-300" />
                <div className="pl-5 flex flex-col justify-center text-left w-full">
                  <h3 className="text-2xl font-black text-gray-900 leading-snug">
                    Apoio
                  </h3>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-400" />
                    <p className="text-gray-700 text-lg font-bold">Recepção</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => generateTicket(null, "agendamento_cirurgico")}
                disabled={loading}
                className="hidden bg-white py-6 px-6 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all border border-gray-100 flex items-center group relative overflow-hidden min-h-[130px]"
              >
                <div className="absolute top-0 left-0 w-2.5 h-full bg-secondary transition-colors duration-300" />
                <div className="pl-5 flex flex-col justify-center text-left w-full">
                  <h3 className="text-2xl font-black text-gray-900 leading-snug">
                    Agendamento Cirúrgico
                  </h3>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0 bg-secondary" />
                    <p className="text-gray-700 text-lg font-bold">Cirurgia</p>
                  </div>
                </div>
              </button>

              {doctors.map((doctor) => (
                <button
                  key={doctor.id}
                  onClick={() => generateTicket(doctor.id)}
                  disabled={loading}
                  className="bg-white py-6 px-6 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all border border-gray-100 flex items-center group relative overflow-hidden min-h-[130px]"
                >
                  <div
                    className={`absolute top-0 left-0 w-2.5 h-full ${ticketType === "consulta" ? "bg-primary" : "bg-secondary"} transition-colors duration-300`}
                  />
                  <div className="pl-5 flex flex-col justify-center text-left w-full">
                    <h3 className="text-2xl font-black text-gray-900 leading-snug">
                      {doctor.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-3">
                      <span
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${ticketType === "consulta" ? "bg-primary" : "bg-secondary"}`}
                      />
                      <p className="text-gray-700 text-lg font-bold">
                        {doctor.specialization}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto mt-8">
              <button
                onClick={() => generateTicket(null, "agendamento_cirurgico")}
                disabled={loading}
                className="bg-white py-12 px-8 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all border border-gray-100 flex flex-col items-center justify-center gap-4 group relative overflow-hidden min-h-[180px]"
              >
                <div className="absolute top-0 left-0 w-2.5 h-full bg-secondary" />
                <Scissors className="w-12 h-12 text-secondary" />
                <span className="text-2xl font-black text-gray-900 text-center">
                  Agendamento Cirúrgico
                </span>
              </button>

              <button
                onClick={() => generateTicket(null, "apoio")}
                disabled={loading}
                className="bg-white py-12 px-8 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all border border-gray-100 flex flex-col items-center justify-center gap-4 group relative overflow-hidden min-h-[180px]"
              >
                <div className="absolute top-0 left-0 w-2.5 h-full bg-gray-400" />
                <Headphones className="w-12 h-12 text-gray-600" />
                <span className="text-2xl font-black text-gray-900">Apoio</span>
              </button>
            </div>
          )}
        </div>
      </div>

    </>
  );
};

export default Reception;
