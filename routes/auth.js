const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// GET /auth/login - Generates a JWT token for a hardcoded userId
router.get('/login', (req, res) => {
  const userId = 'user_123';
  
  // Create a token that expires in 1 day
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1d' });
  
  res.json({
    message: 'Login successful',
    token
  });
});

module.exports = router;
