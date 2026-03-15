# Voice Media (ASR/TTS) — Design & Implementation Plan

## Tổng quan

Mở rộng `/ws/chat` và Connection worker (Telegram/Discord) để hỗ trợ:
- **ASR** (Automatic Speech Recognition): Audio → Text via Groq Whisper
- **TTS** (Text-to-Speech): Text → Audio via ElevenLabs

Nguyên tắc thiết kế:
- **Không phá vỡ** `/ws/chat` hiện tại — các field mới đều optional
- **Shared pipeline** — `VoiceMediaService` dùng chung cho cả WS chat và Connection worker
- **`/ws/voice`** để dành cho realtime voice streaming (WebRTC/PCM) về sau

---

## Phạm vi Phase 1

| Feature | WS Chat | Telegram | Discord |
|---------|---------|----------|---------|
| ASR: audio → text | ✅ | ✅ | ✅ |
| TTS: text → audio URL | ✅ (fire & forget) | ❌ phase 2 | ❌ phase 2 |
| TTS: sendVoice reply | — | ❌ phase 2 | ❌ phase 2 |

---

## Kiến trúc

### Shared VoiceMediaService

```
                    ┌─────────────────────┐
                    │   VoiceMediaService  │
                    │  ┌───────────────┐  │
                    │  │  AsrService   │  │  ← Groq Whisper
                    │  │  TtsService   │  │  ← ElevenLabs
                    │  └───────────────┘  │
                    └──────────┬──────────┘
                               │ inject
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ChatGateway         ConnectionRunner    (future: VoiceGateway)
    (ws/chat)           (con worker)
```

### Cấu trúc file

```
services/aiwm/src/modules/chat/
├── chat.gateway.ts          ← +inject VoiceMediaService, +~15 dòng trong handleSendMessage
├── chat.module.ts           ← +import VoiceMediaModule
└── voice-media/
    ├── voice-media.module.ts
    ├── voice-media.service.ts   ← orchestrator (transcribe / synthesize)
    ├── asr.service.ts           ← Groq Whisper
    └── tts.service.ts           ← ElevenLabs
```

---

## Flow chi tiết

### WS Chat — User gửi audio

```
Client records audio → base64 encode
→ message:send { role:'user', content:'', audioData: 'base64...', enableTts: true }
→ ChatGateway.handleSendMessage()
→ VoiceMediaService.transcribe(audioData) → Groq Whisper API
→ resolvedContent = "xin chào agent"
→ save Action { content: "xin chào agent", metadata.attachments[{type:'audio'}] }
→ broadcast message:new { content: "xin chào agent", transcribedText: "xin chào agent" }
→ Agent processes text bình thường
→ Agent: message:send { role:'assistant', content: "xin chào bạn!" }
→ broadcast message:new { content: "xin chào bạn!" }
→ [if enableTts] VoiceMediaService.synthesize() chạy async
→ emit message:audio { messageId, audioUrl/audioData }
→ Client plays audio
```

### Telegram Voice Note

```
User gửi voice note trên Telegram
→ TelegramAdapter._handleMessage() — bỏ filter `if (!text) return` cho audio
→ NormalizedInbound { text: '', attachments: [{ type:'audio', fileId:'...' }] }
→ ConnectionRunner._handleInbound()
→ VoiceMediaService.transcribeFromTelegram(fileId, botToken)
    → Telegram getFile API → download URL
    → Groq Whisper transcribe
    → return text
→ resolvedContent = "xin chào"
→ onMessageNew({ content: resolvedContent })
→ ChatGateway nhận text → Agent xử lý → reply text
→ TelegramAdapter.send() → bot.sendMessage() (phase 1)
```

---

## Điểm hook trong code hiện tại

### 1. `chat.gateway.ts` — `handleSendMessage()` (line 465)

