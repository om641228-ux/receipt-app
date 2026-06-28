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

// ====== INLINE LIST-MODELS ROUTES (ТОЛЬКО GEMINI + GROQ + OCR.SPACE — МАКСИМУМ) ======

app.get('/api/list-gemini-models', (req, res) => {
  res.json({
    models: [
      // Gemini 2.5
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      // Gemini 3.x
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
      { id: 'gemini-3-pro-image', name: 'Gemini 3 Pro Image' },
      { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
      { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image' },
      { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image Preview' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
      { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
      { id: 'gemini-3.1-pro-preview-customtools', name: 'Gemini 3.1 Pro Preview Custom Tools' },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
      // Latest aliases
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest' },
      { id: 'gemini-pro-latest', name: 'Gemini Pro Latest' },
      // Specialized
      { id: 'gemini-robotics-er-1.6-preview', name: 'Gemini Robotics ER 1.6 Preview' },
      // Gemini 2.0
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-001', name: 'Gemini 2.0 Flash 001' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Exp' },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' },
      { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking Exp' },
      // Gemini 1.5
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B' },
      { id: 'gemini-1.5-flash-002', name: 'Gemini 1.5 Flash 002' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-pro-002', name: 'Gemini 1.5 Pro 002' },
      // Gemini 1.0
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' },
      { id: 'gemini-1.0-pro-002', name: 'Gemini 1.0 Pro 002' },
      { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' },
      // Experimental / other
      { id: 'gemini-exp-1206', name: 'Gemini Exp 1206' },
      { id: 'gemini-exp-1121', name: 'Gemini Exp 1121' },
      { id: 'gemini-2.0-flash-preview', name: 'Gemini 2.0 Flash Preview' },
      { id: 'gemini-2.0-flash-lite-preview', name: 'Gemini 2.0 Flash Lite Preview' },
      { id: 'gemini-2.0-pro-preview', name: 'Gemini 2.0 Pro Preview' },
      { id: 'gemini-2.0-ultra', name: 'Gemini 2.0 Ultra' }
    ]
  });
});

app.get('/api/list-groq-models', (req, res) => {
  res.json({
    models: [
      // Llama 4
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B' },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B' },
      // Llama 3.3
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      // Llama 3.2
      { id: 'llama-3.2-1b-preview', name: 'Llama 3.2 1B Preview' },
      { id: 'llama-3.2-3b-preview', name: 'Llama 3.2 3B Preview' },
      { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision' },
      { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision' },
      // Llama 3.1
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B Versatile' },
      { id: 'llama-3.1-405b-reasoning', name: 'Llama 3.1 405B Reasoning' },
      // Llama 3
      { id: 'llama3-8b-8192', name: 'Llama 3 8B' },
      { id: 'llama3-70b-8192', name: 'Llama 3 70B' },
      // Llama Guard / Prompt Guard
      { id: 'llama-guard-3-8b', name: 'Llama Guard 3 8B' },
      { id: 'meta-llama/llama-prompt-guard-2-22m', name: 'Llama Prompt Guard 2 22M' },
      { id: 'meta-llama/llama-prompt-guard-2-86m', name: 'Llama Prompt Guard 2 86M' },
      // Mixtral
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      { id: 'mixtral-8x22b-instruct', name: 'Mixtral 8x22B Instruct' },
      // Gemma
      { id: 'gemma-7b-it', name: 'Gemma 7B' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
      { id: 'gemma2-27b-it', name: 'Gemma 2 27B' },
      // Qwen
      { id: 'qwen-2.5-32b', name: 'Qwen 2.5 32B' },
      { id: 'qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B' },
      { id: 'qwen-qwq-32b', name: 'Qwen QwQ 32B' },
      { id: 'qwen/qwen3-32b', name: 'Qwen 3 32B' },
      { id: 'qwen/qwen3.6-27b', name: 'Qwen 3.6 27B' },
      // DeepSeek
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B' },
      { id: 'deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill Qwen 32B' },
      { id: 'deepseek-r1-distill-qwen-14b', name: 'DeepSeek R1 Distill Qwen 14B' },
      // Mistral
      { id: 'mistral-saba-24b', name: 'Mistral Saba 24B' },
      { id: 'mistral-nemo', name: 'Mistral Nemo' },
      { id: 'mistral-7b-instruct', name: 'Mistral 7B Instruct' },
      // OpenAI on Groq
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
      { id: 'openai/gpt-oss-safeguard-20b', name: 'GPT-OSS Safeguard 20B' },
      // Compound
      { id: 'groq/compound', name: 'Groq Compound' },
      { id: 'groq/compound-mini', name: 'Groq Compound Mini' },
      // Allam
      { id: 'allam-2-7b', name: 'Allam 2 7B' },
      // CanopyLabs
      { id: 'canoplabs/orpheus-arabic-saudi', name: 'Orpheus Arabic Saudi' },
      { id: 'canoplabs/orpheus-v1-english', name: 'Orpheus v1 English' },
      // Whisper (audio, но включим для полноты)
      { id: 'whisper-large-v3', name: 'Whisper Large v3' },
      { id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo' },
      { id: 'distil-whisper-large-v3-en', name: 'Distil Whisper Large v3 EN' }
    ]
  });
});

app.get('/api/list-ocrspace-models', (req, res) => {
  res.json({
    models: [
      { id: 'ocrspace-default', name: 'OCR.space Default (Engine 1)' },
      { id: 'ocrspace-engine2', name: 'OCR.space Engine 2' },
      { id: 'ocrspace-engine3', name: 'OCR.space Engine 3' },
      { id: 'ocrspace-engine5', name: 'OCR.space Engine 5 (Table OCR)' },
      { id: 'ocrspace-handwritten', name: 'OCR.space Handwritten' },
      { id: 'ocrspace-receipt', name: 'OCR.space Receipt' },
      { id: 'ocr-engine-1', name: 'OCR Engine 1' },
      { id: 'ocr-engine-2', name: 'OCR Engine 2' }
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

    const buffer = Buffer.from(image, 'base64');
    const ext = fileName ? path.extname(fileName) : '.jpg';
    const savedName = `${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, savedName);
    fs.writeFileSync(filePath, buffer);

    const host = req.get('host') || `localhost:${PORT}`;
    const imageUrl = `${req.protocol}://${host}/uploads/${savedName}`;

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
