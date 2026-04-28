<?php
/**
*@Author: JH-Ahua
*@CreateTime: 2025/6/13 下午3:36
*@email: admin@bugpk.com
*@blog: www.jiuhunwl.cn
*@Api: api.bugpk.com
*@tip: 微博短视频解析【官方接口】
*/
header("Access-Control-Allow-Origin: *");
// 定义常量
define('MAX_REDIRECTS', 5); // 最大重定向次数
define('TIMEOUT', 15); // 请求超时时间(秒)

/**
 * 主处理函数
 */
function main()
{
    // 处理请求方法
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $params = $_GET;
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $params = $_POST;
    } else {
        outputError('仅支持GET或POST请求', 405);
    }

    // 验证并获取参数
    $url = getParam($params, 'url', '');
    // 参数验证
    if (empty($url)) {
        outputError('参数url不能为空', 400);
    }


    // 提取视频ID
    $videoId = extractVideoId($url);
    if (empty($videoId)) {
        outputError("无法从URL中提取视频ID: {$url}", 404);
    }
    // 获取请求头
    $headers = getRequestHeaders();

    // 请求API获取视频信息
    $apiResponse = fetchVideoInfo($videoId, $headers);

    // 输出结果
    outputSuccess($apiResponse);
}

/**
 * 从参数数组中获取参数，带安全过滤
 * @param array $params 参数数组
 * @param string $key 参数键名
 * @param mixed $default 默认值
 * @param int $filter 过滤类型
 * @return mixed 处理后的参数值
 */
function getParam($params, $key, $default = null, $filter = FILTER_SANITIZE_STRING)
{
    return isset($params[$key]) ? filter_var($params[$key], $filter) : $default;
}

/**
 * 从微博视频URL中提取视频ID
 * @param string $url 微博视频URL
 * @return string 提取的视频ID，失败返回空字符串
 */
function extractVideoId($url)
{
    $id = '';

    // 模式1: video.weibo.com/show
    if (strpos($url, 'video.weibo.com/show') !== false) {
        $parsedUrl = parse_url($url);
        if (isset($parsedUrl['query'])) {
            parse_str($parsedUrl['query'], $queryParams);
            $id = isset($queryParams['fid']) ? $queryParams['fid'] : '';
        }
    } // 模式2: weibo.com/tv/show
    else if (strpos($url, 'weibo.com/tv/show') !== false) {
        $pattern = '/weibo\.com\/tv\/show\/([^?&]+)/';
        if (preg_match($pattern, $url, $matches)) {
            $id = isset($matches[1]) ? $matches[1] : '';
        }
    } // 模式3: 短链接处理
    else if (strpos($url, 't.cn/') !== false) {
        $redirectUrl = getRedirectUrl($url);
        if (!empty($redirectUrl)) {
            return extractVideoId($redirectUrl);
        }
    }

    return $id;
}

/**
 * 获取重定向后的URL
 * @param string $url 原始URL
 * @return string 重定向后的URL，失败返回空字符串
 */
function getRedirectUrl($url)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_NOBODY, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, TIMEOUT);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, CONNECTION_TIMEOUT);

    curl_exec($ch);
    $redirectUrl = curl_getinfo($ch, CURLINFO_REDIRECT_URL);
    curl_close($ch);

    return $redirectUrl;
}

/**
 * 获取请求头数组
 * @param string $referer 自定义referer
 * @return array 请求头数组
 */
