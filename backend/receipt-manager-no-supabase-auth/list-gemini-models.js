module.exports = async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 ЗАПРОС НА ПРОВЕРКУ GEMINI МОДЕЛЕЙ');
  console.log('='.repeat(60));
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    console.log('⚡ OPTIONS request');
    return res.status(200).end();
  }
  
  try {
    const results = [];
    const apiKey = process.env.GEMINI_API_KEY;
    
    console.log('📌 GEMINI_API_KEY:', apiKey ? '✅ установлен' : '❌ НЕ УСТАНОВЛЕН');
    
    if (!apiKey) {
      console.log('❌ API ключ не найден');
      return res.json({ 
        success: false, 
        error: 'GEMINI_API_KEY не установлен в .env файле',
        totalModels: 0,
        workingModels: 0,
        results: [] 
      });
    }

    console.log('📡 Запрос к Google API...');
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    const modelsResponse = await fetch(modelsUrl);
    console.log('📥 Статус ответа:', modelsResponse.status);
    
    if (!modelsResponse.ok) {
      const errorText = await modelsResponse.text();
      console.error('❌ Ошибка HTTP:', modelsResponse.status, errorText);
      throw new Error(`HTTP ${modelsResponse.status}: ${errorText}`);
    }
    
    const modelsData = await modelsResponse.json();
    console.log('📦 Получено данных:', JSON.stringify(modelsData).length, 'байт');
    
    if (!modelsData.models) {
      console.error('❌ Нет поля models в ответе');
      return res.json({ 
        success: false, 
        error: 'Неверный формат ответа от API',
        totalModels: 0,
        workingModels: 0,
        results: [] 
      });
    }

    const allModels = modelsData.models;
    console.log(`📊 Всего моделей от Google: ${allModels.length}`);
    
    const geminiModels = allModels
      .filter(model => {
        const hasGenerateContent = model.supportedGenerationMethods && 
                                   model.supportedGenerationMethods.includes('generateContent');
        const isGemini = model.name && model.name.includes('gemini');
        return hasGenerateContent && isGemini;
      })
      .map(model => ({
        id: model.name.replace('models/', ''),
        name: model.displayName || model.name
      }));

    console.log(`📋 Gemini моделей с generateContent: ${geminiModels.length}`);
    geminiModels.forEach(m => console.log(`  - ${m.id}`));

    for (const model of geminiModels) {
      try {
        console.log(`\n🧪 Тестирование модели: ${model.id}`);
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`;
        
        const testResponse = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "OK"' }] }]
          })
        });
        
        const testData = await testResponse.json();
        
        if (testResponse.ok && testData.candidates && testData.candidates.length > 0) {
          console.log(`  ✅ ${model.id} - работает`);
          results.push({
            name: model.id,
            provider: 'Gemini',
            status: 'ok',
            message: '✅ Доступна'
          });
        } else {
          console.log(`  ❌ ${model.id} - ошибка:`, testData.error?.message || 'Нет кандидатов');
          results.push({
            name: model.id,
            provider: 'Gemini',
            status: 'error',
            message: testData.error?.message || '❌ Ошибка'
          });
        }
      } catch (err) {
        console.log(`  ❌ ${model.id} - исключение:`, err.message);
        results.push({
          name: model.id,
          provider: 'Gemini',
          status: 'error',
          message: '❌ Нет подключения'
        });
      }
    }

    results.sort((a, b) => {
      if (a.status === 'ok' && b.status !== 'ok') return -1;
      if (a.status !== 'ok' && b.status === 'ok') return 1;
      return a.name.localeCompare(b.name);
    });

    const workingCount = results.filter(r => r.status === 'ok').length;
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Gemini: Найдено ${results.length} моделей, рабочих: ${workingCount}`);
    console.log('='.repeat(60) + '\n');

    res.json({ 
      success: true, 
      totalModels: results.length,
      workingModels: workingCount,
      results: results 
    });
  } catch (err) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', err.message);
    console.error('📋 Stack:', err.stack);
    console.log('='.repeat(60) + '\n');
    res.status(500).json({ 
      success: false, 
      error: err.message,
      totalModels: 0,
      workingModels: 0,
      results: [] 
    });
  }
};