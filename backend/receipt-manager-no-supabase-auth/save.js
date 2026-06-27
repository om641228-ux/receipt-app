const supabase = require('./supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { item, image } = req.body;
    if (!item) return res.status(400).json({ error: 'Нет данных' });

    const { data, error } = await supabase
      .from('receipts')
      .insert([{
        image_url: image || null,
        store_name: item.store_name || null,
        receipt_date: item.date || null,
        receipt_number: item.receipt_number || null,
        total_amount: item.total_amount || null,
        currency: item.currency || 'RUB',
        tax_amount: item.tax_amount || null,
        items: item.items || [],
        raw_text: item.raw_text || null,
        document_type: item.document_type || 'receipt'
      }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('Save Error:', err);
    res.status(500).json({ error: err.message });
  }
};