import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import DoctorQueueCard from './DoctorQueueCard';
import { Users } from 'lucide-react';
import { sortQueues } from '../utils/queueSorter';
import type { QueueStat } from '../types';

interface DoctorQueueGridProps {
    onCall: (doctorId: number | null) => void;
    disabled: boolean;
    refreshTrigger: number;
    queueSector?: string;
}

const DoctorQueueGrid: React.FC<DoctorQueueGridProps> = ({ onCall, disabled, refreshTrigger, queueSector }) => {
    const [stats, setStats] = useState<QueueStat[]>([]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const queryParams = new URLSearchParams();
                if (queueSector) {
                    queryParams.append('queue_sector', queueSector);
                }
                const res = await fetch(`${API_URL}/api/tickets/waiting-stats?${queryParams.toString()}`);
                const data = await res.json();
                if (Array.isArray(data)) {
                    // FILTRAR: mostrar apenas médicos com pelo menos 1 senha aguardando
                    const filtered = data.filter((s: QueueStat) => s.count > 0);
                    // ORDENAR: usando o algoritmo de reordenação dinâmica
                    const sorted = sortQueues(filtered);
                    setStats(sorted);
                } else {
                    console.error("Invalid stats data:", data);
                    setStats([]);
                }
            } catch (error) {
                console.error("Error fetching queue stats:", error);
            }
        };

        fetchStats();

        // Atualizar a cada 30 segundos para garantir ordenação correta mesmo sem eventos de socket
        const intervalId = setInterval(fetchStats, 30000);

        return () => clearInterval(intervalId);
    }, [refreshTrigger, queueSector]);

    // Estado vazio — nenhuma senha aguardando
    if (stats.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-24 text-center">
                <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 max-w-sm">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhum paciente aguardando</h3>
                    <p className="text-gray-300 text-sm">Os cards aparecerão aqui conforme as senhas forem geradas.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-2 overflow-y-auto">
            {stats.map((stat) => (
                <DoctorQueueCard
                    key={stat.doctor_id || 'support'}
                    doctorName={stat.doctor_name}
                    waitingCount={stat.count}
                    oldestTicketTime={stat.oldest_created_at}
                    onCall={() => onCall(stat.doctor_id)}
                    disabled={disabled}
                />
            ))}
        </div>
    );
};

export default DoctorQueueGrid;