```typescript
// Mở rộng DTO
dto: {
  conversationId?: string;
  role: string;
  content: string;
  type?: string;
  audioData?: string;    // NEW: base64 audio từ client
  audioUrl?: string;     // NEW: hoặc URL public
  enableTts?: boolean;   // NEW: client opt-in TTS response
}

// Hook trước khi save Action
let resolvedContent = dto.content;
if ((dto.audioData || dto.audioUrl) && dto.role !== 'assistant') {
  resolvedContent = await this.voiceMediaService.transcribe(dto.audioData, dto.audioUrl);
}
// ... tiếp tục dùng resolvedContent thay dto.content ...

// Hook sau broadcast (TTS — fire & forget)
if (dto.enableTts && dto.role === 'assistant') {
  this.voiceMediaService.synthesize(dto.content).then((audioUrl) => {
    client.emit('message:audio', { messageId: actionId, audioUrl });
  }).catch(() => {});
}
```

### 2. `telegram.adapter.ts` — `_handleMessage()` (line 58)

```typescript
// TRƯỚC (bị drop voice note):
const text = msg.text || msg.caption || '';
if (!text) return;

// SAU (cho phép audio đi qua):
const text = msg.text || msg.caption || '';
const attachments = this._extractAttachments(msg);
const hasAudio = attachments.some((a) => a.type === 'audio');
if (!text && !hasAudio) return;  // chỉ drop nếu không có cả text lẫn audio
```

### 3. `connection-runner.ts` — `_handleInbound()` (line 74)

```typescript
// Thêm ASR trước onMessageNew
let resolvedContent = msg.text;
if (!resolvedContent && msg.attachments?.some((a) => a.type === 'audio')) {
  resolvedContent = await this.voiceMediaService.transcribeFromAttachment(
    msg.attachments.find((a) => a.type === 'audio'),
    this.connection.provider,
    this.connection.config,
  );
}
this.onMessageNew({ ..., content: resolvedContent });
```

### 4. `connection-worker.service.ts`

Inject `VoiceMediaService` vào `ConnectionRunner` constructor khi tạo runner.

---

## VoiceMediaService API

```typescript
class VoiceMediaService {
  // WS Chat: nhận base64 hoặc URL
  async transcribe(audioData?: string, audioUrl?: string): Promise<string>

  // Connection worker: nhận attachment + provider context
  async transcribeFromAttachment(
    attachment: { type: string; fileId?: string; url?: string },
    provider: 'telegram' | 'discord',
    config: ConnectionConfig,
  ): Promise<string>

  // TTS: text → audio
  async synthesize(text: string, voiceId?: string): Promise<string>  // returns URL or base64
}
```

---

## AsrService — Groq Whisper

```typescript
// Provider: groq (npm: groq-sdk)
// Model: whisper-large-v3-turbo (nhanh nhất, tốt cost/perf)
// Fallback: whisper-large-v3 (chính xác hơn)

class AsrService {
  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const file = new File([audioBuffer], 'audio.ogg', { type: mimeType });
    const result = await this.groq.audio.transcriptions.create({
      model: 'whisper-large-v3-turbo',
      file,
    });
    return result.text;
  }
}
```

**Telegram flow để lấy audio buffer:**
```
fileId → bot.getFileLink(fileId) → download URL → fetch → Buffer
```

**Discord flow:**
```
attachment.url → fetch (với Discord CDN headers) → Buffer
```

---

## TtsService — ElevenLabs

```typescript
// Provider: elevenlabs (npm: elevenlabs)
// Model: eleven_flash_v2_5 (latency ~75ms, tốt cho realtime)
// eleven_multilingual_v2 nếu cần hỗ trợ tiếng Việt tốt hơn

class TtsService {
  async synthesize(text: string, voiceId?: string): Promise<Buffer> {
    const audio = await this.elevenlabs.textToSpeech.convert(
      voiceId || process.env.ELEVENLABS_VOICE_ID,
      {
        text,
        model_id: 'eleven_flash_v2_5',
        output_format: 'mp3_44100_128',
      },
    );
    return Buffer.from(await audio.arrayBuffer());
  }
}
```

**Output strategy:**
- WS Chat: trả base64 trực tiếp cho client (tránh cần storage)
- Telegram Phase 2: `bot.sendVoice(chatId, audioBuffer)`

