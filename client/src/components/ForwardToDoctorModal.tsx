import React, { useState, useEffect } from "react";
import { BaseModal } from "./BaseModal";
import type { Doctor } from "../types";
import { Send } from "lucide-react";

interface ForwardToDoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctors: Doctor[];
  onConfirm: (doctorId: number, patientName: string) => Promise<boolean>;
}

export const ForwardToDoctorModal: React.FC<ForwardToDoctorModalProps> = ({
  isOpen,
  onClose,
  doctors,
  onConfirm,
}) => {
  const [doctorId, setDoctorId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDoctorId(doctors[0] ? String(doctors[0].id) : "");
      setPatientName("");
    }
  }, [isOpen, doctors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorId || !patientName.trim()) return;

    setSubmitting(true);
    try {
      const success = await onConfirm(Number(doctorId), patientName.trim());
      if (success) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Encaminhar para médico">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Médico
          </label>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            required
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
          >
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do paciente
          </label>
          <input
            type="text"
            required
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            placeholder="Nome completo"
          />
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !doctorId || !patientName.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Send size={16} />
            {submitting ? "Enviando..." : "Encaminhar"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
};
