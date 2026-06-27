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
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-lite');
  const [currency, setCurrency] = useState('AED');
  const [docType, setDocType] = useState('receipt');
  const [showModelSelector, setShowModelSelector] = useState(false);
  
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // === МОДАЛЬНОЕ ОКНО ПРОСМОТРА ===
  const [viewModal, setViewModal] = useState(null);

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

  const recognizeAndSave = async () => {
    if (!selectedFiles.length) return;
    setRecognizing(true);
    setLastSavedReceipt(null);
    
    try {
      const file = selectedFiles[currentFileIndex];
      const base64 = await fileToBase64(file);
      
      let endpoint = '/api/identify';
      if (selectedModel.includes('llama') || selectedModel.includes('qwen') || selectedModel.includes('gpt-oss')) {
        endpoint = '/api/identify-groq';
      } else if (selectedModel.includes('claude')) {
        endpoint = '/api/identify-claude';
      } else if (selectedModel.includes('ocr')) {
        endpoint = '/api/identify-ocrspace';
      }
      
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
      
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Распознавание не удалось');
      }
      
      const saveRes = await fetch(`${API_URL}/api/save-receipt?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: data.data,
          image: base64,
          docType: docType,
          recognitionMethod: `${data.provider || endpoint.replace('/api/identify-', '').replace('/api/identify', 'gemini')}:${selectedModel}`,
          recognizedAt: new Date().toISOString()
        })
      });
      const saveData = await saveRes.json();
      
      if (saveData.success && saveData.data) {
        setLastSavedReceipt(saveData.data);
        loadReceipts();
      } else {
        throw new Error(saveData.error || 'Ошибка сохранения');
      }
      
    } catch (e) {
      console.error('Ошибка:', e);
      alert('Ошибка: ' + e.message);
    }
    
    setRecognizing(false);
  };

  const deleteReceipt = async (id) => {
    if (!window.confirm('Удалить чек?')) return;
    try {
      const res = await fetch(`${API_URL}/api/delete-receipt/${id}?token=${token}`, {
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

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const [geminiRes, groqRes, ocrRes] = await Promise.all([
        fetch(`${API_URL}/api/list-gemini-models`).catch(() => ({ok: false})),
        fetch(`${API_URL}/api/list-groq-models`).catch(() => ({ok: false})),
        fetch(`${API_URL}/api/list-ocrspace-models`).catch(() => ({ok: false}))
      ]);
      
      let allModels = [];
      
      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        if (geminiData.results) allModels = [...allModels, ...geminiData.results];
      }
      
      if (groqRes.ok) {
        const groqData = await groqRes.json();
        if (groqData.results) allModels = [...allModels, ...groqData.results];
      }
      
      if (ocrRes.ok) {
        const ocrData = await ocrRes.json();
        if (ocrData.results) allModels = [...allModels, ...ocrData.results];
      }
      
      setModels(allModels);
    } catch (e) {
      console.error('Ошибка загрузки моделей:', e);
    }
    setModelsLoading(false);
  };

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

      {/* === МОДАЛЬНОЕ ОКНО ПРОСМОТРА ЧЕКА === */}
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
              {user?.role === 'admin' && (
                <button className="danger" onClick={() => deleteReceipt(viewModal.id)}>🗑️ Удалить</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === ВКЛАДКА ЗАГРУЗКА === */}
      {activeTab === 'upload' && (
        <div className="upload-section">
          <div className="top-controls">
            <button 
              className="model-toggle-btn"
              onClick={() => {setShowModelSelector(!showModelSelector); if (!models.length) loadModels();}}
            >
              🤖 {showModelSelector ? 'Скрыть' : `Выбор модели (${models.filter(m => m.status === 'ok').length})`}
            </button>
            
            {showModelSelector && (
              <div className="model-dropdown">
                {modelsLoading ? (
                  <p>Загрузка...</p>
                ) : (
                  <div className="models-grid">
                    {models.map(model => (
                      <div 
                        key={model.name} 
                        className={`model-option ${selectedModel === model.name ? 'selected' : ''} ${model.status !== 'ok' ? 'disabled' : ''}`}
                        onClick={() => {
                          if (model.status === 'ok') {
                            setSelectedModel(model.name);
                            setShowModelSelector(false);
                          }
                        }}
                      >
                        <span className="provider-badge">{model.provider}</span>
                        <span className="model-name">{model.name}</span>
                        <span className={model.status === 'ok' ? 'status-ok' : 'status-error'}>
                          {model.status === 'ok' ? '✅' : '❌'}
                        </span>
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
                    <button onClick={() => setViewModal(receipt)}>👁️ Просмотр</button>
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