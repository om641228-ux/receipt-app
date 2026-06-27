import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API_URL = 'https://backend-production-adc7.up.railway.app';

function App() {
  // === СОСТОЯНИЯ ===
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload'); // upload, list, models
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Загрузка
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
  const [currency, setCurrency] = useState('AED');
  const [docType, setDocType] = useState('receipt');
  
  // Модели
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  
  // Фильтры
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // === АВТОРИЗАЦИЯ ===
  const login = async () => {
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
        setLoginError('');
        loadReceipts(data.token);
      } else {
        setLoginError(data.error || 'Неверный пароль');
      }
    } catch (e) {
      setLoginError('Ошибка соединения');
    }
  };

  const logout = async () => {
    if (token) {
      await fetch(`${API_URL}/api/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    setReceipts([]);
  };

  // === ЗАГРУЗКА ЧЕКОВ ===
  const loadReceipts = useCallback(async (authToken = token) => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/receipts?token=${authToken}&type=${filterType}`);
      const data = await res.json();
      setReceipts(data.receipts || []);
    } catch (e) {
      console.error('Ошибка загрузки:', e);
    }
    setLoading(false);
  }, [token, filterType]);

  useEffect(() => {
    if (token) {
      // Проверяем токен
      fetch(`${API_URL}/api/me?token=${token}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setUser(data.user);
            loadReceipts(token);
          } else {
            logout();
          }
        });
    }
  }, [token, loadReceipts]);

  // === ЗАГРУЗКА ФАЙЛА ===
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setRecognitionResult(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setRecognitionResult(null);
    }
  };

  // === РАСПОЗНАВАНИЕ ===
  const recognize = async (endpoint) => {
    if (!selectedFile) return;
    setRecognizing(true);
    
    try {
      const base64 = await fileToBase64(selectedFile);
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          model: selectedModel,
          currency: currency,
          docType: docType
        })
      });
      const data = await res.json();
      setRecognitionResult(data);
      
      // Если успешно и есть данные — сохраняем
      if (data.success && data.data) {
        await saveReceipt(data.data, base64);
      }
    } catch (e) {
      console.error('Ошибка распознавания:', e);
      setRecognitionResult({ success: false, error: e.message });
    }
    
    setRecognizing(false);
  };

  const compareRecognize = async () => {
    if (!selectedFile) return;
    setRecognizing(true);
    
    try {
      const base64 = await fileToBase64(selectedFile);
      const res = await fetch(`${API_URL}/api/compare-recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          currency: currency,
          docType: docType
        })
      });
      const data = await res.json();
      setRecognitionResult(data);
      
      if (data.success && data.saved) {
        loadReceipts();
      }
    } catch (e) {
      console.error('Ошибка:', e);
      setRecognitionResult({ success: false, error: e.message });
    }
    
    setRecognizing(false);
  };

  // === СОХРАНЕНИЕ ЧЕКА ===
  const saveReceipt = async (receiptData, image) => {
    try {
      const res = await fetch(`${API_URL}/api/save-receipt?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: receiptData,
          image: image,
          docType: docType,
          recognitionMethod: `${receiptData.provider || 'unknown'}:${selectedModel}`,
          recognizedAt: new Date().toISOString()
        })
      });
      const data = await res.json();
      if (data.success) {
        loadReceipts();
      }
      return data;
    } catch (e) {
      console.error('Ошибка сохранения:', e);
    }
  };

  // === УДАЛЕНИЕ ===
  const deleteReceipt = async (id) => {
    if (!window.confirm('Удалить чек?')) return;
    try {
      const res = await fetch(`${API_URL}/api/delete-receipt/${id}?token=${token}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadReceipts();
      }
    } catch (e) {
      console.error('Ошибка удаления:', e);
    }
  };

  // === ЭКСПОРТ ===
  const exportExcel = async () => {
    try {
      const res = await fetch(`${API_URL}/api/export-excel?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds: [] }) // все чеки
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'receipts.xlsx';
      a.click();
    } catch (e) {
      console.error('Ошибка экспорта:', e);
    }
  };

  // === ПРОВЕРКА МОДЕЛЕЙ ===
  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/list-and-test-models`);
      const data = await res.json();
      setModels(data.results || []);
    } catch (e) {
      console.error('Ошибка:', e);
    }
    setModelsLoading(false);
  };

  // === УТИЛИТЫ ===
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  const formatAmount = (amount, currency) => {
    if (!amount) return '-';
    return `${parseFloat(amount).toFixed(2)} ${currency || ''}`;
  };

  // === РЕНДЕР ===
  if (!token) {
    return (
      <div className="App">
        <div className="login-box">
          <h1>🔐 Receipt Manager</h1>
          <input 
            type="password" 
            placeholder="Введите пароль" 
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && login()}
          />
          <button onClick={login}>Войти</button>
          {loginError && <p className="error">{loginError}</p>}
          <p className="hint">Пароли: admin, user1-user20</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>📄 Receipt Manager</h1>
        <div className="user-bar">
          <span>{user?.name || 'Пользователь'} ({user?.role})</span>
          <button onClick={logout}>Выйти</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>
          📤 Загрузка
        </button>
        <button className={activeTab === 'list' ? 'active' : ''} onClick={() => {setActiveTab('list'); loadReceipts();}}>
          📋 Чеки ({receipts.length})
        </button>
        <button className={activeTab === 'models' ? 'active' : ''} onClick={() => {setActiveTab('models'); loadModels();}}>
          🤖 Модели
        </button>
      </nav>

      {/* === ВКЛАДКА ЗАГРУЗКА === */}
      {activeTab === 'upload' && (
        <div className="upload-section">
          <div 
            className="drop-zone"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <input type="file" accept="image/*" onChange={handleFileSelect} id="file-input" />
            <label htmlFor="file-input">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="preview" />
              ) : (
                <div className="drop-text">
                  <p>📷 Перетащите фото чека сюда</p>
                  <p>или нажмите для выбора</p>
                </div>
              )}
            </label>
          </div>

          <div className="controls">
            <div className="control-group">
              <label>Модель:</label>
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
                <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout</option>
                <option value="meta-llama/llama-4-maverick-17b-128e-instruct">Llama 4 Maverick</option>
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="ocr-engine-2">OCR.Space Engine 2</option>
              </select>
            </div>

            <div className="control-group">
              <label>Валюта:</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="AED">AED (Дирхам)</option>
                <option value="EUR">EUR (Евро)</option>
                <option value="USD">USD (Доллар)</option>
                <option value="RUB">RUB (Рубль)</option>
              </select>
            </div>

            <div className="control-group">
              <label>Тип:</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="receipt">Чек</option>
                <option value="invoice">Фактура</option>
              </select>
            </div>
          </div>

          <div className="recognize-buttons">
            <button onClick={() => recognize('/api/identify')} disabled={!selectedFile || recognizing}>
              🤖 Gemini
            </button>
            <button onClick={() => recognize('/api/identify-groq')} disabled={!selectedFile || recognizing}>
              ⚡ Groq
            </button>
            <button onClick={() => recognize('/api/identify-claude')} disabled={!selectedFile || recognizing}>
              🎨 Claude
            </button>
            <button onClick={() => recognize('/api/identify-ocrspace')} disabled={!selectedFile || recognizing}>
              📷 OCR.Space
            </button>
            <button onClick={compareRecognize} disabled={!selectedFile || recognizing} className="compare-btn">
              🔍 Сравнить (Gemini + Groq)
            </button>
          </div>

          {recognizing && <div className="spinner">⏳ Распознавание...</div>}

          {recognitionResult && (
            <div className="result">
              {recognitionResult.success ? (
                <div>
                  <h3>✅ Распознано</h3>
                  <p><strong>Магазин:</strong> {recognitionResult.data?.store_name_ru || recognitionResult.data?.store_name}</p>
                  <p><strong>Дата:</strong> {recognitionResult.data?.date}</p>
                  <p><strong>Итого:</strong> {recognitionResult.data?.total} {recognitionResult.data?.currency}</p>
                  <p><strong>Товаров:</strong> {recognitionResult.data?.items?.length || 0}</p>
                  {recognitionResult.comparison && (
                    <p><strong>Победитель:</strong> {recognitionResult.comparison.winner}</p>
                  )}
                  <details>
                    <summary>📋 Подробности</summary>
                    <pre>{JSON.stringify(recognitionResult, null, 2)}</pre>
                  </details>
                </div>
              ) : (
                <div className="error">
                  <h3>❌ Ошибка</h3>
                  <p>{recognitionResult.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === ВКЛАДКА СПИСОК === */}
      {activeTab === 'list' && (
        <div className="list-section">
          <div className="filters">
            <select value={filterType} onChange={e => {setFilterType(e.target.value); loadReceipts();}}>
              <option value="all">Все</option>
              <option value="receipt">Чеки</option>
              <option value="invoice">Фактуры</option>
            </select>
            <input 
              type="text" 
              placeholder="Поиск..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button onClick={exportExcel}>📥 Excel</button>
            <button onClick={() => loadReceipts()}>🔄 Обновить</button>
          </div>

          {loading ? (
            <p>Загрузка...</p>
          ) : receipts.length === 0 ? (
            <p>Нет чеков. Загрузите первый!</p>
          ) : (
            <div className="receipts-grid">
              {receipts.filter(r => {
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                return (r.store_name_ru || r.store_name || '').toLowerCase().includes(q) ||
                       (r.raw_text || '').toLowerCase().includes(q);
              }).map(receipt => (
                <div key={receipt.id} className="receipt-card">
                  <div className="receipt-header">
                    <h3>{receipt.store_name_ru || receipt.store_name || 'Без названия'}</h3>
                    <span className="type-badge">{receipt.document_type}</span>
                  </div>
                  <p className="date">{formatDate(receipt.receipt_date)} {receipt.receipt_time}</p>
                  <p className="amount">{formatAmount(receipt.total_amount, receipt.currency)}</p>
                  <p className="items-count">🛒 {receipt.items?.length || 0} товаров</p>
                  {receipt.image_url && (
                    <img src={receipt.image_url} alt="Чек" className="receipt-thumb" />
                  )}
                  <div className="receipt-actions">
                    <button onClick={() => {}}>👁️ Просмотр</button>
                    {user?.role === 'admin' && (
                      <button onClick={() => deleteReceipt(receipt.id)} className="danger">🗑️ Удалить</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === ВКЛАДКА МОДЕЛИ === */}
      {activeTab === 'models' && (
        <div className="models-section">
          <h2>🤖 Доступные модели</h2>
          {modelsLoading ? (
            <p>Загрузка...</p>
          ) : (
            <div className="models-list">
              {models.filter(m => m.status === 'ok').map(model => (
                <div key={model.name} className="model-card ok">
                  <span className="provider">{model.provider}</span>
                  <span className="name">{model.name}</span>
                  <span className="status">✅ Работает</span>
                </div>
              ))}
              {models.filter(m => m.status !== 'ok').map(model => (
                <div key={model.name} className="model-card error">
                  <span className="provider">{model.provider}</span>
                  <span className="name">{model.name}</span>
                  <span className="status">❌ {model.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;