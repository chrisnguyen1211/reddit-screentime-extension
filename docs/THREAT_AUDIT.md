# Audit rủi ro phát hiện — Reddit Growth Lab (v2.1.0)

Đối chiếu code extension với mô hình đa tín hiệu (fingerprint + behavior + account).  
**Không** phải pen-test Reddit. Mục tiêu: chỉ ra extension **đang tạo tín hiệu gì**, mức độ, và mitigation.

> Cập nhật v2.1: stealth UI, session max, human-submit-only, sub lock, draft dedupe, distribution quotas — xem [DISTRIBUTION.md](./DISTRIBUTION.md).

## Tóm tắt executive

| Mức | Ý nghĩa |
|-----|---------|
| 🔴 Cao | Tín hiệu mạnh, khó “giả người” bằng config |
| 🟠 Trung bình | Có thể giảm bằng nhịp/config/account hygiene |
| 🟢 Thấp / đã có mitigation | Đã randomize hoặc soft-gate |

**Kết luận ngắn:** Extension **không** bị “chỉ vì IP”. Vấn đề chính là **hành vi synthetic + pattern automation + content LLM/seed** trên **cùng browser profile** — IP/VPN chỉ là 1 lớp.

---

## 1. Device / browser fingerprint

### 1.1 Extension inject = fingerprint 🔴

| Tín hiệu | Trong code | Rủi ro |
|----------|------------|--------|
| Content scripts + CSS cố định | `manifest` inject `.rch-mascot`, `#rgl-overlay-root`, `.rch-trigger` | DOM node lạ, class prefix `rch-`/`rgl-` unique |
| Z-index cực cao | `2147483000+` | Hay gặp tool extension |
| MutationObserver full tree | `20-assist-ui.js` inject nút ✨ | Timing inject lặp theo lazy-load |
| `chrome.runtime` / storage | Badge, storage keys `rgl_*` | Extension ID + storage shape (nếu bị scan client) |

Reddit **có thể** không “đọc” chrome.storage, nhưng **có thể** quan sát DOM/behavior. Overlay + Bram **rất dễ** fingerprint nếu họ so DOM tree / mutation pattern.

**Mitigation hiện có (v2.1):** `rgl_stealthUi` → class `html.rgl-stealth` làm mờ mascot/overlay (opacity thấp).  
**Vẫn còn:** Class prefix `rch-`/`rgl-` cố định; randomize class names (khó reverse) chưa làm.

### 1.2 Canvas / WebGL / Audio fingerprint 🟢

Extension **không** vẽ canvas hay WebGL riêng. Fingerprint browser vẫn là của Chrome user — **không xấu thêm**, cũng **không che** được.

### 1.3 Cookie / session 🟠

Extension dùng session login bình thường → cookie `reddit_session` gắn account.  
Automation **cùng session** → mọi bot action gắn thẳng account (đúng cách Reddit muốn).

VPN đổi IP **không** tách fingerprint cookie + device.

### 1.4 Clipboard API 🟠

`clipboardWrite` + `navigator.clipboard.writeText` khi fill Lexical.  
Ít khi là ban signal một mình, nhưng **pattern paste hàng loạt** + comment burst = hành vi bất thường.

---

## 2. Synthetic events (`isTrusted: false`) 🔴

Mọi tương tác programmatic:

```text
element.click()
dispatchEvent(MouseEvent / KeyboardEvent / InputEvent / ClipboardEvent)
document.execCommand('insertText' | 'paste')
window.scrollBy / scrollIntoView
```

Trong browser, event tạo từ script có **`event.isTrusted === false`**.

| Hành động extension | Trusted? |
|---------------------|----------|
| Auto upvote `.click()` | ❌ |
| Open post / Reply click | ❌ |
| Fill composer (insertText/paste) | ❌ |
| Submit Comment button | ❌ |
| ScrollBy automation | Không phải event click, nhưng scroll pattern vẫn đo được |

**Mức độ:** Đây là tín hiệu **cứng nhất** phía client.  
Config “nhịp người” **không** biến `isTrusted` thành `true`.

**Mitigation trong code:** Không có (không thể bypass từ extension chuẩn).  
**Hệ quả:** Upvote + submit auto **luôn** khác user tay, nếu Reddit/client-side hoặc server correlate velocity.

---

## 3. Hành vi / pattern (behavioral)

### 3.1 Đã có mitigation 🟢 / 🟠

| Pattern người | Extension | Status |
|---------------|-----------|--------|
| Scroll không đều | `normal` / `logish` / burst / reverse | 🟢 Tốt |
| Dwell theo độ dài text | `countPostChars` + skim | 🟢 Tốt |
| Config drift | re-roll + micro-drift | 🟢 Tốt |
| Typing latency ∝ words | `estimateTypingMs` | 🟢 Tốt (nếu fill 1 lần) |
| Rate limit comment | gap, max/h, max/session | 🟢 |
| 9:1 / multi-sub / velocity | `08-ban-guard.js` | 🟢 Proxy tốt |
| Promo-invite seed | detect + force soft_mention | 🟠 Tốt cho UX, **tăng promo share** |

### 3.2 Vẫn “bot-like” 🔴 / 🟠

