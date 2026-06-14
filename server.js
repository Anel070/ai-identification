require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobe = require("ffprobe-static");
const { GoogleGenAI } = require("@google/genai");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.static("public"));

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ ОШИБКА: Не найден GEMINI_API_KEY в .env файле!");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function extractFrames(videoPath) {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(__dirname, "frames");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Удаляем старые кадры
    fs.readdirSync(outputDir)
      .filter(f => f.endsWith(".jpg"))
      .forEach(f => fs.unlinkSync(path.join(outputDir, f)));

    ffmpeg(videoPath)
      .screenshots({
        count: 6,
        folder: outputDir,
        filename: "frame-%i.jpg",
        size: "640x?"
      })
      .on("end", () => {
        const files = fs
          .readdirSync(outputDir)
          .filter(f => f.endsWith(".jpg"))
          .sort()
          .map(f => path.join(outputDir, f));
        resolve(files);
      })
      .on("error", reject);
  });
}

app.post("/analyze", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Видео не загружено" });
    }

    console.log("📹 Извлекаю кадры из:", req.file.originalname);
    const frames = await extractFrames(req.file.path);
    console.log(`🖼️  Извлечено кадров: ${frames.length}`);

    const contents = [
      {
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
      }
    ];

    for (const frame of frames) {
      const imageData = fs.readFileSync(frame);
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageData.toString("base64")
        }
      });
    }

    console.log("🤖 Отправляю в Gemini 2.5 Flash...");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents
    });

    const rawText = response.text;
    console.log("✅ Ответ получен:", rawText);

    // Парсим JSON (Gemini иногда оборачивает в ```json```)
    let parsed;
    try {
      const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      parsed = { verdict: "UNCLEAR", confidence: 0, summary: rawText, signs: [] };
    }

    // Удаляем загруженный файл
    fs.unlinkSync(req.file.path);

    res.json({ success: true, result: parsed });

  } catch (error) {
    console.error("❌ Ошибка:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});
