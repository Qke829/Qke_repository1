"""
猴子跑酷 · 汤勺大作战 (tkinter 桌面版)
- 三条道路，拖动鼠标上下移动猴子换道
- 收集地面汤勺 🥄 回血，躲避追来的 🐷🦈🦛
- 三种动物碰撞体积/伤害不同：🦈体积小伤害高 · 🐷中 · 🦛体积大伤害低
- 四种模式：简单(无必杀·怪少·勺多) / 普通(标准) / 极速(里程快·越来越快·勺多) / 困难(无血量·一击必杀)
- 敌人伤害随里程递增，按动物分档进入一击必杀；困难模式无血全部一击必杀
- 背景天空带 + 太阳/月亮按一天 24 小时轮转
- 金色最高分数线（无文字，竖线；破纪录前提前出现、超过后跟随猴子）；汤勺数 ≥ 历史最佳时全场汤勺变金
- 无限复活：死亡可选复活（次数不限，但复活后成绩不计入历史最佳）或退出游戏
- 暂停后退出，重新打开可继续（本地存档）；暂停/死亡界面均展示历史最佳；各模式最佳分开统计
运行：python monkey_parkour_tkinter.py
（手机端请用 monkey_parkour.html 网页版）
"""
import tkinter as tk
import random
import time
import math
import os
import json

LANES = 3
EMOJI = ("Segoe UI Emoji", 40)   # Windows 自带彩色 emoji 字体

# ---------- 游戏模式 ----------
MODES = {
    "easy":   {"label": "简单", "enemy_mul": 1.7,  "spoon_mul": 0.6, "mileage_mul": 1.0, "one_shot": False, "max_hp": 100.0, "acc": 0.0},
    "normal": {"label": "普通", "enemy_mul": 1.0,  "spoon_mul": 1.0, "mileage_mul": 1.0, "one_shot": "per", "max_hp": 100.0, "acc": 0.0},
    "fast":   {"label": "极速", "enemy_mul": 0.85, "spoon_mul": 0.7, "mileage_mul": 1.6, "one_shot": "per", "max_hp": 100.0, "acc": 0.004},
    "hard":   {"label": "困难", "enemy_mul": 1.0,  "spoon_mul": 1.0, "mileage_mul": 1.0, "one_shot": "all", "max_hp": 1.0,   "acc": 0.0},
}
MODE_KEYS = ["easy", "normal", "fast", "hard"]
BEST_LEAD = 80               # 提前多少「米」看到金色分数线

# 敌人参数：碰撞半径(col_r)依次增大，基础伤害(base_dmg)依次降低
# one_shot：该动物进入「一击必杀」的里程阈值（伤害越低→阈值越大→越晚进入）
ENEMY_TYPES = {
    "🦈": {"col_r": 16, "base_dmg": 30, "size": 42, "one_shot": 2000},
    "🐷": {"col_r": 22, "base_dmg": 22, "size": 44, "one_shot": 3200},
    "🦛": {"col_r": 30, "base_dmg": 14, "size": 48, "one_shot": 5000},
}
MONKEY_R = 22
SPOON_HEAL = 6
DAY_LENGTH = 120            # 一轮24小时多少秒

# 里程彩蛋：到达特定里程，背景显示该元素的大型虚化头像
MILESTONES = [
    {"m": 46,   "ch": "🐷", "label": "猪"},
    {"m": 529,  "ch": "🐒", "label": "猴子"},
    {"m": 720,  "ch": "🦈", "label": "鲨鱼"},
    {"m": 829,  "ch": "🦛", "label": "河马"},
    {"m": 1015, "ch": "🥄", "label": "勺子"},
]

# 天色关键帧 (t, top_rgb, bot_rgb)
SKY = [
    (0.00, (10, 14, 39), (20, 33, 61)),
    (0.22, (26, 31, 58), (40, 46, 80)),
    (0.28, (255, 158, 109), (255, 217, 160)),
    (0.50, (74, 163, 224), (191, 230, 255)),
    (0.72, (255, 123, 84), (255, 208, 160)),
    (0.78, (26, 31, 58), (40, 46, 80)),
    (1.00, (10, 14, 39), (20, 33, 61)),
]


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


