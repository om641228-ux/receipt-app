require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const FormData = require('form-data');
const axios = require('axios');
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

// ====== IMAGE COMPRESSION ======
async function compressImage(buffer, maxWidth = 1500, quality = 85) {
  try {
    const compressed = await sharp(buffer)
      .rotate()
      .resize({ width: maxWidth, height: 4000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, progressive: true })
      .toBuffer();
    console.log(`📉 Compressed: ${buffer.length} → ${compressed.length} bytes (${((1 - compressed.length/buffer.length)*100).toFixed(0)}%)`);
    return compressed;
  } catch (e) {
    console.error('⚠️ Compression failed:', e.message);
    return buffer;
  }
}

// ====== RECOGNITION FUNCTIONS ======

// ====== POST-PROCESSING: clean items from AI ======
function cleanItems(items) {
  if (!Array.isArray(items)) return [];

  // Только удаляем очевидно служебные строки
  const serviceNames = ['rounding', 'sub total', 'tax', 'total due', 'total', 'vat', 'prepayment', 'amount due', 'grand total'];

  return items.filter(item => {
    const name = (item.name || '').toLowerCase().trim();
    // Удаляем только если название ТОЧНО совпадает со служебным
    for (const s of serviceNames) {
      if (name === s || name === s + ':' || name === s + '.') return false;
    }
    return true;
  });
}


// ====== PARSE ITEMS FROM RAW TEXT (fallback if AI fails) ======
function parseItemsFromText(text) {
  if (!text) return [];
  const items = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Pattern: "Qty Price Total" on one line, name on previous
    const match = line.match(/^(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
    if (match && i > 0) {
      const name = lines[i-1];
      if (name && !/Total|Tax|Sub|VAT|Rounding|Prepayment/i.test(name)) {
        items.push({
          name: name,
          name_ru: name,
          quantity: parseInt(match[1]),
          price: parseFloat(match[2]),
          total: parseFloat(match[3])
        });
      }
    }
  }
  return items;
}

// 1. GEMINI
async function recognizeWithGemini(base64Image, mimeType, modelId) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY не настроен');

  const modelName = modelId && modelId.startsWith('gemini') ? modelId : 'gemini-3.5-flash';
  console.log('🤖 Gemini model:', modelName);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
  });

  const prompt = `Ты — эксперт по распознаванию чеков. Проанализируй изображение чека и верни результат СТРОГО в формате JSON (без markdown, только чистый JSON).

КРИТИЧЕСКИ ВАЖНО:
1. Верни МАССИВ items — это ОБЯЗАТЕЛЬНОЕ поле. Каждый товар должен быть объектом с полями: name, name_ru, quantity, price, total.
2. Название товара — это РЕАЛЬНОЕ название продукта (например "WARRE'S WARRIOR 75CL", "GRAHAM'S SIX GRAPE RESERVE 75CL", "Plastic Bag")
3. НЕ используй "2 EACH", "1 EACH", "1 PCS" как название товара — это количество!
4. Если название товара написано на отдельной строке от кода/количества — возьми название с той строки
5. Код товара (например E0260, 12991, CN010) — это НЕ название, пропускай его
6. "Rounding", "Sub Total", "Tax", "Total" — это НЕ товары, не включай их

Структура JSON (ОБЯЗАТЕЛЬНО верни ВСЕ поля):
{
  "store_name": "название магазина",
  "store_name_ru": "название на русском",
  "receipt_date": "YYYY-MM-DD",
  "receipt_time": "HH:MM",
  "total_amount": 359.50,
  "subtotal": 263.48,
  "tax_amount": 96.02,
  "tax_rate": "5%",
  "currency": "AED",
  "items": [
    {"name": "WARRE'S WARRIOR 75CL", "name_ru": "Виски WARRE'S WARRIOR 0.75л", "quantity": 2, "price": 79.12, "total": 158.24}
  ],
  "raw_text": "полный текст чека"
}

Если поле не найдено — используй null. НО items ДОЛЖЕН быть массивом, даже пустым [].`;

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

