import express, { Application } from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import interviewRoutes from './routes/interview.routes';
import sessionRoutes from './routes/session.routes';
import responseRoutes from './routes/response.routes';
import path from 'path';
import adminRoutes from './routes/admin.routes';
// import publicRoutes from "./routes/public.routes";
import publicRoutes from "./modules/public/public.routes";


const app: Application = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/auth', authRoutes);

// Routes
app.use('/health', healthRoutes);
app.use('/admin', adminRoutes);
app.use('/public', publicRoutes);

// Global error fallback
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});


app.use('/interviews', interviewRoutes);

app.use('/sessions', sessionRoutes);

app.use('/uploads', express.static('uploads'));

app.use('/responses', responseRoutes);




export default app;
