# AI Video Detector 🔍

Определяет, создано ли видео с помощью ИИ, используя Google Gemini 2.5 Flash.

## Быстрый запуск

### 1. Получите API ключ Gemini
Бесплатно: https://aistudio.google.com/app/apikey

### 2. Создайте файл `.env`
```
cp .env.example .env
```
Откройте `.env` и вставьте ваш ключ:
```
GEMINI_API_KEY=AIzaSy...ваш_ключ
```

### 3. Установите зависимости (если нужно)
```
npm install
```

### 4. Запустите
```
npm start
```

### 5. Откройте в браузере
```
http://localhost:3000
```

## Как работает
1. Загружаете видео через браузер
2. Сервер извлекает 6 ключевых кадров с помощью FFmpeg
3. Кадры отправляются в Gemini 2.5 Flash
4. Gemini анализирует признаки ИИ-генерации
5. Вы получаете вердикт: AI_GENERATED / REAL / UNCLEAR
# ai-identification
