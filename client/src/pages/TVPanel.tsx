import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useSearchParams } from 'react-router-dom';
import type { Ticket } from '../types';
import { Monitor, Clock, ArrowRight } from 'lucide-react';
import Logo from '../components/Logo';

const TVPanel: React.FC = () => {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('type'); // consulta | cirurgia
  const filterDoctor = searchParams.get('doctor_id');

  const socketContext = useSocket();
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [history, setHistory] = useState<Ticket[]>([]);
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
    audioRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    
    const fetchState = async () => {
        try {
            // Fetch history first
            const histRes = await fetch('http://localhost:3000/api/tickets/history');
            const histData: Ticket[] = await histRes.json();
            
            if (histData.length > 0) {
                // The most recent one is the current one being displayed
                const current = histData[0];
                setCurrentTicket(current);
                // History is the rest
                setHistory(histData.slice(1, 6));
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
          audioRef.current.play().catch(e => console.log('Audio play failed (user interaction needed?):', e));
        }

        setCurrentTicket(prev => {
          // If it's the same ticket, do nothing
          if (prev && prev.id === ticket.id) return prev;

          // If there was a previous ticket, move it to history if it's not already there
          if (prev) {
            setHistory(h => {
              const alreadyInHistory = h.some(t => t.id === prev.id);
              if (alreadyInHistory) return h;
              return [prev, ...h].slice(0, 5);
            });
          }
          return ticket;
        });
      };

      const handleUpdated = (ticket: Ticket) => {
        // Update current ticket if it matches
        setCurrentTicket(prev => {
          if (prev && prev.id === ticket.id) {
            return ticket;
          }
          return prev;
        });

        // Update history if it contains the ticket
        setHistory(prevHistory => 
          prevHistory.map(t => t.id === ticket.id ? ticket : t)
        );
      };

      socketContext.on('ticket:calling', handleCalling);
      socketContext.on('ticket:started', handleUpdated);
      socketContext.on('ticket:finished', handleUpdated);

      return () => {
        socketContext.off('ticket:calling', handleCalling);
        socketContext.off('ticket:started', handleUpdated);
        socketContext.off('ticket:finished', handleUpdated);
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
                <h1 className="text-3xl font-bold tracking-tight text-white">Centro do Cérebro e Coluna</h1>
                <p className="text-gray-400 text-lg">Sistema de Atendimento</p>
            </div>
        </div>
        
        <div className="flex items-center gap-6">
            <div className="text-right">
                <div className="text-5xl font-mono font-bold text-white tracking-widest">
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-gray-400 uppercase font-medium tracking-widest text-sm text-right mt-1">
                    {currentTime.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex gap-8 p-8">
        
        {/* Left: Main Call Display (70%) */}
        <div className="flex-[3] flex flex-col justify-center">
            {currentTicket ? (
                <div className="flex flex-col items-center animate-in zoom-in duration-500">
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-12 w-full max-w-4xl text-center shadow-2xl relative overflow-hidden group">
                        
                        {/* Status Badge */}
                        <div className={`absolute top-0 left-0 w-full py-4 font-bold text-xl uppercase tracking-[0.5em] ${
                            currentTicket.status === 'calling' ? 'bg-yellow-500 text-yellow-900 animate-pulse' :
                            currentTicket.status === 'in_attendance' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
                        }`}>
                            {currentTicket.status === 'calling' ? 'CHAMANDO' : 
                             currentTicket.status === 'in_attendance' ? 'EM ATENDIMENTO' : 
                             currentTicket.status === 'finished' ? 'ATENDIMENTO FINALIZADO' : 'AGUARDE'}
                        </div>
                        
                        <div className="mt-16 mb-8">
                            <span className="inline-block px-6 py-2 rounded-full bg-white/10 text-gray-300 font-medium uppercase tracking-widest text-sm mb-6 border border-white/10">
                                SENHA
                            </span>
                            <div className="text-[14rem] leading-none font-black text-white tracking-tighter drop-shadow-2xl">
                                {currentTicket.number}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-8 border-t border-white/10 pt-8 mt-8">
                            <div>
                                <div className="text-gray-400 uppercase tracking-widest text-sm font-bold mb-2">Local de Atendimento</div>
                                <div className="text-6xl font-bold text-primary flex items-center justify-center gap-4">
                                    <Monitor className="w-12 h-12" />
                                    {currentTicket.workstation_name || 'GUICHÊ --'}
                                </div>
                            </div>
                            
                            <div className="bg-white/5 rounded-xl p-6">
                                <div className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-1">Profissional</div>
                                <div className="text-3xl font-medium text-white">
                                    {currentTicket.doctor_name || 'Clínico Geral'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center text-gray-600 opacity-50">
                    <Monitor className="w-32 h-32 mb-6" />
                    <div className="text-4xl font-light">Aguardando chamada...</div>
                </div>
            )}
        </div>

        {/* Right: History Sidebar (30%) */}
        <div className="flex-1 bg-gray-800/50 backdrop-blur-md rounded-3xl border border-white/10 p-6 flex flex-col">
            <h2 className="text-xl font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-3 border-b border-white/10 pb-4">
                <Clock className="w-6 h-6 text-secondary" />
                Últimas Chamadas
            </h2>
            
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                {history.length > 0 ? (
                    history.map((ticket, idx) => (
                        <div key={`${ticket.id}-${idx}`} className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-4 border-l-4 border-secondary flex items-center justify-between group">
                            <div>
                                <div className="text-3xl font-bold text-white group-hover:text-secondary transition-colors">{ticket.number}</div>
                                <div className="text-gray-400 text-sm">{ticket.workstation_name}</div>
                            </div>
                            <ArrowRight className="text-gray-600 group-hover:text-white transition-colors" />
                        </div>
                    ))
                ) : (
                    <div className="text-center text-gray-500 py-10">
                        Histórico vazio
                    </div>
                )}
            </div>
            
            <div className="mt-6 pt-6 border-t border-white/10">
                <div className="bg-gradient-to-r from-primary/20 to-secondary/20 rounded-xl p-4 text-center">
                    <p className="text-gray-300 text-sm">Por favor, aguarde sua vez.</p>
                </div>
            </div>
        </div>

      </main>
      
      {/* Footer Ticker */}
      <footer className="bg-primary text-white py-3 overflow-hidden whitespace-nowrap relative">
          <div className="animate-marquee inline-block px-4 font-bold tracking-wider">
              BEM-VINDO AO CENTRO DO CÉREBRO E COLUNA • HORÁRIO DE ATENDIMENTO: 08:00 ÀS 18:00 • EM CASO DE DÚVIDAS, PROCURE A RECEPÇÃO • MANTENHA O SILÊNCIO
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
