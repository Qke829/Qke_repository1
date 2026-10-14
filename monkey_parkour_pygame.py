# -*- coding: utf-8 -*-
"""
猴子跑酷 —— pygame 版（与网页版 HTML5 Canvas 逻辑 1:1 复刻）
- 四模式：简单 / 普通 / 极速 / 困难（分模式统计最佳）
- 三车道拖动（鼠标上下移动）换道收汤勺，躲避 🐷🦈🦛
- 圆形碰撞判定、血量、一击必杀、金线竖线、金勺、里程彩蛋、太阳月亮轮转
- 无限复活（复活后成绩不计入最佳）、暂停后退出可续玩
说明：pygame 跨平台渲染彩色 emoji 不可靠，角色用矢量图形绘制（形态贴近网页 emoji），
      其余机制/数值/布局与网页版完全一致。
"""
import os
import sys
import json
import math
import random
import pygame

# ============================================================
# 常量（与网页版一致）
# ============================================================
LANES = 3
BASE_SPEED = 180
MONKEY_R = 22
SPOON_HEAL = 6
DAY_LENGTH = 120          # 一天 = 120 秒
BEST_LEAD = 80            # 破纪录前 80m 即出现金线
EGG_ALPHA = 0.16          # 彩蛋头像最大透明度

# 模式配置
MODES = {
    'easy':   {'label': '简单', 'enemyMul': 1.7,  'spoonMul': 0.6, 'mileageMul': 1.0, 'oneShot': False, 'maxHp': 100, 'acc': 0,     'desc': '无必杀 · 怪少 · 勺多'},
    'normal': {'label': '普通', 'enemyMul': 1.0,  'spoonMul': 1.0, 'mileageMul': 1.0, 'oneShot': 'per', 'maxHp': 100, 'acc': 0,     'desc': '标准体验'},
    'fast':   {'label': '极速', 'enemyMul': 0.85, 'spoonMul': 0.7, 'mileageMul': 1.6, 'oneShot': 'per', 'maxHp': 100, 'acc': 0.004, 'desc': '里程快 · 越来越快 · 勺多'},
    'hard':   {'label': '困难', 'enemyMul': 1.0,  'spoonMul': 1.0, 'mileageMul': 1.0, 'oneShot': 'all', 'maxHp': 1,   'acc': 0,     'desc': '无血量 · 一击必杀'},
}
MODE_KEYS = ['easy', 'normal', 'fast', 'hard']

# 敌人参数：碰撞半径依次增大，基础伤害依次降低
ENEMY_TYPES = {
    'shark':  {'colR': 16, 'baseDmg': 30, 'size': 42, 'oneShot': 2000, 'name': '鲨鱼'},
    'pig':    {'colR': 22, 'baseDmg': 22, 'size': 44, 'oneShot': 3200, 'name': '猪'},
    'hippo':  {'colR': 30, 'baseDmg': 14, 'size': 48, 'oneShot': 5000, 'name': '河马'},
}

# 里程彩蛋
MILESTONES = [
    {'m': 46,   'ch': 'pig',    'label': '猪'},
    {'m': 529,  'ch': 'monkey', 'label': '猴子'},
    {'m': 720,  'ch': 'shark',  'label': '鲨鱼'},
    {'m': 829,  'ch': 'hippo',  'label': '河马'},
    {'m': 1015, 'ch': 'spoon',  'label': '勺子'},
]

# 存档文件（放在脚本同目录）
_HERE = os.path.dirname(os.path.abspath(__file__))
BEST_FILE = os.path.join(_HERE, 'monkey_run_best.json')
SAVE_FILE = os.path.join(_HERE, 'monkey_run_save.json')

# 颜色
COL_GROUND_A = (141, 110, 79)
COL_GROUND_B = (156, 122, 87)
COL_DASH = (255, 255, 255)
COL_GOLD = (255, 207, 58)
COL_GOLD_DK = (185, 132, 26)
COL_SPOON_SILVER = (210, 210, 218)


