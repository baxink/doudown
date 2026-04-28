# Douyin Parser (Cloudflare Workers) / 抖音解析（Cloudflare Workers）

## 简介（中文）

这是一个基于 Cloudflare Workers 的抖音链接解析接口实现，对齐本项目 `douyinnew/workers.js` 的逻辑。

它做的事情：

- 接收用户传入的 `url`（可以是抖音分享文案/短链/网页链接）
- 从文本中提取第一个 URL
- 跟随短链跳转，归一到抖音网页域名
- 提取 `aweme_id`
- 获取 `ttwid`
- 生成 `a_bogus`
- 调用抖音 `aweme/detail` 接口
- 将结果整理为统一 JSON：`{ code, msg, data }`

注意：本 Workers 版本**不包含**任何第三方接口/远程镜像兜底逻辑，只保留原始解析主链路。

---

## Overview (English)

This is a Douyin (TikTok CN) URL parser API implemented on Cloudflare Workers, matching the logic in
`douyinnew/workers.js`.

What it does:

- Accepts a user-provided `url` (share text / short link / web link)
- Extracts the first URL from the text
- Follows redirects and normalizes to Douyin web domains
- Extracts `aweme_id`
- Fetches `ttwid`
- Generates `a_bogus`
- Calls Douyin `aweme/detail`
- Outputs a unified JSON response: `{ code, msg, data }`

Note: This Workers version **does not** include any third-party fallback/proxy logic. Only the original core parsing
flow is kept.

---

## 接口说明 / API

### 请求 / Request

- **Method**: `GET` / `POST` / `OPTIONS`
- **Query Param**: `url` (required)
- **CORS**: `Access-Control-Allow-Origin: *`

Workers 会按以下优先级读取 `url`：

1. `GET ?url=...`
2. `POST application/json`：`{ "url": "..." }`
3. `POST application/x-www-form-urlencoded` 或 `multipart/form-data`：字段 `url=...`
4. `POST text/plain`：直接把 body 当作文本（会从中提取第一个 URL）

The Worker reads `url` in the following order:

1. `GET ?url=...`
2. `POST application/json`: `{ "url": "..." }`
3. `POST application/x-www-form-urlencoded` or `multipart/form-data`: field `url=...`
4. `POST text/plain`: treat the body as text and extract the first URL

---

## 使用示例 / Examples

将下面的 `<WORKER_URL>` 替换成你的 Workers 访问地址。

Replace `<WORKER_URL>` with your deployed Worker URL.

### 1) GET 方式 / GET

```bash
curl "<WORKER_URL>?url=https%3A%2F%2Fv.douyin.com%2Fxxxxxx%2F"
```

### 2) POST JSON / POST JSON

```bash
curl -X POST "<WORKER_URL>" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://v.douyin.com/xxxxxx/\"}"
```

### 3) POST 表单 / POST form

```bash
curl -X POST "<WORKER_URL>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "url=https://v.douyin.com/xxxxxx/"
```

### 4) POST 纯文本（分享文案）/ POST plain text (share text)

```bash
curl -X POST "<WORKER_URL>" \
  -H "Content-Type: text/plain; charset=utf-8" \
  --data "复制此链接，打开抖音查看： https://v.douyin.com/xxxxxx/ "
```

---

## 响应格式 / Response format

### 统一结构 / Unified envelope

所有请求都会返回 JSON：

```json
{
  "code": 200,
  "msg": "解析成功",
  "data": {}
}
```

- **code**:
    - `200`: success
    - `400`: invalid input / not a valid Douyin link
    - `404`: parsed but no playable content found
    - `500`: request/signing/runtime failure
- **msg**: human-readable message
- **data**: payload (empty array/object on failure)

### data 字段（成功时）/ `data` fields (on success)

`data` 会尽量对齐项目现有 PHP 版返回结构，常见字段：

- **type**: `"video"` / `"image"` / `"live"` / `"unknown"`
- **title**: 标题（一般取 `desc`）
- **desc**: 同 `title`
- **author**:
    - `name`: 作者昵称
    - `id`: 作者 id（uid/unique_id/short_id）
    - `avatar`: 头像
- **cover**: 封面 URL
- **music**:
    - `title`
    - `author`
    - `url`
    - `cover`
- **duration**: 时长（可能为 `null`）

当 `type=video`：

- **url**: 主视频直链（已尝试将 `playwm` 替换为 `play`）
- **video_backup**: 备选直链数组
- **video_id**: 视频 id（或 play_addr.uri / fallback）

当 `type=image`：

- **images**: 图片 URL 数组

当 `type=live`（实况图/动态照片）：

- **images**: 图片 URL 数组
- **live_photo**: 实况数组，每项：
    - `image`
    - `video`

---

## 部署说明 / Deployment

本仓库只提供 `workers.js` 单文件实现，你可以用以下方式部署：

- **Cloudflare Dashboard**: Workers & Pages → Workers → Create → 复制粘贴 `douyinnew/workers.js` 内容并保存部署
- **Wrangler**: 将 `workers.js` 作为入口文件部署（按你项目的 Wrangler 配置为准）

This repo provides a single-file `workers.js`. You can deploy via:

- **Cloudflare Dashboard**: Workers → Create → paste `douyinnew/workers.js` and deploy
- **Wrangler**: deploy using `workers.js` as the entry file (depending on your Wrangler setup)

---

## 常见问题 / FAQ

### 1) 为什么会返回 400？

可能原因：

- `url` 参数为空
- 传入文本里没有识别到 `http/https` 链接
- 短链跳转后不属于抖音网页域名（`www.douyin.com` / `www.iesdouyin.com`）

### 2) 为什么会返回 500？

可能原因：

- `ttwid` 获取失败或抖音风控导致接口返回异常
- `aweme/detail` 返回 HTML（WAF/风控）导致 JSON 解析失败
- 目标接口非 200

### 3) code=404 是什么情况？

表示已拿到详情结构，但没有组装出可播放的视频直链或有效图片列表。

### 4) 有没有兜底/代理？

没有。`douyinnew/workers.js` 明确移除了远程 douyin.php 镜像等兜底逻辑，只保留原始主解析链路。

---

## 文件位置 / File

- `douyinnew/workers.js`: Cloudflare Workers 入口与全部逻辑
- `douyinnew/README_WORKERS.md`: 本文档

