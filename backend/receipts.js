const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const FormData = require('form-data');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Доступные модели
const MODELS = {
  'gemini-1.5-flash': { provider: 'gemini', name: 'Gemini 1.5 Flash' },
  'gemini-1.5-pro': { provider: 'gemini', name: 'Gemini 1.5 Pro' },
  'gemini-2.0-flash': { provider: 'gemini', name: 'Gemini 2.0 Flash' },
  'gemini-2.0-pro': { provider: 'gemini', name: 'Gemini 2.0 Pro' },
  'llama-3.2-90b-vision-preview': { provider: 'groq', name: 'Llama 3.2 90B Vision (Groq)' },
  'llama-3.2-11b-vision-preview': { provider: 'groq', name: 'Llama 3.2 11B Vision (Groq)' },
  'mixtral-8x7b-32768': { provider: 'groq', name: 'Mixtral 8x7B (Groq)' },
  'claude-3-opus-20240229': { provider: 'anthropic', name: 'Claude 3 Opus' },
  'claude-3-sonnet-20240229': { provider: 'anthropic', name: 'Claude 3 Sonnet' },
  'claude-3-haiku-20240307': { provider: 'anthropic', name: 'Claude 3 Haiku' },
  'ocrspace': { provider: 'ocrspace', name: 'OCR.space' }
};

// Получение списка моделей
router.get('/models', (req, res) => {
  res.json(Object.entries(MODELS).map(([id, info]) => ({
    id,
    name: info.name,
    provider: info.provider
  })));
});

// Распознавание чека
router.post('/recognize', async (req, res) => {
  try {
    console.log('Recognize request received');
    console.log('Body keys:', Object.keys(req.body));
    console.log('File exists:', !!req.file);
    console.log('Model:', req.body.model);
    console.log('Currency:', req.body.currency);
    console.log('Type:', req.body.type);

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const modelId = req.body.model || 'gemini-1.5-flash';
    const currency = req.body.currency || 'AED';
    const receiptType = req.body.type || 'receipt';
    const modelInfo = MODELS[modelId];

    if (!modelInfo) {
      return res.status(400).json({ error: `Unknown model: ${modelId}` });
    }

    const imageBuffer = req.file.buffer;
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    let result = null;

    // --- GEMINI ---
    if (modelInfo.provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
      }
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: modelId });
      
      const prompt = `Analyze this ${receiptType} image and extract all items, prices, taxes, and total. Currency: ${currency}. Return JSON with: store_name, date, items[{name, quantity, price, total}], subtotal, tax, total, currency.`;
      
      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      };

      const geminiResult = await model.generateContent([prompt, imagePart]);
      const response = await geminiResult.response;
      const text = response.text();
      
      // Пытаемся извлечь JSON из ответа
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw_text: text };
      } catch (e) {
        result = { raw_text: text, parse_error: true };
      }
    }

    // --- GROQ ---
    else if (modelInfo.provider === 'groq') {
      if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
      }
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this ${receiptType} image. Extract: store_name, date, items (name, quantity, price, total), subtotal, tax, total. Currency: ${currency}. Return ONLY valid JSON.`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4096,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw_text: content };
      } catch (e) {
        result = { raw_text: content, parse_error: true };
      }
    }

    // --- ANTHROPIC ---
    else if (modelInfo.provider === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
      }
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: base64Image
                  }
                },
                {
                  type: 'text',
                  text: `Analyze this ${receiptType}. Extract JSON with: store_name, date, items[{name, quantity, price, total}], subtotal, tax, total. Currency: ${currency}.`
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || '';
      
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw_text: content };
      } catch (e) {
        result = { raw_text: content, parse_error: true };
      }
    }

    // --- OCR.SPACE ---
    else if (modelInfo.provider === 'ocrspace') {
      if (!process.env.OCRSPACE_API_KEY) {
        return res.status(500).json({ error: 'OCRSPACE_API_KEY not configured' });
      }
      
      const formData = new FormData();
      formData.append('apikey', process.env.OCRSPACE_API_KEY);
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      formData.append('base64Image', `data:${mimeType};base64,${base64Image}`);
      formData.append('filetype', mimeType.split('/')[1] || 'JPG');

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`OCR.space API error: ${response.status}`);
      }

      const data = await response.json();
      result = {
        provider: 'ocrspace',
        raw_text: data.ParsedResults?.[0]?.ParsedText || '',
        ocr_confidence: data.ParsedResults?.[0]?.TextOverlay?.Message || 'N/A'
      };
    }

    if (!result) {
      return res.status(500).json({ error: 'Recognition failed - no result' });
    }

    // Добавляем метаданные
    result._meta = {
      model: modelId,
      provider: modelInfo.provider,
      currency: currency,
      type: receiptType,
      timestamp: new Date().toISOString()
    };

    console.log('Recognition result:', JSON.stringify(result, null, 2));
    res.json(result);

  } catch (error) {
    console.error('RECOGNIZE ERROR:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Recognition failed', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Сохранение чека в Supabase
router.post('/save', async (req, res) => {
  try {
    const receipt = req.body;
    console.log('Save receipt:', receipt);

    const { data, error } = await supabase
      .from('receipts')
      .insert([receipt])
      .select();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('SAVE ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение чеков
router.get('/list', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('LIST ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;