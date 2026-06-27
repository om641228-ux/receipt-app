// ============================================================
// auth-owners.js
// Серверная авторизация (пароли на бэкенде) + привязка "кто добавил чек".
// НЕ трогает твою БД: владение хранится в отдельном файле owners-store.json.
// Работает между устройствами и пользователями.
//
// Подключение в твоём server.js (где создаётся app):
//   const authOwners = require('./auth-owners');
//   app.use(express.json({ limit: '50mb' }));   // если ещё не подключён парсер JSON
//   app.use('/api', authOwners);                 // ДО или ПОСЛЕ существующих /api роутов — не важно,
//                                                // имена login/logout/owners/set-owner/remove-owner уникальны
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

// ====== АККАУНТЫ И ПАРОЛИ — РЕДАКТИРУЙ ЗДЕСЬ (на сервере) ======
// role: 'admin' — все функции (включая удаление), видит все чеки
// role: 'user'  — все функции КРОМЕ удаления, видит только свои чеки
// id — НЕ меняй после начала работы: к нему привязано владение чеками
const ACCOUNTS = [
  { id: 'admin',  name: 'Администратор',   role: 'admin', password: 'admin' },
  { id: 'user1',  name: 'Пользователь 1',  role: 'user',  password: 'user1' },
  { id: 'user2',  name: 'Пользователь 2',  role: 'user',  password: 'user2' },
  { id: 'user3',  name: 'Пользователь 3',  role: 'user',  password: 'user3' },
  { id: 'user4',  name: 'Пользователь 4',  role: 'user',  password: 'user4' },
  { id: 'user5',  name: 'Пользователь 5',  role: 'user',  password: 'user5' },
  { id: 'user6',  name: 'Пользователь 6',  role: 'user',  password: 'user6' },
  { id: 'user7',  name: 'Пользователь 7',  role: 'user',  password: 'user7' },
  { id: 'user8',  name: 'Пользователь 8',  role: 'user',  password: 'user8' },
  { id: 'user9',  name: 'Пользователь 9',  role: 'user',  password: 'user9' },
  { id: 'user10', name: 'Пользователь 10', role: 'user',  password: 'user10' },
  { id: 'user11', name: 'Пользователь 11', role: 'user',  password: 'user11' },
  { id: 'user12', name: 'Пользователь 12', role: 'user',  password: 'user12' },
  { id: 'user13', name: 'Пользователь 13', role: 'user',  password: 'user13' },
  { id: 'user14', name: 'Пользователь 14', role: 'user',  password: 'user14' },
  { id: 'user15', name: 'Пользователь 15', role: 'user',  password: 'user15' },
  { id: 'user16', name: 'Пользователь 16', role: 'user',  password: 'user16' },
  { id: 'user17', name: 'Пользователь 17', role: 'user',  password: 'user17' },
  { id: 'user18', name: 'Пользователь 18', role: 'user',  password: 'user18' },
  { id: 'user19', name: 'Пользователь 19', role: 'user',  password: 'user19' },
  { id: 'user20', name: 'Пользователь 20', role: 'user',  password: 'user20' },
];

// ====== Хранилище владения и токенов (файл рядом с этим модулем) ======
const STORE_FILE = path.join(__dirname, 'owners-store.json');

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      owners: parsed.owners && typeof parsed.owners === 'object' ? parsed.owners : {},
      tokens: parsed.tokens && typeof parsed.tokens === 'object' ? parsed.tokens : {},
    };
  } catch (e) {
    return { owners: {}, tokens: {} };
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('owners-store: ошибка записи', e);
  }
}

const store = loadStore();

function userByToken(token) {
  if (!token) return null;
  const userId = store.tokens[token];
  if (!userId) return null;
  return ACCOUNTS.find(a => a.id === userId) || null;
}

// публичный справочник пользователей (без паролей)
function publicUsers() {
  const map = {};
  ACCOUNTS.forEach(a => { map[a.id] = { name: a.name, role: a.role }; });
  return map;
}

