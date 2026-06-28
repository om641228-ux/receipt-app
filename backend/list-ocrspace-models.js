const FormData = require('form-data');

module.exports = async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 ЗАПРОС НА ПРОВЕРКУ OCR.SPACE');
  console.log('='.repeat(60));
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const { default: fetch } = await import('node-fetch');
    const API_KEY = process.env.OCRSPACE_API_KEY || 'K89156518988957';
    const API_URL = 'https://api.ocr.space/parse/image';
    
    // БОЛЬШЕЕ тестовое изображение (10x10 пикселей)
    const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADu0W8HqoAAAAAElFTkSuQmCC';
    
    console.log('📌 OCRSPACE_API_KEY:', API_KEY ? '✅ установлен' : '❌ НЕ УСТАНОВЛЕН');
    
    if (!API_KEY) {
      return res.json({ 
        success: false, 
        error: 'OCRSPACE_API_KEY не установлен',
        totalModels: 0,
        workingModels: 0,
        results: [] 
      });
    }

    const results = [];

    for (const engine of ['1', '2']) {
      try {
        console.log(`\n  Тест: OCR Engine ${engine}...`);
        
        const formData = new FormData();
        formData.append('apikey', API_KEY);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('OCREngine', engine);
        formData.append('detectOrientation', 'true');
        formData.append('base64Image', TEST_IMAGE);

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { ...formData.getHeaders() },
          body: formData,
          timeout: 15000 // 15 секунд таймаут
        });

        const text = await response.text();
        console.log('   Статус:', response.status);
        
        let result;
        try {
          result = JSON.parse(text);
        } catch (e) {
          console.log(`   ⚠️  Engine ${engine} - не JSON ответ`);
          results.push({
            name: `ocr-engine-${engine}`,
            provider: 'OCR.Space',
            status: 'warning',
            message: `⚠️ Engine ${engine} (нестабильный)`
          });
          continue;
        }

        console.log('   OCRExitCode:', result.OCRExitCode);
        if (result.ErrorMessage) {
          console.log('   ErrorMessage:', result.ErrorMessage);
        }

        if (response.ok && !result.IsErroredOnProcessing && result.OCRExitCode === 1) {
          console.log(`   ✅ OCR Engine ${engine} - работает!`);
          results.push({
            name: `ocr-engine-${engine}`,
            provider: 'OCR.Space',
            status: 'ok',
            message: `✅ OCR.Space (Engine ${engine})`
          });
        } else if (result.OCRExitCode === 99) {
          console.log(`   ⚠️  Engine ${engine} - превышен лимит`);
          results.push({
            name: `ocr-engine-${engine}`,
            provider: 'OCR.Space',
            status: 'warning',
            message: `⚠️ Engine ${engine} (лимит превышен)`
          });
        } else {
          console.log(`   ⚠️  Engine ${engine} - ${result.ErrorMessage?.[0] || 'Ошибка'}`);
          results.push({
            name: `ocr-engine-${engine}`,
            provider: 'OCR.Space',
            status: 'warning',
            message: `⚠️ Engine ${engine} (${result.ErrorMessage?.[0] || 'Ошибка'})`
          });
        }
      } catch (err) {
        console.log(`   ❌ OCR Engine ${engine} - ${err.message}`);
        results.push({
          name: `ocr-engine-${engine}`,
          provider: 'OCR.Space',
          status: 'error',
          message: '❌ ' + err.message.substring(0, 50)
        });
      }
    }

    const workingCount = results.filter(r => r.status === 'ok').length;
    console.log('\n' + '='.repeat(60));
    console.log(`✅ OCR.Space: Найдено ${results.length} моделей, рабочих: ${workingCount}`);
    
    if (workingCount === 0) {
      console.log('\n💡 Рекомендации:');
      console.log('   1. Проверьте API ключ на https://ocr.space/Account');
      console.log('   2. Проверьте лимит запросов (25,000/мес бесплатно)');
      console.log('   3. Engine 1 быстрее, Engine 2 точнее');
    }
    console.log('='.repeat(60) + '\n');

    res.json({ 
      success: true, 
      totalModels: results.length,
      workingModels: workingCount,
      results: results 
    });
  } catch (err) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      totalModels: 0,
      workingModels: 0,
      results: [] 
    });
  }
};
app.get('/api/list-ocrspace-models', (req, res) => {
  const allModels = [
    { id: 'ocrspace-engine2', name: 'OCR.space Engine 2', status: 'ok' },
    { id: 'ocrspace-engine5', name: 'OCR.space Engine 5', status: 'ok' },
    { id: 'ocr-engine-1', name: 'OCR Engine 1', status: 'ok' },
    { id: 'ocr-engine-2', name: 'OCR Engine 2', status: 'ok' },
  ];
  res.json({ models: allModels });
});