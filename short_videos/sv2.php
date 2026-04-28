<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/8/6 上午12:59
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 短视频去水印聚合解析【单接口版】
*/

// 设置跨域和响应类型
header("Access-Control-Allow-Origin: *");
header('Content-Type: application/json; charset=utf-8');

/**
 * 解析短视频链接
 *
 * @param string $url 要解析的短视频链接
 * @return void
 */
function short_videos($url) {
    // 验证URL有效性
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        outputJson(['error' => '请提供有效的URL参数', 'Auther' => 'BugPk', 'website' => 'https://api.bugpk.com/'], 400);
    }

    // 定义API配置
    $apiConfig = [
        'base_url' => 'https://api.bugpk.com/api/short_videos',
        'timeout' => 30, // 超时时间(秒)
        'ssl_verify' => false // 生产环境建议开启SSL验证
    ];

    // 构建完整请求URL
    $requestUrl = $apiConfig['base_url'] . '?url=' . urlencode($url);

    // 执行请求
    $response = curlRequest($requestUrl, $apiConfig['timeout'], $apiConfig['ssl_verify']);

    if ($response === false) {
        outputJson(['error' => '接口请求失败', 'Auther' => 'BugPk', 'website' => 'https://api.bugpk.com/'], 500);
    }

    // 解析JSON响应
    $decodedResponse = json_decode($response, true);

    if (json_last_error() === JSON_ERROR_NONE) {
        outputJson($decodedResponse);
    } else {
        outputJson([
            'error' => '接口返回格式错误',
            'details' => json_last_error_msg(),
            'Auther' => 'BugPk',
            'website' => 'https://api.bugpk.com/'
        ], 500);
    }
}

/**
 * 发送cURL请求
 *
 * @param string $url 请求URL
 * @param int $timeout 超时时间(秒)
 * @param bool $sslVerify 是否验证SSL证书
 * @return string|false 响应内容或false
 */
function curlRequest($url, $timeout = 30, $sslVerify = false) {
    $ch = curl_init($url);

    // 设置cURL选项
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,    // 返回结果而非直接输出
        CURLOPT_FOLLOWLOCATION => true,   // 跟随重定向
        CURLOPT_SSL_VERIFYPEER => $sslVerify, // SSL证书验证
        CURLOPT_SSL_VERIFYHOST => $sslVerify ? 2 : 0,
        CURLOPT_TIMEOUT => $timeout,      // 超时时间
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        CURLOPT_NOBODY => false
    ]);

    $response = curl_exec($ch);

    // 记录错误信息
    if(curl_errno($ch)) {
        error_log('cURL Error [' . curl_errno($ch) . ']: ' . curl_error($ch));
        $response = false;
    }

    curl_close($ch);
    return $response;
}

/**
 * 输出JSON响应
 *
 * @param array $data 要输出的数据
 * @param int $statusCode HTTP状态码
 * @return void
 */
function outputJson($data, $statusCode = 200) {
    // 设置HTTP状态码
    http_response_code($statusCode);

    // 输出JSON
    echo json_encode($data, 480);
    exit;
}

// 处理请求参数
$url = null;
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $url = trim($_GET['url'] ?? '');
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $url = trim($_POST['url'] ?? '');
}

// 验证参数是否存在
if (empty($url)) {
    outputJson(['error' => '必须提供url参数', 'Auther' => 'BugPk', 'website' => 'https://api.bugpk.com/'], 400);
}

// 执行解析
short_videos($url);
?>
