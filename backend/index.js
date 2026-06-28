require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Supabase клиент ======
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: ws
    }
  }
);

// ====== CORS ======
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

app.use(express.json({ limit: '50mb' }));

// ====== Uploads папка ======
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// ====== Auth Owners (парольная авторизация) ======
const authOwners = require('./auth-owners');
app.use('/api', authOwners);

// ====== INLINE ROUTES (не требуют отдельных файлов) ======

// GET /api/receipts — список чеков
app.get('/api/receipts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('GET /api/receipts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/receipts/:id
app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('receipts')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/receipts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload-receipt — загрузка base64 изображения
app.post('/api/upload-receipt', async (req, res) => {
  try {
    const { image, fileName, fileType, model, currency, docType } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: 'Нет изображения (image base64)' });
    }

    // Сохраняем файл локально
    const buffer = Buffer.from(image, 'base64');
    const ext = fileName ? path.extname(fileName) : '.jpg';
    const savedName = `${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, savedName);
    fs.writeFileSync(filePath, buffer);

    // Формируем URL
    const host = req.get('host') || `localhost:${PORT}`;
    const imageUrl = `${req.protocol}://${host}/uploads/${savedName}`;

    // Сохраняем в БД
    const { data: receipt, error } = await supabase
      .from('receipts')
      .insert({
        image_url: imageUrl,
        currency: currency || 'AED',
        document_type: docType || 'receipt',
        recognition_method: model || 'manual',
        total_amount: 0,
        store_name: 'Unknown',
        items: [],
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, ...receipt });
  } catch (err) {
    console.error('POST /api/upload-receipt error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/export-excel (заглушка)
app.post('/api/export-excel', async (req, res) => {
  res.status(501).json({ success: false, error: 'Excel export пока не реализован' });
});

// ====== OPTIONAL MODULES (безопасная загрузка) ======
function tryRequire(modulePath, routePath) {
  try {
    const mod = require(modulePath);
    if (routePath) app.use(routePath, mod);
    console.log(`✅ Loaded: ${modulePath}`);
    return mod;
  } catch (e) {
    console.warn(`⚠️  Module not found: ${modulePath} — skipping`);
    return null;
  }
}

tryRequire('./identify', '/api/identify');
tryRequire('./identify-groq', '/api/identify-groq');
tryRequire('./identify-ocrspace', '/api/identify-ocrspace');
tryRequire('./list-gemini-models', '/api/list-gemini-models');
tryRequire('./list-groq-models', '/api/list-groq-models');
tryRequire('./list-ocrspace-models', '/api/list-ocrspace-models');
tryRequire('./list-anthropic-models', '/api/list-anthropic-models');
tryRequire('./list-openai-models', '/api/list-openai-models');
tryRequire('./list-and-test-models', '/api/list-and-test-models');
tryRequire('./compare-recognize', '/api/compare-recognize');

// ====== Health checks ======
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Receipt Manager API is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    auth: 'password-based (auth-owners)',
    timestamp: new Date().toISOString()
  });
});

// ====== Error handler ======
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

// ====== Start ======
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Receipt API запущен на порту ${PORT}`);
  console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
  console.log(`📂 Uploads: ${uploadsDir}`);
  console.log(`🔐 Auth: auth-owners.js (password-based)`);
  console.log(`🤖 Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
  console.log(`⚡ Groq: ${process.env.GROQ_API_KEY ? '✅' : '❌'}`);
  console.log(`📷 OCR.Space: ${process.env.OCRSPACE_API_KEY ? '✅' : '❌'}`);
  console.log(`🗄️ Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
});
