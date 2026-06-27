const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// === CORS — РАЗРЕШИТЬ ВСЕ ДЛЯ ОТЛАДКИ (потом ограничим) ===
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));

// === BODY PARSER ===
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// === SUPABASE ===
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('SUPABASE_URL exists:', !!supabaseUrl);
console.log('SUPABASE_KEY exists:', !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// === HEALTH CHECK ===
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    supabase_connected: !!supabaseUrl && !!supabaseKey
  });
});

// === ПРОСТАЯ АВТОРИЗАЦИЯ (без Supabase Auth, просто проверка пароля) ===
const VALID_PASSWORDS = [
  'admin', 'user1', 'user2', 'user3', 'user4', 'user5',
  'user6', 'user7', 'user8', 'user9', 'user10', 'user11',
  'user12', 'user13', 'user14', 'user15', 'user16', 'user17',
  'user18', 'user19', 'user20'
];

app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    console.log('Login attempt with password:', password);
    
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }
    
    if (VALID_PASSWORDS.includes(password)) {
      // Генерируем простой токен
      const token = Buffer.from(password + '_' + Date.now()).toString('base64');
      return res.json({ 
        success: true, 
        token,
        user: { password }
      });
    } else {
      return res.status(401).json({ error: 'Неверный пароль' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// === ПРОВЕРКА ТОКЕНА ===
app.get('/api/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (!token) {
      return res.status(401).json({ error: 'No token' });
    }
    // Простая проверка — токен существует
    res.json({ valid: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// === UPLOAD RECEIPT ===
app.post('/api/upload-receipt', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    console.log('Upload token:', token ? 'exists' : 'missing');
    
    // Пока пропускаем все (для отладки)
    res.json({ success: true, message: 'Upload endpoint ready' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// === ERROR HANDLER ===
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
});