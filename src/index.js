import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import checkoutRoutes from './routes/checkout.js';
import webhookRoutes from './routes/webhooks.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - Solo permitir petmat.cl
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || 'https://petmat.cl',
    'http://localhost:5173', // Para desarrollo local
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'petmat-backend',
    version: '1.0.0'
  });
});

// Routes
app.use('/api', checkoutRoutes);
app.use('/api', webhookRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚂 PetMAT Backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 CORS enabled for: ${process.env.FRONTEND_URL || 'https://petmat.cl'}`);
  console.log(`✅ Server ready!`);
});


