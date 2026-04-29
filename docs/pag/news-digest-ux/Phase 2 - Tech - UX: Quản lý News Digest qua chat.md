# Phase 2 - Tech - UX: Quản lý News Digest qua chat

**Author:** ulva  
**Date:** 2026-04-29  
**Status:** Pending Review

---

## 1. Hiện trạng

### Đã có

| Feature | Cách hoạt động |
|---------|---------------|
| `UserNewsPreference` schema | `platformUserId`, `soulId`, `channelId`, `active`, `categories[]`, `language`, `frequency`, `deliveryTime`, `lastDeliveredAt` |
| `NewsDeliveryProcessor` | BullMQ sweep 2 lần/ngày (07:00 & 18:00 GMT+7) → gửi digest qua Zalo |
| `NewsDigestService.buildDigest()` | AI curation → Gemini → format văn bản thuần |
| Categories có sẵn | `world`, `politics`, `business`, `technology`, `life`, `entertainment`, `sports`, `education` |

### Thiếu

1. **Không có cách nào để user tự cài đặt News Digest qua chat** — hiện tại pref phải được insert thẳng vào DB
2. **LLM không biết news preferences của user** — `buildContents()` không inject news pref → AI không thể trả lời "tôi đang nhận tin tức gì?", "tắt tin tức giúp tôi"
3. **Không có quick commands** cho news management (`news`, `tin tức`, `cài tin tức`, `tắt tin tức`)
4. **Không có edge case handling** — user chưa cài → không có gì xảy ra; user muốn tắt → không có cách

---

## 2. Yêu cầu nghiệp vụ

| # | User story | Trigger |
|---|-----------|---------|
| R1 | "tin tức" / "news" → xem trạng thái digest hiện tại | exact keyword |
| R2 | "cài tin tức" → bắt đầu setup flow chọn categories, delivery time | exact keyword |
| R3 | "tắt tin tức" → disable digest ngay lập tức | exact keyword |
| R4 | "bật tin tức" → re-enable digest | exact keyword |
| R5 | LLM biết user đang dùng news preferences gì → trả lời tự nhiên | context injection |
| R6 | Webhook `news.delivery.*` gặp user chưa cài → bỏ qua (đã có) | guard trong processor |
| R7 | User nhắn tự nhiên "cho tôi xem tin tức" → AI hiểu và guide | LLM context |

---

## 3. Khoảng trống cần xử lý

### Gap 1: Không có quick commands cho news

`handleTaskCommand()` hiện chỉ xử lý: `xong`, `nhắc lại`, `quota`, `plan`.

→ Cần thêm `handleNewsCommand()` tương tự: bắt exact keywords, xử lý không qua LLM.

### Gap 2: LLM không có news context

`buildContents()` inject plan+quota nhưng không inject news preferences.

→ Cần thêm news pref vào prompt (tương tự block `THÔNG TIN GÓI CỦA NGƯỜI DÙNG`).

### Gap 3: Không có setup flow qua chat

Setup cần multi-turn: chọn categories → chọn giờ giao. Dữ liệu trung gian phải lưu tạm ở đâu đó (hoặc xử lý trong 1 turn).

→ **Approach được chọn:** Single-turn parse (không cần state machine). User gửi categories trong 1 câu, bot confirm và lưu. Nếu cần điều chỉnh, user gửi lại câu khác.

---

## 4. Proposed Approach

### 4.1 Quick Commands (không qua LLM)

Thêm method `handleNewsCommand()` vào `InboundProcessor`, gọi **trước** LLM call:

```
priority: handleTaskCommand → handleNewsCommand → LLM
```

| Keyword | Hành động |
|---------|-----------|
| `news` / `tin tức` | Xem trạng thái digest hiện tại |
| `cài tin tức` | Bắt đầu setup wizard |
| `tắt tin tức` / `dừng tin tức` | Set `active = false` |
| `bật tin tức` / `mở tin tức` | Set `active = true` |

