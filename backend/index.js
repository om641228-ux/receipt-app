require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ws = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Multer (FormData) ======
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ====== Supabase ======
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: ws } }
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
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.status(200).end();
});
app.use(express.json({ limit: '50mb' }));

// ====== Uploads ======
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ====== Auth ======
const authOwners = require('./auth-owners');
app.use('/api', authOwners);

// ====== RECOGNITION FUNCTIONS ======

// 1. GEMINI через SDK (надёжнее чем fetch)
async function recognizeWithGemini(base64Image, mimeType, modelId) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY не настроен');

  const modelName = modelId && modelId.startsWith('gemini') ? modelId : 'gemini-1.5-flash';
  console.log('🤖 Gemini model:', modelName);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
  });

  const prompt = `Ты — эксперт по распознаванию чеков. Проанализируй изображение и верни результат СТРОГО в формате JSON (без markdown, только чистый JSON).

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

Если поле не найдено — используй null (не пустую строку).`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64Image, mimeType: mimeType || 'image/jpeg' } }
  ]);

  const text = result.response.text();
  console.log('📝 Gemini raw (first 500 chars):', text.substring(0, 500));

  try {
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);
    console.log('✅ Gemini parsed:', {
      store: parsed.store_name,
      total: parsed.total_amount,
      items: parsed.items?.length
    });
    return parsed;
  } catch (e) {
    console.error('❌ Gemini JSON parse error:', e.message);
    return {
      store_name: 'Unknown', store_name_ru: null, receipt_date: null, receipt_time: null,
      total_amount: 0, subtotal: null, tax_amount: null, tax_rate: null,
      currency: null, items: [], raw_text: text
    };
  }
}

// 2. GROQ (Vision) через fetch
async function recognizeWithGroq(base64Image, mimeType, modelId) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY не настроен');

  const visionModels = ['llama-3.2-11b-vision-preview', 'llama-3.2-90b-vision-preview'];
  const model = visionModels.includes(modelId) ? modelId : 'llama-3.2-11b-vision-preview';
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Image}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Проанализируй этот чек. Верни результат СТРОГО в JSON: {store_name, store_name_ru, receipt_date (YYYY-MM-DD), receipt_time (HH:MM), total_amount (число), subtotal, tax_amount, tax_rate, currency, items:[{name, name_ru, quantity, price, total}], raw_text}. Если поле не найдено — null.' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      temperature: 0.1, max_tokens: 4096
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq ${response.status}: ${err}`);
  }
  const result = await response.json();
  const text = result.choices?.[0]?.message?.content || '';

  try {
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return {
      store_name: 'Unknown', store_name_ru: null, receipt_date: null, receipt_time: null,
      total_amount: 0, subtotal: null, tax_amount: null, tax_rate: null,
      currency: null, items: [], raw_text: text
    };
  }
}

// 3. OCR.SPACE
async function recognizeWithOCRSpace(base64Image, modelId) {
  const apiKey = process.env.OCRSPACE_API_KEY;
  if (!apiKey) throw new Error('OCRSPACE_API_KEY не настроен');

  const engineMap = {
    'ocrspace-default': '1', 'ocrspace-engine2': '2', 'ocrspace-engine3': '3',
    'ocrspace-engine5': '5', 'ocrspace-handwritten': '2', 'ocrspace-receipt': '5',
    'ocr-engine-1': '1', 'ocr-engine-2': '2'
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

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OCR.space ${response.status}: ${err}`);
  }
  const result = await response.json();

  if (result.IsErroOnProcessing) throw new Error(`OCR.space error: ${result.ErrorMessage}`);
  const parsedText = result.ParsedResults?.[0]?.ParsedText || '';

  return {
    store_name: 'Unknown', store_name_ru: null, receipt_date: null, receipt_time: null,
    total_amount: extractTotal(parsedText), subtotal: null, tax_amount: null, tax_rate: null,
    currency: extractCurrency(parsedText), items: [], raw_text: parsedText
  };
}

function extractTotal(text) {
  const patterns = [
    /TOTAL\s*DUE\s*[€$£AED]*\s*([\d,]+\.?\d*)/i,
    /TOTAL\s*[€$£AED]*\s*([\d,]+\.?\d*)/i,
    /ИТОГО\s*[€$£AED]*\s*([\d,]+\.?\d*)/i,
    /AMOUNT\s*DUE\s*[€$£AED]*\s*([\d,]+\.?\d*)/i,
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
  res.json({
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
    ]
  });
});

