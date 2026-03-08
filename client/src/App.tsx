import React, { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SocketProvider } from "./contexts/SocketContext";
import { ToastProvider } from "./contexts/ToastContext";
import Login from "./pages/Login";
import Reception from "./pages/Reception";
import Attendant from "./pages/Attendant";
import TVPanel from "./pages/TVPanel";
import Display from "./pages/Display";
import Admin from "./pages/Admin";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-lg w-full">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Algo deu errado.
            </h1>
            <p className="text-gray-700 mb-4">
              Ocorreu um erro inesperado na aplicação.
            </p>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-64 text-red-800">
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <BrowserRouter
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/recepcao/consultas" element={<Reception />} />
                <Route path="/atendente" element={<Attendant />} />
                <Route path="/painel" element={<TVPanel />} />
                <Route path="/display" element={<Display />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/" element={<Navigate to="/login" replace />} />
              </Routes>
            </BrowserRouter>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
