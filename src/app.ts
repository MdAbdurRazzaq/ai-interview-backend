import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.routes';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/health', healthRoutes);

// Global error fallback
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

export default app;
