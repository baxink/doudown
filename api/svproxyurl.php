<?php

/**
*@Author: JH-Ahua
*@CreateTime: 2025/12/27 下午11:28
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 短视频代理url,防止抖音、微博解析出来的视频403
*/

header("Access-Control-Allow-Origin: *");
header('Content-Type: application/json');

function main()
{
    $params = [];
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $params = $_GET;
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $params = $_POST;
    } else {
        http_response_code(405);
        echo json_encode(['error' => '仅支持GET或POST请求', 'code' => 405]);
        exit;
    }

    $proxyurl = base64_decode(getParam($params, 'proxyurl', ''));
    $type = getParam($params, 'type', 'douyin');

    if (empty($proxyurl)) {
        http_response_code(400);
        echo json_encode(['error' => '参数proxyurl不能为空', 'code' => 400]);
        exit;
    }

    if ($type === 'weibo') {
        weibo_proxy($proxyurl);
    } else {
        douyin_proxy($proxyurl);
    }
}

function getParam($params, $key, $default = null)
{
    return isset($params[$key]) ? trim($params[$key]) : $default;
}

function weibo_proxy($proxyurl)
{
    // 1. 验证输入有效性
    if (empty($proxyurl) || !filter_var($proxyurl, FILTER_VALIDATE_URL)) {
        http_response_code(400);
        echo json_encode(['code' => 400, 'msg' => '无效的视频URL']);
        return;
    }

    // 2. 构建完整请求头（模拟浏览器行为，解决403）
    $baseHeaders = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept: video/mp4,video/x-m4v,video/*;q=0.9,*/*;q=0.8',
        'Accept-Language: zh-CN,zh;q=0.9',
        'Connection: keep-alive',
        'Referer: https://weibo.com/' // 关键：模拟微博站内请求
    ];

    // 3. 初始化cURL并配置流式输出
    $ch = curl_init();
    if ($ch === false) {
        http_response_code(500);
        echo json_encode(['code' => 500, 'msg' => 'cURL初始化失败']);
        return;
    }

    // 存储响应头信息（用于获取Content-Type）
    $responseHeaders = [];

    // 核心配置：流式输出+头信息捕获
    curl_setopt_array($ch, [
        CURLOPT_URL            => $proxyurl,
        CURLOPT_RETURNTRANSFER => false, // 关闭字符串返回，启用流式输出
        CURLOPT_HTTPHEADER     => $baseHeaders,
        CURLOPT_FOLLOWLOCATION => true, // 跟随重定向
        CURLOPT_SSL_VERIFYPEER => false, // 生产环境建议开启并配置CA证书
        CURLOPT_SSL_VERIFYHOST => false, // 生产环境建议设为2
        CURLOPT_TIMEOUT        => 1800, // 5分钟超时（视频传输需充足时间）
        CURLOPT_CONNECTTIMEOUT => 10, // 连接超时10秒
        CURLOPT_LOW_SPEED_LIMIT => 1024, // 最低传输速度（字节/秒）
        CURLOPT_LOW_SPEED_TIME  => 30,   // 低于最低速度持续30秒则中断（避免无限等待）
        // 捕获响应头
        CURLOPT_HEADERFUNCTION => function ($curl, $header) use (&$responseHeaders) {
            $len = strlen($header);
            $headerParts = explode(':', $header, 2);
            if (count($headerParts) >= 2) {
                $key = strtolower(trim($headerParts[0]));
                $responseHeaders[$key] = trim($headerParts[1]);
            }
            return $len;
        },
        // 流式输出回调（核心：边下载边输出，不占大量内存）
        CURLOPT_WRITEFUNCTION  => function ($ch, $data) {
            echo $data;
            // 强制刷新缓冲区，确保视频流实时传输
            if (ob_get_length() > 0) ob_flush();
            flush();
            return strlen($data); // 必须返回实际处理的字节数
        }
    ]);

    // 4. 发送响应头（在输出视频内容前）
    $contentType = $responseHeaders['content-type'] ?? 'application/octet-stream';
    if (ob_get_length() > 0) ob_clean(); // 清理缓冲，避免头信息混乱
    // 下载模式：设置文件下载头
    $filename = 'weibo_video_' . md5($proxyurl) . '.mp4'; // 更友好的文件名
    header('Content-Type: ' . $contentType);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Transfer-Encoding: binary');
    header('Expires: 0');
    header('Cache-Control: must-revalidate');
    header('Pragma: public');

    // 5. 执行请求并处理错误
    curl_exec($ch);
    $curlErrno = curl_errno($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // 6. 错误处理
    if ($curlErrno !== 0) {
        $errorMsg = '视频传输失败: ' . curl_strerror($curlErrno);
        error_log($errorMsg . ' URL: ' . $proxyurl); // 记录错误日志
        echo "\n" . $errorMsg; // 输出错误信息（已部分传输时追加显示）
    } elseif ($httpCode != 200) {
        $errorMsg = '请求失败，HTTP状态码: ' . $httpCode;
        if ($httpCode == 403) {
            $errorMsg .= '（可能需要更新Cookie或Referer头信息）';
        }
        error_log($errorMsg . ' URL: ' . $proxyurl);
        echo "\n" . $errorMsg;
    }
}

