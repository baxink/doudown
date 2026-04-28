async function base64Decode(str) {
    try {
        // 修复URL中的+号被解析为空格的问题
        const correctedStr = str.replace(/\s/g, '+');
        return decodeURIComponent(atob(correctedStr).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    } catch (err) {
        return null;
    }
}

async function md5Hash(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('MD5', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchWithTimeout(url, options, timeout = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

async function douyin_proxy(proxyurl, download = 'true') {
    try {
        new URL(proxyurl);
    } catch (err) {
        return {status: 400, data: {code: 400, msg: '无效的视频URL'}};
    }

    const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/mp4,video/x-m4v,video/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
        'Referer': 'https://douyin.com/'
    };

    const parsedProxyUrl = new URL(proxyurl);

    try {
        let response = await fetchWithTimeout(parsedProxyUrl.toString(), {
            method: 'GET',
            headers: baseHeaders,
            redirect: 'manual'
        }, 30000);

        let statusCode = response.status;
        let redirectCount = 0;
        const maxRedirects = 10;

        while (statusCode >= 300 && statusCode < 400 && redirectCount < maxRedirects) {
            const redirectUrl = response.headers.get('location');
            if (redirectUrl) {
                const newUrl = new URL(redirectUrl, proxyurl).href;
                response = await fetchWithTimeout(newUrl, {
                    method: 'GET',
                    headers: baseHeaders,
                    redirect: 'manual'
                }, 30000);
                statusCode = response.status;
                redirectCount++;
            } else {
                break;
            }
        }

        if (statusCode !== 200) {
            let errorMsg = `请求失败，HTTP状态码: ${statusCode}`;
            if (statusCode === 403) {
                errorMsg += '（可能需要更新Cookie或Referer头信息）';
            }
            return {status: statusCode, data: errorMsg};
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const filename = `douyin_video_${await md5Hash(proxyurl)}.mp4`;

        const responseHeaders = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };

        if (download !== 'false') {
            responseHeaders['Content-Disposition'] = `attachment; filename="${filename}"`;
            responseHeaders['Content-Transfer-Encoding'] = 'binary';
            responseHeaders['Expires'] = '0';
            responseHeaders['Cache-Control'] = 'must-revalidate';
            responseHeaders['Pragma'] = 'public';
        }

        return {
            status: 200,
            data: response.body,
            headers: responseHeaders
        };
    } catch (err) {
        return {status: 500, data: {code: 500, msg: '请求失败', error: err.message}};
    }
}

async function weibo_proxy(proxyurl, download = 'true') {
    if (!proxyurl) {
        return {status: 400, data: {code: 400, msg: '无效的视频URL'}};
    }

    try {
        new URL(proxyurl);
    } catch (err) {
        return {status: 400, data: {code: 400, msg: '无效的视频URL'}};
    }

    const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/mp4,video/x-m4v,video/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
        'Referer': 'https://weibo.com/'
    };

    const parsedProxyUrl = new URL(proxyurl);

    try {
        let response = await fetchWithTimeout(parsedProxyUrl.toString(), {
            method: 'GET',
            headers: baseHeaders,
            redirect: 'manual'
        }, 30000);

        let statusCode = response.status;
        let redirectCount = 0;
        const maxRedirects = 10;

        while (statusCode >= 300 && statusCode < 400 && redirectCount < maxRedirects) {
            const redirectUrl = response.headers.get('location');
            if (redirectUrl) {
                const newUrl = new URL(redirectUrl, proxyurl).href;
                response = await fetchWithTimeout(newUrl, {
                    method: 'GET',
                    headers: baseHeaders,
                    redirect: 'manual'
                }, 30000);
                statusCode = response.status;
                redirectCount++;
            } else {
                break;
            }
        }

        if (statusCode !== 200) {
            let errorMsg = `请求失败，HTTP状态码: ${statusCode}`;
            if (statusCode === 403) {
                errorMsg += '（可能需要更新Cookie或Referer头信息）';
            }
            return {status: statusCode, data: errorMsg};
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const filename = `weibo_video_${await md5Hash(proxyurl)}.mp4`;

        const responseHeaders = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'X-Proxy': 'weibo-proxy'
        };

        if (download !== 'false') {
            responseHeaders['Content-Disposition'] = `attachment; filename="${filename}"`;
            responseHeaders['Content-Transfer-Encoding'] = 'binary';
            responseHeaders['Expires'] = '0';
            responseHeaders['Cache-Control'] = 'must-revalidate';
            responseHeaders['Pragma'] = 'public';
        }

        return {
            status: 200,
            data: response.body,
            headers: responseHeaders
        };
    } catch (err) {
        return {status: 500, data: {code: 500, msg: '请求失败', error: err.message}};
    }
}

async function douyin_image_proxy(proxyurl, download = 'true') {
    try {
        new URL(proxyurl);
    } catch (err) {
        return {status: 400, data: {code: 400, msg: '无效的图片URL'}};
    }

    const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
        'Referer': 'https://douyin.com/'
    };

    const parsedProxyUrl = new URL(proxyurl);

    try {
        let response = await fetchWithTimeout(parsedProxyUrl.toString(), {
            method: 'GET',
            headers: baseHeaders,
            redirect: 'manual'
        }, 30000);

        let statusCode = response.status;
        let redirectCount = 0;
        const maxRedirects = 10;

        while (statusCode >= 300 && statusCode < 400 && redirectCount < maxRedirects) {
            const redirectUrl = response.headers.get('location');
            if (redirectUrl) {
                const newUrl = new URL(redirectUrl, proxyurl).href;
                response = await fetchWithTimeout(newUrl, {
                    method: 'GET',
                    headers: baseHeaders,
                    redirect: 'manual'
                }, 30000);
                statusCode = response.status;
                redirectCount++;
            } else {
                break;
            }
        }

        if (statusCode !== 200) {
            let errorMsg = `请求失败，HTTP状态码: ${statusCode}`;
            if (statusCode === 403) {
                errorMsg += '（可能需要更新Cookie或Referer头信息）';
            }
            return {status: statusCode, data: errorMsg};
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.split('/')[1] || 'jpg';
        const filename = `douyin_image_${await md5Hash(proxyurl)}.${ext}`;

        const responseHeaders = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'X-Proxy': 'douyin-image-proxy',
            'Cache-Control': 'public, max-age=86400'
        };

        if (download !== 'false') {
            responseHeaders['Content-Disposition'] = `attachment; filename="${filename}"`;
        }

        return {
            status: 200,
            data: response.body,
            headers: responseHeaders
        };
    } catch (err) {
        return {status: 500, data: {code: 500, msg: '请求失败', error: err.message}};
    }
}

async function weibo_image_proxy(proxyurl, download = 'true') {
    if (!proxyurl) {
        return {status: 400, data: {code: 400, msg: '无效的图片URL'}};
    }

    try {
        new URL(proxyurl);
    } catch (err) {
        return {status: 400, data: {code: 400, msg: '无效的图片URL'}};
    }

    const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
        'Referer': 'https://weibo.com/'
    };

    const parsedProxyUrl = new URL(proxyurl);

    try {
        let response = await fetchWithTimeout(parsedProxyUrl.toString(), {
            method: 'GET',
            headers: baseHeaders,
            redirect: 'manual'
        }, 30000);

        let statusCode = response.status;
        let redirectCount = 0;
        const maxRedirects = 10;

        while (statusCode >= 300 && statusCode < 400 && redirectCount < maxRedirects) {
            const redirectUrl = response.headers.get('location');
            if (redirectUrl) {
                const newUrl = new URL(redirectUrl, proxyurl).href;
                response = await fetchWithTimeout(newUrl, {
                    method: 'GET',
                    headers: baseHeaders,
                    redirect: 'manual'
                }, 30000);
                statusCode = response.status;
                redirectCount++;
            } else {
                break;
            }
        }

        if (statusCode !== 200) {
            let errorMsg = `请求失败，HTTP状态码: ${statusCode}`;
            if (statusCode === 403) {
                errorMsg += '（可能需要更新Cookie或Referer头信息）';
            }
            return {status: statusCode, data: errorMsg};
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.split('/')[1] || 'jpg';
        const filename = `weibo_image_${await md5Hash(proxyurl)}.${ext}`;

        const responseHeaders = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'X-Proxy': 'weibo-image-proxy',
            'Cache-Control': 'public, max-age=86400'
        };

        if (download !== 'false') {
            responseHeaders['Content-Disposition'] = `attachment; filename="${filename}"`;
        }

        return {
            status: 200,
            data: response.body,
            headers: responseHeaders
        };
    } catch (err) {
        return {status: 500, data: {code: 500, msg: '请求失败', error: err.message}};
    }
}

