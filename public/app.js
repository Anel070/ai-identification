// ---- Auth state ----
let token = localStorage.getItem("token");
let currentUser = localStorage.getItem("username");

// ---- Init ----
window.addEventListener("DOMContentLoaded", () => {
  if (token) {
    showApp();
  } else {
    showAuth();
  }
});

function showAuth() {
  document.getElementById("authScreen").style.display = "flex";
  document.getElementById("appScreen").style.display = "none";
}

function showApp() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "flex";
  document.getElementById("headerUsername").textContent = currentUser || "";
}

// ---- Tab switch ----
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("loginForm").style.display = tab === "login" ? "flex" : "none";
  document.getElementById("registerForm").style.display = tab === "register" ? "flex" : "none";
  document.querySelectorAll(".tab-btn")[tab === "login" ? 0 : 1].classList.add("active");
}

// ---- Login ----
async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";

  if (!email || !password) { errEl.textContent = "Заполните все поля"; return; }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.error; return; }
    saveAuth(data.token, data.username);
    showApp();
  } catch (e) {
    errEl.textContent = "Ошибка соединения";
  }
}

// ---- Register ----
async function doRegister() {
  const username = document.getElementById("regUsername").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const errEl = document.getElementById("registerError");
  errEl.textContent = "";

  if (!username || !email || !password) { errEl.textContent = "Заполните все поля"; return; }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.error; return; }
    saveAuth(data.token, data.username);
    showApp();
  } catch (e) {
    errEl.textContent = "Ошибка соединения";
  }
}

function saveAuth(t, u) {
  token = t;
  currentUser = u;
  localStorage.setItem("token", t);
  localStorage.setItem("username", u);
}

function doLogout() {
  token = null;
  currentUser = null;
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  showAuth();
}

// Enter key support for auth
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (document.getElementById("loginForm").style.display !== "none") doLogin();
  else doRegister();
});

// ---- Upload & analyze ----
const fileInput = document.getElementById("fileInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const fileInfo = document.getElementById("fileInfo");
const loader = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");
const result = document.getElementById("result");
const uploadArea = document.getElementById("uploadArea");

uploadArea.addEventListener("dragover", e => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", e => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("video/")) setFile(file);
});
fileInput.addEventListener("change", () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });

function setFile(file) {
  fileInput._file = file;
  const mb = (file.size / 1024 / 1024).toFixed(1);
  fileInfo.style.display = "block";
  fileInfo.innerHTML = `📁 <strong>${file.name}</strong> — ${mb} МБ`;
  analyzeBtn.disabled = false;
  result.style.display = "none";
}

analyzeBtn.addEventListener("click", async () => {
  const file = fileInput._file || fileInput.files[0];
  if (!file) { alert("Выберите видео"); return; }

  analyzeBtn.disabled = true;
  loader.style.display = "flex";
  result.style.display = "none";

  const messages = [
    "Извлекаю кадры из видео...",
    "Анализирую кадры с Gemini 2.5 Flash...",
    "Ищу признаки ИИ-генерации...",
    "Почти готово..."
  ];
  let msgIdx = 0;
  loaderText.textContent = messages[0];
  const msgInterval = setInterval(() => {
    msgIdx = Math.min(msgIdx + 1, messages.length - 1);
    loaderText.textContent = messages[msgIdx];
  }, 3000);

  try {
    const fd = new FormData();
    fd.append("video", file);

    const res = await fetch("/analyze", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    const data = await res.json();

    clearInterval(msgInterval);
    loader.style.display = "none";
    analyzeBtn.disabled = false;

    if (!data.success) {
      showResult({ verdict: "ERROR", confidence: 0, summary: data.error, signs: [] }, true);
      return;
    }
    showResult(data.result);
  } catch (err) {
    clearInterval(msgInterval);
    loader.style.display = "none";
    analyzeBtn.disabled = false;
    showResult({ verdict: "ERROR", confidence: 0, summary: err.message, signs: [] }, true);
  }
});

function showResult(r, isError = false) {
  result.style.display = "block";
  if (isError) {
    result.className = "result-card error";
    result.innerHTML = `<h2>❌ Ошибка</h2><p>${r.summary}</p>`;
    return;
  }
  const verdictMap = {
    "AI_GENERATED": { label: "ИИ-СГЕНЕРИРОВАНО", emoji: "🤖", cls: "ai" },
    "REAL":         { label: "НАСТОЯЩЕЕ",         emoji: "✅", cls: "real" },
    "UNCLEAR":      { label: "НЕЯСНО",             emoji: "❓", cls: "unclear" }
  };
  const v = verdictMap[r.verdict] || verdictMap["UNCLEAR"];
  const signsHtml = (r.signs && r.signs.length)
    ? `<ul class="signs">${r.signs.map(s => `<li>${s}</li>`).join("")}</ul>` : "";

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
}

// ---- History ----
let historyVisible = false;

async function toggleHistory() {
  const panel = document.getElementById("historyPanel");
  historyVisible = !historyVisible;
  panel.style.display = historyVisible ? "flex" : "none";
  if (historyVisible) loadHistory();
}

async function loadHistory() {
  const list = document.getElementById("historyList");
  list.innerHTML = '<p class="history-empty">Загрузка...</p>';
  try {
    const res = await fetch("/api/history", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success || !data.analyses.length) {
      list.innerHTML = '<p class="history-empty">История пуста</p>';
      return;
    }
    const verdictLabel = { AI_GENERATED: "🤖 ИИ", REAL: "✅ Реал", UNCLEAR: "❓ Неясно" };
    list.innerHTML = data.analyses.map(a => `
      <div class="history-item">
        <div class="history-item-top">
          <span class="h-verdict">${verdictLabel[a.verdict] || a.verdict}</span>
          <span class="h-conf">${a.confidence}%</span>
        </div>
        <div class="h-filename" title="${a.filename}">${a.filename}</div>
        <div class="h-date">${new Date(a.created_at).toLocaleString("ru")}</div>
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = '<p class="history-empty">Ошибка загрузки</p>';
  }
}
