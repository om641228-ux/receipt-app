const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// === CORS ===
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// === SUPABASE ===
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('SUPABASE_URL exists:', !!supabaseUrl);
console.log('SUPABASE_KEY exists:', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// === PASSWORDS ===
const VALID_PASSWORDS = [
  'admin', 'user1', 'user2', 'user3', 'user4', 'user5',
  'user6', 'user7', 'user8', 'user9', 'user10', 'user11',
  'user12', 'user13', 'user14', 'user15', 'user16', 'user17',
  'user18', 'user19', 'user20'
];

// === HEALTH ===
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    supabase_connected: !!supabaseUrl && !!supabaseKey
  });
});

// === LOGIN HANDLER ===
function handleLogin(req, res) {
  const { password } = req.body;
  console.log('Login attempt:', password);

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (VALID_PASSWORDS.includes(password)) {
    const token = Buffer.from(password + '_' + Date.now()).toString('base64');
    return res.json({ success: true, token, user: { password } });
  }
  return res.status(401).json({ error: 'Неверный пароль' });
}

// === LOGIN ROUTES ===
app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

// === VERIFY / ME ===
app.get('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });
  res.json({ valid: true });
});

app.get('/api/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });
  res.json({ id: 'user', email: 'user@example.com' });
});

// === RECEIPTS ===
app.get('/api/receipts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Receipts error:', err);
    res.json([]);
  }
});

app.post('/api/receipts', async (req, res) => {
  try {
    const receipt = req.body;
    const { data, error } = await supabase
      .from('receipts')
      .insert([receipt])
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('receipts').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === UPLOAD ===
app.post('/api/upload-receipt', async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) return res.status(400).json({ error: 'No image' });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = `receipts/${Date.now()}_${filename || 'receipt.jpg'}`;

    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(filePath, buffer, { contentType: 'image/jpeg' });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath);
    res.json({ success: true, url: urlData.publicUrl, path: filePath });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// === AI MODELS — ВСЕ ДОСТУПНЫЕ МОДЕЛИ ===

// Gemini модели (Google AI)
app.get('/api/list-gemini-models', (req, res) => {
  res.json({
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash Latest' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro Latest' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
    ]
  });
});

// Groq модели
app.get('/api/list-groq-models', (req, res) => {
  res.json({
    models: [
      { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'llama-3.2-1b-preview', name: 'Llama 3.2 1B' },
      { id: 'llama-3.2-3b-preview', name: 'Llama 3.2 3B' },
      { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision' },
      { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      { id: 'mixtral-8x22b-32768', name: 'Mixtral 8x22B' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
      { id: 'gemma-7b-it', name: 'Gemma 7B' },
      { id: 'qwen-2.5-32b-instruct', name: 'Qwen 2.5 32B' },
      { id: 'qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B' },
      { id: 'deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill Qwen 32B' }
    ]
  });
});

// OCR.space модели
app.get('/api/list-ocrspace-models', (req, res) => {
  res.json({
    models: [
      { id: 'default', name: 'OCR.space Default' },
      { id: '1', name: 'Engine 1 - Fast' },
      { id: '2', name: 'Engine 2 - Accurate' },
      { id: '3', name: 'Engine 3 - Multi-language' },
      { id: '5', name: 'Engine 5 - Table OCR' }
    ]
  });
});

// Anthropic Claude модели
app.get('/api/list-anthropic-models', (req, res) => {
  res.json({
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
    ]
  });
});

// OpenAI модели (если есть ключ)
app.get('/api/list-openai-models', (req, res) => {
  res.json({
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ]
  });
});

// === IDENTIFY (placeholders) ===
app.post('/api/identify', (req, res) => {
  res.json({ success: true, message: 'Identify endpoint ready' });
});

app.post('/api/identify-groq', (req, res) => {
  res.json({ success: true, message: 'Groq identify ready' });
});

app.post('/api/identify-gemini', (req, res) => {
  res.json({ success: true, message: 'Gemini identify ready' });
});

app.post('/api/identify-ocrspace', (req, res) => {
  res.json({ success: true, message: 'OCRSpace identify ready' });
});

app.post('/api/identify-anthropic', (req, res) => {
  res.json({ success: true, message: 'Anthropic identify ready' });
});

app.post('/api/identify-openai', (req, res) => {
  res.json({ success: true, message: 'OpenAI identify ready' });
});

// === REPROCESS ===
app.post('/api/reprocess/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { model } = req.body;
    res.json({ success: true, message: `Reprocess ${id} with ${model}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === ERROR ===
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Server running on port', PORT);
});
