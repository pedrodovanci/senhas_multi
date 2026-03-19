import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { useSearchParams } from "react-router-dom";
import { DoorOpen, History, Stethoscope } from "lucide-react";
import { API_URL } from "../config";
import QueueLayout from "../components/QueueLayout";

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
        if (
          filterType &&
          filterType !== "undefined" &&
          ticket.type !== filterType
        ) {
          console.log("Display: ticket filtered out", {
            filterType,
            ticketType: ticket.type,
          });
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

  const headerContent = (
    <div className="relative flex justify-center items-center w-full h-full px-8">
      {/* Centered Logo */}
      <img src="/logo-ccc.png" alt="Logo" className="h-20 object-contain" />

      {/* Right-aligned Time (Absolute) */}
      <div className="absolute right-8 text-right">
        <div className="text-4xl font-mono font-bold text-gray-800">
          {currentTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div className="text-gray-600 font-medium uppercase text-sm mt-1">
          {currentTime.toLocaleDateString([], {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
      </div>
    </div>
  );

  return (
    <QueueLayout headerContent={headerContent}>
      <div className="w-full h-full flex relative">
        {/* Left Section (History) - Overlays the green shapes */}
        <div className="w-[40%] h-full pt-12 pl-12 z-30">
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 shadow-xl">
            <h2 className="text-white text-xl font-bold uppercase tracking-widest flex items-center gap-3 mb-6 border-b border-white/20 pb-4">
              <History className="text-white w-6 h-6" />
              Últimas Chamadas
            </h2>
            <div className="space-y-4">
              {history.slice(0, 5).map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex justify-between items-center p-4 bg-white/10 rounded-xl border border-white/10"
                >
                  <div className="flex items-center gap-6">
                    <span className="text-4xl font-black text-white">
                      {ticket.number}
                    </span>
                    <span className="text-xl font-bold text-white/90 uppercase">
                      {formatWorkstation(
                        ticket.workstation_name,
                        ticket.workstation_code,
                      )}
                    </span>
                  </div>
                  <span className="text-white/60 text-lg font-mono">
                    {new Date(ticket.called_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Section (Current Ticket) */}
        <div className="w-[60%] h-full flex flex-col items-center justify-center pr-12 pb-12">
          {currentTicket ? (
            <div
              className={`flex flex-col items-center w-full max-w-2xl transition-all duration-500 ${isCalling ? "scale-105" : ""}`}
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">
                  Senha Atual
                </h2>
                <div className="text-[12rem] leading-none font-black text-gray-800 tracking-tighter drop-shadow-lg">
                  {currentTicket.number}
                </div>
              </div>

              <div className="w-full space-y-6">
                <div className="bg-white rounded-2xl shadow-xl p-8 border-l-8 border-[#65845f]">
                  <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">
                    Local de Atendimento
                  </div>
                  <div className="text-5xl font-bold text-[#65845f] flex items-center gap-4">
                    <DoorOpen className="w-12 h-12" />
                    {formatWorkstation(
                      currentTicket.workstation_name,
                      currentTicket.workstation_code,
                    )}
                  </div>
                </div>

                {currentTicket.doctor_name && (
                  <div className="bg-white rounded-2xl shadow-xl p-8 border-l-8 border-[#7f8f7c]">
                    <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">
                      Profissional
                    </div>
                    <div className="text-4xl font-medium text-gray-800 flex items-center gap-4">
                      <Stethoscope className="w-10 h-10 text-gray-400" />
                      {currentTicket.doctor_name}
                    </div>
                  </div>
                )}
              </div>

              {isCalling && (
                <div className="mt-12 py-4 px-12 bg-yellow-400 text-yellow-900 rounded-full text-2xl font-bold uppercase tracking-widest animate-pulse shadow-lg">
                  Chamando
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 opacity-60">
              <DoorOpen className="w-32 h-32 mb-6" />
              <div className="text-4xl font-light">Aguardando chamada...</div>
            </div>
          )}
        </div>
      </div>
    </QueueLayout>
  );
};

export default Display;