# ============================================================
# 游戏主体
# ============================================================
class Game:
    def __init__(self, width=960, height=640):
        pygame.init()
        self.W, self.H = width, height
        self.screen = pygame.display.set_mode((self.W, self.H), pygame.RESIZABLE)
        pygame.display.set_caption('猴子跑酷')
        self.clock = pygame.time.Clock()
        self.font = self._find_font()
        self.big_font = pygame.font.Font(self.font, 30) if self.font else pygame.font.SysFont(None, 30)
        self.title_font = pygame.font.Font(self.font, 34) if self.font else pygame.font.SysFont(None, 34)
        self.small_font = pygame.font.Font(self.font, 14) if self.font else pygame.font.SysFont(None, 14)

        self.state = 'menu'            # menu / playing / paused / dead
        self.best = self.load_best()
        self.has_save = os.path.exists(SAVE_FILE)

        # 运行状态
        self.monkey = {'x': 0, 'y': 0, 'targetLane': 1, 'hp': 100, 'maxHp': 100, 'inv': 0}
        self.curMode = 'normal'
        self.spoons = []
        self.enemies = []
        self.mileage = 0
        self.spoonsCount = 0
        self.goldSpoons = False
        self.scrollSpeed = BASE_SPEED
        self.baseSpeed = BASE_SPEED
        self.lastT = 0
        self.spoonTimer = 0
        self.enemyTimer = 0
        self.dayTime = 0.27
        self.flash = 0
        self.eggCh = None
        self.eggAlpha = 0
        self.usedRevive = False
        self.stars = []

        self._build_stars()
        self._init_state()
        # 按钮命中区（每帧重算）
        self.buttons = {}

    # ---------- 字体探测 ----------
    def _find_font(self):
        cands = ['Microsoft YaHei', 'SimHei', 'SimSun', 'PingFang SC',
                 'Heiti SC', 'STHeiti', 'Noto Sans CJK SC', 'Arial']
        for c in cands:
            try:
                f = pygame.font.SysFont(c, 20)
                # 简单探测中文渲染
                if f.render('测', True, (0, 0, 0)).get_width() > 2:
                    return pygame.font.match_font(c)
            except Exception:
                continue
        # 退而求其次：直接找系统字体文件
        for p in ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf']:
            if os.path.exists(p):
                return p
        return None

    # ---------- 布局 ----------
    def lane_h(self):
        return self.H / LANES

    def lane_y(self, i):
        h = self.lane_h()
        return h * i + h / 2

    def lane_from_y(self, y):
        h = self.lane_h()
        return max(0, min(LANES - 1, int(y / h)))

    def sky_band(self):
        return min(self.H * 0.30, 130)

    def _build_stars(self):
        self.stars = [{'x': random.random(), 'y': random.random() * 0.85,
                       'r': random.random() * 1.4 + 0.4} for _ in range(50)]

    def _init_state(self):
        self.monkey['x'] = self.W * 0.22
        self.monkey['y'] = self.lane_y(1)
        self.monkey['targetLane'] = 1

    # ============================================================
    # 历史最佳（按模式分别存储，JSON 文件）
    # ============================================================
    def default_best(self):
        return {k: {'mileage': 0, 'spoons': 0} for k in MODE_KEYS}

    def load_best(self):
        try:
            if os.path.exists(BEST_FILE):
                with open(BEST_FILE, 'r', encoding='utf-8') as f:
                    v = json.load(f)
                # 兼容旧版单一 {mileage, spoons} 记录 → 平移到「普通模式」
                if isinstance(v, dict) and 'mileage' in v and 'normal' not in v:
                    nb = self.default_best()
                    nb['normal'] = {
                        'mileage': max(0, int(float(v.get('mileage', 0) or 0))),
                        'spoons': max(0, int(float(v.get('spoons', 0) or 0))),
                    }
                    self._write_json(BEST_FILE, nb)
                    return nb
                if all(k in v for k in MODE_KEYS):
                    return v
        except Exception:
            pass
        return self.default_best()

    def save_best(self):
        try:
            self._write_json(BEST_FILE, self.best)
        except Exception:
            pass

    def commit_best_if_valid(self):
        if self.usedRevive:
            return
        b = self.best[self.curMode]
        if int(self.mileage) > b['mileage']:
            b['mileage'] = int(self.mileage)
        if self.spoonsCount > b['spoons']:
            b['spoons'] = self.spoonsCount
        self.save_best()

    # ---------- 进度存档（暂停后可退出，重开续玩） ----------
    def save_state(self):
        try:
            data = {
                'curMode': self.curMode,
                'monkey': dict(self.monkey),
                'mileage': self.mileage,
                'spoonsCount': self.spoonsCount,
                'dayTime': self.dayTime,
                'scrollSpeed': self.scrollSpeed,
                'baseSpeed': self.baseSpeed,
                'spoonTimer': self.spoonTimer,
                'enemyTimer': self.enemyTimer,
                'eggCh': self.eggCh,
                'eggAlpha': self.eggAlpha,
                'enemies': self.enemies,
                'spoons': self.spoons,
                'usedRevive': self.usedRevive,
                'ts': int(__import__('time').time() * 1000),
            }
            self._write_json(SAVE_FILE, data)
            self.has_save = True
        except Exception:
            pass

    def load_state(self):
        try:
            if os.path.exists(SAVE_FILE):
                with open(SAVE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception:
            pass
        return None

    def clear_state(self):
        self.has_save = False
        try:
            if os.path.exists(SAVE_FILE):
                os.remove(SAVE_FILE)
        except Exception:
            pass

    def restore_state(self, s):
        self.curMode = s.get('curMode', 'normal')
        self.monkey.update(s.get('monkey', {}))
        self.mileage = s.get('mileage', 0)
        self.spoonsCount = s.get('spoonsCount', 0)
        self.dayTime = s.get('dayTime', 0.27)
        self.scrollSpeed = s.get('scrollSpeed', BASE_SPEED)
        self.baseSpeed = s.get('baseSpeed', BASE_SPEED)
        self.spoonTimer = s.get('spoonTimer', 0.4)
        self.enemyTimer = s.get('enemyTimer', 1.0)
        self.eggCh = s.get('eggCh')
        self.eggAlpha = s.get('eggAlpha', 0)
        self.enemies = s.get('enemies', [])
        self.spoons = s.get('spoons', [])
        self.usedRevive = bool(s.get('usedRevive', False))

    @staticmethod
    def _write_json(path, obj):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False)

    # ============================================================
    # 游戏逻辑
    # ============================================================
    def reset(self, mode):
        m = MODES[mode]
        self.curMode = mode
        self.monkey['targetLane'] = 1
        self.monkey['y'] = self.lane_y(1)
        self.monkey['x'] = self.W * 0.22
        self.monkey['maxHp'] = m['maxHp']
        self.monkey['hp'] = m['maxHp']
        self.monkey['inv'] = 0
        self.spoons = []
        self.enemies = []
        self.mileage = 0
        self.spoonsCount = 0
        self.goldSpoons = False
        self.scrollSpeed = self.baseSpeed
        self.spoonTimer = 0.4
        self.enemyTimer = 1.0
        self.dayTime = 0.27
        self.flash = 0
        self.eggCh = None
        self.eggAlpha = 0
        self.usedRevive = False
        self.lastT = pygame.time.get_ticks()

    def spawn_spoon(self):
        self.spoons.append({'lane': random.randint(0, LANES - 1), 'x': self.W + 40, 'got': False})

    def spawn_enemy(self):
        incoming = [e['lane'] for e in self.enemies if e['x'] > self.monkey['x']]
        free = [l for l in (0, 1, 2) if l not in incoming]
        if not free:
            return
        lane = random.choice(free)
        etype = random.choice(list(ENEMY_TYPES.keys()))
        self.enemies.append({
            'lane': lane,
            'x': self.W + 60,
            'type': etype,
            'speed': self.scrollSpeed + 60 + random.random() * 60,
        })

    def enemy_damage(self):
        return 1 + self.mileage / 2000

    def is_one_shot(self, etype):
        m = MODES[self.curMode]
        if m['oneShot'] is False:
            return False
        if m['oneShot'] == 'all':
            return True
        return self.mileage >= ENEMY_TYPES[etype]['oneShot']

    def update(self, dt):
        m = MODES[self.curMode]
        self.dayTime = (self.dayTime + dt / DAY_LENGTH) % 1
        self.scrollSpeed = self.baseSpeed + self.mileage * 0.02
        acc = 12 + m['acc'] * self.mileage
        ty = self.lane_y(self.monkey['targetLane'])
        self.monkey['y'] += (ty - self.monkey['y']) * min(1, dt * acc)
        if self.monkey['inv'] > 0:
            self.monkey['inv'] -= dt
        if self.flash > 0:
            self.flash -= dt
        self.mileage += self.scrollSpeed * dt * 0.1 * m['mileageMul']

        # 汤勺移动 + 收集
        for s in self.spoons:
            s['x'] -= self.scrollSpeed * dt
        for s in self.spoons:
            if s['got']:
                continue
            dy = self.lane_y(s['lane']) - self.monkey['y']
            dx = s['x'] - self.monkey['x']
            if abs(dx) < 30 and abs(dy) < self.lane_h() * 0.5:
                s['got'] = True
                self.spoonsCount += 1
                self.monkey['hp'] = min(self.monkey['maxHp'], self.monkey['hp'] + SPOON_HEAL)
        self.spoons = [s for s in self.spoons if not s['got'] and s['x'] > -60]

        # 敌人移动 + 圆形碰撞
        mult = self.enemy_damage()
        for e in self.enemies:
            e['x'] -= e['speed'] * dt
        if self.monkey['inv'] <= 0:
            for e in self.enemies:
                ey = self.lane_y(e['lane'])
                dx = e['x'] - self.monkey['x']
                dy = ey - self.monkey['y']
                dist = math.hypot(dx, dy)
                reach = ENEMY_TYPES[e['type']]['colR'] + MONKEY_R
                if dist < reach:
                    dmg = self.monkey['maxHp'] if self.is_one_shot(e['type']) else ENEMY_TYPES[e['type']]['baseDmg'] * mult
                    self.monkey['hp'] -= dmg
                    self.monkey['inv'] = 1.2
                    self.flash = 0.25
                    if self.monkey['hp'] <= 0:
                        self.monkey['hp'] = 0
                        self.game_over()
                        return
        self.enemies = [e for e in self.enemies if e['x'] > -80]

        # 里程彩蛋
        reached = None
        for ms in MILESTONES:
            if self.mileage >= ms['m']:
                reached = ms
        if reached and self.eggCh != reached['ch']:
            self.eggCh = reached['ch']
            self.eggAlpha = 0
        if self.eggCh:
            self.eggAlpha = min(EGG_ALPHA, self.eggAlpha + dt * 0.4)

        self.goldSpoons = self.spoonsCount >= self.best[self.curMode]['spoons']

        # 刷怪 / 出勺
        self.spoonTimer -= dt
        if self.spoonTimer <= 0:
            self.spawn_spoon()
            self.spoonTimer = (0.7 + random.random() * 0.6) * m['spoonMul']
        self.enemyTimer -= dt
        if self.enemyTimer <= 0:
            self.spawn_enemy()
            self.enemyTimer = max(0.7, (1.8 - self.mileage * 0.0008) * m['enemyMul']) + random.random() * 0.6

    # ============================================================
    # 绘制：背景 / 地面 / 金线 / 彩蛋 / 角色 / 天体 / HUD
    # ============================================================
    def draw_ground(self):
        h = self.lane_h()
        for i in range(LANES):
            y = h * i
            col = COL_GROUND_A if i % 2 == 0 else COL_GROUND_B
            pygame.draw.rect(self.screen, col, (0, y, self.W, h))
            if i > 0:
                self._dashed_line(0, y, self.W, y, COL_DASH, 3, 18, 14)

    def _dashed_line(self, x1, y1, x2, y2, color, width, dash, gap):
        dist = math.hypot(x2 - x1, y2 - y1)
        steps = int(dist / (dash + gap))
        for i in range(steps + 1):
            t0 = i * (dash + gap) / dist
            t1 = (i * (dash + gap) + dash) / dist
            if t1 > 1:
                t1 = 1
            pygame.draw.line(self.screen, color,
                             (x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0),
                             (x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1), width)

    def draw_best_line(self):
        b = self.best[self.curMode]
        if not b or b['mileage'] <= 0:
            return
        now = pygame.time.get_ticks()
        if self.mileage >= b['mileage']:
            lineX = self.monkey['x']
        elif b['mileage'] - self.mileage <= BEST_LEAD:
            d = (b['mileage'] - self.mileage) / BEST_LEAD
            lineX = self.monkey['x'] + d * 140
        else:
            return
        pulse = 0.55 + 0.35 * abs(math.sin(now / 300))
        glow = pygame.Surface((10, self.H), pygame.SRCALPHA)
        pygame.draw.line(glow, (255, 215, 0, int(255 * pulse)), (5, 0), (5, self.H), 5)
        # 简单光晕：再叠一层更宽更淡
        pygame.draw.line(self.screen, (255, 215, 0, int(180 * pulse)), (lineX, 0), (lineX, self.H), 5)
        pygame.draw.line(self.screen, (255, 235, 120, int(90 * pulse)), (lineX, 0), (lineX, self.H), 10)

    def draw_egg(self):
        if not self.eggCh or self.eggAlpha <= 0.01:
            return
        surf = pygame.Surface((self.W, self.H), pygame.SRCALPHA)
        alpha = int(self.eggAlpha * 255)
        cx, cy = self.W / 2, self.H / 2
        size = min(self.W, self.H) * 0.95
        if self.goldSpoons and self.eggCh == 'spoon':
            self._draw_spoon_surf(surf, cx, cy, size, True, alpha)
        else:
            self._draw_char_surf(surf, self.eggCh, cx, cy, size, alpha)
        self.screen.blit(surf, (0, 0))

    # 在指定 surface 上画矢量角色（用于彩蛋虚化头像）
    def _draw_char_surf(self, surf, ch, x, y, size, alpha):
        if ch == 'spoon':
            self._draw_spoon_surf(surf, x, y, size, False, alpha)
            return
        sub = pygame.Surface((int(size * 1.4), int(size * 1.4)), pygame.SRCALPHA)
        sx, sy = size * 0.7, size * 0.7
        if ch == 'monkey':
            self._paint_monkey(sub, sx, sy, size * 0.6)
        elif ch == 'pig':
            self._paint_pig(sub, sx, sy, size * 0.6)
        elif ch == 'shark':
            self._paint_shark(sub, sx, sy, size * 0.6)
        elif ch == 'hippo':
            self._paint_hippo(sub, sx, sy, size * 0.6)
        sub.set_alpha(alpha)
        surf.blit(sub, (x - sx, y - sy))

    def _draw_spoon_surf(self, surf, x, y, size, gold, alpha):
        sub = pygame.Surface((int(size * 1.4), int(size * 1.4)), pygame.SRCALPHA)
        sx, sy = size * 0.7, size * 0.7
        self._paint_spoon(sub, sx, sy, size * 0.5, gold)
        sub.set_alpha(alpha)
        surf.blit(sub, (x - sx, y - sy))

    # ---------- 矢量角色（主绘制，直接画到 screen） ----------
    def _paint_monkey(self, s, x, y, r):
        c = (120, 80, 50)
        face = (200, 160, 120)
        pygame.draw.circle(s, c, (x - r * 0.55, y - r * 0.45), r * 0.42)   # 耳
        pygame.draw.circle(s, c, (x + r * 0.55, y - r * 0.45), r * 0.42)
        pygame.draw.circle(s, face, (x, y), r)                            # 脸
        pygame.draw.ellipse(s, (225, 195, 165), (x - r * 0.55, y - r * 0.1, r * 1.1, r * 0.8))
        pygame.draw.circle(s, (30, 20, 15), (x - r * 0.35, y - r * 0.2), r * 0.12)
        pygame.draw.circle(s, (30, 20, 15), (x + r * 0.35, y - r * 0.2), r * 0.12)
        pygame.draw.arc(s, (90, 60, 40), (x - r * 0.3, y + r * 0.05, r * 0.6, r * 0.4), 0.2, math.pi - 0.2, 3)

    def _paint_pig(self, s, x, y, r):
        c = (240, 170, 185)
        pygame.draw.circle(s, c, (x, y), r)                               # 脸
        pygame.draw.circle(s, (225, 150, 165), (x - r * 0.5, y - r * 0.55), r * 0.22)
        pygame.draw.circle(s, (225, 150, 165), (x + r * 0.5, y - r * 0.55), r * 0.22)
        pygame.draw.ellipse(s, (225, 140, 160), (x - r * 0.4, y + r * 0.05, r * 0.8, r * 0.55))
        pygame.draw.circle(s, (120, 60, 70), (x - r * 0.13, y + r * 0.22), r * 0.07)
        pygame.draw.circle(s, (120, 60, 70), (x + r * 0.13, y + r * 0.22), r * 0.07)
        pygame.draw.circle(s, (30, 20, 15), (x - r * 0.32, y - r * 0.18), r * 0.1)
        pygame.draw.circle(s, (30, 20, 15), (x + r * 0.32, y - r * 0.18), r * 0.1)

    def _paint_shark(self, s, x, y, r):
        c = (90, 110, 130)
        belly = (220, 230, 235)
        pygame.draw.ellipse(s, c, (x - r, y - r * 0.6, r * 2, r * 1.2))   # 身体
        pygame.draw.ellipse(s, belly, (x - r * 0.7, y - r * 0.1, r * 1.4, r * 0.6))
        pygame.draw.polygon(s, c, [(x - r * 0.1, y - r * 0.6), (x + r * 0.4, y - r * 0.6), (x + r * 0.1, y - r * 1.15)])  # 背鳍
        pygame.draw.polygon(s, c, [(x + r * 0.9, y), (x + r * 1.5, y - r * 0.5), (x + r * 1.5, y + r * 0.5)])            # 尾
        pygame.draw.circle(s, (20, 25, 30), (x - r * 0.55, y - r * 0.2), r * 0.1)
        pygame.draw.polygon(s, (255, 255, 255), [(x - r * 0.9, y + r * 0.2), (x - r * 0.5, y + r * 0.2), (x - r * 0.7, y + r * 0.45)])

    def _paint_hippo(self, s, x, y, r):
        c = (130, 110, 140)
        pygame.draw.circle(s, c, (x, y), r)                              # 头
        pygame.draw.circle(s, c, (x - r * 0.6, y - r * 0.6), r * 0.28)
        pygame.draw.circle(s, c, (x + r * 0.6, y - r * 0.6), r * 0.28)
        pygame.draw.ellipse(s, (95, 80, 105), (x - r * 0.6, y + r * 0.1, r * 1.2, r * 0.7))  # 大嘴
        pygame.draw.circle(s, (50, 40, 60), (x - r * 0.2, y + r * 0.45), r * 0.08)
        pygame.draw.circle(s, (50, 40, 60), (x + r * 0.2, y + r * 0.45), r * 0.08)
        pygame.draw.circle(s, (30, 20, 15), (x - r * 0.4, y - r * 0.25), r * 0.1)
        pygame.draw.circle(s, (30, 20, 15), (x + r * 0.4, y - r * 0.25), r * 0.1)

    def _paint_spoon(self, s, x, y, s0, gold):
        bowl_col = COL_GOLD if gold else COL_SPOON_SILVER
        bowl_dk = COL_GOLD_DK if gold else (150, 150, 160)
        r = s0 * 0.38
        bowlY = y - r
        handle_len = r * 3.2
        handle_w = s0 * 0.26
        pygame.draw.line(s, bowl_dk, (x, bowlY + r * 0.45), (x, bowlY + r * 0.45 + handle_len), int(handle_w))
        pygame.draw.circle(s, bowl_col, (x, bowlY), r)
        pygame.draw.circle(s, bowl_dk, (x, bowlY), r, 2)

    def draw_spoon(self, x, y, gold):
        self._paint_spoon(self.screen, x, y, 30, gold)

    def draw_monkey(self, x, y):
        self._paint_monkey(self.screen, x, y, 24)

    def draw_enemy(self, x, y, etype):
        r = ENEMY_TYPES[etype]['size'] * 0.55
        if etype == 'shark':
            self._paint_shark(self.screen, x, y, r)
        elif etype == 'pig':
            self._paint_pig(self.screen, x, y, r)
        elif etype == 'hippo':
            self._paint_hippo(self.screen, x, y, r)

    # ---------- 天体（太阳 / 月亮 / 星空） ----------
    def sky_color(self, t):
        SKY = [
            (0.00, (10, 14, 39), (20, 33, 61)),
            (0.22, (26, 31, 58), (40, 46, 80)),
            (0.28, (255, 158, 109), (255, 217, 160)),
            (0.50, (74, 163, 224), (191, 230, 255)),
            (0.72, (255, 123, 84), (255, 208, 160)),
            (0.78, (26, 31, 58), (40, 46, 80)),
            (1.00, (10, 14, 39), (20, 33, 61)),
        ]
        for i in range(len(SKY) - 1):
            if SKY[i][0] <= t <= SKY[i + 1][0]:
                f = (t - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0])
                top = [int(a + (b - a) * f) for a, b in zip(SKY[i][1], SKY[i + 1][1])]
                bot = [int(a + (b - a) * f) for a, b in zip(SKY[i][2], SKY[i + 1][2])]
                return top, bot
        return SKY[0][1], SKY[0][2]

    def darkness(self, t):
        if t < 0.25:
            return (0.25 - t) / 0.25
        if t > 0.75:
            return (t - 0.75) / 0.25
        return 0

    def fmt_time(self, t):
        total = t * 24
        hh = int(total) % 24
        mm = int((total - int(total)) * 60)
        return f"{hh:02d}:{mm:02d}"

    def draw_celestial(self):
        band = self.sky_band()
        dk = self.darkness(self.dayTime)
        if dk > 0.05:
            for st in self.stars:
                pygame.draw.circle(self.screen, (255, 255, 255, int(217 * dk)),
                                   (st['x'] * self.W, st['y'] * band), st['r'])
        if 0.25 <= self.dayTime <= 0.75:
            p = (self.dayTime - 0.25) / 0.5
            sx = p * self.W
            sy = band - math.sin(p * math.pi) * (band * 0.72) - 8
            halo = pygame.Surface((84, 84), pygame.SRCALPHA)
            pygame.draw.circle(halo, (255, 240, 150, 120), (42, 42), 42)
            self.screen.blit(halo, (sx - 42, sy - 42))
            pygame.draw.circle(self.screen, (255, 242, 168), (sx, sy), 18)
        if self.dayTime > 0.75 or self.dayTime < 0.25:
            frac = (self.dayTime - 0.75) / 0.5 if self.dayTime > 0.75 else (self.dayTime + 0.25) / 0.5
            mx = frac * self.W
            my = band - math.sin(frac * math.pi) * (band * 0.72) - 8
            pygame.draw.circle(self.screen, (255, 255, 210), (mx, my), 15)
            _, bot = self.sky_color(self.dayTime)
            pygame.draw.circle(self.screen, bot, (mx + 6, my - 4), 13)

    def draw_day_night_tint(self):
        dk = self.darkness(self.dayTime)
        if dk > 0.02:
            overlay = pygame.Surface((self.W, self.H), pygame.SRCALPHA)
            overlay.fill((8, 12, 35, int(76 * dk)))
            self.screen.blit(overlay, (0, 0))

    def draw_hud(self):
        topH = 72
        pad = 12
        barH = 14
        overlay = pygame.Surface((self.W, topH), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 90))
        self.screen.blit(overlay, (0, 0))
        white = (255, 255, 255)
        gold = COL_GOLD

        self._text(f"汤勺 {self.spoonsCount}", pad, 22, white, self.small_font, 'left', 'middle')
        self._text(f"时间 {self.fmt_time(self.dayTime)}", self.W - 12, 22, white, self.small_font, 'right', 'middle')
        self._text(f"里程 {int(self.mileage)} m", pad, 48, white, self.small_font, 'left', 'middle')
        self._text(f"【{MODES[self.curMode]['label']}】", self.W - 12, 48, gold, self.small_font, 'right', 'middle')

        if self.monkey['maxHp'] > 1:
            bx, bw, by = pad, self.W - pad * 2, 56
            pygame.draw.rect(self.screen, (255, 255, 255, 64), (bx, by, bw, barH))
            ratio = max(0, self.monkey['hp'] / self.monkey['maxHp'])
            r = int(220 + (80 - 220) * ratio)
            g = int(40 + (200 - 40) * ratio)
            pygame.draw.rect(self.screen, (r, g, 60), (bx, by, int(bw * ratio), barH))
            self._text(f"HP {max(0, math.ceil(self.monkey['hp']))}", self.W / 2, by + barH / 2, white, self.small_font, 'center', 'middle')
        else:
            self._text("一击必杀", self.W / 2, 63, (255, 154, 138), self.small_font, 'center', 'middle')

    def draw(self):
        self.screen.fill((90, 67, 38))
        self.draw_ground()
        self.draw_best_line()
        self.draw_egg()
        for s in self.spoons:
            self.draw_spoon(s['x'], self.lane_y(s['lane']), self.goldSpoons)
        for e in self.enemies:
            self.draw_enemy(e['x'], self.lane_y(e['lane']), e['type'])
        blink = self.monkey['inv'] > 0 and int(self.monkey['inv'] * 12) % 2 == 0
        if not blink:
            self.draw_monkey(self.monkey['x'], self.monkey['y'])
        self.draw_celestial()
        self.draw_day_night_tint()
        if self.flash > 0:
            overlay = pygame.Surface((self.W, self.H), pygame.SRCALPHA)
            overlay.fill((255, 40, 40, int(89 * (self.flash / 0.25))))
            self.screen.blit(overlay, (0, 0))
        self.draw_hud()
        self.draw_pause_button()

    def draw_pause_button(self):
        if self.state != 'playing':
            return
        x, y, r = self.W - 34, 100, 22
        pygame.draw.circle(self.screen, (0, 0, 0, 115), (x, y), r)
        pygame.draw.rect(self.screen, (255, 255, 255), (x - 7, y - 8, 5, 16))
        pygame.draw.rect(self.screen, (255, 255, 255), (x + 2, y - 8, 5, 16))

    # ---------- 文字工具 ----------
    def _text(self, s, x, y, color, font, align='left', valign='middle'):
        surf = font.render(s, True, color)
        rect = surf.get_rect()
        if align == 'center':
            rect.centerx = x
        elif align == 'right':
            rect.right = x
        else:
            rect.left = x
        if valign == 'center':
            rect.centery = y
        elif valign == 'bottom':
            rect.bottom = y
        else:
            rect.top = y
        self.screen.blit(surf, rect)

    # ============================================================
    # UI 覆盖层（菜单 / 暂停 / 死亡）
    # ============================================================
    def _button(self, rect, label, color=(255, 200, 58), text_col=(58, 36, 0)):
        pygame.draw.rect(self.screen, color, rect, border_radius=12)
        self._text(label, rect.centerx, rect.centery, text_col, self.small_font, 'center', 'center')

    def draw_menu(self):
        overlay = pygame.Surface((self.W, self.H), pygame.SRCALPHA)
        overlay.fill((20, 12, 4, 199))
        self.screen.blit(overlay, (0, 0))
        self._text("猴子跑酷", self.W / 2, 60, (255, 226, 122), self.title_font, 'center', 'center')
        # 四模式卡片（2x2）
        card_w = min(360, self.W / 2 - 24)
        card_h = 132
        gx = (self.W - (card_w * 2 + 16)) / 2
        gy = 110
        self.buttons = {}
        for i, k in enumerate(MODE_KEYS):
            cx = gx + (i % 2) * (card_w + 16)
            cy = gy + (i // 2) * (card_h + 16)
            rect = pygame.Rect(cx, cy, card_w, card_h)
            col_map = {'easy': (155, 227, 122), 'normal': (255, 226, 122),
                       'fast': (126, 200, 255), 'hard': (255, 154, 138)}
            pygame.draw.rect(self.screen, (255, 255, 255, 20), rect, border_radius=14)
            pygame.draw.rect(self.screen, col_map[k], rect, 1, border_radius=14)
            self._text(MODES[k]['label'], cx + card_w / 2, cy + 22, col_map[k], self.big_font, 'center', 'center')
            self._text(f"最佳 {self.best[k]['mileage']} m · {self.best[k]['spoons']} 勺",
                       cx + card_w / 2, cy + 50, (255, 255, 255), self.small_font, 'center', 'center')
            self._text(MODES[k]['desc'], cx + card_w / 2, cy + 72, (200, 200, 200), self.small_font, 'center', 'center')
            btn = pygame.Rect(cx + card_w / 2 - 60, cy + card_h - 38, 120, 30)
            self._button(btn, "开始")
            self.buttons['mode_' + k] = btn
        self._text("三条路拖动（鼠标上下）换道收汤勺 · 躲避猪鲨河马 · 死亡可无限复活（不影响最佳）",
                   self.W / 2, gy + card_h * 2 + 24, (200, 200, 200), self.small_font, 'center', 'center')
        if self.has_save:
            btn = pygame.Rect(self.W / 2 - 110, gy + card_h * 2 + 44, 220, 34)
            self._button(btn, "继续游戏（上次存档）", (255, 255, 255, 40), (255, 255, 255))
            self.buttons['resume'] = btn

    def draw_pause(self):
        overlay = pygame.Surface((self.W, self.H), pygame.SRCALPHA)
        overlay.fill((20, 12, 4, 199))
        self.screen.blit(overlay, (0, 0))
        self._text("已暂停", self.W / 2, 120, (255, 255, 255), self.title_font, 'center', 'center')
        b = self.best[self.curMode]
        self._text(f"历史最佳：{b['mileage']} m · {b['spoons']} 勺", self.W / 2, 170, COL_GOLD, self.small_font, 'center', 'center')
        self.buttons = {}
        bw, bh = 220, 44
        cx = self.W / 2 - bw / 2
        self._make_btn('resume', cx, 220, bw, bh, "继续游戏")
        self._make_btn('restart', cx, 276, bw, bh, "重新开始", (255, 255, 255, 40), (255, 255, 255))
        self._make_btn('exit', cx, 332, bw, bh, "退出游戏", (255, 255, 255, 40), (255, 255, 255))
        self._text("已为你保存进度，退出后重新打开可继续", self.W / 2, 392, (180, 180, 180), self.small_font, 'center', 'center')

    def draw_dead(self):
        overlay = pygame.Surface((self.W, self.H), pygame.SRCALPHA)
        overlay.fill((20, 12, 4, 199))
        self.screen.blit(overlay, (0, 0))
        self._text("游戏结束！", self.W / 2, 110, (255, 255, 255), self.title_font, 'center', 'center')
        self._text(f"本次里程：{int(self.mileage)} 米", self.W / 2, 165, (255, 255, 255), self.small_font, 'center', 'center')
        self._text(f"收集汤勺：{self.spoonsCount} 个", self.W / 2, 192, (255, 255, 255), self.small_font, 'center', 'center')
        b = self.best[self.curMode]
        self._text(f"历史最佳：{b['mileage']} m · {b['spoons']} 勺", self.W / 2, 222, COL_GOLD, self.small_font, 'center', 'center')
        self._text("复活后成绩不计入历史最佳", self.W / 2, 250, (180, 180, 180), self.small_font, 'center', 'center')
        self.buttons = {}
        bw, bh = 240, 46
        cx = self.W / 2 - bw / 2
        self._make_btn('revive', cx, 280, bw, bh, "复活（无限次）")
        self._make_btn('exit', cx, 340, bw, bh, "退出游戏", (255, 255, 255, 40), (255, 255, 255))

    def _make_btn(self, key, x, y, w, h, label, color=(255, 200, 58), text_col=(58, 36, 0)):
        rect = pygame.Rect(x, y, w, h)
        self._button(rect, label, color, text_col)
        self.buttons[key] = rect

    # ============================================================
    # 状态切换
    # ============================================================
    def start_new_game(self, mode):
        self.clear_state()
        self.reset(mode)
        self.state = 'playing'
        self.has_save = False

    def continue_game(self):
        s = self.load_state()
        if not s:
            self.start_new_game(self.curMode)
            return
        self.restore_state(s)
        self.state = 'playing'

    def pause_game(self):
        if self.state != 'playing':
            return
        self.state = 'paused'
        self.save_state()
        self.has_save = True

    def resume_game(self):
        if self.state != 'paused':
            return
        self.state = 'playing'
        self.lastT = pygame.time.get_ticks()

    def revive(self):
        self.usedRevive = True
        self.monkey['hp'] = self.monkey['maxHp']
        self.monkey['inv'] = 1.5
        self.enemies = []
        self.state = 'playing'
        self.lastT = pygame.time.get_ticks()

    def exit_to_menu(self, from_death):
        self.commit_best_if_valid()
        if from_death:
            self.clear_state()
        else:
            self.save_state()
        self.has_save = os.path.exists(SAVE_FILE)
        self.state = 'menu'
        self.screen.fill((90, 67, 38))

    def game_over(self):
        self.state = 'dead'
        self.commit_best_if_valid()
        self.clear_state()
        self.has_save = False

    # ============================================================
    # 输入
    # ============================================================
    def point_to_lane(self, y):
        if self.state == 'playing':
            self.monkey['targetLane'] = self.lane_from_y(y)

    def handle_event(self, e):
        if e.type == pygame.VIDEORESIZE:
            self.W, self.H = e.w, e.h
            self.screen = pygame.display.set_mode((self.W, self.H), pygame.RESIZABLE)
            self._build_stars()
            if self.state != 'playing':
                self.monkey['y'] = self.lane_y(self.monkey['targetLane'])
            self.monkey['x'] = self.W * 0.22
        elif e.type == pygame.MOUSEMOTION:
            if self.state == 'playing':
                self.point_to_lane(e.pos[1])
        elif e.type == pygame.MOUSEBUTTONDOWN:
            mx, my = e.pos
            if self.state == 'playing':
                # 右上角暂停按钮
                if (self.W - 34 - 22) <= mx <= (self.W - 34 + 22) and (100 - 22) <= my <= (100 + 22):
                    self.pause_game()
                    return
                self.point_to_lane(my)
            elif self.state == 'menu':
                self._menu_click(mx, my)
            elif self.state == 'paused':
                self._pause_click(mx, my)
            elif self.state == 'dead':
                self._dead_click(mx, my)
        elif e.type == pygame.KEYDOWN:
            if e.key == pygame.K_ESCAPE or e.key == pygame.K_p:
                if self.state == 'playing':
                    self.pause_game()
                elif self.state == 'paused':
                    self.resume_game()
            elif self.state == 'playing' and e.key in (pygame.K_UP, pygame.K_DOWN, pygame.K_w, pygame.K_s):
                d = -1 if e.key in (pygame.K_UP, pygame.K_w) else 1
                self.monkey['targetLane'] = max(0, min(LANES - 1, self.monkey['targetLane'] + d))

    def _menu_click(self, mx, my):
        for k in MODE_KEYS:
            if 'mode_' + k in self.buttons and self.buttons['mode_' + k].collidepoint(mx, my):
                self.start_new_game(k)
                return
        if 'resume' in self.buttons and self.buttons['resume'].collidepoint(mx, my):
            self.continue_game()

    def _pause_click(self, mx, my):
        if 'resume' in self.buttons and self.buttons['resume'].collidepoint(mx, my):
            self.resume_game()
        elif 'restart' in self.buttons and self.buttons['restart'].collidepoint(mx, my):
            self.start_new_game(self.curMode)
        elif 'exit' in self.buttons and self.buttons['exit'].collidepoint(mx, my):
            self.exit_to_menu(False)

    def _dead_click(self, mx, my):
        if 'revive' in self.buttons and self.buttons['revive'].collidepoint(mx, my):
            self.revive()
        elif 'exit' in self.buttons and self.buttons['exit'].collidepoint(mx, my):
            self.exit_to_menu(True)

    # ============================================================
    # 主循环
    # ============================================================
    def run(self):
        running = True
        while running:
            for e in pygame.event.get():
                if e.type == pygame.QUIT:
                    if self.state == 'playing':
                        self.save_state()
                    running = False
                else:
                    self.handle_event(e)
            if self.state == 'playing':
                now = pygame.time.get_ticks()
                dt = min(0.05, (now - self.lastT) / 1000.0)
                self.lastT = now
                self.update(dt)
                if self.state == 'playing':
                    self.draw()
            elif self.state == 'menu':
                self.draw_menu()
            elif self.state == 'paused':
                self.draw_pause()
            elif self.state == 'dead':
                self.draw_dead()
            pygame.display.flip()
            self.clock.tick(60)
        pygame.quit()


if __name__ == '__main__':
    game = Game()
    game.run()
