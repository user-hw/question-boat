const STORE = "question-boat-v1";
const labels = { single: "单选", judge: "判断", short: "简答" };
const sample = [
  q("二叉搜索树的中序遍历结果具有什么特征？", "数据结构", "single", "B", ["A. 节点按插入顺序排列", "B. 节点值按升序排列", "C. 只访问叶子节点", "D. 根节点总是最后访问"], "中序遍历会得到升序序列。"),
  q("HTTP 状态码 404 表示服务器内部错误。", "计算机网络", "judge", "错误", ["正确", "错误"], "404 表示资源不存在，500 才是服务器内部错误。"),
  q("请简述进程和线程的主要区别。", "操作系统", "short", "进程是资源分配单位，线程是 CPU 调度单位；同一进程内线程共享资源。", [], "重点回答资源隔离、调度单位和通信成本。"),
  q("事务 ACID 中保证全部成功或全部失败的是？", "数据库", "single", "A", ["A. 原子性", "B. 一致性", "C. 隔离性", "D. 持久性"], "原子性要求事务操作要么全部完成，要么全部不完成。"),
];

function q(prompt, category, type, answer, options = [], explanation = "", difficulty = "基础") {
  return { id: crypto.randomUUID(), prompt, category, type, answer, options, explanation, difficulty, wrong: 0 };
}

const state = JSON.parse(localStorage.getItem(STORE) || "null") || {
  questions: sample,
  stats: { answered: 0, correct: 0 },
};
let current = null;
let generated = [];
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
function cats() { return [...new Set(state.questions.map((x) => x.category || "未分类"))].sort((a, b) => a.localeCompare(b, "zh-CN")); }
function counts() { return state.questions.reduce((m, x) => ((m[x.category] = (m[x.category] || 0) + 1), m), {}); }

function render() {
  renderFilters();
  renderCategories();
  renderList();
  renderStats();
}

function renderFilters() {
  const old = $("#filterCategory").value || "all";
  $("#filterCategory").innerHTML = `<option value="all">全部分类</option>` + cats().map((c) => `<option>${c}</option>`).join("");
  $("#filterCategory").value = cats().includes(old) ? old : "all";
}

function renderCategories() {
  const data = counts();
  $("#categoryList").innerHTML = Object.entries(data).map(([c, n]) => `<span>${c} ${n}</span>`).join("");
}

function pool() {
  const category = $("#filterCategory").value;
  const type = $("#filterType").value;
  let list = state.questions.filter((x) => (category === "all" || x.category === category) && (type === "all" || x.type === type));
  const wrong = list.filter((x) => x.wrong > 0);
  if ($("#preferWrong").checked && wrong.length) list = wrong;
  return list;
}

function randomQuestion() {
  const list = pool();
  if (!list.length) return showPlaceholder("当前筛选条件下没有题目。");
  current = list[Math.floor(Math.random() * list.length)];
  $("#questionMeta").innerHTML = [current.category, labels[current.type], current.difficulty, current.wrong ? `错 ${current.wrong}` : "新题"].map((x) => `<span>${x}</span>`).join("");
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
}

function showPlaceholder(text) {
  current = null;
  $("#questionMeta").innerHTML = "";
  $("#questionText").textContent = text;
  $("#options").innerHTML = "";
  $("#feedback").classList.add("hidden");
}

function choose(btn, option) {
  $$(".option").forEach((x) => x.classList.remove("selected"));
  btn.classList.add("selected");
  const ok = norm(option).includes(norm(current.answer)) || norm(current.answer).includes(norm(option));
  record(ok);
  feedback(`${ok ? "回答正确。" : "还可以再看一眼。"}<br>标准答案：${current.answer}<br>${current.explanation || ""}`);
}

function norm(text) {
  return String(text).replace(/^[A-D][.、\s]*/i, "").trim().toLowerCase();
}

function feedback(html) {
  $("#feedback").innerHTML = html;
  $("#feedback").classList.remove("hidden");
}

function record(ok) {
  if (!current) return;
  state.stats.answered += 1;
  if (ok) state.stats.correct += 1;
  else current.wrong += 1;
  save();
  render();
}

function add(item) {
  state.questions.unshift({ id: crypto.randomUUID(), wrong: 0, difficulty: "基础", explanation: "", options: [], ...item });
  save();
  render();
}

function renderList() {
  const key = $("#search").value.trim().toLowerCase();
  const list = state.questions.filter((x) => `${x.prompt} ${x.category} ${x.answer}`.toLowerCase().includes(key));
  $("#questionList").innerHTML = list.map(itemHtml).join("") || `<div class="empty">暂无题目</div>`;
  $$(".delete").forEach((btn) => btn.onclick = () => {
    state.questions = state.questions.filter((x) => x.id !== btn.dataset.id);
    save();
    render();
  });
}

