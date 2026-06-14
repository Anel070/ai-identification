const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const router = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, error: "Заполните все поля" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: "Пароль минимум 6 символов" });
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: "Email или имя пользователя уже занято" });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hash]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ success: true, token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Введите email и пароль" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: "Неверный email или пароль" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Неверный email или пароль" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});

// GET /api/auth/me
router.get("/me", require("../middleware/auth"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Пользователь не найден" });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});

module.exports = router;
