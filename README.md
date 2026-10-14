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

## 在线试玩（GitHub Pages）

本仓库已开启 GitHub Pages，根目录 `index.html` 会自动跳转到网页版游戏：

- 公网地址：`https://qke829.github.io/Qke_repository1/`
- 纯静态、零后端：游戏逻辑全在 `web_app/monkey_parkour.html` 内，成绩用浏览器 `localStorage` 本地保存，**无任何网络请求**。
- 每次 `git push` 到 `main` 即自动重新部署（约 1 分钟生效）。

## 本地运行网页版

```bash
cd web_app
python server.py          # 零依赖，仅用 Python 标准库起一个静态文件服务
# 浏览器打开 http://localhost:5000
```

> `web_app/server.py` 只是个标准库静态文件服务器，作用是「本地起服务方便打开」，**不是后端**。直接双击 `web_app/monkey_parkour.html` 也能玩。

## 目录说明

- `index.html` —— 仓库根入口，访问 Pages 时自动跳转到网页版游戏
- `monkey_parkour.html` —— 纯静态网页版（可直接双击打开）
- `monkey_parkour_tkinter.py` —— tkinter 桌面版
- `monkey_parkour_pygame.py` —— pygame 桌面版
- `web_app/` —— 移动端/浏览器版网页游戏（纯静态，含 `server.py` 本地静态服务脚本）
- `server.py` —— 根目录独立静态服务脚本
- `.gitignore` 已排除：运行时生成的 `monkey_best.json`、`leaderboard.db`、以及本地 `.workbuddy/`

## License

MIT
