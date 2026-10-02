import express from 'express';
import cors from 'cors';

import './database';
import metricsRoutes from './routes/metrics';
import sessionRoutes from './routes/sessions';

export const app = express();

const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (_req, res) => {
    res.json({
        message: 'PJT-I Posture Backend is running'
    });
});

app.use('/api/sessions', sessionRoutes);
app.use('/api/metrics', metricsRoutes);

export function startServer(port: number = PORT) {
    return app.listen(port, '0.0.0.0', () => {
        console.log(`PJT-I backend running on port ${port}`);
    });
}

if (require.main === module) {
    startServer();
}
