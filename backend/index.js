const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// === CORS ===
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// === PASSWORDS ===
const VALID_PASSWORDS = [
  'admin', 'user1', 'user2', 'user3', 'user4', 'user5',
  'user6', 'user7', 'user8', 'user9', 'user10', 'user11',
  'user12', 'user13', 'user14', 'user15', 'user16', 'user17',
  'user18', 'user19', 'user20'
];

// === HEALTH ===
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// === LOGIN HANDLER ===
function handleLogin(req, res) {
  const { password } = req.body;
  console.log('Login attempt:', password);
  
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  
  if (VALID_PASSWORDS.includes(password)) {
    const token = Buffer.from(password + '_' + Date.now()).toString('base64');
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: 'Неверный пароль' });
}

// === LOGIN ROUTES (оба пути!) ===
app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

// === VERIFY ===
app.get('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  res.json({ valid: true });
});

// === UPLOAD ===
app.post('/api/upload-receipt', (req, res) => {
  res.json({ success: true, message: 'Upload ready' });
});

// === IDENTIFY ===
app.post('/api/identify', (req, res) => {
  res.json({ success: true, message: 'Identify ready' });
});

// === ERROR ===
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Server running on port', PORT);
});