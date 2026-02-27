import React, { useState, useEffect } from 'react';
import type { Doctor, Ticket } from '../types';
import { User, CheckCircle, Stethoscope, Scissors } from 'lucide-react';
import Logo from '../components/Logo';

const Reception: React.FC = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [lastTicket, setLastTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticketType, setTicketType] = useState<'consulta' | 'cirurgia'>('consulta');

  useEffect(() => {
    fetch('http://localhost:3000/api/doctors')
      .then(res => res.json())
      .then(data => setDoctors(data));
  }, []);

  const generateTicket = async (doctorId: number) => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          doctor_id: doctorId,
          type: ticketType
        })
      });
      const data = await res.json();
      setLastTicket(data);
      
      // Stub for printing
      console.log('Printing ticket:', data);
      
      // Auto-hide confirmation after 5 seconds
      setTimeout(() => setLastTicket(null), 5000);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="min-h-screen bg-gray-50 p-8 relative print:hidden">
      <div className="absolute top-6 left-6 hidden md:block">
        <Logo theme="dark" />
      </div>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">Recepção - Gerar Senha</h1>
        
        {/* Ticket Type Selection */}
        <div className="flex justify-center mb-12 space-x-6">
          <button
            onClick={() => setTicketType('consulta')}
            className={`flex items-center px-8 py-4 rounded-xl text-xl font-bold transition-all shadow-md ${
              ticketType === 'consulta' 
                ? 'bg-primary text-white scale-105 ring-4 ring-primary/20' 
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Stethoscope className="mr-3 w-6 h-6" />
            CONSULTAS
          </button>
          
          <button
            onClick={() => setTicketType('cirurgia')}
            className={`flex items-center px-8 py-4 rounded-xl text-xl font-bold transition-all shadow-md ${
              ticketType === 'cirurgia' 
                ? 'bg-secondary text-white scale-105 ring-4 ring-secondary/20' 
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Scissors className="mr-3 w-6 h-6" />
            CIRURGIAS
          </button>
        </div>

        {lastTicket && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
            <div className="bg-white p-12 rounded-2xl shadow-2xl text-center max-w-md w-full transform transition-all scale-100">
              <div className="flex justify-center mb-6">
                <CheckCircle className="w-20 h-20 text-green-500 animate-bounce" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">SENHA GERADA</h2>
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
              
              <button 
                onClick={() => {
                    window.print();
                    setTimeout(() => setLastTicket(null), 1000);
                }}
                className="w-full py-4 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold text-lg transition-colors"
              >
                Imprimir e Fechar
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {doctors.map(doctor => (
            <button
              key={doctor.id}
              onClick={() => generateTicket(doctor.id)}
              disabled={loading}
              className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-xl transition-all transform hover:-translate-y-1 border border-gray-100 flex flex-col items-center group relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-2 h-full ${ticketType === 'consulta' ? 'bg-primary' : 'bg-secondary'} transition-colors duration-300`} />
              
              <div className={`p-4 rounded-full mb-4 transition-colors ${
                ticketType === 'consulta' 
                  ? 'bg-primary/10 group-hover:bg-primary/20 text-primary' 
                  : 'bg-secondary/10 group-hover:bg-secondary/20 text-secondary'
              }`}>
                <User className="w-10 h-10" />
              </div>
              
              <h3 className="text-lg font-bold text-gray-800 mb-1 text-center">{doctor.name}</h3>
              <p className="text-gray-500 font-medium text-sm text-center">{doctor.specialization}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
    
    {/* Print Layout */}
    {lastTicket && (
        <div className="hidden print:flex flex-col items-center justify-center p-8 text-center h-screen w-full bg-white text-black">
            <div className="w-full max-w-[300px]">
                <h1 className="text-xl font-bold mb-1">Centro do Cérebro e Coluna</h1>
                <p className="text-xs text-gray-500 mb-4">Gestão de Atendimento</p>
                
                <div className="border-b-2 border-black mb-4"></div>
                
                <div className="text-sm font-bold uppercase mb-2">SENHA</div>
                <div className="text-7xl font-black mb-4 tracking-tighter leading-none">
                    {lastTicket.number}
                </div>
                
                <div className="bg-black text-white px-2 py-1 rounded text-lg font-bold uppercase mb-4 inline-block">
                    {lastTicket.type}
                </div>
                
                <div className="text-sm mb-6 font-mono">
                    {new Date().toLocaleString()}
                </div>
                
                <div className="border-b-2 border-black mb-6"></div>
                
                <p className="text-base font-bold mb-2">Aguarde ser chamado no painel.</p>
                <p className="text-xs">Obrigado pela preferência.</p>
            </div>
        </div>
    )}
    </>
  );
};

export default Reception;
