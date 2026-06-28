const express = require('express');
const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

router.post('/login', (req, res) => {
  console.log('Login attempt:', req.body.username);
  
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (password === ADMIN_PASSWORD) {
    res.json({ 
      success: true, 
      token: 'demo-token-' + Date.now(),
      user: { username, role: 'admin' }
    });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

module.exports = router;