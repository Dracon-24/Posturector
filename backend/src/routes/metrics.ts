import { Router, Request, Response } from 'express';

import {
    StoredSessionRow,
    calculateHistoricalAnalytics,
} from '../analytics';
import db from '../database';

const router = Router();

function readStoredSessions(): StoredSessionRow[] {
    return db.prepare(`
        SELECT
          id,
          start_time,
          end_time,
          monitored_duration,
          sample_count,
          actual_sampling_rate,
          session_data
        FROM sessions
    `).all() as StoredSessionRow[];
}

router.get('/summary', (_req: Request, res: Response) => {
    try {
        const analytics = calculateHistoricalAnalytics(
            readStoredSessions()
        );

        res.json(analytics.summary);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to calculate historical summary',
        });
    }
});

router.get('/trends', (_req: Request, res: Response) => {
    try {
        const analytics = calculateHistoricalAnalytics(
            readStoredSessions()
        );

        res.json(analytics.trends);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to calculate historical trends',
        });
    }
});

export default router;
