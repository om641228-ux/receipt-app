require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ✅ ИЗМЕНЕНО: limit = 1000 по умолчанию (чтобы фронтенд получал все чеки)
    const { type, page = 1, limit = 1000 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('receipts')
      .select('*', { count: 'exact' });

    // Фильтр по типу документа
    if (type && type !== 'all') {
      query = query.eq('document_type', type);
    }

    // Сортировка по дате создания (новые первые)
    query = query.order('created_at', { ascending: false });

    // Пагинация
    query = query.range(offset, offset + limitNum - 1);

    const { data: receipts, error, count } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      receipts: receipts || [],
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil((count || 0) / limitNum)
    });

  } catch (err) {
    console.error('Error fetching receipts:', err.message);
    res.status(500).json({ error: err.message });
  }
};