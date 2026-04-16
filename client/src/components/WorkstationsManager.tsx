import React, { useEffect, useMemo, useState } from "react";
import type { Workstation } from "../types";
import { BaseModal } from "./BaseModal";
import { Check, Edit, Plus, X as XIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../utils/api";

export const WorkstationsManager: React.FC = () => {
  const { token } = useAuth();
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Workstation | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(false);

  const sorted = useMemo(() => {
    return [...workstations].sort((a, b) =>
      String(a.code || "").localeCompare(String(b.code || ""), "pt-BR", {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [workstations]);

  useEffect(() => {
    if (token) fetchWorkstations();
  }, [token]);

  const fetchWorkstations = async () => {
    try {
      const res = await apiFetch("/api/admin/workstations", { token });
      const data = await res.json();
      setWorkstations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const openModal = (ws?: Workstation) => {
    if (ws) {
      setEditing(ws);
      setFormData({
        code: ws.code || "",
        name: ws.name || "",
        is_active: ws.is_active !== undefined ? !!ws.is_active : true,
      });
    } else {
      setEditing(null);
      setFormData({ code: "", name: "", is_active: true });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setFormData({ code: "", name: "", is_active: true });
  };

  const toggleActive = async (ws: Workstation) => {
    try {
      await apiFetch(`/api/admin/workstations/${ws.id}`, {
        token,
        method: "PUT",
        body: JSON.stringify({ is_active: !(ws.is_active ?? true) }),
      });
      fetchWorkstations();
    } catch (error) {
      console.error(error);
      alert("Erro ao atualizar guichê");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/workstations/${editing.id}`, {
          token,
          method: "PUT",
          body: JSON.stringify({
            name: formData.name,
            is_active: formData.is_active,
          }),
        });
      } else {
        await apiFetch(`/api/admin/workstations`, {
          token,
          method: "POST",
          body: JSON.stringify({
            code: formData.code,
            name: formData.name,
            is_active: formData.is_active,
          }),
        });
      }
      fetchWorkstations();
      closeModal();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar guichê");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Gerenciar Guichês</h2>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={20} /> Novo Guichê
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Código
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600">Nome</th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Status
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600">
                Ocupação
              </th>
              <th className="p-4 text-sm font-semibold text-gray-600 text-right">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ws) => {
              const active = ws.is_active !== undefined ? !!ws.is_active : true;
              const occupied = !!ws.current_user_id;
              return (
                <tr
                  key={ws.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <td className="p-4 font-mono text-gray-800">{ws.code}</td>
                  <td className="p-4 font-medium text-gray-800">{ws.name}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {active ? <Check size={12} /> : <XIcon size={12} />}
                      {active ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${occupied ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}
                    >
                      {occupied ? "OCUPADO" : "LIVRE"}
                    </span>
                  </td>
                  <td className="p-4 flex justify-end gap-2">
                    <button
                      onClick={() => openModal(ws)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => toggleActive(ws)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
                      disabled={occupied && active}
                      title={
                        occupied && active
                          ? "Não é possível desativar um guichê ocupado."
                          : active
                            ? "Desativar"
                            : "Ativar"
                      }
                    >
                      {active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  Nenhum guichê cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BaseModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editing ? "Editar Guichê" : "Novo Guichê"}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código
            </label>
            <input
              type="text"
              required
              value={formData.code}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                })
              }
              disabled={!!editing}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="G01"
            />
          </div>

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
              placeholder="Guichê 01"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="ws-active"
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="h-4 w-4"
            />
            <label htmlFor="ws-active" className="text-sm text-gray-700">
              Ativo (aparece no login)
            </label>
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

