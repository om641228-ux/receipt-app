import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API_URL = 'https://backend-production-adc7.up.railway.app';

function App() {
  // === СОСТОЯНИЯ ===
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Загрузка
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-lite');
  const [currency, setCurrency] = useState('AED');
  const [docType, setDocType] = useState('receipt');
  const [showModelSelector, setShowModelSelector] = useState(false);
  
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

  // === ЗАГРУЗКА ФАЙЛОВ ===
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFiles(files);
      setCurrentFileIndex(0);
      setPreviewUrl(URL.createObjectURL(files[0]));
      setRecognitionResult(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      setSelectedFiles(files);
      setCurrentFileIndex(0);
      setPreviewUrl(URL.createObjectURL(files[0]));
      setRecognitionResult(null);
    }
  };

  const nextFile = () => {
    if (currentFileIndex < selectedFiles.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
      setPreviewUrl(URL.createObjectURL(selectedFiles[currentFileIndex + 1]));
      setRecognitionResult(null);
    }
  };

  const prevFile = () => {
    if (currentFileIndex > 0) {
      setCurrentFileIndex(currentFileIndex - 1);
      setPreviewUrl(URL.createObjectURL(selectedFiles[currentFileIndex - 1]));
      setRecognitionResult(null);
    }
  };

  // === РАСПОЗНАВАНИЕ ===
  const recognizeCurrent = async () => {
    if (!selectedFiles.length) return;
    setRecognizing(true);
    
    try {
      const file = selectedFiles[currentFileIndex];
      const base64 = await fileToBase64(file);
      
      const res = await fetch(`${API_URL}/api/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          model: selectedModel,
          currency: currency
        })
      });
      const data = await res.json();
      setRecognitionResult(data);
      
      if (data.success && data.data) {
        await saveReceipt(data.data, base64);
      }
    } catch (e) {
      console.error('Ошибка распознавания:', e);
      setRecognitionResult({ success: false, error: e.message });
    }
    
    setRecognizing(false);
  };

  const recognizeWithModel = async (endpoint) => {
    if (!selectedFiles.length) return;
    setRecognizing(true);
    
    try {
      const file = selectedFiles[currentFileIndex];
      const base64 = await fileToBase64(file);
      
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
      
      if (data.success && data.data) {
        await saveReceipt(data.data, base64);
      }
    } catch (e) {
      console.error('Ошибка:', e);
      setRecognitionResult({ success: false, error: e.message });
    }
    
    setRecognizing(false);
  };

  const compareRecognize = async () => {
    if (!selectedFiles.length) return;
    setRecognizing(true);
    
    try {
      const file = selectedFiles[currentFileIndex];
      const base64 = await fileToBase64(file);
      
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

  // === СОХРАНЕНИЕ ===
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
        body: JSON.stringify({ receiptIds: [] })
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

  // === МОДЕЛИ ===
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
          <h1>🧾 Receipt Manager</h1>
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
      {/* === МИНИМАЛЬНЫЙ ХЕДЕР === */}
      <header className="mini-header">
        <div className="header-left">
          <span className="logo-icon">🧾</span>
        </div>
        <div className="header-right">
          <button className="logout-btn" onClick={logout}>🚪 Выйти</button>
        </div>
      </header>

      {/* === ТАБЫ === */}
      <nav className="tabs">
        <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>
          📤 Загрузка
        </button>
        <button className={activeTab === 'list' ? 'active' : ''} onClick={() => {setActiveTab('list'); loadReceipts();}}>
          📋 Чеки ({receipts.length})
        </button>
      </nav>

      {/* === ВКЛАДКА ЗАГРУЗКА === */}
      {activeTab === 'upload' && (
        <div className="upload-section">
          {/* Верхняя панель с выбором модели */}
          <div className="top-controls">
            <button 
              className="model-toggle-btn"
              onClick={() => {setShowModelSelector(!showModelSelector); if (!models.length) loadModels();}}
            >
              🤖 {showModelSelector ? 'Скрыть модели' : 'Выбор модели'}
            </button>
            
            {showModelSelector && (
              <div className="model-dropdown">
                {modelsLoading ? (
                  <p>Загрузка моделей...</p>
                ) : (
                  <div className="models-grid">
                    {models.filter(m => m.status === 'ok').map(model => (
                      <div 
                        key={model.name} 
                        className={`model-option ${selectedModel === model.name ? 'selected' : ''}`}
                        onClick={() => {setSelectedModel(model.name); setShowModelSelector(false);}}
                      >
                        <span className="provider-badge">{model.provider}</span>
                        <span className="model-name">{model.name}</span>
                        <span className="status-ok">✅</span>
                      </div>
                    ))}
                    <div className="model-option" onClick={() => {setSelectedModel('gemini-2.0-flash-lite'); setShowModelSelector(false);}}>
                      <span className="provider-badge">Gemini</span>
                      <span className="model-name">gemini-2.0-flash-lite</span>
                    </div>
                    <div className="model-option" onClick={() => {setSelectedModel('meta-llama/llama-4-scout-17b-16e-instruct'); setShowModelSelector(false);}}>
                      <span className="provider-badge">Groq</span>
                      <span className="model-name">llama-4-scout</span>
                    </div>
                    <div className="model-option" onClick={() => {setSelectedModel('claude-sonnet-4-20250514'); setShowModelSelector(false);}}>
                      <span className="provider-badge">Claude</span>
                      <span className="model-name">claude-sonnet-4</span>
                    </div>
                    <div className="model-option" onClick={() => {setSelectedModel('ocr-engine-2'); setShowModelSelector(false);}}>
                      <span className="provider-badge">OCR</span>
                      <span className="model-name">OCR.Space Engine 2</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="current-model">
              <small>Модель: <strong>{selectedModel}</strong></small>
            </div>
          </div>

          {/* Зона загрузки */}
          <div 
            className="drop-zone"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <input 
              type="file" 
              accept="image/*" 
              multiple
              onChange={handleFileSelect} 
              id="file-input" 
            />
            <label htmlFor="file-input">
              {previewUrl ? (
                <div className="preview-container">
                  <img src={previewUrl} alt="Preview" className="preview" />
                  {selectedFiles.length > 1 && (
                    <div className="file-nav">
                      <button onClick={(e) => {e.preventDefault(); prevFile();}} disabled={currentFileIndex === 0}>◀</button>
                      <span>{currentFileIndex + 1} / {selectedFiles.length}</span>
                      <button onClick={(e) => {e.preventDefault(); nextFile();}} disabled={currentFileIndex === selectedFiles.length - 1}>▶</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="drop-text">
                  <p>📷 Перетащите фото чека сюда</p>
                  <p>или нажмите для выбора файлов</p>
                  <p className="hint">Можно выбрать несколько файлов (папка)</p>
                </div>
              )}
            </label>
          </div>

          {/* Настройки */}
          <div className="controls-row">
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

          {/* Кнопка РАСПОЗНАТЬ */}
          <div className="recognize-bar">
            <button 
              className="recognize-main-btn"
              onClick={recognizeCurrent}
              disabled={!selectedFiles.length || recognizing}
            >
              {recognizing ? '⏳ Распознавание...' : '🔍 Распознать'}
            </button>
            
            <button 
              className="recognize-alt-btn"
              onClick={compareRecognize}
              disabled={!selectedFiles.length || recognizing}
            >
              ⚡ Сравнить
            </button>
          </div>

          {/* Результат */}
          {recognitionResult && (
            <div className={`result ${recognitionResult.success ? 'success' : 'error'}`}>
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
                </div>
              ) : (
                <div>
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
                    <button>👁️ Просмотр</button>
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
    </div>
  );
}

export default App;