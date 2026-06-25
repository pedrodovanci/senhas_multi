export interface DoctorQueueEntry {
  id: string;
  ticketId: number;
  ticketNumber: string;
  patientName: string;
  forwardedAt: string;
}

const queues = new Map<number, DoctorQueueEntry[]>();
let nextEntryId = 1;

export const adicionar = (
  doctorId: number,
  entry: { ticketId: number; ticketNumber: string; patientName: string },
): DoctorQueueEntry => {
  const fullEntry: DoctorQueueEntry = {
    id: String(nextEntryId++),
    ticketId: entry.ticketId,
    ticketNumber: entry.ticketNumber,
    patientName: entry.patientName,
    forwardedAt: new Date().toISOString(),
  };
  const queue = queues.get(doctorId) ?? [];
  queue.push(fullEntry);
  queues.set(doctorId, queue);
  return fullEntry;
};

export const listar = (doctorId: number): DoctorQueueEntry[] => {
  return queues.get(doctorId) ?? [];
};

export const chamarProximo = (doctorId: number): DoctorQueueEntry | null => {
  const queue = queues.get(doctorId);
  if (!queue || queue.length === 0) return null;
  const [entry] = queue.splice(0, 1);
  return entry;
};

export const chamarEspecifico = (
  doctorId: number,
  entryId: string,
): DoctorQueueEntry | null => {
  const queue = queues.get(doctorId);
  if (!queue) return null;
  const index = queue.findIndex((e) => e.id === entryId);
  if (index === -1) return null;
  const [entry] = queue.splice(index, 1);
  return entry;
};

export const remover = (doctorId: number, entryId: string): boolean => {
  const queue = queues.get(doctorId);
  if (!queue) return false;
  const index = queue.findIndex((e) => e.id === entryId);
  if (index === -1) return false;
  queue.splice(index, 1);
  return true;
};

export const limpar = (doctorId: number): void => {
  queues.delete(doctorId);
};
