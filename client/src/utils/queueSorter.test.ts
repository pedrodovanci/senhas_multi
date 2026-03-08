import { describe, it, expect } from 'vitest';
import { sortQueues } from './queueSorter';
import type { QueueStat } from '../types';

describe('sortQueues', () => {
    const now = Date.now();
    const MINUTE = 60 * 1000;

    const createStat = (name: string, minutesWaiting: number, count: number = 1): QueueStat => {
        // Calculate created_at based on wait time. 
        // Waiting for X minutes means created_at was X minutes ago.
        const createdAt = new Date(now - minutesWaiting * MINUTE).toISOString();
        return {
            doctor_id: Math.random(),
            doctor_name: name,
            count: count,
            oldest_created_at: createdAt
        };
    };

    it('should prioritize the queue with the longest waiting time (oldest ticket)', () => {
        // Case 1: Queue A (25 min wait) vs Queue B (10 min wait)
        const queueA = createStat('Queue A', 25);
        const queueB = createStat('Queue B', 10);

        const result = sortQueues([queueB, queueA]);
        
        // Expect Queue A (25 min wait) to be first
        expect(result[0].doctor_name).toBe('Queue A');
        expect(result[1].doctor_name).toBe('Queue B');
    });

    it('should reorder correctly when waiting times change', () => {
        // Case 2: After calling A's 25 min ticket, next A is 2 min wait vs Queue B 10 min wait
        const queueA = createStat('Queue A', 2); // Now only 2 min wait
        const queueB = createStat('Queue B', 10); // Still 10 min wait

        const result = sortQueues([queueA, queueB]);

        // Expect Queue B (10 min wait) to be first now
        expect(result[0].doctor_name).toBe('Queue B');
        expect(result[1].doctor_name).toBe('Queue A');
    });

    it('should handle ties by sorting alphabetically by name', () => {
        const queueA = createStat('Alpha', 15);
        const queueB = createStat('Beta', 15);

        // Input order: Beta, Alpha
        const result = sortQueues([queueB, queueA]);

        // Expect Alpha first due to alphabetical tie-break
        expect(result[0].doctor_name).toBe('Alpha');
        expect(result[1].doctor_name).toBe('Beta');
    });

    it('should handle empty queues (count=0) by putting them last', () => {
        const queueA = createStat('Queue A', 0, 0); // 0 count, 0 wait effectively
        // Manually set oldest_created_at to null for empty queue as per typical backend response
        queueA.oldest_created_at = null; 
        
        const queueB = createStat('Queue B', 5);

        const result = sortQueues([queueA, queueB]);

        expect(result[0].doctor_name).toBe('Queue B');
        expect(result[1].doctor_name).toBe('Queue A');
    });

    it('should not change order for new tickets if they are not the oldest', () => {
        // Scenario: Queue A has oldest waiting 20 min.
        // Queue B has oldest waiting 10 min.
        // New ticket arrives in Queue B (0 min wait).
        // Queue B's oldest is STILL 10 min.
        
        const queueA = createStat('Queue A', 20);
        const queueB = createStat('Queue B', 10);

        const result = sortQueues([queueB, queueA]);

        // Order should still be A, B because A(20) > B(10)
        expect(result[0].doctor_name).toBe('Queue A');
        expect(result[1].doctor_name).toBe('Queue B');
    });
});