// 2. GROQ
async function recognizeWithGroq(base64Image, mimeType, modelId) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY не настроен');

  // Только vision-модели Groq поддерживают изображения
  const visionModels = [
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview'
  ];

  // Если выбрана НЕ vision-модель — ошибка
  if (!visionModels.includes(modelId)) {
    throw new Error(`Модель ${modelId} не поддерживает распознавание изображений в Groq. Выберите vision-модель: llama-3.2-90b-vision-preview или llama-3.2-11b-vision-preview`);
  }

  const model = modelId;
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Image}`;

  console.log('🚀 Groq request:', model);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Проанализируй этот чек. ВАЖНО: название товара — это РЕАЛЬНОЕ название продукта, НЕ "2 EACH" или код товара. Если название на отдельной строке от количества — бери название с отдельной строки. Не включай "Rounding", "Sub Total", "Tax" как товары. Верни СТРОГО в JSON: {store_name, store_name_ru, receipt_date, receipt_time, total_amount, subtotal, tax_amount, tax_rate, currency, items:[{name, name_ru, quantity, price, total}], raw_text}' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      temperature: 0.1, max_tokens: 4096
    })
  });

  const result = await response.json();

  if (!response.ok) {
    const err = result.error?.message || JSON.stringify(result);
    throw new Error(`Groq ${response.status}: ${err}`);
  }

  const text = result.choices?.[0]?.message?.content || '';
  console.log('📝 Groq response (first 300 chars):', text.substring(0, 300));

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

// 3. OCR.SPACE — с агрессивным сжатием
async function recognizeWithOCRSpace(buffer, modelId) {
  const apiKey = process.env.OCRSPACE_API_KEY;
  if (!apiKey) throw new Error('OCRSPACE_API_KEY не настроен');

  const engineMap = {
    'ocrspace-default': '1', 'ocrspace-engine2': '2', 'ocrspace-engine3': '3',
    'ocrspace-engine5': '5', 'ocrspace-handwritten': '2', 'ocrspace-receipt': '5',
    'ocr-engine-1': '1', 'ocr-engine-2': '2'
  };
  const engine = engineMap[modelId] || '2';

  // Агрессивное сжатие для OCR.space (лимит ~1.5 MB base64)
  let imageBuffer = buffer;
  let base64Data = buffer.toString('base64');
  
  if (base64Data.length > 1000000) {
    console.log('📉 Aggressive compression for OCR.space...');
    imageBuffer = await compressImage(buffer, 1200, 70);
    base64Data = imageBuffer.toString('base64');
    
    if (base64Data.length > 1000000) {
      console.log('📉 Extra compression...');
      imageBuffer = await compressImage(buffer, 1000, 60);
      base64Data = imageBuffer.toString('base64');
    }
  }
  
  console.log('📐 OCR.space base64 length:', base64Data.length, 'KB:', (base64Data.length/1024).toFixed(0));

  const formData = new FormData();
  formData.append('apikey', apiKey);
  formData.append('base64Image', `data:image/jpeg;base64,${base64Data}`);
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('OCREngine', engine);
  formData.append('scale', 'true');

    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
    headers: { ...formData.getHeaders() },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 30000
  });

  const result = response.data;
  
  if (result.IsErroredOnProcessing) {
    throw new Error(`OCR.space error: ${result.ErrorMessage?.[0] || JSON.stringify(result)}`);
  }
  
  const parsedText = result.ParsedResults?.[0]?.ParsedText || '';
  console.log('📝 OCR.space text (first 500 chars):', parsedText.substring(0, 500));

  const data = parseReceiptText(parsedText);
  
  console.log('✅ OCR.space parsed:', {
    store: data.store_name,
    total: data.total,
    items: data.items.length
  });
  
  return {
    store_name: data.store_name || 'Unknown',
    store_name_ru: data.store_name_ru || null,
    receipt_date: data.date,
    receipt_time: data.time,
    total_amount: data.total || 0,
    subtotal: data.subtotal || null,
    tax_amount: data.tax || null,
    tax_rate: data.tax_rate || null,
    currency: data.currency || 'AED',
    items: data.items || [],
    raw_text: parsedText
  };
}

// === ПАРСИНГ OCR.SPACE ===
function parseReceiptText(fullText) {
  const data = {
    store_name: '',
    store_name_ru: '',
    date: null,
    time: null,
    total: 0,
    subtotal: 0,
    tax: 0,
    tax_rate: null,
    currency: detectCurrency(fullText),
    country: null,
    items: [],
    payment_method: null,
    payment_amount: 0
  };

  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

  if (lines.length > 0) {
    data.store_name = lines[0];
    data.store_name_ru = translateToRussian(lines[0]);
  }

  const dateMatch = fullText.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (dateMatch) {
    const [, d, m, y] = dateMatch;
    const year = y.length === 2 ? '20' + y : y;
    data.date = `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  
  const timeMatch = fullText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) data.time = `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}`;

  const totalPatterns = [
    /(?:GRAND\s*)?TOTAL[:\s]*[A-Z]{0,3}\s*([\d,.]+)/i,
    /ИТОГО[:\s]*([\d,.]+)/i,
    /ВСЕГО[:\s]*([\d,.]+)/i,
    /TOTAL\s*DUE[:\s]*([\d,.]+)/i,
    /TOTAL\s*DUE\s*:?\s*([\d,.]+)/i,
    /AMOUNT\s*DUE[:\s]*([\d,.]+)/i
  ];
  
  for (const pattern of totalPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      data.total = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  const vatMatch = fullText.match(/(?:VAT|НДС|TAX)[^\d]*(\d+)?%?[:\s]*[A-Z]{0,3}\s*([\d,.]+)/i);
  if (vatMatch) {
    if (vatMatch[1]) data.tax_rate = vatMatch[1] + '%';
    data.tax = parseFloat(vatMatch[2].replace(/,/g, ''));
  }

  const subMatch = fullText.match(/(?:SUBTOTAL|SUB\s*TOTAL|Total before VAT)[:\s]*[A-Z]{0,3}\s*([\d,.]+)/i);
  if (subMatch) {
    data.subtotal = parseFloat(subMatch[1].replace(/,/g, ''));
  }

  // Паттерн 1: "название x кол-во цена сумма"
  const pattern1 = /^(.+?)\s+(\d+)\s*[xX×]\s*([\d,.]+)\s+([\d,.]+)/gm;
  let match;
  while ((match = pattern1.exec(fullText)) !== null) {
    const [, name, qty, price, total] = match;
    if (isProductLine(name)) {
      data.items.push({
        name: name.trim(),
        name_ru: translateToRussian(name.trim()),
        quantity: parseInt(qty),
        price: parseFloat(price.replace(/,/g, '')),
        total: parseFloat(total.replace(/,/g, ''))
      });
    }
  }

  // Паттерн 2: "название  кол-во  цена  сумма"
  if (data.items.length === 0) {
    const pattern2 = /^(.+?)\s{2,}(\d+)\s+([\d,.]+)\s+([\d,.]+)\s*$/gm;
    while ((match = pattern2.exec(fullText)) !== null) {
      const [, name, qty, price, total] = match;
      if (isProductLine(name)) {
        data.items.push({
          name: name.trim(),
          name_ru: translateToRussian(name.trim()),
          quantity: parseInt(qty),
          price: parseFloat(price.replace(/,/g, '')),
          total: parseFloat(total.replace(/,/g, ''))
        });
      }
    }
  }

  // Паттерн 3: "название цена"
  if (data.items.length === 0) {
    const pattern3 = /^(.+?)\s+([\d]{1,4}[.,]\d{2})\s*$/gm;
    while ((match = pattern3.exec(fullText)) !== null) {
      const [, name, price] = match;
      if (isProductLine(name)) {
        const p = parseFloat(price.replace(/,/g, ''));
        data.items.push({
          name: name.trim(),
          name_ru: translateToRussian(name.trim()),
          quantity: 1,
          price: p,
          total: p
        });
      }
    }
  }

  if (/DUBAI|UAE|UNITED ARAB/i.test(fullText)) data.country = 'UAE';
  else if (/RUSSIA|РОССИЯ|МОСКВА/i.test(fullText)) data.country = 'RU';

  return data;
}

