import React, { createContext, useContext, useState } from 'react';
import type { User, Workstation } from '../types';
import { apiFetch } from '../utils/api';

interface AuthContextType {
  user: User | null;
  workstation: Workstation | null;
  token: string | null;
  login: (user: User, token: string, workstation?: Workstation) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser) as User;
    } catch {
      return null;
    }
  });
  const [workstation, setWorkstation] = useState<Workstation | null>(() => {
    const storedWs = localStorage.getItem('workstation');
    if (!storedWs) return null;
    try {
      return JSON.parse(storedWs) as Workstation;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('token');
  });

  const login = (userData: User, authToken: string, wsData?: Workstation) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', authToken);
    
    if (wsData) {
      setWorkstation(wsData);
      localStorage.setItem('workstation', JSON.stringify(wsData));
    }
  };

  const logout = () => {
    const userId = user?.id;
    const workstationId = workstation?.id;
    if (userId && workstationId) {
      void apiFetch('/api/logout', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, workstation_id: workstationId }),
        token,
      }).catch(() => {});
    }
    setUser(null);
    setWorkstation(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('workstation');
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, workstation, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
