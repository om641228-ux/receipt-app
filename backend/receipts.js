const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function recognizeWithGemini(base64Image, mimeType) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Extract from this receipt and return STRICT JSON only:
{
  "store": "store name or Unknown",
  "date": "YYYY-MM-DD",
  "total": 0.00,
  "items": [{"name": "item", "price": 0.00, "quantity": 1}]
}`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64Image, mimeType: mimeType || 'image/jpeg' } }
  ]);

  const text = result.response.text();
  console.log('Gemini raw response:', text);

  // Вытаскиваем JSON из возможного markdown
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Gemini response');
  
  const json = JSON.parse(match[1] || match[0]);
  return json;
}

router.post('/', upload.single('image'), async (req, res) => {
  console.log('>>> Upload started');
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file (field name must be "image")' });
    }

    console.log('File:', req.file.originalname, 'Size:', req.file.size, 'Type:', req.file.mimetype);

    const base64Image = req.file.buffer.toString('base64');
    let parsed = null;

    // 1. Пробуем Gemini
    try {
      parsed = await recognizeWithGemini(base64Image, req.file.mimetype);
      console.log('Parsed:', parsed);
    } catch (geminiErr) {
      console.error('Gemini failed:', geminiErr.message);
    }

    // 2. Загружаем картинку в Supabase Storage
    const filePath = `${Date.now()}_${req.file.originalname}`;
    const { error: upErr } = await supabase.storage
      .from('receipts')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype });

    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath);
    const imageUrl = urlData.publicUrl.replace('http://', 'https://'); // фикс Mixed Content

    // 3. Сохраняем в БД
    const insert = {
      image_url: imageUrl,
      store_name: parsed?.store || 'Unknown',
      date: parsed?.date || new Date().toISOString().split('T')[0],
      total: parsed?.total || 0,
      currency: req.body.currency || 'AED',
      type: req.body.type || 'Чек',
      items: parsed?.items || [],
      created_at: new Date().toISOString()
    };

    const { data: dbData, error: dbErr } = await supabase
      .from('receipts')
      .insert([insert])
      .select()
      .single();

    if (dbErr) throw dbErr;

    res.json({ success: true, data: dbData });

  } catch (err) {
    console.error('>>> CRASH:', err);
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

module.exports = router;