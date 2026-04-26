/**
 * 去水印下载 - Cloudflare Worker
 * 支持：抖音、小红书 视频/图集解析 + 文件代理下载
 */

// ============ 工具函数 ============

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ============ 抖音解析 ============

async function parseDouyin(url) {
  try {
    // 1. 短链接跳转获取真实 URL
    const redirectRes = await fetchWithTimeout(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
      },
    }, 10000);

    let realUrl = url;
    const location = redirectRes.headers.get('location');
    if (location) {
      realUrl = location;
    }

    // 2. 提取视频 ID
    const idMatch = realUrl.match(/(?:video\/)(\d+)/) || realUrl.match(/(\d{19})/);
    if (!idMatch) {
      return { code: 400, msg: '无法解析视频 ID' };
    }
    const videoId = idMatch[1];

    // 3. 获取分享页面数据
    const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}`;
    const pageRes = await fetchWithTimeout(shareUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    }, 15000);

    const html = await pageRes.text();

    // 4. 提取 window._ROUTER_DATA
    const match = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s);
    if (!match || !match[1]) {
      return { code: 201, msg: '解析数据失败，请稍后重试' };
    }

    let videoInfo;
    try {
      videoInfo = JSON.parse(match[1].trim());
    } catch (e) {
      return { code: 201, msg: '数据解析失败' };
    }

    const loaderData = videoInfo?.loaderData?.['video_(id)/page'];
    if (!loaderData) {
      return { code: 201, msg: '数据结构异常' };
    }

    const item = loaderData?.videoInfoRes?.item_list?.[0];
    if (!item) {
      return { code: 201, msg: '未找到视频数据' };
    }

    // 5. 提取视频 URL（替换 playwm 为 play）
    let videoUrl = '';
    const playAddr = item?.video?.play_addr?.url_list?.[0];
    if (playAddr) {
      videoUrl = playAddr.replace('playwm', 'play');
    }

    // 6. 提取图集
    const images = [];
    const imgList = item?.images || [];
    for (const img of imgList) {
      if (img?.url_list?.[0]) {
        images.push(img.url_list[0]);
      }
    }

    // 7. 提取音乐
    let music = null;
    if (item?.music) {
      music = {
        title: item.music.title || '',
        author: item.music.author || '',
        avatar: item.music.cover_large?.url_list?.[0] || '',
        url: item.music.play_url?.url_list?.[0] || '',
      };
    }

    // 8. 返回数据
    const isImageSet = images.length > 0;
    return {
      code: 200,
      msg: '解析成功',
      data: {
        type: isImageSet ? 'image' : 'video',
        title: item.desc || '',
        cover: item.video?.cover?.url_list?.[0] || '',
        url: isImageSet ? `当前为图文解析，图文数量为:${images.length}张图片` : videoUrl,
        images: isImageSet ? images : [],
        author: {
          name: item.author?.nickname || '',
          id: item.author?.unique_id || '',
          avatar: item.author?.avatar_medium?.url_list?.[0] || '',
        },
        music: music || { title: '', author: '', avatar: '', url: '' },
        duration: item.video?.duration || null,
      },
    };
  } catch (err) {
    return { code: 500, msg: '解析异常: ' + err.message };
  }
}

// ============ 小红书解析 ============

async function parseXiaohongshu(url) {
  try {
    // 1. 获取重定向后的真实 URL
    const redirectRes = await fetchWithTimeout(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
      },
    }, 10000);

    let realUrl = url;
    const location = redirectRes.headers.get('location');
    if (location) {
      realUrl = location;
    }

    // 2. 提取笔记 ID
    const noteMatch = realUrl.match(/\/explore\/(\w+)/) || realUrl.match(/\/discovery\/item\/(\w+)/);
    if (!noteMatch) {
      return { code: 400, msg: '无法解析笔记 ID' };
    }
    const noteId = noteMatch[1];

    // 3. 获取小红书页面
    const pageRes = await fetchWithTimeout(realUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Referer': 'https://www.xiaohongshu.com/',
      },
    }, 15000);

    const html = await pageRes.text();

    // 4. 提取 initialState 数据
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?})<\/script>/s);
    if (!stateMatch) {
      // 尝试备用方案：从页面提取基本信息
      return fallbackParseXiaohongshu(html, noteId);
    }

    let state;
    try {
      state = JSON.parse(stateMatch[1]);
    } catch (e) {
      return fallbackParseXiaohongshu(html, noteId);
    }

    const note = state?.note?.noteDetailMap?.[noteId]?.note;
    if (!note) {
      return fallbackParseXiaohongshu(html, noteId);
    }

    // 5. 提取图片/视频
    const images = [];
    const imageList = note?.imageList || [];
    for (const img of imageList) {
      if (img?.urlDefault) {
        images.push(img.urlDefault);
      } else if (img?.url) {
        images.push(img.url);
      }
    }

    // 6. 提取视频
    let videoUrl = '';
    if (note?.video?.consumer?.originVideoKey) {
      videoUrl = note.video.consumer.originVideoKey;
    }

    // 7. 提取实况照片
    const livePhotos = [];
    if (note?.livePhotoVideoList) {
      for (let i = 0; i < imageList.length; i++) {
        if (note.livePhotoVideoList[i]) {
          livePhotos.push({
            image: imageList[i]?.urlDefault || imageList[i]?.url || '',
            video: note.livePhotoVideoList[i],
          });
        }
      }
    }

    return {
      code: 200,
      msg: '解析成功',
      data: {
        type: videoUrl ? 'video' : (livePhotos.length > 0 ? 'live' : 'image'),
        title: note.title || note.desc || '',
        cover: images[0] || '',
        url: videoUrl,
        images: images,
        live_photo: livePhotos,
        author: {
          name: note.user?.nickname || '',
          id: note.user?.userId || '',
          avatar: note.user?.avatar || '',
        },
        music: null,
      },
    };
  } catch (err) {
    return { code: 500, msg: '解析异常: ' + err.message };
  }
}

async function fallbackParseXiaohongshu(html, noteId) {
  // 备用解析：从 meta 标签提取信息
  const titleMatch = html.match(/<meta\s+name="description"\s+content="(.*?)"/i);
  const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="(.*?)"/i);

  return {
    code: 200,
    msg: '解析成功（基础模式）',
    data: {
      type: 'image',
      title: titleMatch ? titleMatch[1] : '',
      cover: ogImageMatch ? ogImageMatch[1] : '',
      url: '',
      images: ogImageMatch ? [ogImageMatch[1]] : [],
      live_photo: [],
      author: { name: '', id: '', avatar: '' },
      music: null,
    },
  };
}

// ============ 文件代理下载 ============

async function proxyFile(url, filename, type) {
  try {
    if (!url) {
      return jsonResponse({ code: 400, msg: 'URL 不能为空' }, 400);
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': type === 'weibo' ? 'https://weibo.com/' : 'https://douyin.com/',
    };

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
    }, 30000);

    if (!response.ok) {
      return jsonResponse({ code: response.status, msg: '请求失败: ' + response.status }, response.status);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const decodedFilename = filename ? decodeURIComponent(filename) : 'download';

    const responseHeaders = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Disposition': `attachment; filename="${decodedFilename}"; filename*=UTF-8''${encodeURIComponent(decodedFilename)}`,
    };

    return new Response(response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    return jsonResponse({ code: 500, msg: '代理失败: ' + err.message }, 500);
  }
}

// ============ 主入口 ============

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // 1. API 解析接口
    if (path === '/api/douyin') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return jsonResponse({ code: 400, msg: '请输入抖音链接' });
      }
      const result = await parseDouyin(targetUrl);
      return jsonResponse(result);
    }

    if (path === '/api/xhs') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return jsonResponse({ code: 400, msg: '请输入小红书链接' });
      }
      const result = await parseXiaohongshu(targetUrl);
      return jsonResponse(result);
    }

    // 2. 文件代理下载接口
    const dlUrl = url.searchParams.get('dl');
    if (dlUrl) {
      const filename = url.searchParams.get('filename') || 'download';
      const type = url.searchParams.get('type') || 'douyin';
      return proxyFile(dlUrl, filename, type);
    }

    // 3. 默认响应
    return jsonResponse({
      code: 200,
      msg: '去水印下载 Worker 运行中',
      endpoints: {
        douyin: '/api/douyin?url=抖音链接',
        xiaohongshu: '/api/xhs?url=小红书链接',
        download: '/?dl=文件URL&filename=文件名',
      },
    });
  },
};
