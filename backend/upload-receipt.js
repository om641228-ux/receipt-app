const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const supabase = require('./supabase');
const fs = require('fs');
const path = require('path');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.split(' ')[0];
  const match = dateStr.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  } catch (e) {}
  return null;
};

const parseTime = (timeStr) => {
  if (!timeStr) return null;
  if (/^\d{2}:\d{2}:\d{2}/.test(timeStr)) return timeStr;
  if (/^\d{1,2}:\d{2}/.test(timeStr)) return timeStr.padStart(8, '0');
  return null;
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Нет файла' });
    }

    try {
      const { model, currency, docType, token } = req.body;
      
      // Проверяем авторизацию
      const authRes = await fetch(`${req.protocol}://${req.headers.host}/api/me?token=${token}`);
      const authData = await authRes.json();
      if (!authData.success) {
        return res.status(401).json({ success: false, error: 'Не авторизован' });
      }

      const buffer = req.file.buffer;
      const base64 = buffer.toString('base64');
      
      let result;
      let provider = 'Gemini';

      // Определяем провайдер по модели
      if (model && (model.includes('llama') || model.includes('qwen') || model.includes('gpt-oss'))) {
        // Groq
        provider = 'Groq';
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const prompt = `You are a receipt OCR expert...`; // ваш prompt
        
        const completion = await groq.chat.completions.create({
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
            ]
          }],
          model: model,
          temperature: 0.1,
          max_tokens: 4096
        });
        
        let text = completion.choices[0]?.message?.content || '';
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('JSON не найден');
        result = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
        
      } else {
        // Gemini (по умолчанию)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const aiModel = genAI.getGenerativeModel({ 
          model: model || 'gemini-2.0-flash-lite'
        });

        const prompt = `You are a receipt OCR expert. Extract ALL information and translate to Russian.
Return ONLY valid JSON:
{
  "store_name": "Original store name",
  "store_name_ru": "Название магазина на русском",
  "date": "2024-01-15",
  "time": "14:30",
  "total": 45.99,
  "subtotal": 40.00,
  "tax": 5.99,
  "tax_rate": "5%",
  "currency": "${currency || 'AED'}",
  "country": "UAE",
  "items": [
    {"name": "Original product name", "name_ru": "Название на русском", "quantity": 2, "price": 10.50, "total": 21.00}
  ],
  "payment_method": "card",
  "cashier": "Anna"
}

RULES:
- Extract EVERY item
- Translate ALL names to Russian (store_name_ru, name_ru)
- Keep original names too (store_name, name)
- Detect currency from symbols (€, $, £, د.إ, руб)
- Use null for unknown fields
- Return ONLY JSON, no markdown`;

        const genResult = await aiModel.generateContent([
          prompt,
          { inlineData: { data: base64, mimeType: req.file.mimetype } }
        ]);
        
        let text = genResult.response.text();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('JSON не найден');
        result = JSON.parse(text.substring(jsonStart, jsonEnd +