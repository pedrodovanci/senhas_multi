import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Workstation } from '../types';
import { Brain, User as UserIcon, Lock, Monitor } from 'lucide-react';
import Logo from '../components/Logo';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [workstationId, setWorkstationId] = useState('');
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('http://localhost:3000/api/workstations')
      .then(res => res.json())
      .then(data => setWorkstations(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if (data.success) {
        const selectedWs = workstations.find(ws => ws.id === Number(workstationId));
        login(data.user, selectedWs);
        if (data.user.role === 'admin') {
            navigate('/admin');
        } else {
            navigate('/atendente');
        }
      } else {
        alert('Login failed: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Login error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 relative">
      <div className="absolute top-6 left-6 hidden md:block">
        <Logo theme="dark" />
      </div>
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Brain className="w-12 h-12 text-primary mb-2" />
          <h1 className="text-2xl font-bold text-gray-800">Centro do Cérebro e Coluna</h1>
          <p className="text-gray-500">Gestão de Atendimento</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
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
                required
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
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Posto de Trabalho</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Monitor className="h-5 w-5 text-gray-400" />
              </div>
              <select
                value={workstationId}
                onChange={(e) => setWorkstationId(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                required
              >
                <option value="">Selecione seu Guichê/Sala</option>
                {workstations.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
          >
            ENTRAR NO SISTEMA
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
