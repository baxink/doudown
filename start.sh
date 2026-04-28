#!/bin/bash
# 去水印服务一键启动脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "正在停止已有服务..."
pkill -f "node.*douyin-signer" 2>/dev/null
pkill -f "php -S localhost:8000" 2>/dev/null
sleep 1

echo "启动 Node.js 签名服务..."
node "$SCRIPT_DIR/douyin-signer.js" > /dev/null 2>&1 &
NODE_PID=$!

echo "启动 PHP 服务..."
php -S localhost:8000 -t "$SCRIPT_DIR" > /dev/null 2>&1 &
PHP_PID=$!

sleep 2

if curl -s http://localhost:3456/health > /dev/null 2>&1; then
    echo "✓ Node.js 服务启动成功 (端口 3456)"
else
    echo "✗ Node.js 服务启动失败"
fi

if curl -s http://localhost:8000 > /dev/null 2>&1; then
    echo "✓ PHP 服务启动成功 (端口 8000)"
else
    echo "✗ PHP 服务启动失败"
fi

echo ""
echo "访问: http://localhost:8000"

# 自动打开浏览器
if [[ "$OSTYPE" == "darwin"* ]]; then
    sleep 1
    open http://localhost:8000
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sleep 1
    xdg-open http://localhost:8000
elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    sleep 1
    start http://localhost:8000
fi

echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

wait
