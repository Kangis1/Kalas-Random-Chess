const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend');
const { pool } = require('./db');

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this';
const JWT_EXPIRES_IN = '7d';

// Signup
router.post('/signup', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = uuidv4();
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, username, verification_token, verification_token_expires)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, username`,
      [email.toLowerCase(), passwordHash, username || null, verificationToken, tokenExpires]
    );

    const user = result.rows[0];

    // Send verification email
    const verifyUrl = `${process.env.APP_URL || 'https://kalas-random-chess-1.onrender.com'}/verify?token=${verificationToken}`;

    try {
      await resend.emails.send({
        from: 'Kalas Chess <onboarding@resend.dev>',
        to: email,
        subject: 'Verify your Kalas Random Chess account',
        html: `
          <h1>Welcome to Kalas Random Chess!</h1>
          <p>Click the link below to verify your email address:</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
          <p>This link expires in 24 hours.</p>
        `
      });
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr);
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({
      message: 'Account created. Please check your email to verify your account.',
      user: { id: user.id, email: user.email, username: user.username, emailVerified: false },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, username, password_hash, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      user: { id: user.id, email: user.email, username: user.username, emailVerified: user.email_verified },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify email
router.get('/verify', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Verification token required' });
  }

  try {
    const result = await pool.query(
      `SELECT id FROM users
       WHERE verification_token = $1
       AND verification_token_expires > CURRENT_TIMESTAMP
       AND email_verified = FALSE`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    await pool.query(
      `UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL WHERE id = $1`,
      [result.rows[0].id]
    );

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT id, email, username, email_verified, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerified: user.email_verified,
        createdAt: user.created_at
      }
    });
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT id, email, email_verified FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Generate new verification token
    const verificationToken = uuidv4();
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
      [verificationToken, tokenExpires, user.id]
    );

    const verifyUrl = `${process.env.APP_URL || 'https://kalas-random-chess-1.onrender.com'}/verify?token=${verificationToken}`;

    await resend.emails.send({
      from: 'Kalas Chess <onboarding@resend.dev>',
      to: user.email,
      subject: 'Verify your Kalas Random Chess account',
      html: `
        <h1>Verify your email</h1>
        <p>Click the link below to verify your email address:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
      `
    });

    res.json({ message: 'Verification email sent' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

module.exports = router;