| Vấn đề | Chi tiết code | Mức |
|--------|---------------|-----|
| **Zero pointer human path** | Không có real mouse path; chỉ `click()` / random `mousemove` thỉnh thoảng | 🔴 |
| **mousemove giả** | `dispatchEvent(mousemove)` — `isTrusted:false`, tọa độ rời rạc | 🟠 Gần như vô dụng vs anti-bot |
| **Upvote không đọc reaction** | Vote sau delay random, không “hover” tin cậy | 🟠 |
| **Session 24/7** | Tab mở + loop vô hạn nếu ON | 🔴 Rất khác người |
| **Near-bottom jump** | Random `/`, `/r/popular`, `/r/all` | 🟠 Cross-feed pattern |
| **Duplicate comment text** | Đã fix 2.0.12 nhưng history đã có duplicate | 🔴 Content fingerprint |
| **LLM voice cluster** | Cùng model/prompt/productContext → semantic similarity | 🔴 |
| **Fill→submit pipeline cố định** | DWELL→GEN→THINK→TYPE→FILL→SUBMIT phases | 🟠 Dù timing jitter, **order** lặp |
| **Overlay/stats interval** | `setInterval(updateOverlay, 1500)` | 🟢 Thấp (local only) |
| **Clipboard paste pattern** | Fill via paste lặp | 🟠 |

### 3.3 Tốc độ action vs “người thật”

Ban-guard chặn khi:

- comments/1h cao  
- multi-sub/1h  
- promo ratio xấu  

**Chưa chặn:**

- Scroll+open post cả ngày không nghỉ dài (ngoài micro break 4%)  
- Upvote velocity riêng (chỉ soft qua chance)  
- Account age / karma = 0  

---

## 4. Content / semantic signals 🔴

| Tín hiệu | Rủi ro |
|----------|--------|
| Seed + productContext lặp domain/brand | Self-promo graph |
| Comment LLM cùng style (tbh/ngl/lol fixed anti-AI list) | Cluster detection |
| Body duplicate (history) | Spam filter rõ |
| Post self-promo sub (r/SaaS, buildinpublic) đã **100% removed** trên sample audit | Domain/account risk cao với **post**, không chỉ comment |

Account signal: karma/history/email — extension **không** sửa được.

---

## 5. Network / side channels 🟠

| | |
|--|--|
| `host_permissions` http(s)://\*/\* | Rộng — chỉ local risk, không fingerprint Reddit |
| Gọi 9router từ service worker | Traffic không qua reddit.com; Reddit không thấy LLM call |
| Fail open khi 9router down | User thấy `9router down` — không post (tốt) |

---

## 6. Mapping “công thức cộng đồng” ↔ extension

| Công thức | Extension làm gì | Còn lỗ hổng |
|-----------|------------------|---------------|
| 9:1 value:promo | ban-guard track + blockSeed | Chỉ đếm action extension; **không** đếm comment tay |
| Velocity | max/h, gap, ban-guard | Session dài, scroll vô hạn |
| Multi-sub | ban-guard subs1h | Near-bottom jump all/popular |
| Warm-up account | **Không enforce** | User Full+seed ngay = nguy hiểm |
| Không cross-post same text | **Không** check similarity across posts | LLM có thể lặp ý |
| isTrusted / real input | **Không** | Structural |

---

## 7. Bảng ưu tiên rủi ro (extension-induced)

| # | Issue | Severity | Fix hướng |
|---|--------|----------|-----------|
| 1 | Synthetic click/vote/submit (`isTrusted:false`) | 🔴 | Giảm auto-vote; human-in-loop submit; hoặc bỏ Full submit |
| 2 | DOM fingerprint (mascot/overlay/triggers) | 🔴 | Stealth mode ẩn UI khi auto |
| 3 | LLM/content cluster + seed domain | 🔴 | Diversity prompt; cap seed; no repeat draft hash global |
| 4 | Long unattended sessions | 🔴 | Hard session time cap + forced cooldowns |
| 5 | Phase pipeline always same order | 🟠 | Random skip phases / sometimes only read |
| 6 | Cross-listing navigation | 🟠 | Stay in current sub option |
| 7 | mousemove fake | 🟠 | Bỏ hoặc đừng tin là mitigation |
| 8 | Scroll/dwell RNG | 🟢 | Giữ |

---

## 8. Kết luận audit

1. **IP/VPN:** Không phải lỗ hổng chính của extension; đổi IP **không** “rửa” automation.  
2. **Fingerprint browser:** Extension **thêm** DOM/extension signature.  
3. **Hành vi:** Scroll/dwell làm **tốt hơn bot naive**; upvote/comment auto vẫn **synthetic + rate**.  
4. **Ban-guard 9:1/velocity:** Hữu ích như **dashboard**, **không** bằng anti-detect.  
5. **Rủi ro lớn nhất khi Full + auto-submit + seed + upvote** trên account non-warmed.

### Khuyến nghị vận hành (ngắn)

| Mode | Khi nào |
|------|---------|
| Observe | Warm-up, chỉ dwell |
| Engage | Thêm upvote **thưa**, account đã có karma |
| Full | Comment thưa; seed **chỉ** promo-invite; bật Dist quotas |
| Full + human submit | An toàn hơn: fill xong, **bạn** bấm Comment |
| Stealth | `rgl_stealthUi` — mờ Bram/overlay khi auto |

### Đã ship harden (v2.1) ✅

1. **Stealth UI** — `rgl_stealthUi`  
2. **Session max phút** — `rgl_sessionMaxMinutes` → force OFF  
3. **Human submit only** — `rgl_humanSubmitOnly`  
4. **Draft hash dedupe** — `rgl_draftHashes`  
5. **Sub lock / allowlist** — `rgl_stayInSub`, allowlist/blocklist  
6. **Day/sub quotas + quiet hours + queue** — tab Dist  

### Vẫn mở (nếu harden tiếp)

1. Randomize class names / không inject DOM khi stealth hard  
2. Disable auto-upvote default ON (opt-in upvote)  
3. Trusted-path automation (không khả thi thuần extension)  

---

*Audit tĩnh codebase. Không claim bypass Reddit. Cập nhật v2.1.0 khi ship distribution layer.*
