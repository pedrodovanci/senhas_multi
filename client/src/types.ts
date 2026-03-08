export interface User {
  id: number;
  username: string;
  role: "admin" | "attendant" | "cirurgia";
  active?: boolean;
}

export interface Workstation {
  id: number;
  code: string;
  name: string;
  current_user_id?: number | null;
  is_active?: boolean;
}

export interface Doctor {
  id: number;
  name: string;
  specialization: string;
}

export interface Ticket {
  id: number;
  number: string;
  status: "waiting" | "calling" | "in_attendance" | "finished" | "missed";
  type: "consulta" | "outros";
  subtype?: string | null;
  queue_sector: "recepcao" | "cirurgia";
  doctor_id: number;
  workstation_id?: number;
  created_at: string;
  called_at?: string;
  started_at?: string;
  finished_at?: string;
  requeued_at?: string;
  requeue_count?: number;
  call_type?: "FIFO" | "RANDOM";
  is_specific_call?: boolean;
  doctor_name?: string;
  workstation_name?: string;
  workstation_code?: string;
  printError?: string;
}

export interface QueueStat {
  doctor_id: number | null;
  doctor_name: string;
  count: number;
  oldest_created_at: string | null;
}
