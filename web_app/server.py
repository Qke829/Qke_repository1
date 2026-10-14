"""
猴子跑酷 · 纯静态文件服务器（零依赖，使用 Python 标准库）
- 仅用于把 monkey_parkour.html 通过公网发布，供微信/浏览器直接打开
- 已移除所有云端排行榜接口（前端为纯单机游戏，无任何 fetch 调用）
运行：python server.py   （监听 $PORT，默认 5000）
"""
import os
import http.server
import socketserver

PORT = int(os.environ.get("PORT", 5000))
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serving on 0.0.0.0:{PORT}")
        httpd.serve_forever()