app.get('/api/list-groq-models', (req, res) => {
  res.json({
    models: [
      { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision' },
      { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout' }
    ]
  });
});

app.get('/api/list-ocrspace-models', (req, res) => {
  res.json({
    models: [
      { id: 'ocrspace-engine2', name: 'OCR.space Engine 2' },
      { id: 'ocrspace-engine5', name: 'OCR.space Engine 5' }
    ]
  });
});

// ====== CORE ROUTES ======

app.get('/api/receipts', async (req, res) => {
  try {
    const { data, error } = await supabase.from('receipts').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('receipts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sanitizeForDB(val) {
  if (val === undefined || val === '' || val === 'null') return null;
  return val;
}

// POST /api/upload-receipt — FormData (multipart)
app.post('/api/upload-receipt', upload.single('image'), async (req, res) => {
  console.log('>>> /api/upload-receipt called');
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'Нет изображения (поле FormData должно называться "image")' });
    }

    console.log('📁 File:', file.originalname, 'Size:', file.size, 'Type:', file.mimetype);

    const { model, currency, docType } = req.body;
    const base64Image = file.buffer.toString('base64');

    // 1. Save file locally
    const ext = path.extname(file.originalname) || '.jpg';
    const savedName = `${Date.now()}${ext}`;
    fs.writeFileSync(path.join(uploadsDir, savedName), file.buffer);

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    let imageUrl = `${protocol}://${host}/uploads/${savedName}`;

    // 2. Upload to Supabase Storage
    try {
      const { error: upErr } = await supabase.storage
        .from('receipts')
        .upload(savedName, file.buffer, { contentType: file.mimetype });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(savedName);
        imageUrl = urlData.publicUrl.replace('http://', 'https://');
        console.log('✅ Supabase URL:', imageUrl);
      }
    } catch (e) {
      console.error('⚠️ Supabase upload:', e.message);
    }

    // 3. Recognize with fallback
    let recognized = null;
    let recognitionMethod = model || 'manual';
    let recognitionError = null;

    const selectedModel = model || 'gemini-1.5-flash';

    // Пробуем основную модель
    try {
      if (selectedModel.startsWith('gemini')) {
        console.log('🔍 Gemini...');
        recognized = await recognizeWithGemini(base64Image, file.mimetype || 'image/jpeg', selectedModel);
        recognitionMethod = selectedModel;
      } else if (selectedModel.includes('vision')) {
        console.log('🔍 Groq...');
        recognized = await recognizeWithGroq(base64Image, file.mimetype || 'image/jpeg', selectedModel);
        recognitionMethod = selectedModel;
      } else if (selectedModel.startsWith('ocr') || selectedModel.startsWith('ocrspace')) {
        console.log('🔍 OCR.space...');
        recognized = await recognizeWithOCRSpace(base64Image, selectedModel);
        recognitionMethod = selectedModel;
      } else {
        recognitionError = 'Unknown model: ' + selectedModel;
      }
    } catch (err) {
      console.error('❌ Primary recognition failed:', err.message);
      recognitionError = err.message;

      // Fallback на Gemini если основная не Gemini
      if (!selectedModel.startsWith('gemini') && process.env.GEMINI_API_KEY) {
        try {
          console.log('🔄 Fallback to Gemini...');
          recognized = await recognizeWithGemini(base64Image, file.mimetype || 'image/jpeg', 'gemini-1.5-flash');
          recognitionMethod = 'gemini-1.5-flash (fallback)';
          recognitionError = null;
        } catch (fallbackErr) {
          console.error('❌ Fallback also failed:', fallbackErr.message);
          recognitionError += ' | Fallback: ' + fallbackErr.message;
        }
      }
    }

    // 4. Если распознавание полностью провалилось — возвращаем ошибку
    if (!recognized || (recognized.store_name === 'Unknown' && recognized.total_amount === 0 && recognized.items.length === 0)) {
      if (recognitionError) {
        console.error('❌ No recognition data, returning error');
        return res.status(500).json({
          success: false,
          error: 'Распознавание не удалось: ' + recognitionError,
          saved: false
        });
      }
    }

    // 5. Save to DB
    const insertData = {
      image_url: imageUrl,
      currency: sanitizeForDB(currency) || sanitizeForDB(recognized?.currency) || 'AED',
      document_type: docType || 'receipt',
      recognition_method: recognitionMethod,
      store_name: sanitizeForDB(recognized?.store_name) || 'Unknown',
      store_name_ru: sanitizeForDB(recognized?.store_name_ru),
      receipt_date: sanitizeForDB(recognized?.receipt_date),
      receipt_time: sanitizeForDB(recognized?.receipt_time),
      total_amount: recognized?.total_amount || 0,
      subtotal: sanitizeForDB(recognized?.subtotal),
      tax_amount: sanitizeForDB(recognized?.tax_amount),
      tax_rate: sanitizeForDB(recognized?.tax_rate),
      items: Array.isArray(recognized?.items) ? recognized.items : [],
      raw_text: sanitizeForDB(recognized?.raw_text) || '',
      created_at: new Date().toISOString()
    };

    console.log('💾 DB insert:', {
      store: insertData.store_name,
      total: insertData.total_amount,
      items: insertData.items.length
    });

    const { data: receipt, error } = await supabase.from('receipts').insert(insertData).select().single();
    if (error) throw error;

    console.log('✅ Saved ID:', receipt.id);

    const response = { success: true, ...receipt };
    if (recognitionError) {
      response.recognition_error = recognitionError;
      response.warning = 'Распознавание частично не удалось, чек сохранён с базовыми данными.';
    }

    res.json(response);
  } catch (err) {
    console.error('❌ CRASH:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/export-excel', async (req, res) => {
  res.status(501).json({ success: false, error: 'Excel export пока не реализован' });
});

// ====== OPTIONAL MODULES ======
function tryRequire(modulePath, routePath) {
  try {
    const mod = require(modulePath);
    if (routePath) app.use(routePath, mod);
    console.log(`✅ Loaded: ${modulePath}`);
    return mod;
  } catch (e) {
    console.warn(`⚠️  Module not found: ${modulePath}`);
    return null;
  }
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

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API на порту ${PORT}`);
  console.log(`🤖 Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
  console.log(`⚡ Groq: ${process.env.GROQ_API_KEY ? '✅' : '❌'}`);
  console.log(`📷 OCR.space: ${process.env.OCRSPACE_API_KEY ? '✅' : '❌'}`);
});