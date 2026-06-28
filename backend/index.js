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

// ====== INLINE LIST-MODELS ROUTES (гарантированно без 404) ======

app.get('/api/list-gemini-models', (req, res) => {
  res.json({
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
    ]
  });
});

app.get('/api/list-groq-models', (req, res) => {
  res.json({
    models: [
      { id: 'llama3-8b-8192', name: 'Llama 3 8B' },
      { id: 'llama3-70b-8192', name: 'Llama 3 70B' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      { id: 'gemma-7b-it', name: 'Gemma 7B' }
    ]
  });
});

app.get('/api/list-ocrspace-models', (req, res) => {
  res.json({
    models: [
      { id: 'ocrspace-default', name: 'OCR.space Default' },
      { id: 'ocrspace-2', name: 'OCR.space Engine 2' }
    ]
  });
});

app.get('/api/list-anthropic-models', (req, res) => {
  res.json({
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
    ]
  });
});

app.get('/api/list-openai-models', (req, res) => {
  res.json({
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ]
  });
});

// ====== INLINE CORE ROUTES ======

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
