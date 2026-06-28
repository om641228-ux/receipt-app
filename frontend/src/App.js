import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API_URL = 'https://backend-production-adc7.up.railway.app';

// Хелпер: убираем http:// для изображений (Mixed Content)
const fixImageUrl = (url) => {
  if (!url) return null;
  return url.replace(/^http:\/\//, 'https://');
};

// Fallback-модели (ВСЕ доступные из API)
const FALLBACK_MODELS = [
  // OCR.space (3 движка)
  { name: 'ocrspace-engine1', displayName: 'OCR.space Engine 1 (Basic)', provider: 'OCR.space' },
  { name: 'ocrspace-engine2', displayName: 'OCR.space Engine 2 (Advanced)', provider: 'OCR.space' },
  { name: 'ocrspace-engine3', displayName: 'OCR.space Engine 3 (Handwriting)', provider: 'OCR.space' },
  // Gemini (все generateContent модели)
  { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: 'Gemini' },
  { name: 'gemini-2.5-flash-image', displayName: 'Gemini 2.5 Flash Image', provider: 'Gemini' },
  { name: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite', provider: 'Gemini' },
  { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', provider: 'Gemini' },
  { name: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash Preview', provider: 'Gemini' },
  { name: 'gemini-3-pro-image', displayName: 'Gemini 3 Pro Image', provider: 'Gemini' },
  { name: 'gemini-3-pro-image-preview', displayName: 'Gemini 3 Pro Image Preview', provider: 'Gemini' },
  { name: 'gemini-3.1-flash-image', displayName: 'Gemini 3.1 Flash Image', provider: 'Gemini' },
  { name: 'gemini-3.1-flash-image-preview', displayName: 'Gemini 3.1 Flash Image Preview', provider: 'Gemini' },
  { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', provider: 'Gemini' },
  { name: 'gemini-3.1-flash-lite-preview', displayName: 'Gemini 3.1 Flash Lite Preview', provider: 'Gemini' },
  { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', provider: 'Gemini' },
  { name: 'gemini-3.1-pro-preview-customtools', displayName: 'Gemini 3.1 Pro Preview CustomTools', provider: 'Gemini' },
  { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', provider: 'Gemini' },
  { name: 'gemini-flash-latest', displayName: 'Gemini Flash Latest', provider: 'Gemini' },
  { name: 'gemini-flash-lite-latest', displayName: 'Gemini Flash Lite Latest', provider: 'Gemini' },
  { name: 'gemini-pro-latest', displayName: 'Gemini Pro Latest', provider: 'Gemini' },
  { name: 'gemini-robotics-er-1.6-preview', displayName: 'Gemini Robotics ER 1.6 Preview', provider: 'Gemini' },
  { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', provider: 'Gemini' },
  { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', provider: 'Gemini' },
  { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', provider: 'Gemini' },
  { name: 'gemini-2.0-flash-001', displayName: 'Gemini 2.0 Flash 001', provider: 'Gemini' },
  { name: 'gemini-2.0-flash-lite', displayName: 'Gemini 2.0 Flash Lite', provider: 'Gemini' },
  { name: 'gemini-2.0-flash-lite-001', displayName: 'Gemini 2.0 Flash Lite 001', provider: 'Gemini' },
  { name: 'gemma-4-26b-a4b-it', displayName: 'Gemma 4 26B A4B IT', provider: 'Gemini' },
  { name: 'gemma-4-31b-it', displayName: 'Gemma 4 31B IT', provider: 'Gemini' },
  // Groq (все модели из API)
  { name: 'groq-llama-3.3-70b', displayName: 'Groq Llama 3.3 70B', provider: 'Groq' },
  { name: 'groq-llama-4-scout', displayName: 'Groq Llama 4 Scout', provider: 'Groq' },
  { name: 'groq-compound', displayName: 'Groq Compound', provider: 'Groq' },
  { name: 'groq-compound-mini', displayName: 'Groq Compound Mini', provider: 'Groq' },
  { name: 'groq-allam-2-7b', displayName: 'Groq Allam 2 7B', provider: 'Groq' },
  { name: 'groq-llama-3.1-8b', displayName: 'Groq Llama 3.1 8B', provider: 'Groq' },
  { name: 'groq-llama-prompt-guard-2-22m', displayName: 'Groq Prompt Guard 2 22M', provider: 'Groq' },
  { name: 'groq-llama-prompt-guard-2-86m', displayName: 'Groq Prompt Guard 2 86M', provider: 'Groq' },
  { name: 'groq-gpt-oss-120b', displayName: 'Groq GPT-OSS 120B', provider: 'Groq' },
  { name: 'groq-gpt-oss-20b', displayName: 'Groq GPT-OSS 20B', provider: 'Groq' },
  { name: 'groq-gpt-oss-safeguard-20b', displayName: 'Groq GPT-OSS Safeguard 20B', provider: 'Groq' },
  { name: 'groq-qwen3-32b', displayName: 'Groq Qwen3 32B', provider: 'Groq' },
  { name: 'groq-qwen3.6-27b', displayName: 'Groq Qwen3.6 27B', provider: 'Groq' },
  { name: 'groq-mixtral', displayName: 'Groq Mixtral', provider: 'Groq' },
  { name: 'groq-gemma', displayName: 'Groq Gemma', provider: 'Groq' },
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true); // ← НОВОЕ: блокируем мигание
  const [activeTab, setActiveTab] = useState('upload');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [lastSavedReceipt, setLastSavedReceipt] = useState(null);
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash'); // ← Рабочая модель по умолчанию
  const [currency, setCurrency] = useState('AED');
  const [docType, setDocType] = useState('receipt');
  const [showModelSelector, setShowModelSelector] = useState(false);

  const [models, setModels] = useState(FALLBACK_MODELS); // ← Fallback сразу
  const [modelsLoading, setModelsLoading] = useState(false);

  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [viewModal, setViewModal] = useState(null);

  // === ОЧИСТКА PREVIEW URL (утечки памяти) ===
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // === LOGIN ===
  const login = async () => {
    setLoginError('');
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
      setLoginError('Ошибка соединения с сервером');
    }
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    setReceipts([]);
    setAuthChecking(false);
  }, []);

  // === LOAD RECEIPTS ===
  const loadReceipts = useCallback(async (authToken = token) => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/receipts?token=${authToken}`);
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (data.receipts || []);
      // Фикс Mixed Content для всех image_url
      const processed = raw.map(r => {
        // Парсим items если пришло как строка (JSON)
        let items = r.items;
        if (typeof items === 'string') {
          try { items = JSON.parse(items); } catch (e) { items = []; }
        }
        if (!Array.isArray(items)) items = [];

        return {
          ...r,
          image_url: fixImageUrl(r.image_url),
          items: items,
          raw_text: r.raw_text || ''
        };
      });
      setReceipts(processed);
    } catch (e) {
      console.error('Ошибка загрузки:', e);
      setReceipts([]);
    }
    setLoading(false);
  }, [token, logout]);

  // === CHECK AUTH (исправлено: нет мигания, logout в catch) ===
  useEffect(() => {
    if (token) {
      setAuthChecking(true);
      fetch(`${API_URL}/api/me?token=${token}`)
        .then(async r => {
          if (!r.ok) throw new Error('Auth failed: ' + r.status);
          return r.json();
        })
        .then(data => {
          const userData = data.user || data;
          if ((data.success !== false) && (userData.id || userData.valid || data.id)) {
            setUser(userData);
            loadReceipts(token);
          } else {
            throw new Error('Invalid token');
          }
        })
        .catch(err => {
          console.error('Auth check error:', err);
          logout(); // ← Теперь точно выкидывает при любой ошибке
        })
        .finally(() => setAuthChecking(false));
    } else {
      setAuthChecking(false);
    }
  }, [token, loadReceipts, logout]);

  // === FILE HANDLERS ===
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      const urls = files.map(f => URL.createObjectURL(f));
      setSelectedFiles(files);
      setCurrentFileIndex(0);
      setPreviewUrls(urls);
      setPreviewUrl(urls[0]);
      setLastSavedReceipt(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      const urls = files.map(f => URL.createObjectURL(f));
      setSelectedFiles(files);
      setCurrentFileIndex(0);
      setPreviewUrls(urls);
      setPreviewUrl(urls[0]);
      setLastSavedReceipt(null);
    }
  };

  const nextFile = () => {
    if (currentFileIndex < selectedFiles.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
      setPreviewUrl(previewUrls[currentFileIndex + 1]);
      setLastSavedReceipt(null);
    }
  };

  const prevFile = () => {
    if (currentFileIndex > 0) {
      setCurrentFileIndex(currentFileIndex - 1);
      setPreviewUrl(previewUrls[currentFileIndex - 1]);
      setLastSavedReceipt(null);
    }
  };

  // === RECOGNIZE AND SAVE (FORMDATA!) ===
  const recognizeAndSave = async () => {
    if (!selectedFiles.length) return;
    setRecognizing(true);
    setLastSavedReceipt(null);

    try {
      const file = selectedFiles[currentFileIndex];

      const formData = new FormData();
      formData.append('image', file);
      formData.append('model', selectedModel);
      formData.append('currency', currency);
      formData.append('docType', docType);

      const res = await fetch(`${API_URL}/api/upload-receipt?token=${token}`, {
        method: 'POST',
        body: formData
        // НЕ указываем Content-Type! Браузер сам поставит multipart/form-data
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Сервер вернул ${res.status}: ${text.slice(0, 200)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || `Ошибка сервера: ${res.status}`);
      }

      if (!data.success && !data.id) {
        throw new Error(data.error || data.message || 'Сохранение не удалось');
      }

      const receiptData = data.data || data;
      if (receiptData.image_url) {
        receiptData.image_url = fixImageUrl(receiptData.image_url);
      }

      setLastSavedReceipt(receiptData);
      loadReceipts();

    } catch (e) {
      console.error('Ошибка:', e);
      alert('Ошибка: ' + e.message);
    }

    setRecognizing(false);
  };

  // === DELETE RECEIPT ===
  const deleteReceipt = async (id) => {
    if (!window.confirm('Удалить чек?')) return;
    try {
      const res = await fetch(`${API_URL}/api/receipts/${id}?token=${token}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadReceipts();
        if (viewModal && viewModal.id === id) setViewModal(null);
      } else {
        alert('Ошибка удаления');
      }
    } catch (e) {
      console.error('Ошибка удаления:', e);
    }
  };

  // === EXPORT EXCEL ===
  const exportExcel = async () => {
    try {
      const res = await fetch(`${API_URL}/api/export-excel?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds: [] })
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'receipts.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Ошибка экспорта:', e);
      alert('Ошибка экспорта');
    }
  };

  // === LOAD MODELS (с fallback) ===
  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const endpoints = [
        { url: `${API_URL}/api/list-gemini-models`, provider: 'Gemini' },
        { url: `${API_URL}/api/list-groq-models`, provider: 'Groq' },
        { url: `${API_URL}/api/list-ocrspace-models`, provider: 'OCR.space' }
      ];

      let allModels = [];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint.url);
          if (res.ok) {
            const data = await res.json();
            if (data.models) {
              allModels = [...allModels, ...data.models.map(m => ({
                name: m.id,
                displayName: m.name || m.id,
                provider: endpoint.provider,
                status: 'ok'
              }))];
            }
          }
        } catch (e) {
          console.error(`Error loading ${endpoint.provider}:`, e);
        }
      }

      // Если API не ответили — используем fallback
      if (allModels.length === 0) {
        allModels = FALLBACK_MODELS;
      }
      setModels(allModels);
    } catch (e) {
      console.error('Ошибка загрузки моделей:', e);
      setModels(FALLBACK_MODELS);
    }
    setModelsLoading(false);
  };

  // === HELPERS ===
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  const formatAmount = (amount, currency) => {
    if (amount === null || amount === undefined) return '—';
    return `${parseFloat(amount).toFixed(2)} ${currency || ''}`;
  };

  const getProviderColor = (provider) => {
    const colors = {
      'Gemini': '#4285f4',
      'Groq': '#f55036',
      'OCR.space': '#00a86b'
    };
    return colors[provider] || '#888';
  };

  // === AUTH CHECKING SCREEN (блокирует мигание) ===
  if (authChecking) {
    return (
      <div className="App">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  // === LOGIN SCREEN ===
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

  // === MAIN APP ===
  return (
    <div className="App">
      <header className="mini-header">
        <div className="header-left">
          <span className="logo-icon">🧾</span>
          <span className="user-name">{user?.name || user?.email || 'Пользователь'}</span>
        </div>
        <div className="header-right">
          <button className="logout-btn" onClick={logout}>🚪 Выйти</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>
          📤 Загрузка
        </button>
        <button className={activeTab === 'list' ? 'active' : ''} onClick={() => {setActiveTab('list'); loadReceipts();}}>
          📋 Чеки ({receipts.length})
        </button>
      </nav>

      {/* === VIEW MODAL === */}
      {viewModal && (
        <div className="modal-overlay" onClick={() => setViewModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📄 Чек #{viewModal.id}</h2>
              <button className="modal-close" onClick={() => setViewModal(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="modal-image-section">
                {viewModal.image_url ? (
                  <img src={viewModal.image_url} alt="Чек" className="modal-image" />
                ) : (
                  <div className="no-image">Нет фото</div>
                )}
              </div>

              <div className="modal-info">
                <div className="info-block">
                  <h3>Основная информация</h3>
                  <p><strong>Магазин:</strong> {viewModal.store_name_ru || viewModal.store_name || '—'}</p>
                  <p><strong>Дата:</strong> {formatDate(viewModal.receipt_date)} {viewModal.receipt_time}</p>
                  <p><strong>Итого:</strong> {formatAmount(viewModal.total_amount, viewModal.currency)}</p>
                  <p><strong>Тип:</strong> {viewModal.document_type}</p>
                  <p><strong>Метод:</strong> {viewModal.recognition_method || '—'}</p>
                  {viewModal.subtotal && <p><strong>Подытог:</strong> {viewModal.subtotal}</p>}
                  {viewModal.tax_amount && <p><strong>Налог:</strong> {viewModal.tax_amount} ({viewModal.tax_rate || ''})</p>}
                </div>

                <div className="info-block">
                  <h3>Товары ({viewModal.items?.length || 0})</h3>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Товар</th>
                        <th>Кол-во</th>
                        <th>Цена</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewModal.items || []).map((item, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{item.name_ru || item.name || '—'}</td>
                          <td>{item.quantity}</td>
                          <td>{item.price}</td>
                          <td>{item.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {viewModal.raw_text && (
                  <div className="info-block">
                    <h3>Распознанный текст</h3>
                    <pre className="raw-text">{viewModal.raw_text}</pre>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setViewModal(null)}>Закрыть</button>
              <button className="danger" onClick={() => deleteReceipt(viewModal.id)}>🗑️ Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* === UPLOAD TAB === */}
      {activeTab === 'upload' && (
        <div className="upload-section">
          <div className="top-controls">
            <button 
              className="model-toggle-btn"
              onClick={() => {setShowModelSelector(!showModelSelector); if (!models.length) loadModels();}}
            >
              🤖 {showModelSelector ? 'Скрыть' : `Выбор модели (${models.length})`}
            </button>

            {showModelSelector && (
              <div className="model-dropdown" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {modelsLoading ? (
                  <p>Загрузка...</p>
                ) : (
                  <div className="models-grid">
                    {models.map(model => (
                      <div 
                        key={`${model.provider}-${model.name}`} 
                        className={`model-option ${selectedModel === model.name ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedModel(model.name);
                          setShowModelSelector(false);
                        }}
                        title={`${model.provider} — ${model.displayName}`}
                      >
                        <span className="provider-badge" style={{ backgroundColor: getProviderColor(model.provider) }}>
                          {model.provider}
                        </span>
                        <span className="model-name">{model.displayName}</span>
                        <span className="status-ok">✅</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="current-model">
              <small>Модель: <strong>{selectedModel}</strong></small>
            </div>
          </div>

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
                  <p className="hint">Можно выбрать несколько файлов</p>
                </div>
              )}
            </label>
          </div>

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

          <div className="recognize-bar">
            <button 
              className="recognize-main-btn full-width"
              onClick={recognizeAndSave}
              disabled={!selectedFiles.length || recognizing}
            >
              {recognizing ? '⏳ Распознавание...' : '🔍 Распознать и сохранить'}
            </button>
          </div>

          {lastSavedReceipt && (
            <div className="saved-receipt-card">
              <h3>✅ Чек сохранён</h3>
              <div className="receipt-preview">
                {lastSavedReceipt.image_url && (
                  <img src={lastSavedReceipt.image_url} alt="Чек" className="receipt-image" />
                )}
                <div className="receipt-info">
                  <p><strong>ID:</strong> {lastSavedReceipt.id}</p>
                  <p><strong>Магазин:</strong> {lastSavedReceipt.store_name_ru || lastSavedReceipt.store_name || '—'}</p>
                  <p><strong>Дата:</strong> {formatDate(lastSavedReceipt.receipt_date)}</p>
                  <p><strong>Итого:</strong> {formatAmount(lastSavedReceipt.total_amount, lastSavedReceipt.currency)}</p>
                  <p><strong>Товаров:</strong> {lastSavedReceipt.items?.length || 0}</p>
                  {lastSavedReceipt.items && lastSavedReceipt.items.length > 0 && (
                    <div className="items-preview">
                      <h4>Товары:</h4>
                      <ul>
                        {lastSavedReceipt.items.map((item, i) => (
                          <li key={i}>{item.name_ru || item.name} — {item.quantity} × {item.price} = {item.total}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {lastSavedReceipt.raw_text && (
                    <details>
                      <summary>Распознанный текст</summary>
                      <pre style={{fontSize: '11px', maxHeight: '200px', overflow: 'auto'}}>{lastSavedReceipt.raw_text}</pre>
                    </details>
                  )}
                </div>
              </div>
              <button className="close-btn" onClick={() => setLastSavedReceipt(null)}>Закрыть</button>
            </div>
          )}
        </div>
      )}

      {/* === LIST TAB === */}
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
            <div className="loading-center">
              <div className="spinner"></div>
              <p>Загрузка чеков...</p>
            </div>
          ) : receipts.length === 0 ? (
            <p className="empty-state">Нет чеков. Загрузите первый!</p>
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
                    <button onClick={() => setViewModal(receipt)}>👁️ Просмотр</button>
                    <button onClick={() => deleteReceipt(receipt.id)} className="danger">🗑️ Удалить</button>
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
