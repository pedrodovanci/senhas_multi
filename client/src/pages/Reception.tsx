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
import { API_URL } from "../config";

const Reception: React.FC = () => {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [lastTicket, setLastTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticketType, setTicketType] = useState<"consulta" | "outros">(
    "consulta",
  );
  const printTriggered = useRef(false);

  useEffect(() => {
    if (lastTicket && !printTriggered.current) {
      printTriggered.current = true;
      // Delay de 300ms para garantir que o layout de impressão
      // já foi renderizado no DOM antes de chamar window.print()
      setTimeout(() => {
        window.print();
      }, 300);
    }
    if (!lastTicket) {
      printTriggered.current = false;
    }
  }, [lastTicket]);

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    fetch(`${API_URL}/api/doctors`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          logout();
          navigate("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setDoctors(data);
      });
  }, [token, navigate, logout]);

  const generateTicket = async (doctorId: number | null, subtype?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          doctor_id: doctorId,
          type: ticketType,
          ...(subtype && { subtype }),
        }),
      });

      if (res.status === 401) {
        alert("Sessão expirada. Por favor, faça login novamente.");
        logout();
        navigate("/login");
        return;
      }

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
    }
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            width: 58mm;
            margin: 2mm 2mm 8mm 2mm;
          }
          body * { visibility: hidden; }
          #ticket-print, #ticket-print * { visibility: visible; }
          #ticket-print {
            position: fixed;
            top: 0;
            left: 0;
            width: 54mm;
          }
        }
      `}</style>
      <div className="min-h-screen bg-gray-200 p-8 relative print:hidden">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
            Recepção - Gerar Senha
          </h1>

          {/* Ticket Type Selection */}
          <div className="flex justify-center mb-12 space-x-6">
            <button
              onClick={() => setTicketType("consulta")}
              className={`flex items-center px-8 py-4 rounded-xl text-xl font-bold transition-all shadow-md ${
                ticketType === "consulta"
                  ? "bg-primary text-white scale-105 ring-4 ring-primary/20"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Stethoscope className="mr-3 w-6 h-6" />
              CONSULTAS
            </button>

            <button
              onClick={() => setTicketType("outros")}
              className={`flex items-center px-8 py-4 rounded-xl text-xl font-bold transition-all shadow-md ${
                ticketType === "outros"
                  ? "bg-secondary text-white scale-105 ring-4 ring-secondary/20"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              <LayoutGrid className="mr-3 w-6 h-6" />
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

                <div className="mb-6 text-green-600 font-medium text-sm flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Senha enviada para
                  impressão
                </div>

                <button
                  onClick={() => setLastTicket(null)}
                  className="w-full py-4 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold text-lg transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          {ticketType === "consulta" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {doctors.map((doctor) => (
                <button
                  key={doctor.id}
                  onClick={() => generateTicket(doctor.id)}
                  disabled={loading}
                  className="bg-white py-4 px-5 rounded-xl shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5 border border-gray-100 flex flex-col justify-center group relative overflow-hidden min-h-[80px]"
                >
                  <div
                    className={`absolute top-0 left-0 w-1.5 h-full ${ticketType === "consulta" ? "bg-primary" : "bg-secondary"} transition-colors duration-300`}
                  />
                  <h3 className="text-base font-bold text-gray-800 leading-tight pl-1">
                    {doctor.name}
                  </h3>
                  <p className="text-gray-400 text-xs mt-0.5 pl-1">
                    {doctor.specialization}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto mt-8">
              <button
                onClick={() => generateTicket(null, "agendamento_cirurgico")}
                disabled={loading}
                className="bg-white py-10 px-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1.5 h-full bg-secondary" />
                <Scissors className="w-10 h-10 text-secondary" />
                <span className="text-lg font-bold text-gray-800">
                  Agendamento Cirúrgico
                </span>
              </button>

              <button
                onClick={() => generateTicket(null, "apoio")}
                disabled={loading}
                className="bg-white py-10 px-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gray-400" />
                <Headphones className="w-10 h-10 text-gray-500" />
                <span className="text-lg font-bold text-gray-800">Apoio</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Print Layout */}
      {lastTicket && (
        <div
          id="ticket-print"
          style={{
            fontFamily: "monospace",
            fontSize: "12px",
            width: "54mm",
            padding: "0",
            textAlign: "center",
            color: "#000",
            background: "#fff",
          }}
          className="hidden print:block"
        >
          <img
            src="/logo-ccc.png"
            
            style={{
              maxWidth: "40mm",
              height: "auto",
              margin: "0 auto 4px auto",
              display: "block",
            }}
          />
          <div
            style={{
              fontWeight: "bold",
              fontSize: "13px",
              marginBottom: "2px",
            }}
          >
            
          </div>
          <div
            style={{
              fontWeight: "bold",
              fontSize: "13px",
              marginBottom: "6px",
            }}
          >
            
          </div>

          <div style={{ borderTop: "1px dashed #000", marginBottom: "8px" }} />

          <div
            style={{
              fontSize: "10px",
              fontWeight: "bold",
              letterSpacing: "2px",
              marginBottom: "2px",
            }}
          >
            SENHA
          </div>
          <div
            style={{
              fontSize: "40px",
              fontWeight: "900",
              lineHeight: "1",
              marginBottom: "6px",
              letterSpacing: "-1px",
            }}
          >
            {lastTicket.number}
          </div>

          <div
            style={{
              display: "inline-block",
              border: "1px solid #000",
              padding: "1px 6px",
              fontSize: "11px",
              fontWeight: "bold",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            {lastTicket.subtype
              ? lastTicket.subtype.replace("_", " ").toUpperCase()
              : lastTicket.type.toUpperCase()}
          </div>

          {lastTicket.doctor_name && (
            <div
              style={{
                fontSize: "11px",
                marginBottom: "6px",
                fontWeight: "bold",
              }}
            >
              {lastTicket.doctor_name}
            </div>
          )}

          <div style={{ borderTop: "1px dashed #000", marginBottom: "6px" }} />

          <div style={{ fontSize: "10px", marginBottom: "8px" }}>
            {new Date().toLocaleString("pt-BR")}
          </div>

          <div
            style={{
              fontSize: "11px",
              fontWeight: "bold",
              marginBottom: "2px",
            }}
          >
            Aguarde ser chamado
          </div>
          <div style={{ fontSize: "11px", marginBottom: "2px" }}>
            no painel.
          </div>

          <div style={{ borderTop: "1px dashed #000", marginTop: "8px" }} />
        </div>
      )}
    </>
  );
};

export default Reception;
