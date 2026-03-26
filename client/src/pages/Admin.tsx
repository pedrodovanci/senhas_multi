import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import {
  LayoutDashboard,
  LogOut,
  Clock,
  Activity,
  BarChart2,
  PieChart,
  AlertTriangle,
  Users,
  // Stethoscope,
} from "lucide-react";
import Logo from "../components/Logo";
import { DoctorsManager } from "../components/DoctorsManager";
import { UsersManager } from "../components/UsersManager";

interface Stats {
  total: number;
  waiting: number;
  attended: number;
  avgWaitTimeMinutes: number;
  ranking: { username: string; count: number }[];
  avgServiceTime: { username: string; avg_min: number }[];
  byType: { type: string; count: number }[];
  missed: number;
}

const Admin: React.FC = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"dashboard" | "doctors" | "users">(
    "dashboard",
  );
  const [stats, setStats] = useState<Stats>({
    total: 0,
    waiting: 0,
    attended: 0,
    avgWaitTimeMinutes: 0,
    ranking: [],
    avgServiceTime: [],
    byType: [],
    missed: 0,
  });

  useEffect(() => {
    if (!user || user.role !== "admin" || !token) {
      navigate("/login");
      return;
    }

    const fetchStats = () => {
      apiFetch(`/api/stats`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch stats");
          return res.json();
        })
        .then((data) => {
          setStats({
            total: data.total || 0,
            waiting: data.waiting || 0,
            attended: data.attended || 0,
            avgWaitTimeMinutes: data.avgWaitTimeMinutes || 0,
            ranking: data.ranking || [],
            avgServiceTime: data.avgServiceTime || [],
            byType: data.byType || [],
            missed: data.missed || 0,
          });
        })
        .catch((err) => console.error("Error fetching stats:", err));
    };

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [user, token, navigate]);

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md flex flex-col hidden md:flex">
        <div className="p-6 border-b border-gray-200">
          <Logo theme="dark" />
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === "dashboard" ? "bg-blue-50 text-primary" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button
            onClick={() => setActiveTab("doctors")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === "doctors" ? "bg-blue-50 text-primary" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <Activity size={20} /> Médicos
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === "users" ? "bg-blue-50 text-primary" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <Users size={20} /> Usuários
          </button>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 w-full rounded-lg font-medium transition-colors"
          >
            <LogOut size={20} /> Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">
              {activeTab === "dashboard"
                ? "Visão Geral"
                : activeTab === "doctors"
                  ? "Médicos"
                  : "Usuários"}
            </h2>
            <p className="text-gray-500">Bem-vindo, {user?.username}</p>
          </div>
          <button onClick={logout} className="md:hidden p-2 text-gray-500">
            <LogOut size={24} />
          </button>
        </header>

        {activeTab === "dashboard" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider">
                    Total Hoje
                  </h3>
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <Activity size={20} />
                  </div>
                </div>
                <div className="text-4xl font-black text-gray-800">
                  {stats.total}
                </div>
                <div className="text-sm text-green-500 mt-2 font-medium">
                  Senhas geradas
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider">
                    Aguardando
                  </h3>
                  <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600">
                    <Clock size={20} />
                  </div>
                </div>
                <div className="text-4xl font-black text-yellow-500">
                  {stats.waiting}
                </div>
                <div className="text-sm text-gray-400 mt-2 font-medium">
                  Pessoas na fila
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider">
                    Tempo Médio
                  </h3>
                  <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                    <Clock size={20} />
                  </div>
                </div>
                <div className="text-4xl font-black text-purple-600">
                  {stats.avgWaitTimeMinutes}{" "}
                  <span className="text-lg text-gray-400 font-bold">min</span>
                </div>
                <div className="text-sm text-gray-400 mt-2 font-medium">
                  Espera estimada
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider">
                    Não Compareceu
                  </h3>
                  <div className="p-2 bg-red-50 rounded-lg text-red-600">
                    <AlertTriangle size={20} />
                  </div>
                </div>
                <div className="text-4xl font-black text-red-600">
                  {stats.missed}
                </div>
                <div className="text-sm text-gray-400 mt-2 font-medium">
                  Senhas perdidas
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Ranking */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <BarChart2 size={20} className="text-primary" /> Ranking de
                  Atendimentos
                </h3>
                <div className="space-y-4">
                  {stats.ranking.map((r, i) => (
                    <div
                      key={r.username}
                      className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${i === 0 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          #{i + 1}
                        </div>
                        <div className="font-bold text-gray-800">
                          {r.username}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-primary bg-blue-50 px-3 py-1 rounded-full">
                        {r.count}
                      </div>
                    </div>
                  ))}
                  {stats.ranking.length === 0 && (
                    <p className="text-gray-400 text-center py-4">
                      Sem dados hoje.
                    </p>
                  )}
                </div>
              </div>

              {/* Tempo Médio por Atendente */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Clock size={20} className="text-primary" /> Tempo Médio de
                  Atendimento
                </h3>
                <div className="space-y-4">
                  {stats.avgServiceTime.map((r) => (
                    <div
                      key={r.username}
                      className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <div className="font-bold text-gray-800">
                        {r.username}
                      </div>
                      <div className="font-mono font-bold text-gray-600">
                        {r.avg_min} min
                      </div>
                    </div>
                  ))}
                  {stats.avgServiceTime.length === 0 && (
                    <p className="text-gray-400 text-center py-4">
                      Sem dados hoje.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Tipos de Senha */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <PieChart size={20} className="text-primary" /> Distribuição
                  por Tipo
                </h3>
                <div className="flex justify-around items-center py-8">
                  {stats.byType.map((t) => (
                    <div key={t.type} className="text-center">
                      <div className="text-5xl font-black text-gray-800 mb-2">
                        {t.count}
                      </div>
                      <div className="text-sm font-bold uppercase text-gray-500 tracking-wider">
                        {t.type}
                      </div>
                    </div>
                  ))}
                  {stats.byType.length === 0 && (
                    <p className="text-gray-400 text-center w-full">
                      Sem dados hoje.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "doctors" && <DoctorsManager />}
        {activeTab === "users" && <UsersManager />}
      </main>
    </div>
  );
};

export default Admin;
