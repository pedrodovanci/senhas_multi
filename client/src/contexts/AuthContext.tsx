import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Workstation } from '../types';

interface AuthContextType {
  user: User | null;
  workstation: Workstation | null;
  login: (user: User, workstation?: Workstation) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [workstation, setWorkstation] = useState<Workstation | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedWs = localStorage.getItem('workstation');
    if (storedUser) setUser(JSON.parse(storedUser));
    if (storedWs) setWorkstation(JSON.parse(storedWs));
  }, []);

  const login = (userData: User, wsData?: Workstation) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    if (wsData) {
      setWorkstation(wsData);
      localStorage.setItem('workstation', JSON.stringify(wsData));
    }
  };

  const logout = () => {
    setUser(null);
    setWorkstation(null);
    localStorage.removeItem('user');
    localStorage.removeItem('workstation');
  };

  return (
    <AuthContext.Provider value={{ user, workstation, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
