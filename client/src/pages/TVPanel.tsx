import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { useSearchParams } from "react-router-dom";
import type { Ticket } from "../types";
import { Monitor } from "lucide-react";
import Logo from "../components/Logo";

const TVPanel: React.FC = () => {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get("type"); // consulta | cirurgia
  const filterDoctor = searchParams.get("doctor_id");

  const socketContext = useSocket();
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize audio and fetch initial state
  useEffect(() => {
    // Using a reliable beep sound
    audioRef.current = new Audio(
      "https://actions.google.com/sounds/v1/alarms/beep_short.ogg",
    );

    const fetchState = async () => {
      try {
        // Fetch history first
        const histRes = await fetch(
          "http://localhost:3000/api/tickets/history",
        );
        const histData: Ticket[] = await histRes.json();

        if (histData.length > 0) {
          // The most recent one is the current one being displayed
          const current = histData[0];
          setCurrentTicket(current);
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchState();
  }, []);

  useEffect(() => {
    if (socketContext && socketContext.socket) {
      const handleCalling = (ticket: Ticket) => {
        // Apply filters
        if (filterType && ticket.type !== filterType) return;
        if (filterDoctor && ticket.doctor_id !== Number(filterDoctor)) return;

        // Play sound
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current
            .play()
            .catch((e) =>
              console.log("Audio play failed (user interaction needed?):", e),
            );
        }

        setCurrentTicket(ticket);
      };

      socketContext.on("ticket:calling", handleCalling);
      // REMOVED: ticket:started and ticket:finished — TV only displays calls

      return () => {
        socketContext.off("ticket:calling", handleCalling);
      };
    }
  }, [socketContext, filterType, filterDoctor]);

  return (
    <div className="min-h-screen bg-gray-900 text-white overflow-hidden flex flex-col relative">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-10 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary blur-[150px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-secondary blur-[150px]"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 flex justify-between items-center p-8 border-b border-gray-800 bg-gray-900/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Logo theme="light" />
          <div className="ml-4">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Centro do Cérebro e Coluna
            </h1>
            <p className="text-gray-400 text-lg">Sistema de Atendimento</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-5xl font-mono font-bold text-white tracking-widest">
              {currentTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="text-gray-400 uppercase font-medium tracking-widest text-sm text-right mt-1">
              {currentTime.toLocaleDateString([], {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-8">
        {currentTicket ? (
          <div className="flex flex-col items-center animate-in zoom-in duration-500 w-full max-w-5xl">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-16 w-full text-center shadow-2xl relative overflow-hidden group">
              {/* Status Badge */}
              <div className="absolute top-0 left-0 w-full py-6 font-bold text-3xl uppercase tracking-[0.5em] bg-yellow-500 text-yellow-900 animate-pulse">
                CHAMANDO
              </div>

              <div className="mt-20 mb-12">
                <span className="inline-block px-8 py-3 rounded-full bg-white/10 text-gray-300 font-medium uppercase tracking-widest text-lg mb-8 border border-white/10">
                  SENHA
                </span>
                <div className="text-[18rem] leading-none font-black text-white tracking-tighter drop-shadow-2xl">
                  {currentTicket.number}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-12 border-t border-white/10 pt-12 mt-12">
                <div>
                  <div className="text-gray-400 uppercase tracking-widest text-lg font-bold mb-4">
                    Local de Atendimento
                  </div>
                  <div className="text-8xl font-bold text-primary flex items-center justify-center gap-6">
                    <Monitor className="w-20 h-20" />
                    {currentTicket.workstation_name || "GUICHÊ --"}
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-8">
                  <div className="text-gray-400 uppercase tracking-widest text-base font-bold mb-2">
                    Profissional
                  </div>
                  <div className="text-5xl font-medium text-white">
                    {currentTicket.doctor_name || "Clínico Geral"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-600 opacity-50">
            <Monitor className="w-48 h-48 mb-8" />
            <div className="text-6xl font-light">Aguardando chamada...</div>
          </div>
        )}
      </main>

      {/* Footer Ticker */}
      <footer className="bg-primary text-white py-3 overflow-hidden whitespace-nowrap relative">
        <div className="animate-marquee inline-block px-4 font-bold tracking-wider">
          BEM-VINDO AO CENTRO DO CÉREBRO E COLUNA • HORÁRIO DE ATENDIMENTO:
          08:00 ÀS 18:00 • EM CASO DE DÚVIDAS, PROCURE A RECEPÇÃO • MANTENHA O
          SILÊNCIO
        </div>
      </footer>

      <style>{`
        @keyframes marquee {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
        }
        .animate-marquee {
            animation: marquee 20s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default TVPanel;