function douyin_proxy($proxyurl)
{
    if (empty($proxyurl)) {
        http_response_code(400);
        echo json_encode(['code' => 4001, 'msg' => '视频URL不能为空']);
        return;
    }

    $proxyurl = trim($proxyurl);
    $proxyurl = preg_replace('/[\x00-\x1F\x7F]/', '', $proxyurl);

    $isValid = (
        (substr($proxyurl, 0, 7) === 'http://' || substr($proxyurl, 0, 8) === 'https://')
        && strpos($proxyurl, '.') !== false
    );

    if (!$isValid) {
        http_response_code(400);
        echo json_encode(['code' => 4002, 'msg' => '视频URL格式无效']);
        exit;
    }

    $baseHeaders = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept: video/mp4,video/x-m4v,video/*;q=0.9,*/*;q=0.8',
        'Accept-Language: zh-CN,zh;q=0.9',
        'Connection: keep-alive',
        'Referer: https://douyin.com/'
    ];

    $ch = curl_init();
    if ($ch === false) {
        http_response_code(500);
        echo json_encode(['code' => 500, 'msg' => 'cURL初始化失败']);
        return;
    }

    $responseHeaders = [];

    curl_setopt_array($ch, [
        CURLOPT_URL => $proxyurl,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_HTTPHEADER => $baseHeaders,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 300,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HEADERFUNCTION => function ($curl, $header) use (&$responseHeaders) {
            $len = strlen($header);
            $headerParts = explode(':', $header, 2);
            if (count($headerParts) >= 2) {
                $key = strtolower(trim($headerParts[0]));
                $responseHeaders[$key] = trim($headerParts[1]);
            }
            return $len;
        },
        CURLOPT_WRITEFUNCTION => function ($ch, $data) {
            echo $data;
            if (ob_get_length() > 0) ob_flush();
            flush();
            return strlen($data);
        }
    ]);

    $contentType = $responseHeaders['content-type'] ?? 'application/octet-stream';
    if (ob_get_length() > 0) ob_clean();

    $filename = 'douyin_' . md5($proxyurl) . '.mp4';
    header('Content-Type: ' . $contentType);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Transfer-Encoding: binary');
    header('Expires: 0');
    header('Cache-Control: must-revalidate');
    header('Pragma: public');

    curl_exec($ch);
    $curlErrno = curl_errno($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($curlErrno !== 0) {
        $errorMsg = '视频传输失败: ' . curl_strerror($curlErrno);
        error_log($errorMsg . ' URL: ' . $proxyurl);
        echo "\n" . $errorMsg;
    } elseif ($httpCode != 200) {
        $errorMsg = '请求失败，HTTP状态码: ' . $httpCode;
        if ($httpCode == 403) {
            $errorMsg .= '（可能需要更新Cookie或Referer头信息）';
        }
        error_log($errorMsg . ' URL: ' . $proxyurl);
        echo "\n" . $errorMsg;
    }
}

main();
