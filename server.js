require("dotenv").config();

const express = require("express");
const multer  = require("multer");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");
const { spawn } = require("child_process");
const { GoogleGenAI } = require("@google/genai");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

// ───────────────────────── PostgreSQL ─────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      username     TEXT UNIQUE NOT NULL,
      email        TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename   TEXT NOT NULL,
      verdict    TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      summary    TEXT,
      signs      JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ PostgreSQL: таблицы готовы");
}

// ───────────────────────── Config ─────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret_in_production";
const PORT       = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ ОШИБКА: Не найден GEMINI_API_KEY!");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("❌ ОШИБКА: Не найден DATABASE_URL!");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ───────────────────────── Middleware ─────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const UPLOADS_DIR = "/tmp/uploads";
const FRAMES_DIR  = "/tmp/frames";
[UPLOADS_DIR, FRAMES_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const upload = multer({ dest: UPLOADS_DIR });

// ───────────────────────── Auth middleware ────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer "))
    return res.status(401).json({ success: false, error: "Требуется авторизация" });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Токен недействителен или истёк" });
  }
}

// ───────────────────────── Auth routes ────────────────────────

// Регистрация
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ success: false, error: "Заполните все поля" });
  if (password.length < 6)
    return res.status(400).json({ success: false, error: "Пароль минимум 6 символов" });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3) RETURNING id, username`,
      [username.trim(), email.trim().toLowerCase(), hash]
    );
    const user = rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, username: user.username });
  } catch (e) {
    if (e.code === "23505") {
      const field = e.detail?.includes("email") ? "Email" : "Имя пользователя";
      return res.status(409).json({ success: false, error: `${field} уже занят` });
    }
    console.error(e);
    res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});

// Вход
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, error: "Заполните все поля" });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ success: false, error: "Неверный email или пароль" });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, username: user.username });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});

// Текущий пользователь
app.get("/api/me", auth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, username, email, created_at FROM users WHERE id = $1",
    [req.user.id]
  );
  res.json({ success: true, user: rows[0] });
});

// История анализов
app.get("/api/history", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, filename, verdict, confidence, summary, signs, created_at
     FROM analyses WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ success: true, analyses: rows });
});

// ───────────────────────── FFmpeg ─────────────────────────────
function getFFmpegPath() {
  try { const p = require("ffmpeg-static"); if (p) return p; } catch {}
  return "ffmpeg"; // системный ffmpeg на Render
}

async function extractFrames(videoPath) {
  return new Promise((resolve, reject) => {
    // Очищаем старые кадры
    fs.readdirSync(FRAMES_DIR)
      .filter(f => f.endsWith(".jpg"))
      .forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));

    const out = path.join(FRAMES_DIR, "frame-%d.jpg");
    const bin = getFFmpegPath();

    const proc = spawn(bin, [
      "-i", videoPath,
      "-vf", "fps=0.5,scale=640:-1",
      "-frames:v", "6",
      "-q:v", "2",
      out, "-y"
    ]);

    proc.on("close", () => {
      const files = fs.readdirSync(FRAMES_DIR)
        .filter(f => f.endsWith(".jpg"))
        .sort()
        .map(f => path.join(FRAMES_DIR, f));
      files.length ? resolve(files) : reject(new Error("Не удалось извлечь кадры"));
    });
    proc.on("error", reject);
  });
}

// ───────────────────────── Analyze ────────────────────────────
app.post("/analyze", auth, upload.single("video"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, error: "Видео не загружено" });

    console.log(`📹 [${req.user.username}] ${req.file.originalname}`);
    const frames = await extractFrames(req.file.path);
    console.log(`🖼️  Кадров: ${frames.length}`);

    const contents = [{
      text: `Ты эксперт по обнаружению ИИ-сгенерированного видеоконтента.
Проанализируй предоставленные кадры из видео и определи, является ли видео сгенерированным ИИ или настоящим.

Обрати внимание на:
- Артефакты ИИ (неестественные текстуры, странные детали лиц, рук, фона)
- Неестественное освещение или тени
- Аномалии движения или размытия
- Несоответствия между кадрами
- Гиперреалистичное или "пластиковое" качество картинки

Ответь ТОЛЬКО валидным JSON без лишнего текста:
{
  "verdict": "AI_GENERATED" | "REAL" | "UNCLEAR",
  "confidence": число от 0 до 100,
  "summary": "Краткое объяснение на русском языке (2-3 предложения)",
  "signs": ["признак 1", "признак 2"]
}`
    }];

    for (const frame of frames) {
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: fs.readFileSync(frame).toString("base64")
        }
      });
    }

    console.log("🤖 Отправляю в Gemini 2.5 Flash...");
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents });

    let parsed;
    try {
      const clean = response.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { verdict: "UNCLEAR", confidence: 0, summary: response.text, signs: [] };
    }

    await pool.query(
      `INSERT INTO analyses (user_id, filename, verdict, confidence, summary, signs)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, req.file.originalname, parsed.verdict, parsed.confidence,
       parsed.summary, JSON.stringify(parsed.signs || [])]
    );

    fs.unlinkSync(req.file.path);
    res.json({ success: true, result: parsed });

  } catch (error) {
    console.error("❌", error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ───────────────────────── Health check ───────────────────────
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (e) {
    res.status(500).json({ status: "error", db: e.message });
  }
});

// ───────────────────────── Start ──────────────────────────────
initDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error("❌ Ошибка БД:", err.message);
  process.exit(1);
});
