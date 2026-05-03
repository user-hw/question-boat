const labels = { single: "单选", judge: "判断", short: "简答" };

let questions = [];
let stats = {};
let current = null;
let generated = [];
let mode = "session";
let sessionQueue = [];
let sessionIndex = 0;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "请求失败");
  }
  return response.json();
}

async function loadData() {
  const search = encodeURIComponent($("#search")?.value || "");
  const [questionData, statData] = await Promise.all([
    api(`/api/questions?search=${search}`),
    api("/api/stats"),
  ]);
  questions = questionData;
  stats = statData;
  render();
}

function cats() {
  return Object.keys(stats.categoryCounts || {}).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function render() {
  renderFilters();
  renderCategories();
  renderList();
  renderStats();
  renderMode();
  renderProgress();
}

function renderFilters() {
  const old = $("#filterCategory").value || "all";
  $("#filterCategory").innerHTML =
    `<option value="all">全部分类</option>` + cats().map((c) => `<option>${esc(c)}</option>`).join("");
  $("#filterCategory").value = cats().includes(old) ? old : "all";
}

function renderCategories() {
  $("#categoryList").innerHTML = Object.entries(stats.categoryCounts || {})
    .map(([c, n]) => `<span>${esc(c)} ${n}</span>`)
    .join("");
}

function renderMode() {
  $$(".mode-card").forEach((card) => card.classList.toggle("active", card.dataset.mode === mode));
  $("#sessionCountWrap").classList.toggle("hidden", mode !== "session");
  $("#startSessionBtn").classList.toggle("hidden", mode !== "session");
  $("#randomBtn").classList.toggle("hidden", mode !== "random");
}

function queryParams(extra = {}) {
  const params = new URLSearchParams({
    category: $("#filterCategory").value,
    type: $("#filterType").value,
    prefer_wrong: $("#preferWrong").checked ? "1" : "0",
    ...extra,
  });
  return params.toString();
}

async function startSession() {
  const count = $("#sessionCount").value || "10";
  sessionQueue = await api(`/api/session?${queryParams({ count })}`);
  sessionIndex = 0;
  if (!sessionQueue.length) {
    return showPlaceholder("当前筛选条件下没有题目。");
  }
  showQuestion(sessionQueue[sessionIndex]);
}

async function randomQuestion() {
  try {
    sessionQueue = [];
    sessionIndex = 0;
    showQuestion(await api(`/api/random?${queryParams()}`));
  } catch (error) {
    showPlaceholder(error.message);
  }
}

function showQuestion(question) {
  current = question;
  $("#questionMeta").innerHTML = [
    current.category,
    labels[current.type],
    current.difficulty,
    current.wrong ? `错 ${current.wrong}` : "新题",
  ]
    .map((x) => `<span>${esc(x)}</span>`)
    .join("");
  $("#questionText").textContent = current.prompt;
  $("#feedback").classList.add("hidden");
  $("#shortInput").classList.toggle("hidden", current.type !== "short");
  $("#shortInput").value = "";
  $("#options").innerHTML = "";
  if (current.type !== "short") {
    current.options.forEach((option) => {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.textContent = option;
      btn.onclick = () => choose(btn, option);
      $("#options").append(btn);
    });
  }
  renderProgress();
}

function showPlaceholder(text) {
  current = null;
  $("#questionMeta").innerHTML = "";
  $("#questionText").textContent = text;
  $("#options").innerHTML = "";
  $("#feedback").classList.add("hidden");
  renderProgress();
}

function choose(btn, option) {
  $$(".option").forEach((x) => x.classList.remove("selected"));
  btn.classList.add("selected");
  const ok = norm(option).includes(norm(current.answer)) || norm(current.answer).includes(norm(option));
  record(ok);
  feedback(`${ok ? "回答正确。" : "还可以再看一眼。"}<br>标准答案：${esc(current.answer)}<br>${esc(current.explanation || "")}`);
}

function norm(text) {
  return String(text).replace(/^[A-D][.、\s]*/i, "").trim().toLowerCase();
}

function feedback(html) {
  $("#feedback").innerHTML = html;
  $("#feedback").classList.remove("hidden");
}

async function record(ok) {
  if (!current) return;
  await api("/api/answer", {
    method: "POST",
    body: JSON.stringify({ question_id: current.id, correct: ok }),
  });
  await loadData();
  if (mode === "session" && sessionQueue.length) {
    window.setTimeout(() => {
      sessionIndex += 1;
      if (sessionIndex >= sessionQueue.length) {
        showPlaceholder("本轮刷题完成，可以重新选择数量开始下一轮。");
      } else {
        showQuestion(sessionQueue[sessionIndex]);
      }
    }, 450);
  }
}

function renderProgress() {
  if (mode !== "session" || !sessionQueue.length) {
    $("#sessionProgress").textContent = mode === "session" ? "0/0" : "随机";
    return;
  }
  $("#sessionProgress").textContent = `${Math.min(sessionIndex + 1, sessionQueue.length)}/${sessionQueue.length}`;
}

async function add(item) {
  await api("/api/questions", { method: "POST", body: JSON.stringify(item) });
  await loadData();
}

function renderList() {
  $("#questionList").innerHTML = questions.map(itemHtml).join("") || `<div class="empty">暂无题目</div>`;
  $$(".delete").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/questions/${btn.dataset.id}`, { method: "DELETE" });
      await loadData();
    };
  });
}

function itemHtml(x) {
  return `<article class="item"><div><div class="meta">${[
    x.category,
    labels[x.type],
    x.difficulty,
    x.wrong ? `错 ${x.wrong}` : "新题",
  ]
    .map((m) => `<span>${esc(m)}</span>`)
    .join("")}</div><h3>${esc(x.prompt)}</h3><p>答案：${esc(x.answer)}${x.explanation ? `｜${esc(x.explanation)}` : ""}</p></div><button class="delete" data-id="${x.id}" title="删除">×</button></article>`;
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[m]);
}

function renderStats() {
  const data = stats.categoryCounts || {};
  $("#totalQuestions").textContent = stats.totalQuestions || 0;
  $("#totalCategories").textContent = Object.keys(data).length;
  $("#wrongQuestions").textContent = stats.wrongQuestions || 0;
  $("#totalAnswered").textContent = stats.answered || 0;
  const max = Math.max(1, ...Object.values(data));
  $("#chart").innerHTML = Object.entries(data)
    .map(([c, n]) => `<div class="bar"><b>${esc(c)}</b><div class="track"><div class="fill" style="width:${Math.round((n / max) * 100)}%"></div></div><span>${n}</span></div>`)
    .join("");
}

function parseUpload(text, name) {
  if (name.endsWith(".json")) {
    const data = JSON.parse(text);
    return (Array.isArray(data) ? data : data.questions || []).map(clean).filter(Boolean);
  }
  if (name.endsWith(".csv")) {
    return text.split(/\r?\n/).slice(1).map((row) => {
      const [prompt, category, type, answer, options = "", explanation = "", difficulty = "基础"] = row.split(",");
      return clean({ prompt, category, type, answer, options: options.split("|"), explanation, difficulty });
    }).filter(Boolean);
  }
  return text.split(/\n\s*\n/).map((block) => {
    const lines = block.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const options = lines.filter((x) => /^[A-D][.、]/i.test(x));
    return clean({
      prompt: lines[0].replace(/^题[:：]\s*/, ""),
      category: "导入题库",
      type: options.length ? "single" : "short",
      options,
      answer: lines.at(-1).replace(/^答[案]?[：:]\s*/, ""),
    });
  }).filter(Boolean);
}

function clean(x) {
  if (!x?.prompt || !x?.answer) return null;
  const options = Array.isArray(x.options) ? x.options.filter(Boolean) : [];
  const type = ["single", "judge", "short"].includes(x.type) ? x.type : options.length ? "single" : "short";
  return {
    prompt: String(x.prompt),
    category: String(x.category || "导入题库"),
    type,
    answer: String(x.answer),
    options,
    explanation: String(x.explanation || ""),
    difficulty: String(x.difficulty || "基础"),
  };
}

function makeQuestions(text, category, count) {
  return text.split(/[\n。；;!?！？]/).map((x) => x.replace(/^[-*#\d.\s]+/, "").trim()).filter((x) => x.length >= 12).slice(0, count).map((frag, i) => {
    const keyword = frag.replace(/[，,：:（）()“”"']/g, " ").split(/\s+/).sort((a, b) => b.length - a.length)[0]?.slice(0, 12) || "该知识点";
    if (i % 3 === 0) return clean({ prompt: `关于“${keyword}”，下列说法哪一项最准确？`, category, type: "single", answer: "A", options: [`A. ${frag}`, `B. ${keyword}与原文无关`, `C. ${keyword}只适用于相反场景`, `D. ${keyword}不需要上下文`], explanation: `依据知识库片段：${frag}`, difficulty: "中等" });
    if (i % 3 === 1) return clean({ prompt: `判断：${frag}`, category, type: "judge", answer: "正确", options: ["正确", "错误"], explanation: "该判断直接来自知识库内容。" });
    return clean({ prompt: `请解释“${keyword}”的核心含义或作用。`, category, type: "short", answer: frag, options: [], explanation: "可围绕知识库原句展开。", difficulty: "进阶" });
  });
}

$$(".tab").forEach((btn) => btn.onclick = () => {
  $$(".tab").forEach((x) => x.classList.remove("active"));
  $$(".view").forEach((x) => x.classList.remove("active"));
  btn.classList.add("active");
  $(`#${btn.dataset.view}`).classList.add("active");
  $("#pageTitle").textContent = btn.textContent;
});
$$(".mode-card").forEach((card) => {
  card.onclick = () => {
    mode = card.dataset.mode;
    showPlaceholder(mode === "session" ? "选择刷题数量后开始本轮练习。" : "点击随机抽题开始练习。");
    renderMode();
  };
});
$("#startSessionBtn").onclick = startSession;
$("#randomBtn").onclick = randomQuestion;
$("#answerBtn").onclick = () => current && feedback(`答案：${esc(current.answer)}<br>${esc(current.explanation || "暂无解析。")}`);
$("#wrongBtn").onclick = () => record(false);
$("#rightBtn").onclick = () => record(true);
$("#search").oninput = loadData;
$("#filterCategory").onchange = () => showPlaceholder(mode === "session" ? "筛选已更新，请重新开始刷题。" : "筛选已更新，可以随机抽题。");
$("#filterType").onchange = $("#filterCategory").onchange;
$("#type").onchange = () => $("#optionsWrap").classList.toggle("hidden", $("#type").value === "short");
$("#questionForm").onsubmit = async (e) => {
  e.preventDefault();
  await add({
    prompt: $("#prompt").value.trim(),
    category: $("#category").value.trim(),
    type: $("#type").value,
    difficulty: $("#difficulty").value,
    options: $("#formOptions").value.split(/\r?\n/).filter(Boolean),
    answer: $("#answer").value.trim(),
    explanation: $("#explanation").value.trim(),
  });
  e.target.reset();
};
$("#importInput").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const imported = parseUpload(await file.text(), file.name.toLowerCase());
  for (const item of imported.reverse()) await add(item);
  e.target.value = "";
};
$("#exportBtn").onclick = async () => {
  const data = await api("/api/export");
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "questions-export.json" });
  a.click();
  URL.revokeObjectURL(url);
};
$("#knowledgeFile").onchange = async (e) => $("#knowledgeText").value = (await Promise.all([...e.target.files].map((f) => f.text()))).join("\n\n");
$("#generateBtn").onclick = () => {
  generated = makeQuestions($("#knowledgeText").value, $("#genCategory").value.trim() || "知识库生成", Number($("#genCount").value) || 6);
  $("#generatedList").className = "";
  $("#generatedList").innerHTML = generated.map((item, index) => itemHtml({ id: `g-${index}`, wrong: 0, ...item }).replace(/<button class="delete"[\s\S]*?<\/button>/, "")).join("") || `<div class="empty">暂无生成结果</div>`;
};
$("#saveGeneratedBtn").onclick = async () => {
  for (const item of generated.reverse()) await add(item);
  generated = [];
  $("#generatedList").className = "empty";
  $("#generatedList").textContent = "暂无生成结果";
};

loadData().then(() => showPlaceholder("选择刷题数量后开始本轮练习。"));
