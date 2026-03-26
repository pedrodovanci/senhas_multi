import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { useSearchParams } from "react-router-dom";
import { DoorOpen, History, Stethoscope } from "lucide-react";
import { apiFetch } from "../utils/api";
import { API_URL } from "../config";
import ConnectionStatus from "../components/ConnectionStatus";
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);
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

    apiFetch(`/api/tickets/history?limit=7`)
      .then((res) => {
        console.log("Display history response status:", res.status);
        return res.json();
      })
      .then((data: CalledTicket[]) => {
        console.log("Display history data:", data);
        if (Array.isArray(data)) setHistory(data);
      })
      .catch((err) => console.error("Error fetching history:", err));

    apiFetch(`/api/tickets?status=calling`)
      .then((res) => {
        console.log("Display calling response status:", res.status);
        return res.json();
      })
      .then((data: CalledTicket[]) => {
        console.log("Display calling data:", data);
        if (Array.isArray(data) && data.length > 0) {
          setCurrentTicket(data[0]);
        } else {
          apiFetch(`/api/tickets/history?limit=1`)
            .then((r) => r.json())
            .then((d) => {
              console.log("Display fallback history data:", d);
              if (Array.isArray(d) && d.length > 0) {
                setCurrentTicket(d[0]);
              }
            });
        }
      })
      .catch((err) => console.error("Error fetching calling:", err));
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
      const handleReconnected = () => {
        apiFetch(`/api/tickets/history?limit=7`)
          .then((res) => res.json())
          .then((data: CalledTicket[]) => {
            if (Array.isArray(data)) setHistory(data);
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

  const formatWorkstation = (name?: string, code?: string): string => {
    if (name) return name.toUpperCase();
    const number = code?.replace(/[^0-9]/g, "") ?? "";
    return `GUICHÊ ${number}`;
  };

  const headerContent = (
    <div
      className="w-full h-full"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        paddingLeft: "clamp(0.5rem, 2vw, 3rem)",
        paddingRight: "clamp(0.5rem, 2vw, 3rem)",
        overflow: "hidden",
        height: "100%",
      }}
    >
      <div />
      <img
        src="/logo-ccc.png"
        alt="Logo"
        className="object-contain justify-self-center"
        style={{
          height: "clamp(2.5rem, 7vh, 8rem)",
          maxHeight: "100%",
        }}
      />
      <div className="text-right justify-self-end" style={{ lineHeight: 1 }}>
        <div
          className="font-mono font-bold text-gray-800"
          style={{ fontSize: "clamp(1rem, 2.6vw, 2.6rem)" }}
        >
          {currentTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div
          className="text-gray-600 font-medium uppercase"
          style={{
            fontSize: "clamp(0.8rem, 1.4vw, 1.6rem)",
            marginTop: "clamp(0.2rem, 0.5vw, 0.6rem)",
          }}
        >
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
          className="fixed z-50 flex items-center bg-yellow-400 text-yellow-900 rounded-full shadow-lg font-bold"
          style={{
            top: "clamp(0.5rem, 1.2vw, 1.5rem)",
            right: "clamp(0.5rem, 1.2vw, 1.5rem)",
            paddingLeft: "clamp(0.5rem, 1.4vw, 2rem)",
            paddingRight: "clamp(0.5rem, 1.4vw, 2rem)",
            paddingTop: "clamp(0.3rem, 0.8vw, 1rem)",
            paddingBottom: "clamp(0.3rem, 0.8vw, 1rem)",
            gap: "clamp(0.25rem, 0.8vw, 1rem)",
            fontSize: "clamp(0.9rem, 1.2vw, 1.3rem)",
          }}
        >
          🔇 Clique para ativar o som
        </button>
      )}
      <ConnectionStatus />
      <div className="w-full h-full flex relative">
        {/* Left Section (History) - Overlays the green shapes */}
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
        <div
          className="w-[60%] h-full flex flex-col items-center justify-center"
          style={{
            paddingRight: "clamp(0.4rem, 2vw, 2.5rem)",
            paddingBottom: "clamp(0.4rem, 2vh, 2.5rem)",
          }}
        >
          {currentTicket ? (
            <div
              className={`flex flex-col items-center w-full transition-all duration-500 ${isCalling ? "scale-105" : ""}`}
              style={{ maxWidth: "clamp(26rem, 52vw, 72rem)" }}
            >
              <div className="text-center" style={{ marginBottom: "clamp(0.6rem, 2vh, 2.5rem)" }}>
                <h2
                  className="font-bold text-gray-500 uppercase"
                  style={{
                    fontSize: "clamp(1.2rem, 2.4vw, 3rem)",
                    letterSpacing: "0.2em",
                    marginBottom: "clamp(0.4rem, 1vw, 1.1rem)",
                  }}
                >
                  Senha Atual
                </h2>
                <div
                  className="leading-none font-black text-gray-800 tracking-tighter drop-shadow-lg"
                  style={{
                    fontSize: "clamp(3.5rem, 14vmin, 18rem)",
                  }}
                >
                  {currentTicket.number}
                </div>
              </div>

              <div
                className="w-full"
                style={{
                  rowGap: "clamp(0.6rem, 1.4vh, 1.8rem)",
                  display: "grid",
                }}
              >
                <div
                  className="bg-white shadow-xl border-l-8 border-[#65845f]"
                  style={{
                    padding: "clamp(0.6rem, 1.4vw, 1.8rem)",
                    borderRadius: "clamp(0.5rem, 1vw, 1.25rem)",
                  }}
                >
                  <div
                    className="text-gray-400 uppercase tracking-widest font-bold"
                    style={{
                      fontSize: "clamp(0.85rem, 1.2vw, 1.25rem)",
                      marginBottom: "clamp(0.35rem, 0.8vw, 0.8rem)",
                    }}
                  >
                    Local de Atendimento
                  </div>
                  <div
                    className="font-bold text-[#65845f] flex items-center"
                    style={{
                      fontSize: "clamp(1.4rem, 3.4vw, 4.5rem)",
                      gap: "clamp(0.5rem, 1.2vw, 1.2rem)",
                      whiteSpace: "nowrap",
                      flexWrap: "nowrap",
                      lineHeight: 1,
                    }}
                  >
                    <DoorOpen
                      className=""
                      style={{
                        width: "clamp(1.3rem, 3.2vw, 4.5rem)",
                        height: "clamp(1.3rem, 3.2vw, 4.5rem)",
                        flex: "0 0 auto",
                      }}
                    />
                    <span style={{ whiteSpace: "nowrap" }}>
                      {formatWorkstation(
                        currentTicket.workstation_name,
                        currentTicket.workstation_code,
                      )}
                    </span>
                  </div>
                </div>

                {currentTicket.doctor_name && (
                  <div
                    className="bg-white shadow-xl border-l-8 border-[#7f8f7c]"
                    style={{
                      padding: "clamp(0.6rem, 1.4vw, 1.8rem)",
                      borderRadius: "clamp(0.5rem, 1vw, 1.25rem)",
                    }}
                  >
                    <div
                      className="text-gray-400 uppercase tracking-widest font-bold"
                      style={{
                        fontSize: "clamp(0.85rem, 1.2vw, 1.25rem)",
                        marginBottom: "clamp(0.35rem, 0.8vw, 0.8rem)",
                      }}
                    >
                      Profissional
                    </div>
                    <div
                      className="font-medium text-gray-800 flex items-center"
                      style={{
                        fontSize: "clamp(1.35rem, 3vw, 4.2rem)",
                        gap: "clamp(0.5rem, 1.2vw, 1.2rem)",
                        lineHeight: 1.1,
                      }}
                    >
                      <Stethoscope
                        className="text-gray-400"
                        style={{
                          width: "clamp(1.2rem, 2.8vw, 4.2rem)",
                          height: "clamp(1.2rem, 2.8vw, 4.2rem)",
                          flex: "0 0 auto",
                        }}
                      />
                      {currentTicket.doctor_name}
                    </div>
                  </div>
                )}
              </div>

              {isCalling && (
                <div
                  className="bg-yellow-400 text-yellow-900 rounded-full font-bold uppercase tracking-widest animate-pulse shadow-lg"
                  style={{
                    marginTop: "clamp(0.6rem, 2vh, 2.5rem)",
                    paddingTop: "clamp(0.35rem, 0.8vw, 1rem)",
                    paddingBottom: "clamp(0.35rem, 0.8vw, 1rem)",
                    paddingLeft: "clamp(0.7rem, 2vw, 3rem)",
                    paddingRight: "clamp(0.7rem, 2vw, 3rem)",
                    fontSize: "clamp(1.1rem, 2.2vw, 3.2rem)",
                  }}
                >
                  Chamando
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 opacity-60">
              <DoorOpen
                style={{
                  width: "clamp(4rem, 8vmin, 10rem)",
                  height: "clamp(4rem, 8vmin, 10rem)",
                  marginBottom: "clamp(0.5rem, 1.5vw, 2rem)",
                }}
              />
              <div
                className="font-light"
                style={{ fontSize: "clamp(1.4rem, 3.2vw, 4rem)" }}
              >
                Aguardando chamada...
              </div>
            </div>
          )}
        </div>
      </div>
    </QueueLayout>
  );
};

export default Display;