function getRequestHeaders()
{
    return [
        'cookie: ' . getCookie(),
        'referer: https://weibo.com/',
        'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    ];
}

/**
 * 获取Cookie，可在此处添加动态Cookie获取逻辑
 * @return string Cookie字符串
 */
function getCookie()
{
    // 实际应用中可实现动态Cookie获取，如从数据库读取或通过登录获取
    return 'SUB=_2AkMfFmU_f8NxqwFRmvkWzGrqbIt2zA3EieKpSpTkJRMxHRl-yT9kqmE8tRB6NJZL0M6C_1oEOnh9yqIOVA80rQqt6NcX; SUBP=0033WrSXqPxfM72-Ws9jqgMF55529P9D9W5zakNEPhSYpAFjGDJ2wn0W; _s_tentry=passport.weibo.com; Apache=7094693300415.298.1749740041909; SINAGLOBAL=7094693300415.298.1749740041909; ULV=1749740041974:1:1:1:7094693300415.298.1749740041909:; WBPSESS=LKUy5Npwn5zVNZX-hrYAMCtgRKCpBOAQYN_DEoweut6xx3CBGNvnlySn4uBpFMEMoXOJXLPRmC47nWOg5psVsQ0OJg7B8KpobiCcLMAMnDzAvoAw7SpGuWfsmTBg5Pq7';
}

/**
 * 请求微博API获取视频信息
 * @param string $videoId 视频ID
 * @param array $headers 请求头数组
 * @return array API响应数据
 */
function fetchVideoInfo($videoId, $headers)
{
    $apiUrl = 'https://weibo.com/tv/api/component';
    $pagePath = "/tv/show/{$videoId}";
    $requestUrl = "{$apiUrl}?page=" . urlencode($pagePath);

    // 构建请求数据
    $requestData = [
        'Component_Play_Playinfo' => ['oid' => $videoId]
    ];
    $postData = 'data=' . urlencode(json_encode($requestData));

    // 发送请求
    $response = sendCurlRequest($requestUrl, $postData, $headers, true);
    if (empty($response)) {
        return ['code' => 500, 'msg' => 'API请求失败，无响应数据'];
    }

    // 解析响应
    $responseData = json_decode($response, true);
    if (JSON_ERROR_NONE !== json_last_error()) {
        return ['code' => 500, 'msg' => 'API响应解析失败', 'raw' => $response];
    }

    // 处理API响应
    if (isset($responseData['code']) && $responseData['code'] == "100000") {
        $proxyBase = "https://api.bugpk.com/api/weibo?proxyurl=";
        $videoInfo = $responseData['data']['Component_Play_Playinfo'];

        // 提取所有可用画质
        $qualityUrls = [];
        if (isset($videoInfo['urls']) && is_array($videoInfo['urls'])) {
            foreach ($videoInfo['urls'] as $quality => $url) {
                $qualityUrls[$quality] = $proxyBase . base64_encode('https:' . $url);
            }
        }

        return [
            'code' => 200,
            'msg' => '解析成功',
            'data' => [
                'author' => $videoInfo['author'],
                'author_id' => $videoInfo['author_id'],
                'followers_count' => $videoInfo['followers_count'],
                'reposts_count' => $videoInfo['reposts_count'],
                'comments_count' => $videoInfo['comments_count'],
                'attitudes_count' => $videoInfo['attitudes_count'],
                'play_count' => $videoInfo['play_count'],
                'ip_info_str' => $videoInfo['ip_info_str'],
                'avatar' => $proxyBase . base64_encode('https:' . $videoInfo['avatar']),
                'date' => $videoInfo['date'],
                'title' => $videoInfo['title'],
                'cover' => $proxyBase . base64_encode('https:' . $videoInfo['cover_image']),
                'quality_urls' => $qualityUrls,
                'default_quality' => '高清 720P',
                'url' => $qualityUrls['高清 720P'] ?? '',
                'download_url' => ($qualityUrls['高清 720P'] ?? '') . '&download=true'
            ]
        ];
    } else {
        $errorMsg = '解析失败';
        if (isset($responseData['msg'])) {
            $errorMsg = $responseData['msg'];
        } elseif (isset($responseData['error'])) {
            $errorMsg = $responseData['error'];
        }
        return ['code' => 404, 'msg' => $errorMsg];
    }
}

/**
 * 发送cURL请求
 * @param string $url 请求URL
 * @param string $postData POST数据
 * @param array $headers 请求头
 * @param bool $isJsonResponse 是否期望JSON响应
 * @param bool $isDownload 是否为下载请求
 * @return mixed 响应内容，失败返回false
 */
function sendCurlRequest($url, $postData = '', $headers = [], $isJsonResponse = false, $isDownload = false)
{
    $ch = curl_init();

    // 设置基本选项
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, MAX_REDIRECTS);
    curl_setopt($ch, CURLOPT_TIMEOUT, TIMEOUT);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, CONNECTION_TIMEOUT);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // 生产环境应设为true并验证证书
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);      // 生产环境应设为2

    // 设置请求头
    if (!empty($headers)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    // 设置POST请求
    if (!empty($postData)) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    }

    // 下载请求特殊处理
    if ($isDownload) {
        curl_setopt($ch, CURLOPT_BINARYTRANSFER, true);
    }

    // 执行请求
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    // 处理错误
    if ($error) {
        if ($isJsonResponse) {
            return ['code' => 500, 'msg' => "cURL错误: {$error}"];
        } else {
            return false;
        }
    }

    // 处理HTTP错误
    if ($httpCode >= 400) {
        if ($isJsonResponse) {
            return ['code' => $httpCode, 'msg' => "API请求失败，HTTP状态码: {$httpCode}"];
        } else {
            return false;
        }
    }

    return $response;
}


/**
 * 输出成功响应
 * @param mixed $data 响应数据
 */
function outputSuccess($data)
{
    header('Content-Type: application/json');
    echo json_encode($data, 480);
    exit;
}

/**
 * 输出错误响应
 * @param string $message 错误信息
 * @param int $code 错误码
 */
function outputError($message, $code = 500)
{
    header("Content-Type: application/json");
    header("HTTP/1.1 {$code} " . getHttpStatusMessage($code));
    echo json_encode(['error' => $message, 'code' => $code], 480);
    exit;
}

/**
 * 获取HTTP状态码对应的消息
 * @param int $code HTTP状态码
 * @return string 状态消息
 */
function getHttpStatusMessage($code)
{
    $messages = [
        200 => 'OK',
        400 => 'Bad Request',
        401 => 'Unauthorized',
        403 => 'Forbidden',
        404 => 'Not Found',
        405 => 'Method Not Allowed',
        500 => 'Internal Server Error',
        503 => 'Service Unavailable'
    ];
    return isset($messages[$code]) ? $messages[$code] : 'Unknown Error';
}

// 执行主函数
main();
?>