**Match logic:** `text.toLowerCase().trim()` equals keyword (exact match, case-insensitive). Không dùng regex để tránh false positive.

### 4.2 Setup Flow — `cài tin tức`

**Single-pass approach:** Bot trả về 1 menu lựa chọn dạng văn bản thuần. User reply với lựa chọn. Bot parse reply đó.

**Turn 1 — Bot gửi menu:**
```
Bản tin hàng ngày của bạn ☕

Chọn chủ đề muốn nhận (gõ số, nhiều chủ đề cách nhau bằng dấu phẩy):
1. Thế giới & chính trị
2. Kinh doanh & tài chính  
3. Công nghệ
4. Đời sống & sức khỏe
5. Giải trí & thể thao
6. Giáo dục

Ví dụ: "1, 3, 4" → nhận tin Thế giới, Công nghệ, Đời sống
Hoặc "tất cả" để nhận tất cả chủ đề.

Sau đó chọn giờ giao:
M = Sáng (07:00)   |   E = Chiều (18:00)   |   B = Cả hai

Gõ tất cả trong 1 tin, ví dụ: "1, 3 - M"
```

**Turn 2 — User reply:** `"1, 3, 4 - B"` hoặc `"tất cả - M"`

**Turn 3 — Bot confirm & lưu:**
```
✅ Đã cài bản tin:
− Chủ đề: Thế giới, Công nghệ, Đời sống
− Giao: Sáng (07:00) & Chiều (18:00) GMT+7

Bản tin đầu tiên của bạn sẽ đến vào sáng mai. Gõ "tắt tin tức" bất cứ lúc nào để dừng.
```

**Parse logic trong `handleNewsCommand()`:**

```
Regex: /^([\d,\s]+|tất cả)\s*[-–]\s*([MEB])$/i
Group 1: categories string (e.g. "1, 3, 4" or "tất cả")
Group 2: frequency (M/E/B)
```

Map số → category slug:

| Số | Category slug | Tên hiển thị |
|----|--------------|-------------|
| 1 | world, politics | Thế giới & chính trị |
| 2 | business | Kinh doanh & tài chính |
| 3 | technology | Công nghệ |
| 4 | life | Đời sống & sức khỏe |
| 5 | entertainment, sports | Giải trí & thể thao |
| 6 | education | Giáo dục |

**Lưu pending state:** Dùng Conversation `metadata` hoặc Redis TTL key `pag:news:setup:{platformUserId}:{soulId}` = `"wizard_step1"` (TTL 5 phút). Khi user reply sau khi nhận menu → check key → parse.

> **Note:** Nếu không muốn thêm Redis key riêng, có thể dùng **single-message approach**: Menu + parse instructions inline, user gửi 1 tin "categories - frequency", bot parse và lưu ngay. Không cần state.

**Recommended: Single-message approach** (đơn giản hơn, không cần state):
- User gõ `cài tin tức`
- Bot reply menu + hướng dẫn gõ luôn trong 1 tin
- User gõ `"1, 3 - M"` → bot parse → lưu pref → confirm

### 4.3 Status View — `tin tức`

```
📰 Bản tin hàng ngày của bạn:
− Trạng thái: đang bật ✅
− Chủ đề: Thế giới, Công nghệ, Đời sống
− Giờ giao: Sáng 07:00 GMT+7

Gõ "cài tin tức" để thay đổi, "tắt tin tức" để dừng.
```

Nếu chưa cài:
```
📰 Bạn chưa cài bản tin hàng ngày.
Gõ "cài tin tức" để bắt đầu nhận tin hàng ngày từ TranGPT.
```

### 4.4 Tắt / Bật

**Tắt:**
```
✅ Đã tắt bản tin. Bạn sẽ không nhận tin tức hàng ngày nữa.
Gõ "bật tin tức" để bật lại bất cứ lúc nào.
```

