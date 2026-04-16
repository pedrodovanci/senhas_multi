import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { useSearchParams } from "react-router-dom";
import type { Ticket } from "../types";
import { History, Monitor } from "lucide-react";
import { apiFetch } from "../utils/api";
import { API_URL } from "../config";
import ConnectionStatus from "../components/ConnectionStatus";
import QueueLayout from "../components/QueueLayout";

const TVPanel: React.FC = () => {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get("type"); // consulta | cirurgia
  const filterDoctor = searchParams.get("doctor_id");

  const socketContext = useSocket();
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [history, setHistory] = useState<Ticket[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
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
    const src = `${API_URL}/assets/audio/alert.mp3?v=${Date.now()}`;
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.addEventListener("error", () => {
      console.error("Falha ao carregar áudio:", src);
    });
    audioRef.current = audio;

    const matchesFilter = (ticket: Ticket) => {
      if (
        filterType &&
        filterType !== "undefined" &&
        ticket.type !== filterType
      ) {
        return false;
      }
      if (
        filterDoctor &&
        filterDoctor !== "undefined" &&
        ticket.doctor_id !== Number(filterDoctor)
      ) {
        return false;
      }
      return true;
    };

    const fetchState = async () => {
      try {
        const histRes = await apiFetch(`/api/tickets/history?limit=7`);
        const histData: Ticket[] = await histRes.json();

        const filteredHistory = Array.isArray(histData)
          ? histData.filter(matchesFilter)
          : [];
        setHistory(filteredHistory.slice(0, 7));

        const callingRes = await apiFetch(`/api/tickets?status=calling`);
        const callingData: Ticket[] = await callingRes.json();
        const filteredCalling = Array.isArray(callingData)
          ? callingData.filter(matchesFilter)
          : [];

        if (filteredCalling.length > 0) {
          setCurrentTicket(filteredCalling[0]);
        } else if (filteredHistory.length > 0) {
          setCurrentTicket(filteredHistory[0]);
        } else {
          setCurrentTicket(null);
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchState();
  }, [filterType, filterDoctor]);

  useEffect(() => {
    if (socketContext && socketContext.socket) {
      const handleCalling = (ticket: Ticket) => {
        // Apply filters
        if (
          filterType &&
          filterType !== "undefined" &&
          ticket.type !== filterType
        ) {
          return;
        }
        if (
          filterDoctor &&
          filterDoctor !== "undefined" &&
          ticket.doctor_id !== Number(filterDoctor)
        ) {
          return;
        }

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
        setIsCalling(true);
        if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
        blinkTimeoutRef.current = setTimeout(() => setIsCalling(false), 5000);

        setHistory((prev) => {
          const filtered = prev.filter((t) => t.id !== ticket.id);
          return [ticket, ...filtered].slice(0, 7);
        });
      };

      socketContext.on("ticket:calling", handleCalling);
      const handleReconnected = () => {
        Promise.all([
          apiFetch(`/api/tickets/history?limit=7`).then((r) => r.json()),
          apiFetch(`/api/tickets?status=calling`).then((r) => r.json()),
        ])
          .then(([hist, calling]) => {
            const matchesFilter = (ticket: Ticket) => {
              if (
                filterType &&
                filterType !== "undefined" &&
                ticket.type !== filterType
              ) {
                return false;
              }
              if (
                filterDoctor &&
                filterDoctor !== "undefined" &&
                ticket.doctor_id !== Number(filterDoctor)
              ) {
                return false;
              }
              return true;
            };

            const histData: Ticket[] = Array.isArray(hist)
              ? hist.filter(matchesFilter)
              : [];
            const callingData: Ticket[] = Array.isArray(calling)
              ? calling.filter(matchesFilter)
              : [];
            setHistory(histData.slice(0, 7));
            if (callingData.length > 0) {
              setCurrentTicket(callingData[0]);
            } else if (histData.length > 0) {
              setCurrentTicket(histData[0]);
            } else {
              setCurrentTicket(null);
            }
          })
          .catch(() => {});
      };
      socketContext.on("ws:reconnected", handleReconnected);

      return () => {
        socketContext.off("ticket:calling", handleCalling);
        socketContext.off("ws:reconnected", handleReconnected);
      };
    }
  }, [socketContext, filterType, filterDoctor]);

  const formatWorkstation = (name?: string, code?: string): string => {
    if (name) return name.toUpperCase();
    const digits = (code ?? "").replace(/[^0-9]/g, "");
    if (digits) return `GUICHÊ ${digits}`;
    return "GUICHÊ --";
  };

  const unlockAudio = () => {
    if (audioRef.current) {
      audioRef.current
        .play()
        .then(() => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          setAudioUnlocked(true);
        })
        .catch(() => {});
    }
  };

  const headerContent = (
    <div className="flex justify-between items-center w-full h-full px-8">
      <div className="flex items-center gap-4">
        <img 
          src="/logo-instagram.png" 
          alt="Logo" 
          className="h-16 object-contain"
        />
        <h1 className="text-2xl font-bold text-gray-700 uppercase tracking-widest">
          Centro do Cérebro e Coluna
        </h1>
      </div>
      
      <div className="text-right">
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
      {!audioUnlocked && (
        <button
          onClick={unlockAudio}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full shadow-lg font-bold text-sm"
        >
          🔇 Clique para ativar o som
        </button>
      )}
      <ConnectionStatus />
      <div className="w-full h-full flex relative">
        <div
          className="w-[40%] h-full z-30"
          style={{
            paddingTop: "clamp(0.4rem, 2vh, 2.5rem)",
            paddingLeft: "clamp(0.4rem, 2vw, 2.5rem)",
          }}
        >
          <div
            className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-xl"
            style={{ padding: "clamp(0.6rem, 1.4vw, 1.6rem)" }}
          >
            <h2
              className="text-white font-bold uppercase tracking-widest flex items-center border-b border-white/20"
              style={{
                fontSize: "clamp(0.95rem, 1.6vw, 1.6rem)",
                gap: "clamp(0.35rem, 0.8vw, 1rem)",
                marginBottom: "clamp(0.6rem, 1.2vw, 1.3rem)",
                paddingBottom: "clamp(0.45rem, 0.9vw, 1rem)",
              }}
            >
              <History
                className="text-white"
                style={{
                  width: "clamp(1.05rem, 1.6vw, 2rem)",
                  height: "clamp(1.05rem, 1.6vw, 2rem)",
                }}
              />
              Últimas Chamadas
            </h2>

            <div
              style={{
                display: "grid",
                rowGap: "clamp(0.45rem, 1vw, 1.05rem)",
              }}
            >
              {history.slice(0, 5).map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex justify-between items-center bg-white/10 rounded-xl border border-white/10"
                  style={{
                    padding: "clamp(0.5rem, 1.1vw, 1.15rem)",
                  }}
                >
                  <div
                    className="flex items-center"
                    style={{ gap: "clamp(0.5rem, 1.5vw, 1.75rem)" }}
                  >
                    <span
                      className="font-black text-white"
                      style={{ fontSize: "clamp(1.3rem, 3vw, 3.2rem)" }}
                    >
                      {ticket.number}
                    </span>
                    <span
                      className="font-bold text-white/90 uppercase"
                      style={{ fontSize: "clamp(0.95rem, 1.8vw, 1.9rem)" }}
                    >
                      {formatWorkstation(
                        ticket.workstation_name,
                        ticket.workstation_code,
                      )}
                    </span>
                  </div>
                  <span
                    className="text-white/60 font-mono"
                    style={{ fontSize: "clamp(0.85rem, 1.4vw, 1.7rem)" }}
                  >
                    {ticket.called_at
                      ? new Date(ticket.called_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="w-[60%] h-full flex flex-col items-center justify-center"
          style={{
            paddingRight: "clamp(0.4rem, 2vw, 2.5rem)",
            paddingBottom: "clamp(0.4rem, 2vh, 2.5rem)",
          }}
        >
          {currentTicket ? (
            <div className={`flex flex-col items-center w-full max-w-2xl transition-all duration-500 ${isCalling ? "scale-105" : ""}`}>
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">
                  Senha
                </h2>
                <div className="text-[12rem] leading-none font-black text-gray-800 tracking-tighter">
                  {currentTicket.number}
                </div>
              </div>

              <div className="w-full space-y-8">
                <div className="bg-white rounded-2xl shadow-lg p-8 border-l-8 border-primary">
                  <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">
                    Local de Atendimento
                  </div>
                  <div className="text-5xl font-bold text-primary flex items-center gap-4">
                    <Monitor className="w-12 h-12" />
                    {formatWorkstation(
                      currentTicket.workstation_name,
                      currentTicket.workstation_code,
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-lg p-8 border-l-8 border-secondary">
                  <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">
                    Profissional
                  </div>
                  <div className="text-4xl font-medium text-gray-800">
                    {currentTicket.doctor_name || "Clínico Geral"}
                  </div>
                </div>
              </div>

              <div
                className={`mt-12 py-4 px-12 bg-yellow-400 text-yellow-900 rounded-full text-2xl font-bold uppercase tracking-widest shadow-lg ${isCalling ? "animate-pulse" : ""}`}
              >
                {currentTicket.status === "in_attendance"
                  ? "Em atendimento"
                  : "Chamando"}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 opacity-60">
              <Monitor className="w-32 h-32 mb-6" />
              <div className="text-4xl font-light">Aguardando chamada...</div>
            </div>
          )}
        </div>
      </div>
    </QueueLayout>
  );
};

export default TVPanel;
