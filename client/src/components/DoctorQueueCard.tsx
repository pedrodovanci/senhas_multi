import React from 'react';
import { ArrowRight } from 'lucide-react';

interface DoctorQueueCardProps {
    doctorName: string;
    waitingCount: number;
    oldestTicketTime: string | null;
    onCall: () => void;
    disabled: boolean;
}

const DoctorQueueCard: React.FC<DoctorQueueCardProps> = ({ 
    doctorName, 
    waitingCount, 
    oldestTicketTime, 
    onCall,
    disabled 
}) => {
    const [currentTime, setCurrentTime] = React.useState(0);

    React.useEffect(() => {
        setCurrentTime(Date.now());
        const interval = setInterval(() => {
            setCurrentTime(Date.now());
        }, 200);
        return () => clearInterval(interval);
    }, []);
    
    // Calculate wait time display
    const getWaitTime = () => {
        if (!oldestTicketTime) return '00:00:00';
        
        const start = new Date(oldestTicketTime).getTime();
        const diff = Math.max(0, Math.floor((currentTime - start) / 1000));
        
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`bg-white rounded-xl shadow-sm border p-4 flex flex-col justify-between h-full transition-all ${
            waitingCount > 0 ? 'border-primary/20 hover:shadow-md hover:border-primary/40' : 'border-gray-100 bg-gray-50/50'
        }`}>
            <div className="mb-3">
                <h3 className={`font-bold text-base leading-tight ${waitingCount > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
                    {doctorName}
                </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                    <div className="text-xs uppercase font-bold text-gray-400 mb-1">Espera</div>
                    <div className={`font-mono font-medium ${waitingCount > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                        {getWaitTime()}
                    </div>
                </div>
                <div>
                    <div className="text-xs uppercase font-bold text-gray-400 mb-1">Fila</div>
                    <div className={`font-bold ${waitingCount > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                        {waitingCount} aguardando
                    </div>
                </div>
            </div>

            <button
                onClick={onCall}
                disabled={disabled || waitingCount === 0}
                className={`w-full py-3 rounded-lg font-bold flex items-center justify-center transition-colors ${
                    waitingCount > 0 && !disabled
                        ? 'bg-primary text-white hover:bg-primary-dark shadow-sm'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
            >
                {waitingCount > 0 ? (
                    <>
                        CHAMAR SENHA <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                ) : (
                    'FILA VAZIA'
                )}
            </button>
        </div>
    );
};

export default DoctorQueueCard;
