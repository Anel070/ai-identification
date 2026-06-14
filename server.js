require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobe = require("ffprobe-static");

const pool = require("./db/pool");
const authRoutes = require("./routes/auth");
const authMiddleware = require("./middleware/auth");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.use("/api/auth", authRoutes);

if (!process.env.GEMINI_API_KEY) {
  console.error("ОШИБКА: Не найден GEMINI_API_KEY в .env файле!");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("ОШИБКА: Не найден JWT_SECRET в .env файле!");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("ОШИБКА: Не найден DATABASE_URL в .env файле!");
  process.exit(1);
}

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 100 * 1024 * 1024 },
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS analyses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255),
        verdict VARCHAR(20),
        confidence INTEGER,
        summary TEXT,
        signs JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("БД инициализирована");
  } catch (err) {
    console.error("Ошибка инициализации БД:", err.message);
  }
}

async function extractFrames(videoPath) {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(__dirname, "frames");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.readdirSync(outputDir)
      .filter((f) => f.endsWith(".jpg"))
      .forEach((f) => fs.unlinkSync(path.join(outputDir, f)));

    ffmpeg(videoPath)
      .screenshots({
        count: 6,
        folder: outputDir,
        filename: "frame-%i.jpg",
        size: "640x?",
      })
      .on("end", () => {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.endsWith(".jpg"))
          .sort()
          .map((f) => path.join(outputDir, f));
        resolve(files);
      })
      .on("error", reject);
  });
}

async function analyzeWithGemini(frames) {
  const parts = [
    {
      text: "Ты эксперт по обнаружению ИИ-сгенерированного видеоконтента. Проанализируй предоставленные кадры из видео и определи, является ли видео сгенерированным ИИ или настоящим. Обрати внимание на: артефакты ИИ, неестественные текстуры, странные детали лиц и рук, неестественное освещение, аномалии движения, несоответствия между кадрами. Ответь ТОЛЬКО валидным JSON: {\"verdict\": \"AI_GENERATED\" | \"REAL\" | \"UNCLEAR\", \"confidence\": число от 0 до 100, \"summary\": \"Краткое объяснение на русском языке\", \"signs\": [\"признак 1\", \"признак 2\"]}"
    }
  ];

  for (const frame of frames) {
    const imageData = fs.readFileSync(frame);
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: imageData.toString("base64")
      }
    });
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: parts }]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

app.post("/analyze", authMiddleware, upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Видео не загружено" });
    }

    console.log("Извлекаю кадры из:", req.file.originalname);
    const frames = await extractFrames(req.file.path);
    console.log("Извлечено кадров:", frames.length);

    console.log("Отправляю в Gemini 2.5 Flash...");
    const rawText = await analyzeWithGemini(frames);
    console.log("Ответ получен:", rawText);

    let parsed;
    try {
      const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      parsed = { verdict: "UNCLEAR", confidence: 0, summary: rawText, signs: [] };
    }

    await pool.query(
      "INSERT INTO analyses (user_id, filename, verdict, confidence, summary, signs) VALUES ($1, $2, $3, $4, $5, $6)",
      [req.user.id, req.file.originalname, parsed.verdict, parsed.confidence, parsed.summary, JSON.stringify(parsed.signs || [])]
    );

    fs.unlinkSync(req.file.path);

    res.json({ success: true, result: parsed });
  } catch (error) {
    console.error("Ошибка:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/history", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, filename, verdict, confidence, summary, signs, created_at FROM analyses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
      [req.user.id]
    );
    res.json({ success: true, history: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log("Сервер запущен: http://localhost:" + PORT);
  });
});