import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Workstation } from '../types';

interface AuthContextType {
  user: User | null;
  workstation: Workstation | null;
  token: string | null;
  login: (user: User, token: string, workstation?: Workstation) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [workstation, setWorkstation] = useState<Workstation | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedWs = localStorage.getItem('workstation');
    const storedToken = localStorage.getItem('token');
    
    if (storedUser) setUser(JSON.parse(storedUser));
    if (storedWs) setWorkstation(JSON.parse(storedWs));
    if (storedToken) setToken(storedToken);
  }, []);

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