// 发送HEAD请求获取媒体类型
async function getMediaType(url, type) {
    try {
        const baseHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Connection': 'keep-alive'
        };

        if (type === 'douyin') {
            baseHeaders['Referer'] = 'https://douyin.com/';
        } else if (type === 'weibo') {
            baseHeaders['Referer'] = 'https://weibo.com/';
        }

        const response = await fetchWithTimeout(url, {
            method: 'HEAD',
            headers: baseHeaders,
            redirect: 'follow'
        }, 15000);

        const contentType = response.headers.get('content-type') || '';

        if (contentType.startsWith('image/')) {
            return 'image';
        } else if (contentType.startsWith('video/')) {
            return 'video';
        } else if (contentType.includes('image') || contentType.includes('picture')) {
            return 'image';
        } else if (contentType.includes('video') || contentType.includes('movie')) {
            return 'video';
        } else {
            // 默认使用video类型
            return 'video';
        }
    } catch (err) {
        console.error('获取媒体类型失败:', err.message);
        // 出错时默认使用video类型
        return 'video';
    }
}

async function handleRequest(request) {
    const urlObj = new URL(request.url, `https://${request.headers.get('host')}`);
    const proxyurl = urlObj.searchParams.get('proxyurl');
    const type = urlObj.searchParams.get('type') || 'douyin';
    const mediaType = urlObj.searchParams.get('mediatype');

    if (!proxyurl) {
        return new Response(JSON.stringify({code: 400, msg: 'proxyurl参数不能为空'}), {
            status: 400,
            headers: {'Content-Type': 'application/json; charset=utf-8'}
        });
    }

    let decodedUrl = await base64Decode(proxyurl);
    // 修复URL中的+号被解析为空格的问题
    const correctedProxyUrl = proxyurl.replace(/\s/g, '+');

    if (!decodedUrl) {
        try {
            decodedUrl = new TextDecoder().decode(new Uint8Array(Array.from(atob(correctedProxyUrl)).map(c => c.charCodeAt(0))));
        } catch (err) {
            return new Response(JSON.stringify({
                code: 400,
                msg: 'URL解码失败',
                original_url: proxyurl,
                corrected_url: correctedProxyUrl,
                error: err.message
            }), {
                status: 400,
                headers: {'Content-Type': 'application/json; charset=utf-8'}
            });
        }
    }

    let result;
    const download = urlObj.searchParams.get('download') || 'true';

    // 确定媒体类型
    let finalMediaType = mediaType;
    if (!finalMediaType) {
        // 自动识别媒体类型
        finalMediaType = await getMediaType(decodedUrl, type);
        console.log('自动识别媒体类型:', finalMediaType, 'URL:', decodedUrl);
    }

    if (finalMediaType === 'image') {
        if (type === 'weibo') {
            result = await weibo_image_proxy(decodedUrl, download);
        } else {
            result = await douyin_image_proxy(decodedUrl, download);
        }
    } else {
        if (type === 'weibo') {
            result = await weibo_proxy(decodedUrl, download);
        } else {
            result = await douyin_proxy(decodedUrl, download);
        }
    }

    if (result.data && typeof result.data === 'object' && result.data.code) {
        return new Response(JSON.stringify(result.data), {
            status: result.status,
            headers: {'Content-Type': 'application/json; charset=utf-8'}
        });
    }

    const responseHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...result.headers
    };

    return new Response(result.data, {
        status: result.status,
        headers: responseHeaders,
        cf: {
            streamLargeResponse: true
        }
    });
}

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});