function itemHtml(x) {
  return `<article class="item"><div><div class="meta">${[x.category, labels[x.type], x.difficulty, x.wrong ? `错 ${x.wrong}` : "新题"].map((m) => `<span>${m}</span>`).join("")}</div><h3>${esc(x.prompt)}</h3><p>答案：${esc(x.answer)}${x.explanation ? `｜${esc(x.explanation)}` : ""}</p></div><button class="delete" data-id="${x.id}" title="删除">×</button></article>`;
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[m]);
}

function renderStats() {
  const data = counts();
  $("#totalQuestions").textContent = state.questions.length;
  $("#totalCategories").textContent = Object.keys(data).length;
  $("#wrongQuestions").textContent = state.questions.filter((x) => x.wrong > 0).length;
  $("#totalAnswered").textContent = state.stats.answered;
  const max = Math.max(1, ...Object.values(data));
  $("#chart").innerHTML = Object.entries(data).map(([c, n]) => `<div class="bar"><b>${c}</b><div class="track"><div class="fill" style="width:${Math.round(n / max * 100)}%"></div></div><span>${n}</span></div>`).join("");
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
    return clean({ prompt: lines[0].replace(/^题[:：]\s*/, ""), category: "导入题库", type: options.length ? "single" : "short", options, answer: lines.at(-1).replace(/^答[案]?[：:]\s*/, "") });
  }).filter(Boolean);
}

function clean(x) {
  if (!x?.prompt || !x?.answer) return null;
  const options = Array.isArray(x.options) ? x.options.filter(Boolean) : [];
  const type = ["single", "judge", "short"].includes(x.type) ? x.type : options.length ? "single" : "short";
  return { prompt: String(x.prompt), category: String(x.category || "导入题库"), type, answer: String(x.answer), options, explanation: String(x.explanation || ""), difficulty: String(x.difficulty || "基础") };
}

function makeQuestions(text, category, count) {
  return text.split(/[\n。；;!?！？]/).map((x) => x.replace(/^[-*#\d.\s]+/, "").trim()).filter((x) => x.length >= 12).slice(0, count).map((frag, i) => {
    const keyword = frag.replace(/[，,：:（）()“”"']/g, " ").split(/\s+/).sort((a, b) => b.length - a.length)[0]?.slice(0, 12) || "该知识点";
    if (i % 3 === 0) return q(`关于“${keyword}”，下列说法哪一项最准确？`, category, "single", "A", [`A. ${frag}`, `B. ${keyword}与原文无关`, `C. ${keyword}只适用于相反场景`, `D. ${keyword}不需要上下文`], `依据知识库片段：${frag}`, "中等");
    if (i % 3 === 1) return q(`判断：${frag}`, category, "judge", "正确", ["正确", "错误"], "该判断直接来自知识库内容。");
    return q(`请解释“${keyword}”的核心含义或作用。`, category, "short", frag, [], "可围绕知识库原句展开。", "进阶");
  });
}

$$(".tab").forEach((btn) => btn.onclick = () => {
  $$(".tab").forEach((x) => x.classList.remove("active"));
  $$(".view").forEach((x) => x.classList.remove("active"));
  btn.classList.add("active");
  $(`#${btn.dataset.view}`).classList.add("active");
  $("#pageTitle").textContent = btn.textContent;
});
$("#randomBtn").onclick = randomQuestion;
$("#answerBtn").onclick = () => current && feedback(`答案：${current.answer}<br>${current.explanation || "暂无解析。"}`);
$("#wrongBtn").onclick = () => record(false);
$("#rightBtn").onclick = () => record(true);
$("#search").oninput = renderList;
$("#type").onchange = () => $("#optionsWrap").classList.toggle("hidden", $("#type").value === "short");
$("#questionForm").onsubmit = (e) => {
  e.preventDefault();
  add({ prompt: $("#prompt").value.trim(), category: $("#category").value.trim(), type: $("#type").value, difficulty: $("#difficulty").value, options: $("#formOptions").value.split(/\r?\n/).filter(Boolean), answer: $("#answer").value.trim(), explanation: $("#explanation").value.trim() });
  e.target.reset();
};
$("#importInput").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  parseUpload(await file.text(), file.name.toLowerCase()).reverse().forEach(add);
  e.target.value = "";
};
$("#exportBtn").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ questions: state.questions }, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "questions-export.json" });
  a.click();
  URL.revokeObjectURL(url);
};
$("#knowledgeFile").onchange = async (e) => $("#knowledgeText").value = (await Promise.all([...e.target.files].map((f) => f.text()))).join("\n\n");
$("#generateBtn").onclick = () => {
  generated = makeQuestions($("#knowledgeText").value, $("#genCategory").value.trim() || "知识库生成", Number($("#genCount").value) || 6);
  $("#generatedList").className = "";
  $("#generatedList").innerHTML = generated.map(itemHtml).join("") || `<div class="empty">暂无生成结果</div>`;
};
$("#saveGeneratedBtn").onclick = () => {
  generated.reverse().forEach(add);
  generated = [];
  $("#generatedList").className = "empty";
  $("#generatedList").textContent = "暂无生成结果";
};

render();
randomQuestion();
