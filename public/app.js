const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const fileInfo = document.getElementById('fileInfo');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const result = document.getElementById('result');
const uploadArea = document.getElementById('uploadArea');

// Drag & drop
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) setFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(file) {
  fileInput._file = file;
  const mb = (file.size / 1024 / 1024).toFixed(1);
  fileInfo.style.display = 'block';
  fileInfo.innerHTML = `📁 <strong>${file.name}</strong> — ${mb} МБ`;
  analyzeBtn.disabled = false;
  result.style.display = 'none';
}

analyzeBtn.addEventListener('click', async () => {
  const file = fileInput._file || fileInput.files[0];
  if (!file) { alert('Выберите видео'); return; }

  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/auth.html'; return; }

  analyzeBtn.disabled = true;
  loader.style.display = 'flex';
  result.style.display = 'none';

  const messages = [
    'Извлекаю кадры из видео...',
    'Анализирую кадры с Gemini 2.5 Flash...',
    'Ищу признаки ИИ-генерации...',
    'Почти готово...'
  ];
  let msgIdx = 0;
  loaderText.textContent = messages[0];
  const msgInterval = setInterval(() => {
    msgIdx = Math.min(msgIdx + 1, messages.length - 1);
    loaderText.textContent = messages[msgIdx];
  }, 3000);

  try {
    const fd = new FormData();
    fd.append('video', file);

    const res = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: fd
    });

    // Handle 401 — logout
    if (res.status === 401) {
      clearInterval(msgInterval);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth.html';
      return;
    }

    const data = await res.json();

    clearInterval(msgInterval);
    loader.style.display = 'none';
    analyzeBtn.disabled = false;

    if (!data.success) {
      result.style.display = 'block';
      result.className = 'result-card error';
      result.innerHTML = `<h2>❌ Ошибка</h2><p>${data.error}</p>`;
      return;
    }

    const r = data.result;
    const verdictMap = {
      'AI_GENERATED': { label: 'ИИ-СГЕНЕРИРОВАНО', emoji: '🤖', cls: 'ai' },
      'REAL': { label: 'НАСТОЯЩЕЕ', emoji: '✅', cls: 'real' },
      'UNCLEAR': { label: 'НЕЯСНО', emoji: '❓', cls: 'unclear' }
    };
    const v = verdictMap[r.verdict] || verdictMap['UNCLEAR'];

    const signsHtml = (r.signs && r.signs.length)
      ? `<ul class="signs">${r.signs.map(s => `<li>${s}</li>`).join('')}</ul>`
      : '';

    result.style.display = 'block';
    result.className = `result-card verdict-${v.cls}`;
    result.innerHTML = `
      <div class="verdict-badge">${v.emoji} ${v.label}</div>
      <div class="confidence-bar">
        <span>Уверенность: <strong>${r.confidence}%</strong></span>
        <div class="bar"><div class="bar-fill" style="width:${r.confidence}%"></div></div>
      </div>
      <p class="summary">${r.summary}</p>
      ${signsHtml}
    `;
  } catch (err) {
    clearInterval(msgInterval);
    loader.style.display = 'none';
    analyzeBtn.disabled = false;
    result.style.display = 'block';
    result.className = 'result-card error';
    result.innerHTML = `<h2>❌ Ошибка соединения</h2><p>${err.message}</p>`;
  }
});