function detectCurrency(fullText) {
  if (fullText.includes('AED') || fullText.includes('د.إ') || /DIRHAM|DIRHAMS/i.test(fullText) || /DUBAI|UAE/i.test(fullText)) return 'AED';
  if (fullText.includes('€') || /EURO|EUR\b/i.test(fullText)) return 'EUR';
  if (fullText.includes('$') || /USD\b|DOLLAR/i.test(fullText)) return 'USD';
  if (fullText.includes('₽') || /RUB|RUBLE|РУБ/i.test(fullText)) return 'RUB';
  return 'AED';
}

function isProductLine(name) {
  if (!name || name.length < 2 || name.length > 100) return false;
  const excluded = ['total', 'subtotal', 'итого', 'всего', 'vat', 'ндс', 'tax', 'налог', 'cash', 'card', 'visa', 'mastercard', 'payment', 'change', 'сдача', 'receipt', 'чек', 'date', 'дата', 'time', 'время', 'thank', 'спасибо', 'address', 'адрес', 'tel', 'phone', 'тел', 'www', 'http', 'email', 'order', 'delivery', 'prepayment', 'amounts in', 'all amounts', 'manager', 'driver', 'order accepted', 'delivery time', 'order delivered'];
  const lower = name.toLowerCase();
  return !excluded.some(e => lower.includes(e));
}

