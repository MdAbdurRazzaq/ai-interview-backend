import express, { Application } from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.routes';

const app: Application = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/health', healthRoutes);

// Global error fallback
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

export default app;
