<?php
/**
 * 去水印下载 - PHP 开发服务器路由
 * 将 /api/douyin 和 /api/xhs 映射到对应的 PHP 解析器
 * 并处理文件代理下载（?dl= 参数）
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// CORS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// ============================================================
// 文件代理下载（通用）
// ============================================================
function proxyDownload(string $dlUrl, string $filename, string $referer): void {
    if (empty($dlUrl)) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['code' => 400, 'msg' => 'dl参数为空'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 根据 URL 后缀判断 Content-Type
    $ext = strtolower(pathinfo(parse_url($dlUrl, PHP_URL_PATH) ?? '', PATHINFO_EXTENSION));
    $contentType = match ($ext) {
        'mp4', 'm4v', 'mov'     => 'video/mp4',
        'webm'                   => 'video/webm',
        'jpg', 'jpeg', 'jpe'    => 'image/jpeg',
        'png'                    => 'image/png',
        'gif'                    => 'image/gif',
        'webp'                   => 'image/webp',
        'heic', 'heif'          => 'image/heic',
        default                  => 'application/octet-stream',
    };

    header('Content-Type: ' . $contentType);
    header('Content-Disposition: attachment; filename*=UTF-8\'\'' . rawurlencode($filename));

    // 关闭输出缓冲以支持流式传输
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $dlUrl,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER     => [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept: */*',
            'Referer: ' . $referer,
        ],
    ]);
    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error || ($httpCode >= 400)) {
        // 如果已经发送了响应头，错误处理无法改变 Content-Type
        error_log("Proxy download failed: HTTP {$httpCode}, error: {$error}, url: {$dlUrl}");
    }
    exit;
}

// ============================================================
// API 路由
// ============================================================

if ($uri === '/api/douyin') {
    require __DIR__ . '/api/douyin/douyin.php';
    exit;
}

if ($uri === '/api/xhs') {
    // 文件代理下载
    if (isset($_GET['dl'])) {
        $dlUrl = $_GET['dl'];
        $filename = $_GET['filename'] ?? 'download';
        proxyDownload($dlUrl, $filename, 'https://www.xiaohongshu.com/');
    }

    // 解析请求
    require __DIR__ . '/api/xiaohongshu/xhsjx.php';
    exit;
}

// ============================================================
// 非 API 请求：交给 PHP 内置服务器处理静态文件
// ============================================================
return false;
