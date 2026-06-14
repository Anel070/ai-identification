# 🔍 AI Video Detector

Детектор ИИ-сгенерированного видео с системой авторизации.

## Стек
- **Backend**: Node.js + Express
- **AI**: Google Gemini 2.5 Flash
- **Database**: PostgreSQL (Render)
- **Auth**: JWT + bcrypt

---

## 🚀 Деплой на Render

### Шаг 1 — GitHub
1. Создай репозиторий на GitHub
2. Загрузи все файлы (кроме `node_modules`, `.env`, `uploads/*`, `frames/*`)

### Шаг 2 — PostgreSQL на Render
1. Зайди на [render.com](https://render.com) → **New → PostgreSQL**
2. Настройки:
   - **Name**: `ai-video-detector-db`
   - **Plan**: Free
3. Нажми **Create Database**
4. Скопируй **Internal Database URL** (понадобится на шаге 3)

### Шаг 3 — Web Service на Render
1. **New → Web Service** → подключи GitHub репозиторий
2. Настройки:
   - **Name**: `ai-video-detector`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
3. Добавь переменные окружения (**Environment → Add**):

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `GEMINI_API_KEY` | твой ключ от Google AI Studio |
| `JWT_SECRET` | любая длинная случайная строка (мин. 32 символа) |
| `DATABASE_URL` | Internal Database URL из шага 2 |

4. Нажми **Create Web Service**

### Шаг 4 (альтернатива) — render.yaml
Если хочешь задеплоить одним кликом:
1. Убедись, что `render.yaml` есть в корне репозитория
2. На Render: **New → Blueprint** → выбери репозиторий
3. Render сам создаст БД и Web Service
4. После деплоя вручную добавь `GEMINI_API_KEY` в Environment переменные

---

## 🔐 Авторизация

- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход, возвращает JWT токен
- `GET /api/auth/me` — данные текущего пользователя
- `POST /analyze` — анализ видео (требует Bearer токен)
- `GET /api/history` — история анализов пользователя

---

## Локальный запуск

```bash
npm install
cp .env.example .env
# Заполни .env своими ключами
npm start
```

Открой http://localhost:3000