**Bật lại:**
```
✅ Đã bật lại bản tin. Bạn sẽ nhận tin theo lịch cũ:
− Chủ đề: Thế giới, Công nghệ
− Giờ giao: Sáng 07:00 GMT+7
```

Nếu chưa từng cài khi gõ `bật tin tức`:
```
Bạn chưa cài bản tin. Gõ "cài tin tức" để bắt đầu.
```

### 4.5 LLM Context Injection

Thêm vào `buildContents()` — sau block plan/quota:

```
THÔNG TIN BẢN TIN CỦA NGƯỜI DÙNG:
− Trạng thái: đang bật / đã tắt / chưa cài
− Chủ đề: Thế giới, Công nghệ, Đời sống
− Giờ giao: Sáng 07:00 & Chiều 18:00 GMT+7
Nếu người dùng hỏi về bản tin, tin tức, news digest — hãy dùng thông tin trên để trả lời. Nếu chưa cài, hướng dẫn gõ "cài tin tức".
```

Load `UserNewsPreference` trong `process()` cùng lúc với plan/quota (parallel await).

---

## 5. Edge Cases

| Tình huống | Xử lý |
|-----------|-------|
| User gõ `cài tin tức` rồi không reply | Không cần cleanup — không có state |
| User gõ format sai (e.g. `"abc - M"`) | Bot báo lỗi + gửi lại menu |
| User gõ `tắt tin tức` khi chưa cài | "Bạn chưa cài bản tin nên không cần tắt. Gõ 'cài tin tức' nếu muốn bắt đầu." |
| User gõ `bật tin tức` khi chưa cài | Guide sang `cài tin tức` |
| `NewsDeliveryProcessor` sweep — pref `active: false` | `findActiveByFrequency()` filter `active: true` → bỏ qua |
| Delivery gặp Zalo -201 | Skip, không retry (đã implement) |
| User thay đổi categories → upsert pref | `findOneAndUpdate({ platformUserId, soulId }, ..., { upsert: true })` |

---

## 6. Implementation Plan

### Files cần thay đổi

| File | Thay đổi |
|------|---------|
| `inbound.processor.ts` | Thêm `handleNewsCommand()`, call trước LLM; inject news pref vào `buildContents()` |
| `inbound.processor.ts` | Load `UserNewsPreference` trong `process()` (parallel với plan/quota) |
| `user-news-prefs.service.ts` | Thêm `findByUser()`, `upsert()`, `setActive()` nếu chưa có |
| `processors.module.ts` | Import `UserNewsPrefsModule` nếu chưa có |

### Files không thay đổi

- `UserNewsPreference` schema — đủ fields, không cần thêm
- `NewsDeliveryProcessor` — không thay đổi
- `NewsDigestService` — không thay đổi

---

## 7. Sample Messages (Full Flow)

### Flow 1: Cài lần đầu

```
User:  cài tin tức

Bot:   📰 Cài bản tin hàng ngày ☕

       Chọn chủ đề (gõ số, cách nhau bằng dấu phẩy):
       1. Thế giới & chính trị
       2. Kinh doanh & tài chính
       3. Công nghệ
       4. Đời sống & sức khỏe
       5. Giải trí & thể thao
       6. Giáo dục

       Chọn giờ giao: M (Sáng 7h) / E (Chiều 18h) / B (Cả hai)

       Gõ trong 1 tin, ví dụ: "1, 3, 4 - M"

User:  1, 3, 4 - B

Bot:   ✅ Đã cài bản tin:
       − Chủ đề: Thế giới, Công nghệ, Đời sống
       − Giao: Sáng 07:00 & Chiều 18:00 GMT+7

       Bản tin đầu tiên sẽ đến sáng mai. Gõ "tắt tin tức" để dừng.
```

### Flow 2: Xem trạng thái

```
User:  tin tức

Bot:   📰 Bản tin hàng ngày của bạn:
       − Trạng thái: đang bật ✅
       − Chủ đề: Thế giới, Công nghệ, Đời sống
       − Giờ giao: Sáng 07:00 & Chiều 18:00 GMT+7

       Gõ "cài tin tức" để thay đổi, "tắt tin tức" để dừng.
```

