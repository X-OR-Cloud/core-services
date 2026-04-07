# SSE Streaming Support for Inference Proxy

**Date**: 2026-04-07
**Module**: Deployment (`services/aiwm/src/modules/deployment/`)
**Priority**: High — blocking production Pi agent deployment

---

## Background

Inference proxy hiện tại (`proxyToAPIProvider()`) luôn buffer toàn bộ response rồi trả JSON, kể cả khi client gửi `stream: true`. Điều này khiến:

- OpenAI SDK streaming parser fail (nhận JSON thay vì SSE chunks)
- Tool calls không được parse → agent không thể gọi tools
- Latency cao (8-30s chờ full response trước khi client nhận bất kỳ data nào)
- any-agent team phải monkey-patch `globalThis.fetch` làm workaround

Ref: `docs/aiwm/inference-endpoint-issues.md` (from any-agent team)

---

## Approach: Hybrid (Option C)

Phân nhánh dựa trên `req.body.stream`:

- `stream: false` (hoặc không gửi) → **giữ nguyên** logic hiện tại (axios → res.json)
- `stream: true` → **SSE passthrough** (axios stream → pipe → res)

### Tại sao passthrough?

- AIWM là transparent proxy — không parse/transform response
- Upstream provider chịu trách nhiệm format SSE
- Nếu provider không hỗ trợ streaming → trả lỗi hoặc JSON bình thường, client tự xử lý
- Không cần AIWM biết format cụ thể của từng provider

---

## Changes

### File: `deployment.service.ts` — method `proxyToAPIProvider()`

**Current** (line 696-738): Luôn dùng axios mặc định, `res.json(response.data)`

**New**: Thêm branch cho streaming:

```typescript
if (requestBody.stream === true) {
  // SSE streaming passthrough
  const response = await axios({
    method: req.method,
    url: targetUrl,
    data: requestBody,
    headers,
    timeout: 300000,
    responseType: 'stream',        // ← key change
    validateStatus: () => true,
  });

  // Set SSE headers
  res.setHeader('Content-Type', response.headers['content-type'] || 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.status(response.status);

  // Passthrough: pipe upstream stream directly to client
  // Parse last chunk for usage tracking
  let lastChunkData: string = '';

  response.data.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    lastChunkData = text;
    res.write(chunk);
  });

  response.data.on('end', () => {
    res.end();
    // Best-effort usage tracking from last chunk
    this.extractStreamingUsage(deployment._id, lastChunkData);
  });

  response.data.on('error', (err: Error) => {
    logger.error(`Stream error: ${err.message}`);
    res.end();
  });
} else {
  // Existing non-streaming logic (unchanged)
  ...
}
```

### Usage Tracking for Streaming

SSE streaming cuối cùng gửi chunk chứa `usage` (nếu client request `stream_options.include_usage: true`):

```
data: {"id":"...","usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}
data: [DONE]
```

Parse `lastChunkData` để extract usage. Nếu không có → skip (best-effort, không block response).

---

## Không thay đổi

- Schema, DTO, Controller — không cần sửa
- Non-streaming path — giữ nguyên 100%
- `proxyToSelfHosted()` — chưa implement, không liên quan
- Error handling cho non-streaming — giữ nguyên

## Test

1. `stream: false` → vẫn nhận JSON response như cũ
2. `stream: true` → nhận `Content-Type: text/event-stream` + SSE chunks
3. `stream: true` + `tools` → tool_calls chunks được stream đúng
4. Provider không hỗ trợ stream → error/JSON được forward nguyên vẹn
5. Connection drop mid-stream → stream end gracefully
