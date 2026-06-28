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

// ====== INLINE LIST-MODELS ROUTES (МАКСИМАЛЬНЫЙ ВЫБОР) ======

app.get('/api/list-gemini-models', (req, res) => {
  res.json({
    models: [
      { id: 'gemini-2.5-pro-exp-03-25', name: 'Gemini 2.5 Pro Exp' },
      { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash Preview' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Exp' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' },
      { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' }
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
      // Llama Guard
      { id: 'llama-guard-3-8b', name: 'Llama Guard 3 8B' },
      // Mixtral
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      { id: 'mixtral-8x22b-instruct', name: 'Mixtral 8x22B Instruct' },
      // Gemma
      { id: 'gemma-7b-it', name: 'Gemma 7B' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
      // Qwen
      { id: 'qwen-2.5-32b', name: 'Qwen 2.5 32B' },
      { id: 'qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B' },
      { id: 'qwen-qwq-32b', name: 'Qwen QwQ 32B' },
      // DeepSeek
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B' },
      { id: 'deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill Qwen 32B' },
      { id: 'deepseek-r1-distill-qwen-14b', name: 'DeepSeek R1 Distill Qwen 14B' },
      // Mistral
      { id: 'mistral-saba-24b', name: 'Mistral Saba 24B' },
      { id: 'mistral-nemo', name: 'Mistral Nemo' },
      // Other
      { id: 'allam-2-7b', name: 'Allam 2 7B' }
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
      { id: 'ocrspace-receipt', name: 'OCR.space Receipt' }
    ]
  });
});

app.get('/api/list-anthropic-models', (req, res) => {
  res.json({
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (New)' },
      { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (Old)' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
      { id: 'claude-2.1', name: 'Claude 2.1' },
      { id: 'claude-2.0', name: 'Claude 2.0' },
      { id: 'claude-instant-1.2', name: 'Claude Instant 1.2' }
    ]
  });
});

app.get('/api/list-openai-models', (req, res) => {
  res.json({
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-2024-08-06', name: 'GPT-4o (2024-08-06)' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4o-mini-2024-07-18', name: 'GPT-4o Mini (2024-07-18)' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4-turbo-2024-04-09', name: 'GPT-4 Turbo (2024-04-09)' },
      { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo Preview' },
      { id: 'gpt-4-0125-preview', name: 'GPT-4 0125 Preview' },
      { id: 'gpt-4-1106-preview', name: 'GPT-4 1106 Preview' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-4-32k', name: 'GPT-4 32K' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      { id: 'gpt-3.5-turbo-0125', name: 'GPT-3.5 Turbo 0125' },
      { id: 'gpt-3.5-turbo-1106', name: 'GPT-3.5 Turbo 1106' },
      { id: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo 16K' },
      { id: 'text-davinci-003', name: 'Davinci 003' },
      { id: 'text-davinci-002', name: 'Davinci 002' },
      { id: 'text-curie-001', name: 'Curie 001' },
      { id: 'text-babbage-001', name: 'Babbage 001' },
      { id: 'text-ada-001', name: 'Ada 001' }
    ]
  });
});

// Дополнительные провайдеры (если API ключи добавлены)
app.get('/api/list-deepseek-models', (req, res) => {
  res.json({
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' }
    ]
  });
});

app.get('/api/list-mistral-models', (req, res) => {
  res.json({
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'codestral-latest', name: 'Codestral' },
      { id: 'pixtral-large-latest', name: 'Pixtral Large' },
      { id: 'ministral-8b-latest', name: 'Ministral 8B' },
      { id: 'ministral-3b-latest', name: 'Ministral 3B' },
      { id: 'mistral-embed', name: 'Mistral Embed' },
      { id: 'open-mistral-nemo', name: 'Mistral Nemo' },
      { id: 'open-mixtral-8x22b', name: 'Mixtral 8x22B' },
      { id: 'open-mixtral-8x7b', name: 'Mixtral 8x7B' },
      { id: 'open-mistral-7b', name: 'Mistral 7B' }
    ]
  });
});

app.get('/api/list-cohere-models', (req, res) => {
  res.json({
    models: [
      { id: 'command-r-plus', name: 'Command R+' },
      { id: 'command-r', name: 'Command R' },
      { id: 'command', name: 'Command' },
      { id: 'command-light', name: 'Command Light' },
      { id: 'command-nightly', name: 'Command Nightly' },
      { id: 'c4ai-aya-23-35b', name: 'Aya 23 35B' },
      { id: 'c4ai-aya-23-8b', name: 'Aya 23 8B' },
      { id: 'embed-english-v3.0', name: 'Embed English v3' },
      { id: 'embed-multilingual-v3.0', name: 'Embed Multilingual v3' }
    ]
  });
});

app.get('/api/list-ai21-models', (req, res) => {
  res.json({
    models: [
      { id: 'jamba-1.5-large', name: 'Jamba 1.5 Large' },
      { id: 'jamba-1.5-mini', name: 'Jamba 1.5 Mini' },
      { id: 'jamba-1.6', name: 'Jamba 1.6' },
      { id: 'j2-ultra', name: 'Jurassic-2 Ultra' },
      { id: 'j2-mid', name: 'Jurassic-2 Mid' },
      { id: 'j2-light', name: 'Jurassic-2 Light' }
    ]
  });
});

app.get('/api/list-together-models', (req, res) => {
  res.json({
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo' },
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout' },
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', name: 'Llama 4 Maverick' },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
      { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B v0.3' },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B' },
      { id: 'NousResearch/Nous-Hermes-2-Yi-34B', name: 'Nous Hermes 2 Yi 34B' }
    ]
  });
});

app.get('/api/list-perplexity-models', (req, res) => {
  res.json({
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro' },
      { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro' },
      { id: 'sonar-reasoning', name: 'Sonar Reasoning' },
      { id: 'sonar', name: 'Sonar' },
      { id: 'sonar-deep-research', name: 'Sonar Deep Research' }
    ]
  });
});

app.get('/api/list-xai-models', (req, res) => {
  res.json({
    models: [
      { id: 'grok-3', name: 'Grok 3' },
      { id: 'grok-3-latest', name: 'Grok 3 Latest' },
      { id: 'grok-2', name: 'Grok 2' },
      { id: 'grok-2-vision', name: 'Grok 2 Vision' },
      { id: 'grok-vision-beta', name: 'Grok Vision Beta' },
      { id: 'grok-beta', name: 'Grok Beta' }
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
