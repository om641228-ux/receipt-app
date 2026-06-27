const Groq = require('groq-sdk');

module.exports = async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('⚡ ЗАПРОС НА ПРОВЕРКУ GROQ МОДЕЛЕЙ');
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
    const apiKey = process.env.GROQ_API_KEY;
    
    console.log('📌 GROQ_API_KEY:', apiKey ? '✅ установлен' : '❌ НЕ УСТАНОВЛЕН');
    if (apiKey) {
      console.log('📝 Ключ:', apiKey.substring(0, 15) + '...');
    }
    
    if (!apiKey) {
      console.log('❌ API ключ не найден');
      return res.json({ 
        success: false, 
        error: 'GROQ_API_KEY не установлен в .env файле',
        totalModels: 0,
        workingModels: 0,
        results: [] 
      });
    }

    console.log('🔧 Инициализация Groq клиента...');
    const groq = new Groq({ apiKey: apiKey });
    
    console.log('📡 Получение списка моделей от Groq...');
    const modelsList = await groq.models.list();
    console.log('📦 Получено моделей:', modelsList.data.length);
    
    if (!modelsList.data || modelsList.data.length === 0) {
      console.log('⚠️ Groq не вернул модели');
      return res.json({ 
        success: true, 
        totalModels: 0,
        workingModels: 0,
        results: [] 
      });
    }

    const allModels = modelsList.data;
    console.log(`\n📋 Все модели Groq (${allModels.length}):`);
    allModels.forEach(m => console.log(`  - ${m.id}`));

    console.log('\n🧪 Начинаем тестирование моделей...');
    for (const model of allModels) {
      try {
        console.log(`\n  Тест: ${model.id}`);
        const testResponse = await groq.chat.completions.create({
          messages: [
            { role: "user", content: "Say OK" }
          ],
          model: model.id,
          max_tokens: 10,
          temperature: 0
        });

        if (testResponse.choices && testResponse.choices.length > 0) {
          console.log(`    ✅ ${model.id} - работает`);
          results.push({
            name: model.id,
            provider: 'Groq',
            status: 'ok',
            message: '✅ Groq (бесплатно)'
          });
        } else {
          console.log(`    ❌ ${model.id} - нет choices`);
          results.push({
            name: model.id,
            provider: 'Groq',
            status: 'error',
            message: '❌ Нет ответа'
          });
        }
      } catch (err) {
        console.log(`    ❌ ${model.id} - ошибка:`, err.message);
        results.push({
          name: model.id,
          provider: 'Groq',
          status: 'error',
          message: '❌ ' + err.message.substring(0, 50)
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
    console.log(`✅ Groq: Найдено ${results.length} моделей, рабочих: ${workingCount}`);
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