// POST /api/login  { password }  -> { success, token, user }
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const acc = ACCOUNTS.find(a => a.password === password);
  if (!acc) return res.json({ success: false, error: 'Неверный пароль' });
  const token = crypto.randomBytes(24).toString('hex');
  store.tokens[token] = acc.id;
  saveStore();
  res.json({ success: true, token, user: { id: acc.id, name: acc.name, role: acc.role } });
});

// POST /api/logout  { token }
router.post('/logout', (req, res) => {
  const { token } = req.body || {};
  if (token && store.tokens[token]) { delete store.tokens[token]; saveStore(); }
  res.json({ success: true });
});

// GET /api/me?token=...  -> { success, user }
router.get('/me', (req, res) => {
  const user = userByToken(req.query.token);
  if (!user) return res.json({ success: false });
  res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
});

// GET /api/owners  -> { success, owners: {receiptId:userId}, users: {userId:{name,role}} }
router.get('/owners', (req, res) => {
  res.json({ success: true, owners: store.owners, users: publicUsers() });
});

// POST /api/set-owner  { token, receiptId }
router.post('/set-owner', (req, res) => {
  const { token, receiptId } = req.body || {};
  const user = userByToken(token);
  if (!user) return res.status(401).json({ success: false, error: 'Не авторизован' });
  if (receiptId === undefined || receiptId === null) {
    return res.json({ success: false, error: 'Не указан receiptId' });
  }
  store.owners[String(receiptId)] = user.id;
  saveStore();
  res.json({ success: true });
});

// POST /api/remove-owner  { token, receiptId }  (вызывать при удалении чека — необязательно)
router.post('/remove-owner', (req, res) => {
  const { token, receiptId } = req.body || {};
  const user = userByToken(token);
  if (!user) return res.status(401).json({ success: false, error: 'Не авторизован' });
  if (store.owners[String(receiptId)] !== undefined) {
    delete store.owners[String(receiptId)];
    saveStore();
  }
  res.json({ success: true });
});

// ============================================================
// ✅ MIDDLEWARE и хелперы для защиты остальных маршрутов
// ============================================================

// Достаём токен из заголовка Authorization, тела или query
function extractToken(req) {
  const h = req.headers && req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  if (req.body && req.body.token) return req.body.token;
  if (req.query && req.query.token) return req.query.token;
  return null;
}

// Требуется авторизация (по токену auth-owners)
function requireAuth(req, res, next) {
  const user = userByToken(extractToken(req));
  if (!user) return res.status(401).json({ success: false, error: 'Требуется авторизация' });
  req.userId = user.id;
  req.userRole = user.role;
  req.userName = user.name;
  req.user = { id: user.id, name: user.name, role: user.role };
  next();
}

// Требуется роль admin
function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ success: false, error: 'Требуется роль администратора' });
  }
  next();
}

// Серверная фильтрация выдачи /api/receipts: не-админ получает ТОЛЬКО свои чеки.
// Перехватываем res.json и фильтруем массив по карте владельцев (работает,
// не трогая сам файл receipts.js).
function scopeReceiptsByOwner(req, res, next) {
  if (req.userRole === 'admin') return next();
  const userId = req.userId;
  const filterArr = (arr) => Array.isArray(arr) ? arr.filter(r => store.owners[String(r.id)] === userId) : arr;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      if (Array.isArray(body)) body = filterArr(body);
      else if (body && Array.isArray(body.receipts)) body = { ...body, receipts: filterArr(body.receipts) };
      else if (body && Array.isArray(body.data)) body = { ...body, data: filterArr(body.data) };
    } catch (e) { /* при проблеме отдаём как есть */ }
    return originalJson(body);
  };
  next();
}

// Фильтр массива чеков по владельцу (для export-excel и пр.)
function filterOwned(arr, userId) {
  return Array.isArray(arr) ? arr.filter(r => store.owners[String(r.id)] === userId) : arr;
}

// Роутер экспортируем как основной модуль, а middleware/хелперы — как его свойства
module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
module.exports.scopeReceiptsByOwner = scopeReceiptsByOwner;
module.exports.filterOwned = filterOwned;