---

## Socket Events — Thay đổi (backward compatible)

### `message:send` (Client → Server) — thêm optional fields

```typescript
{
  conversationId?: string;
  role: string;
  content: string;         // empty string nếu gửi audio
  type?: string;
  audioData?: string;      // NEW: base64 audio
  audioUrl?: string;       // NEW: public URL
  enableTts?: boolean;     // NEW: opt-in TTS
}
```

### `message:new` (Server → Client) — thêm optional fields

```typescript
{
  conversationId: string;
  role: string;
  content: string;          // text (đã transcribe nếu từ audio)
  transcribedText?: string; // NEW: text gốc từ ASR
  audioUrl?: string;        // NEW: TTS audio URL (nếu có)
  _id: string;
}
```

### `message:audio` (Server → Client) — **Event mới**

```typescript
{
  messageId: string;   // actionId của agent message
  audioUrl?: string;   // URL audio
  audioData?: string;  // hoặc base64 (nếu không có storage)
}
```

---

## Action Schema — Không thay đổi

`ActionAttachment` đã hỗ trợ sẵn:
```typescript
{
  type: 'audio',
  url: string,
  mimeType?: 'audio/ogg' | 'audio/webm' | 'audio/mp3',
}
```

Khi save Action cho audio message:
```typescript
metadata: {
  attachments: [{ type: 'audio', url: audioUrl, mimeType: 'audio/ogg' }],
}
```

---

## Environment Variables cần thêm

```bash
GROQ_API_KEY=<key>
ELEVENLABS_API_KEY=<key>
ELEVENLABS_VOICE_ID=<voice_id>   # default voice, có thể override per-agent
```

---

## Files cần sửa / tạo mới

| File | Loại | Thay đổi |
|------|------|---------|
| `modules/chat/voice-media/voice-media.module.ts` | Tạo mới | Module NestJS |
| `modules/chat/voice-media/voice-media.service.ts` | Tạo mới | Orchestrator |
| `modules/chat/voice-media/asr.service.ts` | Tạo mới | Groq Whisper |
| `modules/chat/voice-media/tts.service.ts` | Tạo mới | ElevenLabs |
| `modules/chat/chat.gateway.ts` | Sửa | +inject, +15 dòng trong handleSendMessage |
| `modules/chat/chat.module.ts` | Sửa | +import VoiceMediaModule |
| `modules/connection-worker/adapters/telegram.adapter.ts` | Sửa | Bỏ filter text-only cho audio |
| `modules/connection-worker/adapters/discord.adapter.ts` | Sửa | Tương tự |
| `modules/connection-worker/connection-runner.ts` | Sửa | +ASR hook, +VoiceMediaService inject |
| `modules/connection-worker/connection-worker.service.ts` | Sửa | +inject VoiceMediaService vào runner |

---

## Roadmap

### Phase 1 — ASR + TTS cơ bản
- [ ] Implement `VoiceMediaModule` (asr + tts services)
- [ ] Hook ASR vào `ChatGateway.handleSendMessage()`
- [ ] Hook TTS fire-and-forget cho agent responses
- [ ] Fix `TelegramAdapter` — hỗ trợ voice note
- [ ] Hook ASR vào `ConnectionRunner._handleInbound()`
- [ ] Inject `VoiceMediaService` vào `ConnectionRunner` qua `ConnectionWorkerService`

### Phase 2 — TTS reply về Telegram/Discord
- [ ] Mở rộng `OutboundHandler` type để hỗ trợ audio response
- [ ] `TelegramAdapter.sendVoice()`
- [ ] `DiscordAdapter.sendVoice()`

### Phase 3 — `/ws/voice` (Realtime Voice)
- [ ] WebRTC hoặc PCM stream qua Socket.IO binary frames
- [ ] Streaming ASR (Groq streaming transcription)
- [ ] Streaming TTS (ElevenLabs streaming)
- [ ] Voice Activity Detection (VAD)