function translateToRussian(text) {
  if (!text) return '';
  const translations = {
    'Pickled Cabbage': 'Маринованная капуста',
    'Pickled Herring with Potato': 'Маринованная сельдь с картофелем',
    'Mini Chebureki': 'Мини чебуреки',
    'Borscht': 'Борщ',
    'Beetroot Soup': 'Свекольный суп',
    'Okroshka': 'Окрошка',
    'Summer Soup': 'Летний суп',
    'Beef Cutlets': 'Говяжьи котлеты',
    'Fish Cutlets': 'Рыбные котлеты',
    'Horseradish Jar': 'Баночка хрена',
    'Plastic Bag': 'Пластиковый пакет',
    'Coca-Cola': 'Кока-Кола'
  };
  return translations[text] || text;
}

// ====== LIST MODELS ======
app.get('/api/list-gemini-models', (req, res) => {
  res.json({
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-3.5-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-flash-002', name: 'Gemini 1.5 Flash 002' },
      { id: 'gemini-1.5-pro-002', name: 'Gemini 1.5 Pro 002' }
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

// ====== MODEL MAPPING (frontend names -> backend names) ======
// ВСЕ модели из реальных API (Gemini, Groq, OCR.space)
const MODEL_MAP = {
  // === GEMINI (все generateContent модели) ===
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-flash-image': 'gemini-2.5-flash-image',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',
  'gemini-3-pro-image': 'gemini-3-pro-image',
  'gemini-3-pro-image-preview': 'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image': 'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview-customtools': 'gemini-3.1-pro-preview-customtools',
  'gemini-3.5-flash': 'gemini-3.5-flash',
  'gemini-flash-latest': 'gemini-flash-latest',
  'gemini-flash-lite-latest': 'gemini-flash-lite-latest',
  'gemini-pro-latest': 'gemini-pro-latest',
  'gemini-robotics-er-1.6-preview': 'gemini-robotics-er-1.6-preview',
  'gemini-1.5-flash': 'gemini-1.5-flash',
  'gemini-1.5-pro': 'gemini-1.5-pro',
  'gemini-3.5-flash': 'gemini-3.5-flash',
  'gemini-3.5-flash-001': 'gemini-3.5-flash-001',
  'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-3.5-flash-lite-001': 'gemini-3.5-flash-lite-001',
  'gemini-2.5-flash-preview-tts': 'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts': 'gemini-2.5-pro-preview-tts',
  'gemma-4-26b-a4b-it': 'gemma-4-26b-a4b-it',
  'gemma-4-31b-it': 'gemma-4-31b-it',
  'nano-banana-pro-preview': 'nano-banana-pro-preview',
  'gemini-3.1-flash-tts-preview': 'gemini-3.1-flash-tts-preview',
  'gemini-robotics-er-1.5-preview': 'gemini-robotics-er-1.5-preview',
  'gemini-2.5-computer-use-preview-10-2025': 'gemini-2.5-computer-use-preview-10-2025',
  'antigravity-preview-05-2026': 'antigravity-preview-05-2026',
  'deep-research-max-preview-04-2026': 'deep-research-max-preview-04-2026',
  'deep-research-preview-04-2026': 'deep-research-preview-04-2026',
  'deep-research-pro-preview-12-2025': 'deep-research-pro-preview-12-2025',
  // === GROQ (все модели из API) ===
  'groq-llama-3.3-70b': 'llama-3.3-70b-versatile',
  'groq-llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
  'groq-compound': 'groq/compound',
  'groq-compound-mini': 'groq/compound-mini',
  'groq-allam-2-7b': 'allam-2-7b',
  'groq-llama-3.1-8b': 'llama-3.1-8b-instant',
  'groq-llama-prompt-guard-2-22m': 'meta-llama/llama-prompt-guard-2-22m',
  'groq-llama-prompt-guard-2-86m': 'meta-llama/llama-prompt-guard-2-86m',
  'groq-gpt-oss-120b': 'openai/gpt-oss-120b',
  'groq-gpt-oss-20b': 'openai/gpt-oss-20b',
  'groq-gpt-oss-safeguard-20b': 'openai/gpt-oss-safeguard-20b',
  'groq-qwen3-32b': 'qwen/qwen3-32b',
  'groq-qwen3.6-27b': 'qwen/qwen3.6-27b',
  'groq-mixtral': 'mixtral-8x7b-32768',
  'groq-gemma': 'gemma2-9b-it',
  // === OCR.SPACE (3 движка) ===
  'ocrspace-engine1': 'ocrspace-engine1',
  'ocrspace-engine2': 'ocrspace-engine2',
  'ocrspace-engine3': 'ocrspace-engine3',
};

function resolveModel(modelName) {
  return MODEL_MAP[modelName] || modelName || 'gemini-3.5-flash';
}

function getProvider(modelName) {
  const m = modelName.toLowerCase();
  if (m.startsWith('gemini')) return 'gemini';
  if (m.includes('llama') || m.includes('groq') || m.includes('qwen') || m.includes('allam') || m.includes('openai') || m.includes('mixtral') || m.includes('gemma') || m.includes('prompt-guard')) return 'groq';
  if (m.startsWith('ocr') || m.startsWith('ocrspace')) return 'ocrspace';
  return 'unknown';
}

// POST /api/upload-receipt
app.post('/api/upload-receipt', upload.single('image'), async (req, res) => {
  console.log('>>> /api/upload-receipt called');
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'Нет изображения (поле FormData должно называться "image")' });
    }

    console.log('📁 File:', file.originalname, 'Size:', file.size, 'Type:', file.mimetype);

    const { model, currency, docType } = req.body;
    console.log('📌 Model from frontend:', model);
    console.log('💰 Currency:', currency, '| DocType:', docType);

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

    // 3. Compress image for AI
    const compressedBuffer = await compressImage(file.buffer, 1500, 85);
    const base64Image = compressedBuffer.toString('base64');
    console.log('📐 Base64 length:', base64Image.length);

    // 4. Recognize with correct provider
    let recognized = null;
    let recognitionMethod = model || 'manual';
    let recognitionError = null;

    const frontendModel = model || 'gemini-3.5-flash';
    const backendModel = resolveModel(frontendModel);
    const provider = getProvider(backendModel);

    console.log('🎯 Resolved:', frontendModel, '->', backendModel, '| Provider:', provider);

    try {
      if (provider === 'gemini') {
        console.log('🔍 Gemini...');
        recognized = await recognizeWithGemini(base64Image, 'image/jpeg', backendModel);
        recognitionMethod = backendModel;
      } else if (provider === 'groq') {
        console.log('🔍 Groq...');
        recognized = await recognizeWithGroq(base64Image, 'image/jpeg', backendModel);
        recognitionMethod = backendModel;
      } else if (provider === 'ocrspace') {
        console.log('🔍 OCR.space...');
        recognized = await recognizeWithOCRSpace(compressedBuffer, backendModel);
        recognitionMethod = backendModel;
      } else {
        recognitionError = 'Unknown model: ' + frontendModel + ' (resolved: ' + backendModel + ')';
        console.error('❌', recognitionError);
      }
    } catch (err) {
      console.error('❌ Primary recognition failed:', err.message);
      recognitionError = err.message;

      // Fallback на Gemini ТОЛЬКО если модель не была явно выбрана пользователем
      // (т.е. если provider === 'unknown' или не указана модель)
      if (!model && provider !== 'gemini' && process.env.GEMINI_API_KEY) {
        try {
          console.log('🔄 Fallback to Gemini (no model selected)...');
          recognized = await recognizeWithGemini(base64Image, 'image/jpeg', 'gemini-3.5-flash');
          recognitionMethod = 'gemini-3.5-flash (fallback)';
          recognitionError = null;
        } catch (fallbackErr) {
          console.error('❌ Fallback also failed:', fallbackErr.message);
          recognitionError += ' | Fallback: ' + fallbackErr.message;
        }
      }
    }

    // 5. Если распознавание полностью провалилось
    if (!recognized || (recognized.store_name === 'Unknown' && recognized.total_amount === 0 && recognized.items.length === 0)) {
      if (recognitionError) {
        return res.status(500).json({
          success: false,
          error: 'Распознавание не удалось: ' + recognitionError,
          saved: false
        });
      }
    }

    // Если была ошибка но распознавание частично прошло — показываем предупреждение
    if (recognitionError) {
      console.warn('⚠️ Recognition had errors but returned data:', recognitionError);
    }

    // 5.5. Clean items from AI errors
    if (recognized && recognized.items) {
      const before = recognized.items.length;
      recognized.items = cleanItems(recognized.items);
      console.log('🧹 Cleaned items:', recognized.items.length, 'from', before);
    }

    // 6. Save to DB
    const itemsToSave = Array.isArray(recognized?.items) ? recognized.items : [];
    const rawTextToSave = recognized?.raw_text || '';

    console.log('💾 Saving to DB:', {
      store: recognized?.store_name,
      items_count: itemsToSave.length,
      raw_text_length: rawTextToSave.length
    });

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
      items: itemsToSave,  // массив объектов — Supabase JSONB
      raw_text: rawTextToSave,  // текст — не используем sanitize чтобы не потерять данные
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
      response.warning = 'Распознавание частично не удалось.';
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