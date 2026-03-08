import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { useSearchParams } from "react-router-dom";
import { DoorOpen, History, Stethoscope } from "lucide-react";
import { API_URL } from "../config";

interface CalledTicket {
  id: number;
  number: string;
  workstation_code: string;
  workstation_name?: string;
  called_at: string;
  doctor_name?: string;
  type?: string;
}

const Display: React.FC = () => {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get("type"); // consulta | cirurgia
  const filterDoctor = searchParams.get("doctor_id");

  const socketContext = useSocket();
  const [currentTicket, setCurrentTicket] = useState<CalledTicket | null>(null);
  const [history, setHistory] = useState<CalledTicket[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isCalling, setIsCalling] = useState(false);
  const blinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Initialize audio and fetch initial state
  useEffect(() => {
    audioRef.current = new Audio(
      "https://actions.google.com/sounds/v1/alarms/beep_short.ogg",
    );

    fetch(`${API_URL}/api/tickets/history?limit=7`)
      .then((res) => res.json())
      .then((data: CalledTicket[]) => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch(console.error);

    fetch(`${API_URL}/api/tickets?status=calling`)
      .then((res) => res.json())
      .then((data: CalledTicket[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCurrentTicket(data[0]);
        } else {
          fetch(`${API_URL}/api/tickets/history?limit=1`)
            .then((r) => r.json())
            .then((d) => {
              if (Array.isArray(d) && d.length > 0) {
                setCurrentTicket(d[0]);
              }
            });
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (socketContext && socketContext.socket) {
      console.log("Display: WebSocket connected, registering listener");
      const handleCalling = (ticket: CalledTicket) => {
        console.log("Display: ticket:calling received", ticket);
        // Se houver filtro e o ticket não corresponder (e filtro não for "undefined"), ignora
        if (filterType && filterType !== 'undefined' && ticket.type !== filterType) {
             console.log("Display: ticket filtered out", { filterType, ticketType: ticket.type });
             return;
        }

        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current
            .play()
            .catch((e) =>
              console.log("Audio play failed (user interaction needed?):", e),
            );
        }

        setCurrentTicket(ticket);
        
        setIsCalling(true);
        if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
        blinkTimeoutRef.current = setTimeout(() => setIsCalling(false), 5000);

        setHistory((prev) => {
          const filtered = prev.filter((t) => t.id !== ticket.id);
          return [ticket, ...filtered].slice(0, 7);
        });
      };

      socketContext.on("ticket:calling", handleCalling);

      return () => {
        socketContext.off("ticket:calling", handleCalling);
      };
    }
  }, [socketContext, filterType, filterDoctor]);

  const formatWorkstation = (name?: string, code?: string): string => {
    if (name) return name.toUpperCase();
    const number = code?.replace(/[^0-9]/g, "") ?? "";
    return `GUICHÊ ${number}`;
  };

  return (
    <div className="min-h-screen w-full p-8 gap-8 flex flex-col overflow-hidden bg-[#0f2319] text-slate-900 relative font-['Inter']">
      {/* Background Image Layer */}
      <div
        className="absolute inset-0 z-0 opacity-100 pointer-events-none"
        style={{
          backgroundImage: "url('/FUNDO_SENHAS.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      ></div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>

      {/* Main Content Area */}
      <main className="flex flex-1 gap-8 overflow-hidden relative z-10">
        {/* Left Section (Ticket Card) */}
        <div className="flex-1 flex flex-col justify-center py-12 pl-6 items-start">
          <div
            className={`bg-white/90 backdrop-blur-sm rounded-xl p-12 flex flex-col items-center border-t-4 border-[#00bf63] w-fit min-w-[620px] min-h-[420px] mx-auto transition-all duration-500 ${
              isCalling
                ? "shadow-[0_0_60px_rgba(0,191,99,0.6)] scale-105 border-t-8"
                : "shadow-2xl"
            }`}
          >
            <span
              className={`text-2xl font-bold uppercase tracking-[0.5em] mb-8 transition-colors duration-300 ${
                isCalling ? "text-[#00bf63] animate-pulse" : "text-slate-500"
              }`}
            >
              {isCalling ? "CHAMANDO..." : "Senha Atual"}
            </span>
            <div className="bg-white px-16 py-8 rounded-2xl border border-slate-200 mb-8 min-w-[300px] flex justify-center w-full">
              <span className="text-[clamp(70px,11vw,150px)] leading-none font-black text-slate-900 tracking-tighter">
                {currentTicket ? currentTicket.number : "---"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-6 w-full">
              <div className="flex items-center justify-center gap-4 text-[#00bf63] bg-[#00bf63]/10 px-8 py-4 rounded-full border-2 border-[#00bf63] w-full">
                <DoorOpen className="w-12 h-12" />
                <span className="text-5xl font-black uppercase whitespace-nowrap">
                  {currentTicket
                    ? formatWorkstation(
                        currentTicket.workstation_name,
                        currentTicket.workstation_code,
                      )
                    : "Aguarde"}
                </span>
              </div>
              {currentTicket && currentTicket.doctor_name && (
                <div className="flex items-center gap-3 mt-2">
                  <Stethoscope className="w-8 h-8 text-slate-400" />
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                      Profissional
                    </span>
                    <span className="text-5xl font-bold text-slate-700 whitespace-nowrap">
                      {currentTicket.doctor_name}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Section (History and Meta) */}
        <div className="flex-1 flex flex-col py-12 pr-6 items-end">
          {/* Time and Date */}
          {/* Date Component */}
          <div className="absolute top-[110px] right-[160px] z-20">
            <div className="text-[#0f2319] text-[28px] font-bold tracking-[2px]">
              {currentTime.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </div>
          </div>

          {/* Time Component */}
          <div className="absolute top-[170px] right-[260px] z-20">
            <div className="text-[#0f2319] text-[clamp(60px,8vh,100px)] leading-none tracking-[4px] font-black">
              {currentTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          {/* Last Calls Sidebar */}
          <aside className="w-[clamp(340px,28vw,480px)] bg-white/80 backdrop-blur-md rounded-xl shadow-xl overflow-hidden flex flex-col border border-white mt-60 mr-10">
            <div className="bg-slate-900 p-6">
              <h2 className="text-white text-xl font-black uppercase tracking-widest flex items-center gap-3">
                <History className="text-[#00bf63]" />
                Últimas Chamadas
              </h2>
            </div>
            <div className="flex-1 divide-y divide-slate-200 overflow-hidden">
              {history.slice(0, 7).map((ticket, index) => (
                <div
                key={ticket.id}
                className={`p-4 flex justify-between items-center ${
                  index === 0 ? "bg-[#00bf63]/5" : ""
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-4xl font-black ${
                      index === 0 ? "text-[#00bf63]" : "text-slate-800"
                    } ${index > 0 ? "opacity-60" : ""}`}
                  >
                    {ticket.number}
                  </span>
                  <span
                    className={`text-2xl font-black uppercase ${
                      index === 0 ? "text-[#00bf63]" : "text-slate-800"
                    } ${index > 0 ? "opacity-60" : ""}`}
                  >
                    -{" "}
                    {formatWorkstation(
                      ticket.workstation_name,
                      ticket.workstation_code,
                    )}
                  </span>
                </div>
                <span className="text-slate-400 font-bold text-xl">
                  {new Date(ticket.called_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
            {history.length === 0 && (
              <div className="p-8 text-center text-slate-400 font-medium">
                Nenhum histórico recente
              </div>
            )}
          </div>
            <div className="p-4 bg-slate-50 text-center">
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                Painel Atualizado
              </span>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer Marquee */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#0f2319]/90 backdrop-blur-md border-t-4 border-[#00bf63] py-4 z-50 overflow-hidden whitespace-nowrap">
        <div className="animate-marquee inline-block text-white font-bold text-3xl uppercase tracking-widest">
          BEM-VINDO AO CENTRO DO CÉREBRO E COLUNA - AGENDE SEU HORÁRIO PELO WHATSAPP (17) 3216-9998
        </div>
      </footer>
      {/* Debug/Connection Status */}
      <div 
        className={`absolute bottom-4 right-4 w-4 h-4 rounded-full z-50 ${
          socketContext && socketContext.socket ? 'bg-green-500' : 'bg-red-500'
        }`}
        title={socketContext && socketContext.socket ? 'Conectado' : 'Desconectado'}
      />
    </div>
  );
};

export default Display;
