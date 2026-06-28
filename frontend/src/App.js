import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API_URL = 'https://backend-production-adc7.up.railway.app';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [lastSavedReceipt, setLastSavedReceipt] = useState(null);
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [currency, setCurrency] = useState('AED');
  const [docType, setDocType] = useState('receipt');
  const [showModelSelector, setShowModelSelector] = useState(false);

  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [viewModal, setViewModal] = useState(null);

  // === LOGIN ===
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

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    setReceipts([]);
  };

  // === LOAD RECEIPTS ===
  const loadReceipts = useCallback(async (authToken = token) => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/receipts?token=${authToken}`);
      const data = await res.json();
      setReceipts(Array.isArray(data) ? data : (data.receipts || []));
    } catch (e) {
      console.error('Ошибка загрузки:', e);
      setReceipts([]);
    }
    setLoading(false);
  }, [token]);

  // === CHECK AUTH ===
  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/me?token=${token}`)
        .then(r => r.json())
        .then(data => {
          const userData = data.user || data;
          if ((data.success !== false) && (userData.id || userData.valid || data.id)) {
            setUser(userData);
            loadReceipts(token);
          } else {
            logout();
          }
        })
        .catch(err => {
          console.error('Auth check error:', err);
        });
    }
  }, [token]);

  // === FILE HANDLERS ===
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFiles(files);
      setCurrentFileIndex(0);
      setPreviewUrl(URL.createObjectURL(files[0]));
      setLastSavedReceipt(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      setSelectedFiles(files);
      setCurrentFileIndex(0);
      setPreviewUrl(URL.createObjectURL(files[0]));
      setLastSavedReceipt(null);
    }
  };

  const nextFile = () => {
    if (currentFileIndex < selectedFiles.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
      setPreviewUrl(URL.createObjectURL(selectedFiles[currentFileIndex + 1]));
      setLastSavedReceipt(null);
    }
  };

  const prevFile = () => {
    if (currentFileIndex > 0) {
      setCurrentFileIndex(currentFileIndex - 1);
      setPreviewUrl(URL.createObjectURL(selectedFiles[currentFileIndex - 1]));
      setLastSavedReceipt(null);
    }
  };

  // === RECOGNIZE AND SAVE ===
  const recognizeAndSave = async () => {
    if (!selectedFiles.length) return;
    setRecognizing(true);
    setLastSavedReceipt(null);

    try {
      const file = selectedFiles[currentFileIndex];

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch(`${API_URL}/api/upload-receipt?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          fileName: file.name,
          fileType: file.type,
          model: selectedModel,
          currency: currency,
          docType: docType
        })
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Сохранение не удалось');
      }

      setLastSavedReceipt(data);
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

  // === LOAD MODELS (ТОЛЬКО GEMINI + GROQ + OCR.SPACE) ===
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

      setModels(allModels);
    } catch (e) {
      console.error('Ошибка загрузки моделей:', e);
    }
    setModelsLoading(false);
  };

  // === HELPERS ===
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  const formatAmount = (amount, currency) => {
    if (!amount) return '-';
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
