require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');  // ← ДОБАВЛЕНО: WebSocket для Node.js 20

const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация Supabase клиента с WebSocket transport для Node.js 20
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: ws  // ← ДОБАВЛЕНО: фикс для Node.js 20
    }
  }
);

// CORS настройки
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Обработка OPTIONS запросов (preflight)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

app.use(express.json({ limit: '50mb' }));

// Создаем папку для загрузок если не существует
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// ✅ Middleware для проверки авторизации
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        error: 'Требуется авторизация' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Недействительный токен' 
      });
    }
    
    // Получаем профиль пользователя с ролью
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();
    
    req.user = user;
    req.userRole = profile?.role || 'user';
    req.userFullName = profile?.full_name || user.email;
    
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка проверки авторизации' 
    });
  }
};

// ✅ Middleware для проверки роли admin
const requireAdmin = async (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Требуется роль администратора' 
    });
  }
  next();
};

// ✅ Middleware для логирования запросов
const logRequest = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const user = req.userName ? `${req.userName} (${req.userRole})` : 'anonymous';
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${user}`);
  next();
};

// Health check endpoint (публичный)
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Receipt Manager API is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    auth: 'enabled',
    timestamp: new Date().toISOString()
  });
});

// ✅ Auth endpoints (публичные)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email и пароль обязательны' 
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ 
        success: false, 
        error: error.message 
      });
    }

    // Получаем профиль
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', data.user.id)
      .single();

    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile?.role || 'user',
        fullName: profile?.full_name || data.user.email
      },
      token: data.session.access_token,
      refreshToken: data.session.refresh_token
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка входа' 
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email и пароль обязательны' 
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { 
          role: 'user',
          full_name: fullName || email
        }
      }
    });

    if (error) {
      return res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }

    res.json({
      success: true,
      message: 'Регистрация успешна! Проверьте email для подтверждения.',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка регистрации' 
    });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    res.json({
      success: true,
      message: 'Выход выполнен'
    });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка выхода' 
    });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.userRole,
      fullName: req.userFullName
    }
  });
});

// ✅ Публичные роуты (не требуют авторизации)
app.use('/api/identify', require('./identify'));
app.use('/api/identify-groq', require('./identify-groq'));
app.use('/api/identify-ocrspace', require('./identify-ocrspace'));
app.use('/api/list-gemini-models', require('./list-gemini-models'));
app.use('/api/list-groq-models', require('./list-groq-models'));
app.use('/api/list-ocrspace-models', require('./list-ocrspace-models'));
app.use('/api/list-and-test-models', require('./list-and-test-models'));
app.use('/api/compare-recognize', require('./compare-recognize'));

// ✅ Простая авторизация по паролю + владение чеками (auth-owners.js)
// Даёт /api/login, /api/logout, /api/me, /api/owners, /api/set-owner, /api/remove-owner
const authOwners = require('./auth-owners');
const requireAuthAO = authOwners.requireAuth;       // авторизация по токену из ACCOUNTS
const requireAdminAO = authOwners.requireAdmin;     // роль admin
const scopeReceiptsByOwner = authOwners.scopeReceiptsByOwner; // не-админ видит только свои чеки
app.use('/api', authOwners);

// ✅ Защищённые роуты (требуют авторизации по токену auth-owners)
app.use('/api/upload-file', requireAuthAO, logRequest, require('./upload-file'));
app.use('/api/upload-folder', requireAuthAO, logRequest, require('./upload-folder'));
app.use('/api/save-receipt', requireAuthAO, logRequest, require('./save-receipt'));
app.use('/api/receipts', requireAuthAO, scopeReceiptsByOwner, logRequest, require('./receipts'));
app.use('/api/update-receipt-currency', requireAuthAO, logRequest, require('./update-receipt-currency'));
app.use('/api/reprocess-receipt', requireAuthAO, logRequest, require('./reprocess-receipt'));
app.use('/api/reprocess-unrecognized', requireAuthAO, logRequest, require('./reprocess-unrecognized'));

// ✅ Экспорт доступен всем авторизованным (не-админу — только свои чеки, фильтруется внутри export-excel.js)
app.use('/api/export-excel', requireAuthAO, logRequest, require('./export-excel'));

// ✅ Админские роуты (требуют роль admin)
app.use('/api/delete-receipt/:id', requireAuthAO, requireAdminAO, logRequest, require('./delete-receipt'));

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(500).json({ 
    success: false,
    error: err.message 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Receipt API запущен на порту ${PORT}`);
  console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
  console.log(`📂 Uploads: ${uploadsDir}`);
  console.log(`🔐 Auth: ${process.env.SUPABASE_URL ? '✅ Включена' : '❌ Отключена'}`);
  console.log(`🤖 Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
  console.log(`⚡ Groq: ${process.env.GROQ_API_KEY ? '✅' : '❌'}`);
  console.log(`📷 OCR.Space: ${process.env.OCRSPACE_API_KEY ? '✅' : '❌'}`);
  console.log(`🗄️ Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
});