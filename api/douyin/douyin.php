<?php
/**
 * @Author: JH-Ahua (modified for local Node.js signer)
 * @tip: 抖音解析统一接口 - 通过 Node.js a_bogus 签名服务代理
 */

header("Access-Control-Allow-Origin: *");
header('Content-type: application/json');

// 获取请求参数
$url = null;
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $fullUrl = $_SERVER['REQUEST_URI'];
    $urlParamPos = strpos($fullUrl, 'url=');
    if ($urlParamPos !== false) {
        $encodedUrl = substr($fullUrl, $urlParamPos + 4);
        $url = urldecode($encodedUrl);
    }
} else {
    $url = $_POST['url'] ?? null;
}

if (!$url && isset($_GET['url'])) {
    $url = $_GET['url'];
}

// ============ 下载代理接口 ============
if (isset($_GET['dl'])) {
    $videoUrl = $_GET['dl'] ?? '';
    $filename = $_GET['filename'] ?? 'video.mp4';
    if (empty($videoUrl)) {
        header('Content-type: application/json');
        echo json_encode(['code' => 400, 'msg' => 'dl参数为空']);
        exit;
    }
    // 代理下载，流式转发
    header('Content-Type: video/mp4');
    header('Content-Disposition: attachment; filename*=UTF-8\'\''. rawurlencode($filename));
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $videoUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer: https://www.douyin.com/',
        'Accept: */*',
    ]);
    curl_exec($ch);
    curl_close($ch);
    exit;
}
// ======================================

if (empty($url)) {
    echo json_encode(['code' => 400, 'msg' => '请输入抖音链接', 'data' => []], 480);
    exit;
}

// Node.js signer 服务地址
$signerHost = '127.0.0.1';
$signerPort = 3456;

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "http://{$signerHost}:{$signerPort}/?url=" . urlencode($url));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
$error = curl_error($ch);
curl_close($ch);

if ($error || empty($response)) {
    echo json_encode(['code' => 500, 'msg' => '签名服务连接失败: ' . $error, 'data' => []], 480);
    exit;
}

echo $response;
