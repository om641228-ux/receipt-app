require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Supabase ======
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: ws } }
);

// ====== CORS ======
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: true }));
app.options('*', (req, res) => { res.header('Access-Control-Allow-Origin','*'); res.header('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS'); res.header('Access-Control-Allow-Headers','Content-Type,Authorization'); res.status(200).end(); });
app.use(express.json({ limit: '50mb' }));

// ====== Uploads ======
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ====== Auth ======
const authOwners = require('./auth-owners');
app.use('/api', authOwners);

// ====== RECOGNITION FUNCTIONS ======

// 1. GEMINI
async function recognizeWithGemini(base64Image, mimeType, modelId) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY не настроен');
  const model = modelId && modelId.startsWith('gemini') ? modelId : 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `Ты — эксперт по распознаванию чеков и фактур. Проанализируй изображение и верни результат СТРОГО в формате JSON (без markdown, только чистый JSON).

Извлеки:
- store_name: название магазина
- store_name_ru: название на русском
- receipt_date: дата YYYY-MM-DD
- receipt_time: время HH:MM
- total_amount: общая сумма (число)
- subtotal: сумма без налога
- tax_amount: налог
- tax_rate: процент налога
- currency: валюта (AED, EUR, USD, RUB)
- items: массив [{name, name_ru, quantity, price, total}]
- raw_text: полный текст чека

Если поле не найдено — null или пустая строка.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Image } }
      ]}],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
    })
  });

  if (!response.ok) { const err = await response.text(); throw new Error(`Gemini ${response.status}: ${err}`); }
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

  try {
    const clean = text.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    return JSON.parse(clean);
  } catch (e) {
    return { store_name:'Unknown', store_name_ru:'', receipt_date:null, receipt_time:'', total_amount:0, subtotal:null, tax_amount:null, tax_rate:'', currency:'', items:[], raw_text:text };
  }
}

// 2. GROQ (Vision models)
async function recognizeWithGroq(base64Image, mimeType, modelId) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY не настроен');

  // Groq vision models
  const visionModels = [
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview'
  ];
  const model = visionModels.includes(modelId) ? modelId : 'llama-3.2-11b-vision-preview';

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Image}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'user', content: [
          { type: 'text', text: 'Проанализируй этот чек/фактуру. Верни результат СТРОГО в JSON формате: {store_name, store_name_ru, receipt_date (YYYY-MM-DD), receipt_time (HH:MM), total_amount (число), subtotal, tax_amount, tax_rate, currency, items: [{name, name_ru, quantity, price, total}], raw_text}. Если поле не найдено — null.' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]}
      ],
      temperature: 0.1,
      max_tokens: 4096
    })
  });

  if (!response.ok) { const err = await response.text(); throw new Error(`Groq ${response.status}: ${err}`); }
  const result = await response.json();
  const text = result.choices?.[0]?.message?.content || '';

  try {
    const clean = text.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
    return JSON.parse(clean);
  } catch (e) {
    return { store_name:'Unknown', store_name_ru:'', receipt_date:null, receipt_time:'', total_amount:0, subtotal:null, tax_amount:null, tax_rate:'', currency:'', items:[], raw_text:text };
  }
}

// 3. OCR.SPACE
async function recognizeWithOCRSpace(base64Image, modelId) {
  const apiKey = process.env.OCRSPACE_API_KEY;
  if (!apiKey) throw new Error('OCRSPACE_API_KEY не настроен');

  const engineMap = {
    'ocrspace-default': '1',
    'ocrspace-engine2': '2',
    'ocrspace-engine3': '3',
    'ocrspace-engine5': '5',
    'ocrspace-handwritten': '2',
    'ocrspace-receipt': '5',
    'ocr-engine-1': '1',
    'ocr-engine-2': '2'
  };
  const engine = engineMap[modelId] || '2';

  const formData = new URLSearchParams();
  formData.append('apikey', apiKey);
  formData.append('base64Image', `data:image/jpeg;base64,${base64Image}`);
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  formData.append('OCREngine', engine);

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString()
  });

  if (!response.ok) { const err = await response.text(); throw new Error(`OCR.space ${response.status}: ${err}`); }
  const result = await response.json();

  if (result.IsErroOnProcessing) {
    throw new Error(`OCR.space error: ${result.ErrorMessage}`);
  }

  const parsedText = result.ParsedResults?.[0]?.ParsedText || '';

  // OCR.space только текст, без структуры — парсим простейшее
  return {
    store_name: 'Unknown',
    store_name_ru: '',
    receipt_date: null,
    receipt_time: '',
    total_amount: extractTotal(parsedText),
    subtotal: null,
    tax_amount: null,
    tax_rate: '',
    currency: extractCurrency(parsedText),
    items: [],
    raw_text: parsedText
  };
}

// Helpers
function extractTotal(text) {
  const patterns = [
    /TOTAL\s*[:€$£AED]*\s*([\d,]+\.?\d*)/i,
    /TOTAL\s*DUE\s*[:€$£AED]*\s*([\d,]+\.?\d*)/i,
    /ИТОГО\s*[:€$£AED]*\s*([\d,]+\.?\d*)/i,
    /TOTAL\s*AMOUNT\s*[:€$£AED]*\s*([\d,]+\.?\d*)/i,
    /AMOUNT\s*DUE\s*[:€$£AED]*\s*([\d,]+\.?\d*)/i,
    /([\d,]+\.?\d*)\s*(AED|EUR|USD|\$|€)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
  }
  return 0;
}

function extractCurrency(text) {
  if (text.includes('AED') || text.includes('Aed')) return 'AED';
  if (text.includes('EUR') || text.includes('€')) return 'EUR';
  if (text.includes('USD') || text.includes('$')) return 'USD';
  if (text.includes('RUB') || text.includes('₽')) return 'RUB';
  return 'AED';
}

// ====== LIST MODELS ======
app.get('/api/list-gemini-models', (req, res) => {
  res.json({ models: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
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
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest' },
    { id: 'gemini-pro-latest', name: 'Gemini Pro Latest' },
    { id: 'gemini-robotics-er-1.6-preview', name: 'Gemini Robotics ER 1.6 Preview' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-001', name: 'Gemini 2.0 Flash 001' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
    { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Exp' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' },
    { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking Exp' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B' },
    { id: 'gemini-1.5-flash-002', name: 'Gemini 1.5 Flash 002' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-pro-002', name: 'Gemini 1.5 Pro 002' },
    { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' },
    { id: 'gemini-1.0-pro-002', name: 'Gemini 1.0 Pro 002' },
    { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' },
    { id: 'gemini-exp-1206', name: 'Gemini Exp 1206' },
    { id: 'gemini-exp-1121', name: 'Gemini Exp 1121' },
    { id: 'gemini-2.0-flash-preview', name: 'Gemini 2.0 Flash Preview' },
    { id: 'gemini-2.0-flash-lite-preview', name: 'Gemini 2.0 Flash Lite Preview' },
    { id: 'gemini-2.0-pro-preview', name: 'Gemini 2.0 Pro Preview' },
    { id: 'gemini-2.0-ultra', name: 'Gemini 2.0 Ultra' }
  ]});
});

app.get('/api/list-groq-models', (req, res) => {
  res.json({ models: [
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B' },
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B' },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
    { id: 'llama-3.2-1b-preview', name: 'Llama 3.2 1B Preview' },
    { id: 'llama-3.2-3b-preview', name: 'Llama 3.2 3B Preview' },
    { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision' },
    { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B Versatile' },
    { id: 'llama-3.1-405b-reasoning', name: 'Llama 3.1 405B Reasoning' },
    { id: 'llama3-8b-8192', name: 'Llama 3 8B' },
    { id: 'llama3-70b-8192', name: 'Llama 3 70B' },
    { id: 'llama-guard-3-8b', name: 'Llama Guard 3 8B' },
    { id: 'meta-llama/llama-prompt-guard-2-22m', name: 'Llama Prompt Guard 2 22M' },
    { id: 'meta-llama/llama-prompt-guard-2-86m', name: 'Llama Prompt Guard 2 86M' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    { id: 'mixtral-8x22b-instruct', name: 'Mixtral 8x22B Instruct' },
    { id: 'gemma-7b-it', name: 'Gemma 7B' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
    { id: 'gemma2-27b-it', name: 'Gemma 2 27B' },
    { id: 'qwen-2.5-32b', name: 'Qwen 2.5 32B' },
    { id: 'qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B' },
    { id: 'qwen-qwq-32b', name: 'Qwen QwQ 32B' },
    { id: 'qwen/qwen3-32b', name: 'Qwen 3 32B' },
    { id: 'qwen/qwen3.6-27b', name: 'Qwen 3.6 27B' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B' },
    { id: 'deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill Qwen 32B' },
    { id: 'deepseek-r1-distill-qwen-14b', name: 'DeepSeek R1 Distill Qwen 14B' },
    { id: 'mistral-saba-24b', name: 'Mistral Saba 24B' },
    { id: 'mistral-nemo', name: 'Mistral Nemo' },
    { id: 'mistral-7b-instruct', name: 'Mistral 7B Instruct' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
    { id: 'openai/gpt-oss-safeguard-20b', name: 'GPT-OSS Safeguard 20B' },
    { id: 'groq/compound', name: 'Groq Compound' },
    { id: 'groq/compound-mini', name: 'Groq Compound Mini' },
    { id: 'allam-2-7b', name: 'Allam 2 7B' },
    { id: 'canoplabs/orpheus-arabic-saudi', name: 'Orpheus Arabic Saudi' },
    { id: 'canoplabs/orpheus-v1-english', name: 'Orpheus v1 English' },
    { id: 'whisper-large-v3', name: 'Whisper Large v3' },
    { id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo' },
    { id: 'distil-whisper-large-v3-en', name: 'Distil Whisper Large v3 EN' }
  ]});
});

app.get('/api/list-ocrspace-models', (req, res) => {
  res.json({ models: [
    { id: 'ocrspace-default', name: 'OCR.space Default (Engine 1)' },
    { id: 'ocrspace-engine2', name: 'OCR.space Engine 2' },
    { id: 'ocrspace-engine3', name: 'OCR.space Engine 3' },
    { id: 'ocrspace-engine5', name: 'OCR.space Engine 5 (Table OCR)' },
    { id: 'ocrspace-handwritten', name: 'OCR.space Handwritten' },
    { id: 'ocrspace-receipt', name: 'OCR.space Receipt' },
    { id: 'ocr-engine-1', name: 'OCR Engine 1' },
    { id: 'ocr-engine-2', name: 'OCR Engine 2' }
  ]});
});

// ====== CORE ROUTES ======

app.get('/api/receipts', async (req, res) => {
  try {
    const { data, error } = await supabase.from('receipts').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('receipts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/upload-receipt — СОХРАНЕНИЕ + РАСПОЗНАВАНИЕ (3 провайдера)
app.post('/api/upload-receipt', async (req, res) => {
  try {
    const { image, fileName, fileType, model, currency, docType } = req.body;
    if (!image) return res.status(400).json({ success: false, error: 'Нет изображения' });

    // 1. Сохраняем файл
    const buffer = Buffer.from(image, 'base64');
    const ext = fileName ? path.extname(fileName) : '.jpg';
    const savedName = `${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, savedName);
    fs.writeFileSync(filePath, buffer);

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const imageUrl = `${protocol}://${host}/uploads/${savedName}`;

    // 2. Определяем провайдера и распознаём
    let recognized = null;
    let recognitionMethod = model || 'manual';
    const selectedModel = model || 'gemini-1.5-flash';

    try {
      if (selectedModel.startsWith('gemini')) {
        console.log('🔍 Распознавание через Gemini...');
        recognized = await recognizeWithGemini(image, fileType || 'image/jpeg', selectedModel);
        recognitionMethod = selectedModel;
      } else if (selectedModel.startsWith('llama-3.2-') && selectedModel.includes('vision')) {
        console.log('🔍 Распознавание через Groq Vision...');
        recognized = await recognizeWithGroq(image, fileType || 'image/jpeg', selectedModel);
        recognitionMethod = selectedModel;
      } else if (selectedModel.startsWith('ocr') || selectedModel.startsWith('ocrspace')) {
        console.log('🔍 Распознавание через OCR.space...');
        recognized = await recognizeWithOCRSpace(image, selectedModel);
        recognitionMethod = selectedModel;
      } else {
        console.log('⚠️ Модель не поддерживает vision, сохраняем без распознавания');
      }
    } catch (recErr) {
      console.error('❌ Ошибка распознавания:', recErr.message);
    }

    // 3. Сохраняем в БД
    const insertData = {
      image_url: imageUrl,
      currency: currency || recognized?.currency || 'AED',
      document_type: docType || 'receipt',
      recognition_method: recognitionMethod,
      store_name: recognized?.store_name || 'Unknown',
      store_name_ru: recognized?.store_name_ru || '',
      receipt_date: recognized?.receipt_date || null,
      receipt_time: recognized?.receipt_time || '',
      total_amount: recognized?.total_amount || 0,
      subtotal: recognized?.subtotal || null,
      tax_amount: recognized?.tax_amount || null,
      tax_rate: recognized?.tax_rate || '',
      items: recognized?.items || [],
      raw_text: recognized?.raw_text || '',
      created_at: new Date().toISOString()
    };

    const { data: receipt, error } = await supabase.from('receipts').insert(insertData).select().single();
    if (error) throw error;

    res.json({ success: true, ...receipt });
  } catch (err) {
    console.error('POST /api/upload-receipt error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/export-excel', async (req, res) => {
  res.status(501).json({ success: false, error: 'Excel export пока не реализован' });
});

// ====== OPTIONAL MODULES ======
function tryRequire(modulePath, routePath) {
  try { const mod = require(modulePath); if (routePath) app.use(routePath, mod); console.log(`✅ Loaded: ${modulePath}`); return mod; }
  catch (e) { console.warn(`⚠️  Module not found: ${modulePath}`); return null; }
}
tryRequire('./identify', '/api/identify');
tryRequire('./identify-groq', '/api/identify-groq');
tryRequire('./identify-ocrspace', '/api/identify-ocrspace');
tryRequire('./list-and-test-models', '/api/list-and-test-models');
tryRequire('./compare-recognize', '/api/compare-recognize');

// ====== Health ======
app.get('/', (req, res) => res.json({ status: 'ok', message: 'Receipt Manager API', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  gemini: process.env.GEMINI_API_KEY ? '✅' : '❌',
  groq: process.env.GROQ_API_KEY ? '✅' : '❌',
  ocrspace: process.env.OCRSPACE_API_KEY ? '✅' : '❌',
  supabase: process.env.SUPABASE_URL ? '✅' : '❌'
}));

app.use((err, req, res, next) => { console.error('❌ Error:', err.message); res.status(500).json({ success: false, error: err.message }); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API на порту ${PORT}`);
  console.log(`🤖 Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
  console.log(`⚡ Groq: ${process.env.GROQ_API_KEY ? '✅' : '❌'}`);
  console.log(`📷 OCR.space: ${process.env.OCRSPACE_API_KEY ? '✅' : '❌'}`);
});
