const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this';
const JWT_EXPIRES_IN = '7d';

// Signup
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Check for valid username (alphanumeric and underscores only)
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
  }

  // Check if database is available
  if (!pool) {
    return res.status(503).json({ error: 'Database not available. Please try again later.' });
  }

  try {
    // Check if username already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user with default ELO of 1500
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, elo) VALUES ($1, $2, 1500) RETURNING id, username, elo`,
      [username, passwordHash]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.status(201).json({
      message: 'Account created successfully',
      user: { id: user.id, username: user.username, elo: user.elo },
      token
    });
  } catch (err) {
    console.error('Signup error:', err.message || err);
    // Provide more specific error messages
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already taken' });
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(503).json({ error: 'Database connection failed. Please try again later.' });
    }
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Check if database is available
  if (!pool) {
    return res.status(503).json({ error: 'Database not available. Please try again later.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, elo FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Generate JWT
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      user: { id: user.id, username: user.username, elo: user.elo || 1500 },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
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
      'SELECT id, username, elo, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        elo: user.elo || 1500,
        createdAt: user.created_at
      }
    });
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Get user stats and game history
router.get('/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // Get user's current ELO
    const userResult = await pool.query(
      'SELECT elo FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get game history with ELO changes
    const gamesResult = await pool.query(`
      SELECT
        id,
        CASE WHEN white_player_id = $1 THEN 'white' ELSE 'black' END as played_as,
        winner,
        result,
        CASE WHEN white_player_id = $1 THEN white_elo_before ELSE black_elo_before END as elo_before,
        CASE WHEN white_player_id = $1 THEN white_elo_change ELSE black_elo_change END as elo_change,
        completed_at
      FROM games
      WHERE (white_player_id = $1 OR black_player_id = $1)
        AND completed_at IS NOT NULL
        AND (white_elo_change IS NOT NULL OR black_elo_change IS NOT NULL)
      ORDER BY completed_at ASC
    `, [userId]);

    // Calculate win/loss/draw stats
    let wins = 0, losses = 0, draws = 0;
    const eloHistory = [];

    gamesResult.rows.forEach(game => {
      const playedAs = game.played_as;
      const winner = game.winner;

      if (winner === 'draw' || game.result === 'stalemate') {
        draws++;
      } else if (winner === playedAs) {
        wins++;
      } else if (winner) {
        losses++;
      }

      // Build ELO history
      if (game.elo_before !== null && game.elo_change !== null) {
        eloHistory.push({
          gameNumber: eloHistory.length + 1,
          eloBefore: game.elo_before,
          eloAfter: game.elo_before + game.elo_change,
          change: game.elo_change,
          date: game.completed_at
        });
      }
    });

    res.json({
      currentElo: userResult.rows[0].elo || 1500,
      stats: {
        wins,
        losses,
        draws,
        totalGames: wins + losses + draws
      },
      eloHistory
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
