import json
import random
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "question_boat.db"

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")

SEED_QUESTIONS = [
    {
        "prompt": "二叉搜索树的中序遍历结果具有什么特征？",
        "category": "数据结构",
        "type": "single",
        "difficulty": "基础",
        "options": ["A. 节点按插入顺序排列", "B. 节点值按升序排列", "C. 只访问叶子节点", "D. 根节点总是最后访问"],
        "answer": "B",
        "explanation": "二叉搜索树中序遍历会得到升序序列。",
    },
    {
        "prompt": "HTTP 状态码 404 表示服务器内部错误。",
        "category": "计算机网络",
        "type": "judge",
        "difficulty": "基础",
        "options": ["正确", "错误"],
        "answer": "错误",
        "explanation": "404 表示资源不存在；服务器内部错误通常是 500。",
    },
    {
        "prompt": "请简述进程和线程的主要区别。",
        "category": "操作系统",
        "type": "short",
        "difficulty": "中等",
        "options": [],
        "answer": "进程是资源分配的基本单位，线程是 CPU 调度的基本单位；同一进程内线程共享地址空间和资源。",
        "explanation": "重点覆盖资源隔离、调度单位、通信成本和上下文切换成本。",
    },
    {
        "prompt": "关系型数据库中，用于保证事务全部成功或全部失败的 ACID 特性是？",
        "category": "数据库",
        "type": "single",
        "difficulty": "基础",
        "options": ["A. 原子性", "B. 一致性", "C. 隔离性", "D. 持久性"],
        "answer": "A",
        "explanation": "原子性要求事务中的操作要么全部完成，要么全部不完成。",
    },
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '未分类',
                type TEXT NOT NULL DEFAULT 'single',
                difficulty TEXT NOT NULL DEFAULT '基础',
                options TEXT NOT NULL DEFAULT '[]',
                answer TEXT NOT NULL,
                explanation TEXT NOT NULL DEFAULT '',
                wrong_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS practice_stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                answered INTEGER NOT NULL DEFAULT 0,
                correct INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute("INSERT OR IGNORE INTO practice_stats (id, answered, correct) VALUES (1, 0, 0)")
        existing = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        if existing == 0:
            conn.executemany(
                """
                INSERT INTO questions (prompt, category, type, difficulty, options, answer, explanation)
                VALUES (:prompt, :category, :type, :difficulty, :options, :answer, :explanation)
                """,
                [{**item, "options": json.dumps(item["options"], ensure_ascii=False)} for item in SEED_QUESTIONS],
            )


def row_to_question(row):
    return {
        "id": row["id"],
        "prompt": row["prompt"],
        "category": row["category"],
        "type": row["type"],
        "difficulty": row["difficulty"],
        "options": json.loads(row["options"] or "[]"),
        "answer": row["answer"],
        "explanation": row["explanation"],
        "wrong": row["wrong_count"],
    }


def normalize_question(payload):
    options = payload.get("options") or []
    if isinstance(options, str):
        options = [line.strip() for line in options.splitlines() if line.strip()]
    question_type = payload.get("type") or ("single" if len(options) >= 2 else "short")
    if question_type not in {"single", "judge", "short"}:
        question_type = "short"
    return {
        "prompt": str(payload.get("prompt", "")).strip(),
        "category": str(payload.get("category") or "未分类").strip(),
        "type": question_type,
        "difficulty": str(payload.get("difficulty") or "基础").strip(),
        "options": json.dumps(options, ensure_ascii=False),
        "answer": str(payload.get("answer", "")).strip(),
        "explanation": str(payload.get("explanation") or "").strip(),
    }


def filtered_questions(category="all", question_type="all", prefer_wrong=False):
    clauses = []
    params = []
    if category != "all":
        clauses.append("category = ?")
        params.append(category)
    if question_type != "all":
        clauses.append("type = ?")
        params.append(question_type)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with get_db() as conn:
        rows = conn.execute(f"SELECT * FROM questions {where} ORDER BY id DESC", params).fetchall()
    questions = [row_to_question(row) for row in rows]
    if prefer_wrong:
        wrong = [item for item in questions if item["wrong"] > 0]
        if wrong:
            questions = wrong
    return questions


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/api/questions")
def list_questions():
    search = request.args.get("search", "").strip().lower()
    questions = filtered_questions(request.args.get("category", "all"), request.args.get("type", "all"))
    if search:
        questions = [
            item for item in questions
            if search in f"{item['prompt']} {item['category']} {item['answer']}".lower()
        ]
    return jsonify(questions)


@app.post("/api/questions")
def create_question():
    payload = normalize_question(request.get_json(force=True))
    if not payload["prompt"] or not payload["answer"]:
        return jsonify({"error": "题干和答案不能为空"}), 400
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO questions (prompt, category, type, difficulty, options, answer, explanation)
            VALUES (:prompt, :category, :type, :difficulty, :options, :answer, :explanation)
            """,
            payload,
        )
        row = conn.execute("SELECT * FROM questions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_question(row)), 201


@app.delete("/api/questions/<int:question_id>")
def delete_question(question_id):
    with get_db() as conn:
        conn.execute("DELETE FROM questions WHERE id = ?", (question_id,))
    return jsonify({"ok": True})


@app.get("/api/random")
def random_question():
    questions = filtered_questions(
        request.args.get("category", "all"),
        request.args.get("type", "all"),
        request.args.get("prefer_wrong") == "1",
    )
    if not questions:
        return jsonify({"error": "当前筛选条件下没有题目"}), 404
    return jsonify(random.choice(questions))


@app.get("/api/session")
def practice_session():
    count = max(1, min(100, request.args.get("count", default=10, type=int)))
    questions = filtered_questions(
        request.args.get("category", "all"),
        request.args.get("type", "all"),
        request.args.get("prefer_wrong") == "1",
    )
    random.shuffle(questions)
    return jsonify(questions[:count])


@app.post("/api/answer")
def record_answer():
    payload = request.get_json(force=True)
    correct = bool(payload.get("correct"))
    question_id = payload.get("question_id")
    with get_db() as conn:
        conn.execute(
            "UPDATE practice_stats SET answered = answered + 1, correct = correct + ? WHERE id = 1",
            (1 if correct else 0,),
        )
        if question_id and not correct:
            conn.execute("UPDATE questions SET wrong_count = wrong_count + 1 WHERE id = ?", (question_id,))
    return jsonify({"ok": True})


@app.get("/api/stats")
def stats():
    with get_db() as conn:
        stat = conn.execute("SELECT answered, correct FROM practice_stats WHERE id = 1").fetchone()
        rows = conn.execute("SELECT category, COUNT(*) AS total FROM questions GROUP BY category").fetchall()
        total_questions = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        wrong_questions = conn.execute("SELECT COUNT(*) FROM questions WHERE wrong_count > 0").fetchone()[0]
    return jsonify(
        {
            "answered": stat["answered"],
            "correct": stat["correct"],
            "totalQuestions": total_questions,
            "wrongQuestions": wrong_questions,
            "categoryCounts": {row["category"]: row["total"] for row in rows},
        }
    )


@app.get("/api/export")
def export_questions():
    return jsonify({"questions": filtered_questions()})


if __name__ == "__main__":
    init_db()
    app.run(debug=True, host="127.0.0.1", port=5000)
