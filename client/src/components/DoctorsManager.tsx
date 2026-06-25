import React, { useState, useEffect } from "react";
import type { Doctor } from "../types";
import { BaseModal } from "./BaseModal";
import { Edit, Trash, Plus, KeyRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { apiFetch } from "../utils/api";

export const DoctorsManager: React.FC = () => {
  const { token, logout } = useAuth();
  const socketContext = useSocket();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    specialization: "",
    prefix: "",
    room: "",
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) fetchDoctors();
  }, [token]);

  useEffect(() => {
    if (!socketContext || !socketContext.socket) return;

    const handleCreated = (doctor: Doctor) => {
      setDoctors((prev) =>
        prev.some((d) => d.id === doctor.id) ? prev : [...prev, doctor],
      );
    };
    const handleUpdated = (doctor: Doctor) => {
      setDoctors((prev) =>
        prev.map((d) => (d.id === doctor.id ? doctor : d)),
      );
    };
    const handleDeleted = (payload: { id: number }) => {
      setDoctors((prev) => prev.filter((d) => d.id !== payload.id));
    };
    const handleReconnected = () => fetchDoctors();

    socketContext.on("doctor:created", handleCreated);
    socketContext.on("doctor:updated", handleUpdated);
    socketContext.on("doctor:deleted", handleDeleted);
    socketContext.on("ws:reconnected", handleReconnected);
    return () => {
      socketContext.off("doctor:created", handleCreated);
      socketContext.off("doctor:updated", handleUpdated);
      socketContext.off("doctor:deleted", handleDeleted);
      socketContext.off("ws:reconnected", handleReconnected);
    };
  }, [socketContext]);

  const fetchDoctors = async () => {
    try {
      const res = await apiFetch(`/api/doctors`, {
        token,
        onUnauthorized: logout,
      });
      if (!res.ok) {
        throw new Error("Falha ao carregar médicos");
      }
      const data = await res.json();
      setDoctors(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        specialization: formData.specialization,
        prefix: formData.prefix,
        room: formData.room,
        username: formData.username,
        password: formData.password,
      };

      if (editingDoctor) {
        const res = await apiFetch(`/api/doctors/${editingDoctor.id}`, {
          token,
          onUnauthorized: logout,
          method: "PUT",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const message =
            data?.error || data?.message || "Erro ao salvar médico";
          alert(message);
          return;
        }
      } else {
        const res = await apiFetch(`/api/doctors`, {
          token,
          onUnauthorized: logout,
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const message =
            data?.error || data?.message || "Erro ao salvar médico";
          alert(message);
          return;
        }
      }
      await fetchDoctors();
      closeModal();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar médico");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este médico?")) return;
    try {
      const res = await apiFetch(`/api/doctors/${id}`, {
        token,
        onUnauthorized: logout,
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || data?.message || "Erro ao excluir médico";
        alert(message);
        return;
      }
      await fetchDoctors();
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir médico");
    }
  };

  const openModal = (doctor?: Doctor) => {
    if (doctor) {
      setEditingDoctor(doctor);
      setFormData({
        name: doctor.name,
        specialization: doctor.specialization,
        prefix: doctor.prefix || "",
        room: doctor.room || "",
        username: doctor.medico_username || "",
        password: "",
      });
    } else {
      setEditingDoctor(null);
      setFormData({
        name: "",
        specialization: "",
        prefix: "",
        room: "",
        username: "",
        password: "",
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDoctor(null);
    setFormData({
      name: "",
      specialization: "",
      prefix: "",
      room: "",
      username: "",
      password: "",
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Gerenciar Médicos</h2>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={20} /> Novo Médico
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-4 text-sm font-semibold text-gray-600">Nome</th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Prefixo
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Especialidade
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Sala
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Login
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600 text-right">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((doctor) => (
              <tr
                key={doctor.id}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="p-4 font-medium text-gray-800">{doctor.name}</td>
                <td className="p-4 font-mono text-gray-800">
                  {(doctor.prefix || "").toUpperCase()}
                </td>
                <td className="p-4 text-gray-600">{doctor.specialization}</td>
                <td className="p-4 text-gray-600">{doctor.room || "—"}</td>
                <td className="p-4">
                  {doctor.medico_username ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700">
                      <KeyRound size={12} /> {doctor.medico_username}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-500">
                      Sem login
                    </span>
                  )}
                </td>
                <td className="p-4 flex justify-end gap-2">
                  <button
                    onClick={() => openModal(doctor)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(doctor.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {doctors.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400">
                  Nenhum médico cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BaseModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingDoctor ? "Editar Médico" : "Novo Médico"}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prefixo (2–4 caracteres)
            </label>
            <input
              type="text"
              required
              value={formData.prefix}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                })
              }
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Especialidade
            </label>
            <input
              type="text"
              required
              value={formData.specialization}
              onChange={(e) =>
                setFormData({ ...formData, specialization: e.target.value })
              }
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sala / Consultório
            </label>
            <input
              type="text"
              value={formData.room}
              onChange={(e) =>
                setFormData({ ...formData, room: e.target.value })
              }
              placeholder="Ex.: Sala 3"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 mb-3">
              Login para chamar pacientes pelo terminal (opcional). Deixe em
              branco se este médico não vai usar a fila.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome de usuário
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha{" "}
                  {editingDoctor?.medico_username && (
                    <span className="text-gray-400 font-normal">
                      (deixe em branco para manter a atual)
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </BaseModal>
    </div>
  );
};
