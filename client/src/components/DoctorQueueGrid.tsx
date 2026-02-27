import React, { useEffect, useState } from 'react';
import DoctorQueueCard from './DoctorQueueCard';

interface DoctorQueueGridProps {
    onCall: (doctorId: number | null) => void;
    disabled: boolean;
    refreshTrigger: number;
}

interface QueueStat {
    doctor_id: number | null;
    doctor_name: string;
    count: number;
    oldest_created_at: string | null;
}

const DoctorQueueGrid: React.FC<DoctorQueueGridProps> = ({ onCall, disabled, refreshTrigger }) => {
    const [stats, setStats] = useState<QueueStat[]>([]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('http://localhost:3000/api/tickets/waiting-stats');
                const data = await res.json();
                if (Array.isArray(data)) {
                    setStats(data);
                } else {
                    console.error("Invalid stats data:", data);
                    setStats([]);
                }
            } catch (error) {
                console.error("Error fetching queue stats:", error);
            }
        };

        fetchStats();
    }, [refreshTrigger]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6 overflow-y-auto">
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
            {stats.length === 0 && (
                <div className="col-span-full text-center py-10 text-gray-400">
                    Nenhum médico ou fila disponível no momento.
                </div>
            )}
        </div>
    );
};

export default DoctorQueueGrid;