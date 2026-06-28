const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — разрешаем ВСЕ запросы с фронтенда
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Для preflight запросов
app.options('*', cors());

// Логирование всех запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.headers['content-type'] || 'no-content-type'}`);
  next();
});

// Парсинг JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Проверка env
console.log('SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
console.log('SUPABASE_KEY exists:', !!process.env.SUPABASE_KEY);
console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
console.log('GROQ_API_KEY exists:', !!process.env.GROQ_API_KEY);
console.log('ANTHROPIC_API_KEY exists:', !!process.env.ANTHROPIC_API_KEY);
console.log('OCRSPACE_API_KEY exists:', !!process.env.OCRSPACE_API_KEY);

// Multer для загрузки файлов (FormData)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Роуты
const authRoutes = require('./routes/auth');
const receiptRoutes = require('./routes/receipts');

app.use('/api/auth', authRoutes);
app.use('/api/receipts', upload.single('image'), receiptRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Глобальная обработка ошибок — чтобы бэкенд не падал молча
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err.stack || err.message || err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message,
    path: req.path
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});