def rgb(c):
    return "#%02x%02x%02x" % (max(0, min(255, c[0])), max(0, min(255, c[1])), max(0, min(255, c[2])))


def sky_color(t):
    for i in range(len(SKY) - 1):
        if SKY[i][0] <= t <= SKY[i + 1][0]:
            f = (t - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0])
            return lerp_color(SKY[i][1], SKY[i + 1][1], f), lerp_color(SKY[i][2], SKY[i + 1][2], f)
    return SKY[0][1], SKY[0][2]


def darkness(t):
    if t < 0.25:
        return (0.25 - t) / 0.25
    if t > 0.75:
        return (t - 0.75) / 0.25
    return 0


def fmt_time(t):
    total = t * 24
    hh = int(total) % 24
    mm = int((total - math.floor(total)) * 60)
    return f"{hh:02d}:{mm:02d}"


class Game:
    def __init__(self, root):
        self.root = root
        self.root.title("🐒 猴子跑酷 · 汤勺大作战")
        self.root.geometry("900x600")
        self.W, self.H = 900, 600
        self.running = False
        self.paused = False
        self.gold_spoons = False
        self.used_revive = False        # 本局是否用过复活（用过则成绩不计入历史最佳）
        self.mode = "normal"
        self.best = self.load_best()
        self.stars = []
        self.mode_btns = []
        self.pause_btn = None
        base = os.path.dirname(os.path.abspath(__file__))
        self.save_path = os.path.join(base, "monkey_save.json")
        self.best_path = os.path.join(base, "monkey_best.json")

        self.canvas = tk.Canvas(root, bg="#8d6e4f", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", self.on_resize)
        self.canvas.bind("<ButtonPress-1>", self.on_drag)
        self.canvas.bind("<B1-Motion>", self.on_drag)

        self.show_start()

    # ---------- 布局辅助 ----------
    def lane_h(self):
        return self.H / LANES

    def lane_y(self, i):
        h = self.lane_h()
        return h * i + h / 2

    def lane_from_y(self, y):
        h = self.lane_h()
        return max(0, min(LANES - 1, int(y // h)))

    def sky_band(self):
        return min(self.H * 0.30, 130)

    def build_stars(self):
        self.stars = [(random.random(), random.random() * 0.85, random.random() * 1.4 + 0.4)
                      for _ in range(50)]

    # ---------- 界面 ----------
    def show_start(self):
        self.clear_game_ui()
        self.canvas.delete("all")
        w, h = self.W, self.H
        c = self.canvas
        c.create_text(w/2, 56, text="🐒 猴子跑酷",
                      font=("Segoe UI Emoji", 42), fill="#ffffff")
        c.create_text(w/2, 104, text="拖动鼠标上下换道收 🥄 · 躲避 🐷🦈🦛 · 死亡可无限复活（不影响最佳）",
                      font=("Microsoft YaHei", 13), fill="#ffcc4d")
        modes = [("easy", "简单"), ("normal", "普通"), ("fast", "极速"), ("hard", "困难")]
        positions = [(w*0.28, h*0.40), (w*0.72, h*0.40), (w*0.28, h*0.64), (w*0.72, h*0.64)]
        for (mk, label), (bx, by) in zip(modes, positions):
            b = self.best[mk]
            c.create_text(bx, by - 36, text=f"{label}  最佳 {b['mileage']}m · {b['spoons']}勺",
                          font=("Microsoft YaHei", 12), fill="#cfe8ff")
            btn = tk.Button(self.root, text=f"开始 {label}",
                            font=("Microsoft YaHei", 15, "bold"), bg="#ffcc4d", fg="#3a2a00",
                            command=lambda m=mk: self.start(m))
            btn.place(x=bx - 75, y=by, width=150, height=46)
            self.mode_btns.append(btn)
        if self.load_state():
            self.resume_btn = tk.Button(self.root, text="继续游戏（上次存档）",
                                        font=("Microsoft YaHei", 15, "bold"), bg="#ffffff", fg="#3a2a00",
                                        command=self.continue_game)
            self.resume_btn.place(x=w/2 - 90, y=h - 64, width=180, height=44)

    def on_resize(self, e):
        self.W, self.H = e.width, e.height
        self.build_stars()
        if not self.running and not self.paused:
            self.show_start()

    def on_drag(self, e):
        if not self.running or self.paused:
            return
        self.monkey_target_lane = self.lane_from_y(e.y)

    def clear_game_ui(self):
        # pause_btn 是常驻复用按钮（__init__ 中初始化为 None）：只隐藏、不删除属性
        if self.pause_btn is not None:
            self.pause_btn.place_forget()
        for attr in ("btn", "resume_btn", "pause_resume_btn",
                     "pause_restart_btn", "pause_exit_btn",
                     "dead_revive_btn", "dead_exit_btn"):
            w = getattr(self, attr, None)   # 判 None 而非 hasattr：None 也没有 place_forget
            if w is not None:
                w.place_forget()
                delattr(self, attr)
        for b in self.mode_btns:
            b.place_forget()
        self.mode_btns = []

    # ---------- 游戏控制 ----------
    def start(self, mode="normal"):
        self.clear_game_ui()
        self.clear_state()
        self.mode = mode
        m = MODES[mode]
        self.running = True
        self.paused = False
        self.gold_spoons = False
        self.used_revive = False
        self.W = self.canvas.winfo_width()
        self.H = self.canvas.winfo_height()
        self.build_stars()
        self.monkey_target_lane = 1
        self.monkey_y = self.lane_y(1)
        self.monkey_x = self.W * 0.22
        self.monkey_max_hp = m["max_hp"]
        self.monkey_hp = m["max_hp"]
        self.monkey_inv = 0.0
        self.spoons = []
        self.enemies = []
        self.mileage = 0.0
        self.spoons_count = 0
        self.speed = 180.0
        self.spoon_timer = 0.4
        self.enemy_timer = 1.0
        self.day_time = 0.27
        self.flash = 0.0
        self.egg_ch = None
        self.egg_alpha = 0.0
        self.last = time.time()
        self.ensure_pause_btn()
        self.loop()

    def spawn_spoon(self):
        self.spoons.append({"lane": random.randint(0, LANES - 1), "x": self.W + 40, "got": False})

    def spawn_enemy(self):
        incoming = [e["lane"] for e in self.enemies if e["x"] > self.monkey_x]
        free = [l for l in (0, 1, 2) if l not in incoming]
        if not free:
            return  # 保证至少留一条活路
        lane = random.choice(free)
        types = list(ENEMY_TYPES.keys())
        etype = random.choice(types)
        self.enemies.append({
            "lane": lane, "x": self.W + 60, "type": etype,
            "speed": self.speed + 60 + random.uniform(0, 60)
        })

    def damage_mult(self):
        return 1 + self.mileage / 2000

    def is_one_shot(self, etype):
        m = MODES[self.mode]
        if m["one_shot"] is False:
            return False
        if m["one_shot"] == "all":
            return True
        return self.mileage >= ENEMY_TYPES[etype]["one_shot"]

    def loop(self):
        if not self.running or self.paused:
            return
        now = time.time()
        dt = min(0.05, now - self.last)
        self.last = now
        self.update(dt)
        if self.running and not self.paused:
            self.draw()
            self.root.after(16, self.loop)

    def update(self, dt):
        m = MODES[self.mode]
        self.day_time = (self.day_time + dt / DAY_LENGTH) % 1
        self.speed = 180 + self.mileage * 0.02
        acc = 12 + m["acc"] * self.mileage                       # 极速模式猴子换道越来越快
        ty = self.lane_y(self.monkey_target_lane)
        self.monkey_y += (ty - self.monkey_y) * min(1, dt * acc)
        if self.monkey_inv > 0:
            self.monkey_inv -= dt
        if self.flash > 0:
            self.flash -= dt
        self.mileage += self.speed * dt * 0.1 * m["mileage_mul"] # 极速模式里程增速更快

        for s in self.spoons:
            s["x"] -= self.speed * dt
        lh = self.lane_h()
        for s in self.spoons:
            if not s["got"]:
                dy = self.lane_y(s["lane"]) - self.monkey_y
                dx = s["x"] - self.monkey_x
                if abs(dx) < 30 and abs(dy) < lh * 0.5:
                    s["got"] = True
                    self.spoons_count += 1
                    self.monkey_hp = min(self.monkey_max_hp, self.monkey_hp + SPOON_HEAL)
        self.spoons = [s for s in self.spoons if s["x"] > -60 and not s["got"]]

        mult = self.damage_mult()
        for e in self.enemies:
            e["x"] -= e["speed"] * dt
            if self.monkey_inv > 0:
                continue
            ey = self.lane_y(e["lane"])
            dx = e["x"] - self.monkey_x
            dy = ey - self.monkey_y
            dist = math.hypot(dx, dy)
            reach = ENEMY_TYPES[e["type"]]["col_r"] + MONKEY_R
            if dist < reach:
                one_shot = self.is_one_shot(e["type"])
                dmg = self.monkey_max_hp if one_shot else ENEMY_TYPES[e["type"]]["base_dmg"] * mult
                self.monkey_hp -= dmg
                self.monkey_inv = 1.2
                self.flash = 0.25
                if self.monkey_hp <= 0:
                    self.monkey_hp = 0
                    self.game_over()
                    return
        self.enemies = [e for e in self.enemies if e["x"] > -80]

        reached = None
        for ms in MILESTONES:
            if self.mileage >= ms["m"]:
                reached = ms
        if reached and self.egg_ch != reached["ch"]:
            self.egg_ch = reached["ch"]
            self.egg_alpha = 0.0
        if self.egg_ch:
            self.egg_alpha = min(0.16, self.egg_alpha + dt * 0.4)

        self.spoon_timer -= dt
        if self.spoon_timer <= 0:
            self.spawn_spoon()
            self.spoon_timer = (0.7 + random.uniform(0, 0.6)) * m["spoon_mul"]
        self.enemy_timer -= dt
        if self.enemy_timer <= 0:
            self.spawn_enemy()
            self.enemy_timer = max(0.7, (1.8 - self.mileage * 0.0008) * m["enemy_mul"]) + random.uniform(0, 0.6)

        self.gold_spoons = self.spoons_count >= self.best[self.mode]["spoons"]

    # ---------- 绘制 ----------
    def draw_celestial(self):
        c = self.canvas
        band = self.sky_band()
        dk = darkness(self.day_time)
        if dk > 0.05:
            star_col = "#%02x%02x%02x" % (int(255 * dk), int(255 * dk), int(255 * dk))
            for sx, sy, sr in self.stars:
                c.create_oval(sx * self.W - sr, sy * band - sr, sx * self.W + sr, sy * band + sr,
                              fill=star_col, outline="")
        if 0.25 <= self.day_time <= 0.75:
            p = (self.day_time - 0.25) / 0.5
            sx = p * self.W
            sy = band - math.sin(p * math.pi) * (band * 0.72) - 8
            c.create_oval(sx - 26, sy - 26, sx + 26, sy + 26, fill="#ffe27a", outline="")
            c.create_oval(sx - 16, sy - 16, sx + 16, sy + 16, fill="#fff2a8", outline="")
        if self.day_time > 0.75 or self.day_time < 0.25:
            frac = (self.day_time - 0.75) / 0.5 if self.day_time > 0.75 else (self.day_time + 0.25) / 0.5
            mx = frac * self.W
            my = band - math.sin(frac * math.pi) * (band * 0.72) - 8
            c.create_oval(mx - 15, my - 15, mx + 15, my + 15, fill="#fff7d2", outline="")
            c.create_oval(mx + 6, my - 4, mx + 19, my + 9, fill=rgb(sky_color(self.day_time)[1]), outline="")

    def draw_day_night_tint(self):
        dk = darkness(self.day_time)
        if dk > 0.02:
            self.canvas.create_rectangle(0, 0, self.W, self.H, fill="#080c23", outline="", stipple="gray25")

    def draw_ground(self):
        c = self.canvas
        h = self.lane_h()
        for i in range(LANES):
            y = h * i
            c.create_rectangle(0, y, self.W, y + h,
                               fill=("#8d6e4f" if i % 2 == 0 else "#9c7a57"), outline="")
            if i > 0:
                for xx in range(0, self.W, 32):
                    c.create_line(xx, y, xx + 18, y, fill="#e8d8b0", width=3)

    def draw_best_line(self):
        # 金色最高分数线（无文字）：竖直线，与水平马路分界线垂直；
        # 到达历史最佳前 BEST_LEAD 米即出现在猴子前方，超过后跟随猴子
        b = self.best[self.mode]
        if not b or b["mileage"] <= 0:
            return
        if self.mileage >= b["mileage"]:
            x = self.monkey_x
        elif b["mileage"] - self.mileage <= BEST_LEAD:
            d = (b["mileage"] - self.mileage) / BEST_LEAD
            x = self.monkey_x + d * 140
        else:
            return
        self.canvas.create_line(x, 0, x, self.H, fill="#ffd700", width=5)

    def draw_gold_spoon(self, x, y, s):
        # 矢量绘制：圆头碗在上 + 更长更粗的手柄（仅改颜色为金色，圆头无尖角）
        c = self.canvas
        r = s * 0.38
        bowl_y = y - r
        handle_len = r * 3.2
        handle_w = max(2, int(s * 0.26))
        # 勺柄：圆角粗线，自勺碗下方向下延伸
        c.create_line(x, bowl_y + r * 0.45, x, bowl_y + r * 0.45 + handle_len,
                      fill="#f0b429", width=handle_w, capstyle="round")
        # 勺碗（圆头无尖角，金色渐变近似）
        c.create_oval(x - r, bowl_y - r, x + r, bowl_y + r, fill="#ffc233", outline="#b9841a", width=max(1, int(s*0.04)))
        c.create_oval(x - r*0.6, bowl_y - r*0.6, x + r*0.6, bowl_y + r*0.6, fill="#fff3b0", outline="")

    def draw_hud(self):
        c = self.canvas
        top_h = 72
        c.create_rectangle(0, 0, self.W, top_h, fill="#0b1020", outline="", stipple="gray25")
        c.create_text(14, 22, text=f"🥄 {self.spoons_count}",
                      font=("Segoe UI Emoji", 16), fill="#ffffff", anchor="w")
        c.create_text(self.W - 58, 22, text=f"🕐 {fmt_time(self.day_time)}",
                      font=("Segoe UI Emoji", 16), fill="#ffffff", anchor="e")
        c.create_text(14, 48, text=f"📏 {int(self.mileage)} m",
                      font=("Segoe UI Emoji", 16), fill="#ffffff", anchor="w")
        c.create_text(self.W - 12, 48, text=f"【{MODES[self.mode]['label']}】",
                      font=("Microsoft YaHei", 14, "bold"), fill="#ffd54a", anchor="e")
        if self.monkey_max_hp > 1:
            bx, by, bw, bh = 14, 56, self.W - 28, 14
            c.create_rectangle(bx, by, bx + bw, by + bh, fill="#3a3a3a", outline="")
            ratio = max(0.0, self.monkey_hp / self.monkey_max_hp)
            r = int(lerp(220, 80, ratio)); g = int(lerp(40, 200, ratio))
            c.create_rectangle(bx, by, bx + int(bw * ratio), by + bh,
                               fill=f"#{r:02x}{g:02x}3c", outline="")
            c.create_text(bx + bw / 2, by + bh / 2, text=f"❤ {math.ceil(self.monkey_hp)}",
                          font=("Microsoft YaHei", 11, "bold"), fill="#ffffff")
        else:
            c.create_text(self.W/2, 63, text="☠ 一击必杀",
                          font=("Microsoft YaHei", 13, "bold"), fill="#ff9a8a")

    def draw_egg(self):
        if not self.egg_ch or self.egg_alpha <= 0.01:
            return
        c = self.canvas
        size = int(min(self.W, self.H) * 0.9)
        if self.gold_spoons and self.egg_ch == "🥄":
            self.draw_gold_spoon(self.W/2, self.H/2, size)
        else:
            c.create_text(self.W/2, self.H/2, text=self.egg_ch,
                          font=("Segoe UI Emoji", size), fill="#caa97a")

    def draw(self):
        c = self.canvas
        c.delete("all")
        self.draw_ground()
        self.draw_best_line()
        self.draw_egg()

        for s in self.spoons:
            x = s["x"]; y = self.lane_y(s["lane"])
            if self.gold_spoons:
                self.draw_gold_spoon(x, y, 30)
            else:
                c.create_text(x, y, text="🥄", font=EMOJI, fill="#ffffff")
        for e in self.enemies:
            c.create_text(e["x"], self.lane_y(e["lane"]), text=e["type"],
                          font=("Segoe UI Emoji", ENEMY_TYPES[e["type"]]["size"]), fill="#ffffff")
        blink = self.monkey_inv > 0 and int(self.monkey_inv * 12) % 2 == 0
        if not blink:
            c.create_text(self.monkey_x, self.monkey_y, text="🐒",
                          font=("Segoe UI Emoji", 48), fill="#ffffff")

        self.draw_celestial()
        self.draw_day_night_tint()

        if self.flash > 0:
            c.create_rectangle(0, 0, self.W, self.H, fill="#ff0000", outline="", stipple="gray25")

        self.draw_hud()

    # ---------- 最佳成绩 / 存档 ----------
    def default_best(self):
        return {k: {"mileage": 0, "spoons": 0} for k in MODE_KEYS}

    def load_best(self):
        try:
            with open(self.best_path, "r", encoding="utf-8") as f:
                v = json.load(f)
            # 兼容旧版：单一 {mileage, spoons} 记录 → 平移到「普通模式」最佳
            if isinstance(v, dict) and "mileage" in v and "normal" not in v:
                nb = self.default_best()
                try:
                    nm = max(0, int(float(v.get("mileage", 0)) or 0))
                except (TypeError, ValueError):
                    nm = 0
                try:
                    ns = max(0, int(float(v.get("spoons", 0)) or 0))
                except (TypeError, ValueError):
                    ns = 0
                nb["normal"] = {"mileage": nm, "spoons": ns}
                try:
                    with open(self.best_path, "w", encoding="utf-8") as f:
                        json.dump(nb, f)
                except Exception:
                    pass
                return nb
            if all(k in v for k in MODE_KEYS):
                return v
        except Exception:
            pass
        return self.default_best()

    def save_best(self):
        try:
            with open(self.best_path, "w", encoding="utf-8") as f:
                json.dump(self.best, f)
        except Exception:
            pass

    def commit_best_if_valid(self):
        # 仅当本局「未用过复活」才把当前成绩写入当前模式的历史最佳
        if self.used_revive:
            return
        b = self.best[self.mode]
        b["mileage"] = max(b["mileage"], int(self.mileage))
        b["spoons"] = max(b["spoons"], self.spoons_count)
        self.save_best()

    def save_state(self):
        try:
            data = {
                "mode": self.mode,
                "monkey_target_lane": self.monkey_target_lane, "monkey_y": self.monkey_y,
                "monkey_x": self.monkey_x, "monkey_hp": self.monkey_hp,
                "monkey_max_hp": self.monkey_max_hp, "monkey_inv": self.monkey_inv,
                "mileage": self.mileage, "spoons_count": self.spoons_count,
                "day_time": self.day_time, "speed": self.speed,
                "spoon_timer": self.spoon_timer, "enemy_timer": self.enemy_timer,
                "egg_ch": self.egg_ch, "egg_alpha": self.egg_alpha,
                "used_revive": self.used_revive,
                "enemies": self.enemies, "spoons": self.spoons,
            }
            with open(self.save_path, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception:
            pass

    def load_state(self):
        try:
            if not os.path.exists(self.save_path):
                return None
            with open(self.save_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def clear_state(self):
        try:
            if os.path.exists(self.save_path):
                os.remove(self.save_path)
        except Exception:
            pass

    def restore_state(self, s):
        self.mode = s.get("mode", "normal")
        self.monkey_target_lane = s["monkey_target_lane"]
        self.monkey_y = s["monkey_y"]
        self.monkey_x = s["monkey_x"]
        self.monkey_hp = s["monkey_hp"]
        self.monkey_max_hp = s["monkey_max_hp"]
        self.monkey_inv = s["monkey_inv"]
        self.mileage = s["mileage"]
        self.spoons_count = s["spoons_count"]
        self.day_time = s["day_time"]
        self.speed = s["speed"]
        self.spoon_timer = s["spoon_timer"]
        self.enemy_timer = s["enemy_timer"]
        self.egg_ch = s["egg_ch"]
        self.egg_alpha = s["egg_alpha"]
        self.used_revive = bool(s.get("used_revive", False))
        self.enemies = s["enemies"]
        self.spoons = s["spoons"]
        self.flash = 0.0
        self.gold_spoons = self.spoons_count >= self.best[self.mode]["spoons"]

    def ensure_pause_btn(self):
        if self.pause_btn is None:
            self.pause_btn = tk.Button(self.root, text="⏸", font=("Segoe UI Emoji", 18),
                                       bg="#000000", fg="#ffffff", command=self.toggle_pause)
        self.pause_btn.place(x=self.W - 52, y=10, width=42, height=42)

    def hide_pause_btn(self):
        if self.pause_btn:
            self.pause_btn.place_forget()

    def draw_pause_overlay(self):
        c = self.canvas
        c.create_rectangle(0, 0, self.W, self.H, fill="#0f172a", outline="", stipple="gray25", tag="pauseui")
        c.create_text(self.W/2, self.H/2 - 40, text="⏸ 已暂停",
                      font=("Microsoft YaHei", 34, "bold"), fill="#ffffff", tag="pauseui")
        c.create_text(self.W/2, self.H/2 + 4, text="已保存进度，关闭后重开可继续",
                      font=("Microsoft YaHei", 13), fill="#dddddd", tag="pauseui")
        b = self.best[self.mode]
        c.create_text(self.W/2, self.H/2 + 30,
                      text=f"历史最佳：{b['mileage']} m · {b['spoons']} 勺",
                      font=("Microsoft YaHei", 13), fill="#ffcc4d", tag="pauseui")

    def clear_pause_ui(self):
        self.canvas.delete("pauseui")
        for attr in ("pause_resume_btn", "pause_restart_btn", "pause_exit_btn"):
            if hasattr(self, attr):
                getattr(self, attr).place_forget()
                delattr(self, attr)

    def toggle_pause(self):
        if not self.running or self.paused:
            return
        self.paused = True
        self.save_state()
        self.draw_pause_overlay()
        w, h = self.W, self.H
        self.pause_resume_btn = tk.Button(self.root, text="继续游戏",
            font=("Microsoft YaHei", 16, "bold"), bg="#ffcc4d", fg="#3a2a00", command=self.resume)
        self.pause_resume_btn.place(x=w/2 - 70, y=h/2 + 56, width=140, height=44)
        self.pause_restart_btn = tk.Button(self.root, text="重新开始",
            font=("Microsoft YaHei", 16, "bold"), bg="#ffffff", fg="#3a2a00", command=lambda: self.start(self.mode))
        self.pause_restart_btn.place(x=w/2 - 70, y=h/2 + 110, width=140, height=44)
        self.pause_exit_btn = tk.Button(self.root, text="退出游戏",
            font=("Microsoft YaHei", 16, "bold"), bg="#ffffff", fg="#3a2a00", command=self.exit_pause)
        self.pause_exit_btn.place(x=w/2 - 70, y=h/2 + 164, width=140, height=44)

    def resume(self):
        if not self.paused:
            return
        self.paused = False
        self.clear_pause_ui()
        self.last = time.time()
        self.loop()

    def exit_pause(self):
        if not self.paused:
            return
        # 暂停退出的有效一局（未用复活）结算历史最佳；保留存档以便重开续玩
        self.commit_best_if_valid()
        self.paused = False
        self.clear_pause_ui()
        self.hide_pause_btn()
        self.show_start()

    def continue_game(self):
        s = self.load_state()
        if not s:
            self.start("normal")
            return
        self.clear_game_ui()
        self.running = True
        self.paused = False
        self.restore_state(s)
        self.W = self.canvas.winfo_width()
        self.H = self.canvas.winfo_height()
        self.ensure_pause_btn()
        self.last = time.time()
        self.loop()

    # ---------- 无限复活 / 死亡界面 ----------
    def game_over(self):
        # 死亡时即结算「复活前」的有效成绩
        self.commit_best_if_valid()
        self.running = False
        self.paused = False
        self.clear_state()
        self.hide_pause_btn()
        w, h = self.W, self.H
        c = self.canvas
        c.delete("all")
        c.create_rectangle(0, 0, w, h, fill="#0f172a", outline="")
        c.create_text(w/2, h/2 - 80, text="游戏结束！",
                      font=("Microsoft YaHei", 34, "bold"), fill="#ffffff")
        c.create_text(w/2, h/2 - 38, text=f"里程 {int(self.mileage)} 米 · 汤勺 {self.spoons_count} 个",
                      font=("Microsoft YaHei", 18), fill="#ffcc4d")
        b = self.best[self.mode]
        c.create_text(w/2, h/2 - 8,
                      text=f"历史最佳：{b['mileage']} m · {b['spoons']} 勺",
                      font=("Microsoft YaHei", 13), fill="#dddddd")
        c.create_text(w/2, h/2 + 18, text="（复活后成绩不计入历史最佳）",
                      font=("Microsoft YaHei", 11), fill="#9aa4b2")
        self.dead_revive_btn = tk.Button(self.root, text="🔄 复活（无限次）",
            font=("Microsoft YaHei", 16, "bold"), bg="#ffcc4d", fg="#3a2a00", command=self.revive)
        self.dead_revive_btn.place(x=w/2 - 80, y=h/2 + 44, width=160, height=44)
        self.dead_exit_btn = tk.Button(self.root, text="退出游戏",
            font=("Microsoft YaHei", 16, "bold"), bg="#ffffff", fg="#3a2a00", command=self.dead_exit)
        self.dead_exit_btn.place(x=w/2 - 80, y=h/2 + 98, width=160, height=44)

    def revive(self):
        # 无限复活：恢复满血、清场；一旦复活本局成绩不计入历史最佳
        self.used_revive = True
        self.monkey_hp = self.monkey_max_hp
        self.monkey_inv = 1.5
        self.enemies = []
        for attr in ("dead_revive_btn", "dead_exit_btn"):
            if hasattr(self, attr):
                getattr(self, attr).place_forget()
                delattr(self, attr)
        self.running = True
        self.paused = False
        self.ensure_pause_btn()
        self.last = time.time()
        self.loop()

    def dead_exit(self):
        # 死亡界面退出：结算有效成绩，结束本局（清存档）
        self.commit_best_if_valid()
        for attr in ("dead_revive_btn", "dead_exit_btn"):
            if hasattr(self, attr):
                getattr(self, attr).place_forget()
                delattr(self, attr)
        self.clear_state()
        self.hide_pause_btn()
        self.show_start()


if __name__ == "__main__":
    root = tk.Tk()
    Game(root)
    root.mainloop()
