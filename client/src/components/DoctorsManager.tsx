import React, { useState, useEffect } from "react";
import type { Doctor } from "../types";
import { BaseModal } from "./BaseModal";
import { Edit, Trash, Plus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { API_URL } from "../config";

export const DoctorsManager: React.FC = () => {
  const { token } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [formData, setFormData] = useState({ name: "", specialization: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) fetchDoctors();
  }, [token]);

  const fetchDoctors = async () => {
    try {
      const res = await fetch(`${API_URL}/api/doctors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDoctors(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingDoctor) {
        await fetch(`${API_URL}/api/doctors/${editingDoctor.id}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(formData),
        });
      } else {
        await fetch(`${API_URL}/api/doctors`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(formData),
        });
      }
      fetchDoctors();
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
      await fetch(`${API_URL}/api/doctors/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDoctors();
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir médico");
    }
  };

  const openModal = (doctor?: Doctor) => {
    if (doctor) {
      setEditingDoctor(doctor);
      setFormData({ name: doctor.name, specialization: doctor.specialization });
    } else {
      setEditingDoctor(null);
      setFormData({ name: "", specialization: "" });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDoctor(null);
    setFormData({ name: "", specialization: "" });
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
                Especialidade
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
                <td className="p-4 text-gray-600">{doctor.specialization}</td>
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
                <td colSpan={3} className="p-8 text-center text-gray-400">
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
