import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { useSearchParams } from "react-router-dom";
import type { Ticket } from "../types";
import { Monitor } from "lucide-react";
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

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

    const fetchState = async () => {
      try {
        const histRes = await apiFetch(`/api/tickets/history`);
        const histData: Ticket[] = await histRes.json();

        if (histData.length > 0) {
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
      const handleReconnected = () => {
        apiFetch(`/api/tickets/history`)
          .then(r => r.json())
          .then((d: Ticket[]) => {
            if (Array.isArray(d) && d.length > 0) setCurrentTicket(d[0]);
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
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "10vh",
          width: "50%",
          height: "90vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        {currentTicket ? (
          <div className="flex flex-col items-center w-full max-w-2xl animate-in fade-in zoom-in duration-500">
            
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
                  {currentTicket.workstation_name || "GUICHÊ --"}
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
            
            <div className="mt-12 py-4 px-12 bg-yellow-400 text-yellow-900 rounded-full text-2xl font-bold uppercase tracking-widest animate-pulse shadow-lg">
              Chamando
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400 opacity-60">
            <Monitor className="w-32 h-32 mb-6" />
            <div className="text-4xl font-light">Aguardando chamada...</div>
          </div>
        )}
      </div>
    </QueueLayout>
  );
};

export default TVPanel;
