import express from 'express';
import cors from 'cors';

import './database';
import sessionRoutes from './routes/sessions';

const app = express();

const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
    res.json({
        message: 'PJT-I Posture Backend is running'
    });
});

app.use('/api/sessions', sessionRoutes);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PJT-I backend running on port ${PORT}`);
});