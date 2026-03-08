import type { QueueStat } from '../types';

/**
 * Sorts queue stats based on the accumulated waiting time of the oldest ticket.
 * 
 * Rules:
 * 1. Queues with older tickets (larger waiting time) appear first.
 * 2. If waiting times are equal, sort by doctor name/queue name.
 * 3. Empty queues (count=0) or queues without oldest_created_at are placed at the end.
 * 
 * @param queues Array of QueueStat objects
 * @returns Sorted array of QueueStat objects
 */
export const sortQueues = (queues: QueueStat[]): QueueStat[] => {
    return [...queues].sort((a, b) => {
        // Handle missing dates or zero counts (should be filtered out before, but good for safety)
        if (!a.oldest_created_at || a.count === 0) return 1;
        if (!b.oldest_created_at || b.count === 0) return -1;

        const timeA = new Date(a.oldest_created_at).getTime();
        const timeB = new Date(b.oldest_created_at).getTime();

        // Primary Sort: Oldest ticket first (ascending timestamp)
        // Smaller timestamp = Older date = Longest wait time
        if (timeA !== timeB) {
            return timeA - timeB;
        }

        // Secondary Sort: Name (Alphabetical) for stability
        const nameA = a.doctor_name || '';
        const nameB = b.doctor_name || '';
        return nameA.localeCompare(nameB);
    });
};
