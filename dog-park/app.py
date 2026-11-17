# -*- coding: utf-8 -*-
"""
狗公园 · Virtual Dog Park —— 一键启动器

运行方式：
    python app.py

运行后会自动：
  1. 在本机起一个静态文件服务（只服务当前目录）
  2. 用默认浏览器打开 http://127.0.0.1:<端口>/index.html

零第三方依赖：只用到 Python 标准库（http.server / webbrowser / socket / threading）。
游戏本体是同目录下的 index.html（单文件，含全部样式、脚本与原创 SVG 插图）。
关掉方式：回到这个黑窗口按 Ctrl + C。
"""

import os
import socket
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 让服务器始终从「本文件所在目录」提供文件，避免从别处运行找不到 index.html
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class QuietHandler(SimpleHTTPRequestHandler):
    """只服务静态文件；把访问日志压掉，窗口更干净。出错时才打印。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, fmt, *args):
        # 需要调试时把下面这行注释打开即可看到每次请求
        # super().log_message(fmt, *args)
        pass


def pick_free_port(preferred=8765):
    """优先用 8765；被占用就让系统给一个空闲端口。"""
    for port in (preferred, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return s.getsockname()[1]
            except OSError:
                continue
    return 0


def main():
    port = pick_free_port()
    url = f"http://127.0.0.1:{port}/index.html"

    server = ThreadingHTTPServer(("127.0.0.1", port), QuietHandler)

    # 稍等服务器真正起来，再开浏览器，避免浏览器访问时连接被拒
    def open_later():
        webbrowser.open(url)

    threading.Timer(0.8, open_later).start()

    print("=" * 56)
    print("  狗公园已启动！")
    print(f"  浏览器地址：{url}")
    print("  如果浏览器没自动打开，手动复制上面地址到浏览器即可。")
    print("  游玩中请保持此窗口开着；结束请按 Ctrl + C。")
    print("=" * 56)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已关闭狗公园，慢走～")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
