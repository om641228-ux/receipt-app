const supabase = require('./supabase');
const fs = require('fs');
const path = require('path');

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
  
  try {
    const { receipt, image, docType, recognitionMethod, recognizedAt, object } = req.body;
    console.log('=== SAVE RECEIPT ===');
    console.log('Store:', receipt?.store_name);
    console.log('Has image:', !!image);
    console.log('Image length:', image ? image.length : 0);

    let imageUrl = null;

    if (image) {
      try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `receipt-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        
        console.log('Uploading to Supabase Storage:', filename);
        console.log('Buffer size:', buffer.length, 'bytes');

        // Проверяем существование бакета
        const { data: buckets } = await supabase.storage.listBuckets();
        console.log('Available buckets:', buckets?.map(b => b.name));

        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('receipts')
          .upload(filename, buffer, { 
            contentType: 'image/jpeg', 
            upsert: false 
          });

        if (uploadError) {
          console.error('❌ Supabase upload error:', uploadError);
          throw uploadError;
        }

        console.log('✅ Upload success:', uploadData);

        const { data: urlData } = supabase
          .storage
          .from('receipts')
          .getPublicUrl(filename);

        imageUrl = urlData?.publicUrl;
        console.log('✅ Public URL:', imageUrl);

      } catch (imgErr) {
        console.error('❌ Image upload failed:', imgErr.message);
        console.error('Error details:', imgErr);
        // Не прерываем — сохраняем чек без фото
      }
    }

    const formattedDate = parseDate(receipt.date);
    const formattedTime = parseTime(receipt.time);
    
    let recognizedAtFinal = new Date().toISOString();
    if (recognizedAt && !isNaN(new Date(recognizedAt).getTime())) {
      recognizedAtFinal = new Date(recognizedAt).toISOString();
    }
    
    const recognitionMethodFinal = recognitionMethod || receipt.recognition_method || null;

    console.log('Saving to DB with image_url:', imageUrl);

    const { data, error } = await supabase
      .from('receipts')
      .insert([{
        store_name: receipt.store_name || null,
        store_name_ru: receipt.store_name_ru || null,
        receipt_date: formattedDate,
        receipt_time: formattedTime,
        total_amount: receipt.total || null,
        subtotal: receipt.subtotal || null,
        tax_amount: receipt.tax || null,
        tax_rate: receipt.tax_rate || null,
        currency: receipt.currency || 'AED',
        country: receipt.country || null,
        payment_method: receipt.payment_method || null,
        payment_amount: receipt.payment_amount || null,
        cashier: receipt.cashier || null,
        items: receipt.items || [],
        image_url: imageUrl,
        raw_text: receipt.raw_text || null,
        document_type: docType || 'receipt',
        recognized_at: recognizedAtFinal,
        recognition_method: recognitionMethodFinal,
        object: object || null,
        owner_id: req.user?.id || req.userId || null,
        owner_name: req.user?.name || req.userName || null
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ DB insert error:', error);
      throw error;
    }

    console.log('✅ Saved to DB:', data.id, 'image_url:', data.image_url);

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Save Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};