"""
猴子跑酷 · 云端排行榜后端
- Flask + SQLite，既托管前端页面，又提供排行 API
- 运行：python server.py  ->  浏览器打开 http://localhost:5000
- 手机同 WiFi：http://<电脑局域网IP>:5000
"""
import os
import time
import uuid
import sqlite3
from flask import Flask, request, send_file, jsonify

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "leaderboard.db")
HTML = os.path.join(BASE, "monkey_parkour.html")

app = Flask(__name__)


def db():
    conn = sqlite3.connect(DB)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS players(
            id TEXT PRIMARY KEY,
            name TEXT,
            token TEXT UNIQUE,
            best_mileage INTEGER DEFAULT 0,
            best_spoons INTEGER DEFAULT 0,
            updated_at REAL
        )"""
    )
    return conn


@app.route("/")
def index():
    return send_file(HTML)


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()[:24]
    if not name:
        return jsonify(ok=False, error="昵称不能为空"), 400
    token = data.get("token") or uuid.uuid4().hex
    conn = db()
    cur = conn.execute("SELECT id FROM players WHERE token=?", (token,))
    if cur.fetchone():
        conn.execute("UPDATE players SET name=? WHERE token=?", (name, token))
    else:
        conn.execute(
            "INSERT INTO players(id, token, name, best_mileage, best_spoons, updated_at) VALUES(?,?,?,0,0,?)",
            (uuid.uuid4().hex, token, name, time.time()),
        )
    conn.commit()
    conn.close()
    return jsonify(ok=True, token=token, name=name)


@app.route("/api/score", methods=["POST"])
def score():
    data = request.get_json(force=True, silent=True) or {}
    token = data.get("token")
    try:
        mileage = int(data.get("mileage", 0) or 0)
        spoons = int(data.get("spoons", 0) or 0)
    except (TypeError, ValueError):
        return jsonify(ok=False, error="成绩格式错误"), 400
    if not token:
        return jsonify(ok=False, error="缺少 token"), 400
    conn = db()
    conn.execute(
        "UPDATE players SET best_mileage=MAX(best_mileage,?), best_spoons=MAX(best_spoons,?), updated_at=? WHERE token=?",
        (mileage, spoons, time.time(), token),
    )
    conn.commit()
    conn.close()
    return jsonify(ok=True)


@app.route("/api/leaderboard")
def leaderboard():
    conn = db()
    rows = conn.execute(
        "SELECT name, best_mileage, best_spoons FROM players "
        "ORDER BY best_mileage DESC, best_spoons DESC LIMIT 20"
    ).fetchall()
    conn.close()
    return jsonify(
        [{"name": r[0], "mileage": r[1], "spoons": r[2]} for r in rows]
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
