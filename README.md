# 猴子跑酷 Monkey Parkour

一个三端一致的跑酷小游戏：猴子在三条赛道上换道，收集勺子，躲避猪、鲨鱼、河马。
带血量 / 复活 / 金色最佳分数线 / 里程彩蛋 / 四模式。

## 玩法

- 拖动（鼠标或触摸）切换三条赛道，收勺子、躲动物。
- 动物碰撞体积递增、伤害递减；收勺回血；后期一击必杀。
- 背景有太阳月亮 24 小时轮转、里程彩蛋、金色最佳分数线。
- 死亡后可无限复活（复活后的成绩不计入历史最佳）。
- 四模式：简单 / 普通 / 极速 / 困难，分模式记录最佳。

## 三端版本

| 端 | 文件 | 运行方式 |
|----|------|----------|
| 网页版（纯静态） | `monkey_parkour.html` | 浏览器直接打开（双击即可） |
| tkinter 桌面版 | `monkey_parkour_tkinter.py` | `python monkey_parkour_tkinter.py`（仅标准库） |
| pygame 桌面版 | `monkey_parkour_pygame.py` | 需 `pygame-ce`：`pip install pygame-ce` 后 `python monkey_parkour_pygame.py` |

## 网页版进阶（带排行榜）

`web_app/` 是一个 Flask 应用，含 `index.html`、游戏页 `monkey_parkour.html`、`server.py`（SQLite 排行榜）。

```
cd web_app
pip install -r requirements.txt
python server.py
# 浏览器打开 http://localhost:5000
```

## 目录说明

- `monkey_parkour.html` —— 纯静态网页版（可直接双击打开）
- `monkey_parkour_tkinter.py` —— tkinter 桌面版
- `monkey_parkour_pygame.py` —— pygame 桌面版
- `web_app/` —— Flask 网页版（含排行榜服务端）
- `server.py` —— 根目录独立服务脚本
- `monkey_best.json` —— 本地最佳成绩（运行时自动生成，不入库）
- `leaderboard.db` —— 排行榜数据库（运行时自动生成，不入库）

## License

MIT
