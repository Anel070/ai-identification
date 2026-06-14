# 🔍 AI Video Detector v2

Определяет, создано ли видео с помощью ИИ — Gemini 2.5 Flash + авторизация + PostgreSQL.

## Стек
- **Backend:** Node.js + Express
- **БД:** PostgreSQL (через `pg`)
- **Авторизация:** JWT + bcrypt
- **AI:** Google Gemini 2.5 Flash
- **Хостинг:** Render

---

## Локальный запуск

```bash
npm install
cp .env.example .env
# Заполните GEMINI_API_KEY, JWT_SECRET, DATABASE_URL
npm start
```

Для локальной БД:
```bash
createdb ai_video_detector
# DATABASE_URL=postgresql://localhost/ai_video_detector
```

---

## Деплой на Render (через render.yaml)

1. Запушьте проект в GitHub
2. На [render.com](https://render.com) → **New → Blueprint**
3. Выберите репозиторий — Render сам создаст Web Service + PostgreSQL базу
4. В переменных окружения укажите `GEMINI_API_KEY`
5. Нажмите **Apply** → деплой готов!

### Ручной деплой

**Шаг 1 — создайте PostgreSQL базу:**
- New → PostgreSQL
- Name: `ai-video-db`, Plan: Free
- Скопируйте **Internal Database URL**

**Шаг 2 — создайте Web Service:**
- New → Web Service → подключите GitHub
- Build Command: `npm install`
- Start Command: `npm start`

**Шаг 3 — Environment Variables:**
| Переменная     | Значение                                  |
|----------------|-------------------------------------------|
| GEMINI_API_KEY | Ваш ключ с aistudio.google.com            |
| JWT_SECRET     | Любая длинная случайная строка            |
| DATABASE_URL   | Internal URL от PostgreSQL сервиса Render |

---

## API

| Метод | Путь            | Описание              | Auth |
|-------|-----------------|-----------------------|------|
| POST  | /api/register   | Регистрация           | —    |
| POST  | /api/login      | Вход                  | —    |
| GET   | /api/me         | Текущий пользователь  | ✅   |
| GET   | /api/history    | История анализов      | ✅   |
| POST  | /analyze        | Анализ видео          | ✅   |
| GET   | /health         | Health check + DB     | —    |
