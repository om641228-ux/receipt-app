import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API_URL = 'https://backend-production-adc7.up.railway.app';
const OBJECTS = ['other', 'Duqe', 'Maria', 'Kit', 'Dubai', 'Tich'];
const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 'all'];

const fixImageUrl = (url) => {
  if (!url) return null;
  return url.replace(/^http:\/\//, 'https://');
};

const FALLBACK_MODELS = [
  { name: 'ocrspace-engine1', displayName: 'OCR.space Engine 1 (Basic)', provider: 'OCR.space' },
  { name: 'ocrspace-engine2', displayName: 'OCR.space Engine 2 (Advanced)', provider: 'OCR.space' },
  { name: 'ocrspace-engine3', displayName: 'OCR.space Engine 3 (Handwriting)', provider: 'OCR.space' },
  { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: 'Gemini' },
  { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', provider: 'Gemini' },
  { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', provider: 'Gemini' },
  { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', provider: 'Gemini' },
  { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', provider: 'Gemini' },
  { name: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash Preview', provider: 'Gemini' },
  { name: 'gemini-3-pro-image', displayName: 'Gemini 3 Pro Image', provider: 'Gemini' },
  { name: 'gemini-3.1-flash-image', displayName: 'Gemini 3.1 Flash Image', provider: 'Gemini' },
  { name: 'gemini-flash-latest', displayName: 'Gemini Flash Latest', provider: 'Gemini' },
  { name: 'gemini-pro-latest', displayName: 'Gemini Pro Latest', provider: 'Gemini' },
  { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', provider: 'Gemini' },
  { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', provider: 'Gemini' },
  { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', provider: 'Gemini' },
  { name: 'gemini-2.0-flash-lite', displayName: 'Gemini 2.0 Flash Lite', provider: 'Gemini' },
  { name: 'groq-llama-3.2-90b', displayName: 'Groq Llama 3.2 90B Vision', provider: 'Groq' },
  { name: 'groq-llama-3.2-11b', displayName: 'Groq Llama 3.2 11B Vision', provider: 'Groq' },
  { name: 'groq-llama-4-scout', displayName: 'Groq Llama 4 Scout', provider: 'Groq' },
  { name: 'groq-llama-4-maverick', displayName: 'Groq Llama 4 Maverick', provider: 'Groq' },
  { name: 'groq-qwen3.6-27b', displayName: 'Groq Qwen3.6 27B', provider: 'Groq' },
  { name: 'groq-llama-3.3-70b', displayName: 'Groq Llama 3.3 70B', provider: 'Groq' },
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
  { name: 'groq-mixtral', displayName: 'Groq Mixtral', provider: 'Groq' },
  { name: 'groq-gemma', displayName: 'Groq Gemma', provider: 'Groq' },
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('upload');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [lastSavedReceipt, setLastSavedReceipt] = useState(null);
  const [selectedModel, setSelectedModel] = useState('groq-llama-4-scout'); // ← пункт 5
  const [currency, setCurrency] = useState('auto'); // ← пункт 7
  const [docType, setDocType] = useState('receipt');
  const [object, setObject] = useState('other'); // ← пункт 3
  const [showModelSelector, setShowModelSelector] = useState(false);

  const [models, setModels] = useState(FALLBACK_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [filterType, setFilterType] = useState('all');
  const [filterObject, setFilterObject] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedReceiptIds, setSelectedReceiptIds] = useState(new Set());
  const [viewModal, setViewModal] = useState(null);

  useEffect(() => {
    return () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [previewUrls]);

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
    setSelectedReceiptIds(new Set());
  }, []);

  const loadReceipts = useCallback(async (authToken = token) => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/receipts?token=${authToken}`);
      if (res.status === 401) { logout(); return; }
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (data.receipts || []);
      const processed = raw.map(r => {
        let items = r.items;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
        if (!Array.isArray(items)) items = [];
        return { ...r, image_url: fixImageUrl(r.image_url), items: items, raw_text: r.raw_text || '' };
      });
      setReceipts(processed);
      setSelectedReceiptIds(new Set());
      setCurrentPage(1);
    } catch (e) {
      console.error('Ошибка загрузки:', e);
      setReceipts([]);
    }
    setLoading(false);
  }, [token, logout]);

  useEffect(() => {
    if (token) {
      setAuthChecking(true);
      fetch(`${API_URL}/api/me?token=${token}`)
        .then(async r => { if (!r.ok) throw new Error('Auth failed'); return r.json(); })
        .then(data => {
          const userData = data.user || data;
          if ((data.success !== false) && (userData.id || userData.valid || data.id)) {
            setUser(userData);
            loadReceipts(token);
          } else throw new Error('Invalid token');
        })
        .catch(err => { console.error('Auth check error:', err); logout(); })
        .finally(() => setAuthChecking(false));
    } else {
      setAuthChecking(false);
    }
  }, [token, loadReceipts, logout]);

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
      formData.append('object', object);

      const res = await fetch(`${API_URL}/api/upload-receipt?token=${token}`, { method: 'POST', body: formData });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`Сервер вернул ${res.status}: ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(data.error || data.message || `Ошибка сервера: ${res.status}`);
      if (!data.success && !data.id) throw new Error(data.error || 'Сохранение не удалось');

      const receiptData = data.data || data;
      if (receiptData.image_url) receiptData.image_url = fixImageUrl(receiptData.image_url);
      setLastSavedReceipt(receiptData);
      loadReceipts();
    } catch (e) {
      console.error('Ошибка:', e);
      alert('Ошибка: ' + e.message);
    }
    setRecognizing(false);
  };

  const deleteReceipt = async (id) => {
    if (!window.confirm('Удалить чек?')) return;
    try {
      const res = await fetch(`${API_URL}/api/receipts/${id}?token=${token}`, { method: 'DELETE' });
      if (res.ok) { loadReceipts(); if (viewModal && viewModal.id === id) setViewModal(null); }
      else alert('Ошибка удаления');
    } catch (e) { console.error('Ошибка удаления:', e); }
  };

  const exportExcel = async (ids = []) => {
    try {
      const res = await fetch(`${API_URL}/api/export-excel?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds: ids })
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

  const downloadFile = async (url, filename) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      console.error('Download failed', e);
      window.open(url, '_blank');
    }
  };

  const bulkExportPackage = async () => {
    if (selectedReceiptIds.size === 0) return alert('Выберите чеки');
    const ids = Array.from(selectedReceiptIds);
    // 1. Excel
    await exportExcel(ids);
    // 2. Photo + text for each
    const selected = receipts.filter(r => selectedReceiptIds.has(r.id));
    for (const r of selected) {
      if (r.raw_text) {
        const blob = new Blob([r.raw_text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt_${r.id}_text.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
      if (r.image_url) {
        await downloadFile(r.image_url, `receipt_${r.id}_image.jpg`);
      }
    }
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Удалить ${selectedReceiptIds.size} чеков?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/bulk-delete?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedReceiptIds) })
      });
      if (res.ok) { setSelectedReceiptIds(new Set()); loadReceipts(); }
      else alert('Ошибка массового удаления');
    } catch (e) { console.error(e); }
  };

  const bulkChangeObject = async (newObject) => {
    if (selectedReceiptIds.size === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/bulk-update-object?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedReceiptIds), object: newObject })
      });
      if (res.ok) { setSelectedReceiptIds(new Set()); loadReceipts(); }
      else alert('Ошибка смены объекта');
    } catch (e) { console.error(e); }
  };

  const bulkChangeCurrency = async (newCurrency) => {
    if (selectedReceiptIds.size === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/bulk-update-currency?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedReceiptIds), currency: newCurrency })
      });
      if (res.ok) { setSelectedReceiptIds(new Set()); loadReceipts(); }
      else alert('Ошибка смены валюты');
    } catch (e) { console.error(e); }
  };

  const bulkReprocess = async () => {
    if (!window.confirm(`Перераспознать ${selectedReceiptIds.size} чеков?`)) return;
    setLoading(true);
    const ids = Array.from(selectedReceiptIds);
    for (const id of ids) {
      try {
        await fetch(`${API_URL}/api/reprocess-receipt?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiptId: id, model: selectedModel })
        });
      } catch (e) { console.error('Reprocess error', e); }
    }
    setSelectedReceiptIds(new Set());
    loadReceipts();
    setLoading(false);
  };

  const toggleSelect = (id) => {
    setSelectedReceiptIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const newSet = new Set(selectedReceiptIds);
    paginatedReceipts.forEach(r => newSet.add(r.id));
    setSelectedReceiptIds(newSet);
  };

  const deselectAll = () => setSelectedReceiptIds(new Set());

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
            if (data.models) allModels = [...allModels, ...data.models.map(m => ({ name: m.id, displayName: m.name || m.id, provider: endpoint.provider, status: 'ok' }))];
          }
        } catch (e) {}
      }
      if (allModels.length === 0) allModels = FALLBACK_MODELS;
      setModels(allModels);
    } catch (e) { setModels(FALLBACK_MODELS); }
    setModelsLoading(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ru-RU');
  };

  const formatAmount = (amount, currency) => {
    if (amount === null || amount === undefined) return '—';
    return `${parseFloat(amount).toFixed(2)} ${currency || ''}`;
  };

  const getProviderColor = (provider) => {
    const colors = { 'Gemini': '#4285f4', 'Groq': '#f55036', 'OCR.space': '#00a86b' };
    return colors[provider] || '#888';
  };

  // Filtering
  const filteredReceipts = receipts.filter(r => {
    if (filterType !== 'all' && r.document_type !== filterType) return false;
    if (filterObject !== 'all' && r.object !== filterObject) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (r.store_name_ru || r.store_name || '').toLowerCase().includes(q) || (r.raw_text || '').toLowerCase().includes(q);
  });

  // Pagination
  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(filteredReceipts.length / itemsPerPage);
  const paginatedReceipts = itemsPerPage === 'all'
    ? filteredReceipts
    : filteredReceipts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

  if (!token) {
    return (
      <div className="App">
        <div className="login-box">
          <h1>🧾 Receipt Manager</h1>
          <input type="password" placeholder="Введите пароль" value={password} onChange={e => setPassword(e.target.value)} onKeyPress={e => e.key === 'Enter' && login()} />
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
          <span className="user-name">{user?.name || user?.email || 'Пользователь'}</span>
        </div>
        <div className="header-right">
          <button className="logout-btn" onClick={logout}>🚪 Выйти</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>📤 Загрузка</button>
        <button className={activeTab === 'list' ? 'active' : ''} onClick={() => {setActiveTab('list'); loadReceipts();}}>📋 Чеки ({receipts.length})</button>
      </nav>

      {/* VIEW MODAL */}
      {viewModal && (
        <div className="modal-overlay" onClick={() => setViewModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📄 Чек #{viewModal.id}</h2>
              <button className="modal-close" onClick={() => setViewModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-image-section">
                {viewModal.image_url ? <img src={viewModal.image_url} alt="Чек" className="modal-image" /> : <div className="no-image">Нет фото</div>}
              </div>
              <div className="modal-info">
                <div className="info-block">
                  <h3>Основная информация</h3>
                  <p><strong>Магазин:</strong> {viewModal.store_name_ru || viewModal.store_name || '—'}</p>
                  <p><strong>Дата:</strong> {formatDate(viewModal.receipt_date)} {viewModal.receipt_time}</p>
                  <p><strong>Итого:</strong> {formatAmount(viewModal.total_amount, viewModal.currency)}</p>
                  <p><strong>Тип:</strong> {viewModal.document_type}</p>
                  <p><strong>Объект:</strong> {viewModal.object || '—'}</p>
                  <p><strong>Метод:</strong> {viewModal.recognition_method || '—'}</p>
                  {viewModal.subtotal && <p><strong>Подытог:</strong> {viewModal.subtotal}</p>}
                  {viewModal.tax_amount && <p><strong>Налог:</strong> {viewModal.tax_amount} ({viewModal.tax_rate || ''})</p>}
                </div>
                <div className="info-block">
                  <h3>Товары ({viewModal.items?.length || 0})</h3>
                  <table className="items-table">
                    <thead><tr><th>№</th><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
                    <tbody>
                      {(viewModal.items || []).map((item, i) => (
                        <tr key={i}><td>{i + 1}</td><td>{item.name_ru || item.name || '—'}</td><td>{item.quantity}</td><td>{item.price}</td><td>{item.total}</td></tr>
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

      {/* UPLOAD TAB */}
      {activeTab === 'upload' && (
        <div className="upload-section">
          <div className="top-controls">
            <button className="model-toggle-btn" onClick={() => {setShowModelSelector(!showModelSelector); if (!models.length) loadModels();}}>
              🤖 {showModelSelector ? 'Скрыть' : `Выбор модели (${models.length})`}
            </button>
            {showModelSelector && (
              <div className="model-dropdown" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {modelsLoading ? <p>Загрузка...</p> : (
                  <div className="models-grid">
                    {models.map(model => (
                      <div key={`${model.provider}-${model.name}`} className={`model-option ${selectedModel === model.name ? 'selected' : ''}`}
                           onClick={() => { setSelectedModel(model.name); setShowModelSelector(false); }} title={`${model.provider} — ${model.displayName}`}>
                        <span className="provider-badge" style={{ backgroundColor: getProviderColor(model.provider) }}>{model.provider}</span>
                        <span className="model-name">{model.displayName}</span>
                        <span className="status-ok">✅</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="current-model"><small>Модель: <strong>{selectedModel}</strong></small></div>
          </div>

          <div className="drop-zone" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
            <input type="file" accept="image/*" multiple onChange={handleFileSelect} id="file-input" />
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
                <option value="auto">Auto (определить)</option>
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
            <div className="control-group">
              <label>Объект:</label>
              <select value={object} onChange={e => setObject(e.target.value)}>
                {OBJECTS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="recognize-bar">
            <button className="recognize-main-btn" onClick={recognizeAndSave} disabled={!selectedFiles.length || recognizing}>
              {recognizing ? '⏳ Распознавание...' : '🔍 Распознать и сохранить'}
            </button>
          </div>

          {lastSavedReceipt && (
            <div className="saved-receipt-card">
              <h3>✅ Чек сохранён</h3>
              <div className="receipt-preview">
                {lastSavedReceipt.image_url ? <img src={lastSavedReceipt.image_url} alt="Чек" className="receipt-image" /> : <div className="no-image-thumb" style={{width:250,height:200}}>📄 Нет фото</div>}
                <div className="receipt-info">
                  <p><strong>ID:</strong> {lastSavedReceipt.id}</p>
                  <p><strong>Магазин:</strong> {lastSavedReceipt.store_name_ru || lastSavedReceipt.store_name || '—'}</p>
                  <p><strong>Дата:</strong> {formatDate(lastSavedReceipt.receipt_date)}</p>
                  <p><strong>Итого:</strong> {formatAmount(lastSavedReceipt.total_amount, lastSavedReceipt.currency)}</p>
                  <p><strong>Товаров:</strong> {lastSavedReceipt.items?.length || 0}</p>
                  <p><strong>Объект:</strong> {lastSavedReceipt.object || '—'}</p>
                  <p><strong>Метод:</strong> {lastSavedReceipt.recognition_method || '—'}</p>
                  {lastSavedReceipt.warning && <p className="error">⚠️ {lastSavedReceipt.warning}</p>}
                  {lastSavedReceipt.items && lastSavedReceipt.items.length > 0 && (
                    <div className="receipt-items-preview">
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
                      <pre style={{fontSize:'11px',maxHeight:200,overflow:'auto'}}>{lastSavedReceipt.raw_text}</pre>
                    </details>
                  )}
                </div>
              </div>
              <button className="close-btn" onClick={() => setLastSavedReceipt(null)}>Закрыть</button>
            </div>
          )}
        </div>
      )}

      {/* LIST TAB */}
      {activeTab === 'list' && (
        <div className="list-section">
          <div className="filters" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <select value={filterType} onChange={e => {setFilterType(e.target.value); setCurrentPage(1);}}>
              <option value="all">Все типы</option>
              <option value="receipt">Чеки</option>
              <option value="invoice">Фактуры</option>
            </select>
            <select value={filterObject} onChange={e => {setFilterObject(e.target.value); setCurrentPage(1);}}>
              <option value="all">Все объекты</option>
              {OBJECTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <input type="text" placeholder="Поиск..." value={searchQuery} onChange={e => {setSearchQuery(e.target.value); setCurrentPage(1);}} />
            <select value={itemsPerPage} onChange={e => {setItemsPerPage(e.target.value === 'all' ? 'all' : parseInt(e.target.value)); setCurrentPage(1);}}>
              {ITEMS_PER_PAGE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt === 'all' ? 'Все' : opt}</option>)}
            </select>
            <button onClick={() => exportExcel()}>📥 Excel (все)</button>
            <button onClick={() => loadReceipts()}>🔄 Обновить</button>
          </div>

          {/* Bulk actions */}
          {selectedReceiptIds.size > 0 && (
            <div style={{ background: '#fff3cd', padding: '12px 15px', borderRadius: 8, marginBottom: 15, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>✅ Выбрано: <strong>{selectedReceiptIds.size}</strong></span>
              <button onClick={bulkDelete} style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>🗑️ Удалить</button>
              <button onClick={bulkExportPackage} style={{ background: '#27ae60', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>📁 Экспорт пакета</button>
              <button onClick={() => bulkReprocess()} style={{ background: '#9b59b6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>🔄 Перераспознать</button>
              <select onChange={e => { if (e.target.value) bulkChangeObject(e.target.value); e.target.value = ''; }} style={{ padding: '6px 10px', borderRadius: 6 }}>
                <option value="">Сменить объект...</option>
                {OBJECTS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select onChange={e => { if (e.target.value) bulkChangeCurrency(e.target.value); e.target.value = ''; }} style={{ padding: '6px 10px', borderRadius: 6 }}>
                <option value="">Сменить валюту...</option>
                <option value="AED">AED</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="RUB">RUB</option>
              </select>
              <button onClick={deselectAll} style={{ background: '#95a5a6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>Сбросить</button>
            </div>
          )}

          {/* Select all */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" onChange={(e) => e.target.checked ? selectAllVisible() : deselectAll()} style={{ marginRight: 6 }} />
              Выбрать все на странице
            </label>
          </div>

          {loading ? (
            <div className="loading-center"><div className="spinner"></div><p>Загрузка чеков...</p></div>
          ) : paginatedReceipts.length === 0 ? (
            <p className="empty-state">Нет чеков. Загрузите первый!</p>
          ) : (
            <>
              <div className="receipts-grid">
                {paginatedReceipts.map(receipt => (
                  <div key={receipt.id} className="receipt-card" style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
                      <input type="checkbox" checked={selectedReceiptIds.has(receipt.id)} onChange={() => toggleSelect(receipt.id)} style={{ width: 20, height: 20, cursor: 'pointer' }} />
                    </div>
                    <div className="receipt-header">
                      <h3>{receipt.store_name_ru || receipt.store_name || 'Без названия'}</h3>
                      <span className="type-badge">{receipt.document_type}</span>
                    </div>
                    <p className="date">{formatDate(receipt.receipt_date)} {receipt.receipt_time}</p>
                    <p className="amount">{formatAmount(receipt.total_amount, receipt.currency)}</p>
                    <p className="items-count">🛒 {receipt.items?.length || 0} товаров</p>
                    {receipt.object && <p style={{ fontSize: 12, color: '#7f8c8d' }}>🏢 {receipt.object}</p>}
                    {receipt.image_url ? (
                      <img src={receipt.image_url} alt="Чек" className="receipt-thumb" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div className="no-image-thumb">📄 Чек</div>
                    )}
                    <div className="receipt-actions">
                      <button onClick={() => setViewModal(receipt)}>👁️ Просмотр</button>
                      <button onClick={() => deleteReceipt(receipt.id)} className="danger">🗑️ Удалить</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {itemsPerPage !== 'all' && totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 20 }}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: currentPage === 1 ? '#ddd' : '#3498db', color: 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>◀ Назад</button>
                  <span>Страница {currentPage} из {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: currentPage === totalPages ? '#ddd' : '#3498db', color: 'white', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}>Вперёд ▶</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;