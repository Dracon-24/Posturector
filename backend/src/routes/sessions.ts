import { Router, Request, Response } from 'express';
import db from '../database';

const router = Router();

router.post('/', (req: Request, res: Response) => {
    try {
        const session = req.body;

        if (!session?.id) {
            return res.status(400).json({
                error: 'Session ID is required'
            });
        }

        const statement = db.prepare(`
      INSERT INTO sessions (
        id,
        start_time,
        end_time,
        monitored_duration,
        sample_count,
        actual_sampling_rate,
        session_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        statement.run(
            session.id,
            session.startTime,
            session.endTime,
            session.monitoredDuration,
            session.sampleCount,
            session.actualSamplingRate,
            JSON.stringify(session)
        );

        res.status(201).json({
            message: 'Session stored successfully',
            sessionId: session.id
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to store session'
        });
    }
});

router.get('/', (_req: Request, res: Response) => {
    try {
        const sessions = db
            .prepare(`
        SELECT
          id,
          start_time,
          end_time,
          monitored_duration,
          sample_count,
          actual_sampling_rate
        FROM sessions
        ORDER BY start_time DESC
      `)
            .all();

        res.json(sessions);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to retrieve sessions'
        });
    }
});

router.get('/:id', (req: Request, res: Response) => {
    try {
        const session = db
            .prepare(`
        SELECT session_data
        FROM sessions
        WHERE id = ?
      `)
            .get(req.params.id) as { session_data: string } | undefined;

        if (!session) {
            return res.status(404).json({
                error: 'Session not found'
            });
        }

        res.json(JSON.parse(session.session_data));

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to retrieve session'
        });
    }
});

export default router;