### Flow 3: Tắt tin tức

```
User:  tắt tin tức

Bot:   ✅ Đã tắt bản tin. Bạn sẽ không nhận tin tức hàng ngày nữa.
       Gõ "bật tin tức" để bật lại bất cứ lúc nào.
```

### Flow 4: Hỏi tự nhiên qua LLM

```
User:  tôi đang nhận tin tức gì vậy?

Bot:   Bạn đang nhận bản tin hàng ngày về Thế giới, Công nghệ và
       Đời sống — giao vào sáng 7h và chiều 18h mỗi ngày.
       Bạn muốn thay đổi chủ đề hay giờ giao không? Gõ "cài tin tức" nhé!
```

### Flow 5: Chưa cài

```
User:  tin tức

Bot:   📰 Bạn chưa cài bản tin hàng ngày.
       Gõ "cài tin tức" để nhận tóm tắt tin nóng mỗi ngày từ TranGPT ☕
```

---

## 8. Technical Notes

### Parse Setup Reply

```typescript
const CATEGORY_MAP: Record<string, string[]> = {
  '1': ['world', 'politics'],
  '2': ['business'],
  '3': ['technology'],
  '4': ['life'],
  '5': ['entertainment', 'sports'],
  '6': ['education'],
};

const FREQ_MAP: Record<string, string> = { 'M': 'morning', 'E': 'evening', 'B': 'both' };

function parseSetupReply(text: string): { categories: string[]; frequency: string } | null {
  const m = text.trim().match(/^([\d,\s]+|tất cả)\s*[-–]\s*([MEB])$/i);
  if (!m) return null;
  const catPart = m[1].trim();
  const freqKey = m[2].toUpperCase();
  const frequency = FREQ_MAP[freqKey];
  let categories: string[];
  if (catPart.toLowerCase() === 'tất cả') {
    categories = ['world', 'politics', 'business', 'technology', 'life', 'entertainment', 'sports', 'education'];
  } else {
    categories = [...new Set(catPart.split(',').flatMap(n => CATEGORY_MAP[n.trim()] ?? []))];
  }
  if (!categories.length || !frequency) return null;
  return { categories, frequency };
}
```

### Pending State (cho wizard 2-turn nếu cần)

Dùng Redis TTL key: `pag:news:setup:{platformUserId}:{soulId}` = `"awaiting_reply"` (TTL 300s).

Khi user gửi tin tiếp theo → check key trong Redis → nếu tồn tại → parse setup reply → clear key.

> **Recommendation:** Bắt đầu với single-turn (user gửi `"1, 3 - M"` trong 1 tin). Nếu UX không tốt sau thực tế, mới chuyển sang 2-turn với Redis state.

### News Context Format cho LLM

```typescript
function buildNewsContext(pref: UserNewsPrefDocument | null): string {
  if (!pref) return 'Người dùng chưa cài bản tin hàng ngày. Nếu hỏi về tin tức, hướng dẫn gõ "cài tin tức".';
  if (!pref.active) return 'Bản tin hàng ngày: đã tắt. Gõ "bật tin tức" để bật lại.';
  const catNames = mapCategoriesToNames(pref.categories);
  const freqStr = pref.frequency === 'morning' ? 'Sáng 07:00' : pref.frequency === 'evening' ? 'Chiều 18:00' : 'Sáng 07:00 & Chiều 18:00';
  return `Bản tin hàng ngày: đang bật. Chủ đề: ${catNames}. Giao: ${freqStr} GMT+7.`;
}
```

---

## 9. Out of Scope (cho task này)

- Chọn nguồn tin cụ thể (sourceIds) — để sau
- Thay đổi ngôn ngữ qua chat — để sau
- Xem lại digest đã gửi — để sau
- Admin dashboard để quản lý prefs — để sau
