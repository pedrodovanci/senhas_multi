import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import type { Workstation } from '../types';
import { User as UserIcon, Lock, Monitor, ArrowRight } from 'lucide-react';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [workstationId, setWorkstationId] = useState('');
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const { login } = useAuth();
  const navigate = useNavigate();

  const selectedWs = workstations.find(ws => ws.id === Number(workstationId));
  const isRetirada = !!selectedWs && (selectedWs.code === 'RET01' || selectedWs.name.toLowerCase().includes('retirada'));

  useEffect(() => {
    fetch(`${API_URL}/api/workstations`)
      .then(res => res.json())
      .then(data => setWorkstations(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRetirada) {
        if (!workstationId) {
          alert('Selecione o posto de trabalho para retirada.');
          return;
        }

        const res = await fetch(`${API_URL}/api/totem-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workstation_id: workstationId })
        });
        const data = await res.json();

        if (data.success) {
          login(data.user, data.token, selectedWs);
          navigate('/recepcao/consultas');
        } else {
          alert('Falha no login: ' + data.message);
        }
        return;
      }

      const body: { username: string; password: string; workstation_id?: string } = { username, password };
      if (workstationId) body.workstation_id = workstationId;

      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (data.success) {
        login(data.user, data.token, selectedWs);
        
        if (selectedWs?.code === 'RET01' || selectedWs?.name?.toLowerCase().includes('retirada')) {
            navigate('/recepcao/consultas');
        } else if (data.user.role === 'admin') {
            navigate('/admin');
        } else {
            navigate('/atendente');
        }
      } else {
        alert('Falha no login: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao realizar login');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 relative">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo-ccc.png" alt="Centro do Cérebro e Coluna" className="h-32 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800">Gestão de Atendimento</h1>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* 1. Posto de Trabalho */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Posto de Trabalho (Opcional para Admin)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Monitor className="h-5 w-5 text-gray-400" />
              </div>
              <select
                value={workstationId}
                onChange={(e) => setWorkstationId(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
              >
                <option value="">Selecione seu Guichê/Sala</option>
                {workstations.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Usuário e Senha (Condicional) */}
          {!isRetirada && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                    placeholder="Seu usuário"
                    required={!isRetirada}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                    placeholder="Sua senha"
                    required={!isRetirada}
                  />
                </div>
              </div>
            </>
          )}

          {/* Feedback Visual para Retirada de Senhas */}
          {isRetirada && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-center animate-in fade-in duration-300">
              <p className="text-blue-800 font-medium">Modo de Retirada de Senhas</p>
              <p className="text-blue-600 text-sm mt-1">Acesso liberado. Clique abaixo para iniciar.</p>
            </div>
          )}
          
          <button
            type="submit"
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isRetirada 
                ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' 
                : 'bg-primary hover:bg-opacity-90 focus:ring-primary'
            }`}
          >
            {isRetirada ? (
              <span className="flex items-center">
                ACESSAR RETIRADA DE SENHAS <ArrowRight className="ml-2 w-5 h-5" />
              </span>
            ) : (
              "ENTRAR NO SISTEMA"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
