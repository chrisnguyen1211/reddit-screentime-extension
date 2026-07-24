# Reddit Growth Lab `2.1.0`

Gộp **screentime scroll** + **upvote** + **LLM comment/reply** + **comment distribution** (queue, quota, quiet hours, ban-guard) thành một Chrome extension.

> Lab cá nhân / account test. **Không** merge vào Bravestep production (Bravestep cố ý no-auto-vote).

## Cài

1. `chrome://extensions` → Developer mode → **Load unpacked**
2. Chọn folder repo này (hoặc `git clone` rồi chọn path)
3. Mở [reddit.com](https://www.reddit.com), **F5** sau mỗi lần reload extension
4. Popup → tab **Comment**: endpoint + API key (9router)
5. Tab **Dist**: allowlist / quiet / queue URLs
6. Tab **Safety**: tick ack risk nếu dùng Full
7. Tab **Run**: chọn mode → bật ON

## LLM endpoint: local vs máy khác (Tailscale)

| Máy | Endpoint trong popup |
|-----|----------------------|
| Cùng máy chạy 9router | `http://localhost:20128/v1` |
| Máy khác (Tailscale) | `http://100.x.x.x:20128/v1` hoặc MagicDNS `http://<hostname>:20128/v1` |

### Setup Tailscale (khuyến nghị)

1. Cài Tailscale **cả 2 máy**, login cùng account, check online.
2. **Máy host** (chạy 9router):
   ```bash
   tailscale ip -4
   # ví dụ: 100.76.171.112
   ```
   - Chạy 9router **bind `0.0.0.0:20128`**, không chỉ `127.0.0.1`
3. **Máy client** (chỉ Chrome extension):
   - Popup → Comment → endpoint: `http://100.x.x.x:20128/v1`
   - Cùng API key như máy host
   - Bấm **Test endpoint (HEALTH)** → phải OK

**Không cần** expose 9router ra internet public.

## Modes

| Mode | Scroll | Upvote | Auto comment/reply |
|------|--------|--------|--------------------|
| **Observe** | ✓ | — | — |
| **Engage** | ✓ | ✓ | — |
| **Full** | ✓ | ✓ | ✓ (cần ack risk) |

## Comment distribution (v2.1)

Tab **Dist** — xem chi tiết [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md).

| Feature | Mặc định |
|---------|----------|
| Allowlist / blocklist sub | block announcements |
| Max cmt / sub / ngày | 2 |
| Max cmt / ngày | 8 |
| Quiet hours | 1–7 local |
| Stay in sub | on |
| Post URL queue | optional |
| Queue only | off |
| Session max phút | 90 |
| Human submit only | off (fill only, bạn bấm Comment) |
| Stealth UI | off |
| Ban-guard 9:1 + velocity | Safety tab |

**Flow Full + queue:** pending URL → navigate → dwell → LLM → fill → submit (hoặc human) → mark done → cap ngày.

## Comment / Reply flow (Full)

1. Mở **trang post** (`/comments/...`) — không comment từ feed list  
2. Score target: **câu hỏi** + engagement + promo-invite; skip bài thấp eng  
3. LLM generate (9router)  
4. **Think** + **typing latency** ∝ số từ / WPM  
5. **Detect field** → **fill** → **click** Comment/Reply (trừ human-submit-only)  
6. Gap + chance **drift**; max 1 comment / thread / session  

Manual ✨ **Comment/Reply** (Bram) vẫn inject — human-in-the-loop bất kỳ mode.

## File layout

```
content/00-shared.js         # defaults, RNG, promo detect
content/05-overlay.js        # Claude status panel
content/08-ban-guard.js      # 9:1 / velocity proxy
content/10-automation.js     # scroll / dwell / upvote / drift
content/12-distribution.js   # queue, quotas, quiet, stay-in-sub
content/20-assist-ui.js      # Bram + fill/submit helpers
content/30-auto-comment.js   # job pipeline
content/40-orchestrator.js   # modes + main loop + messages
background.js + background-llm.js
popup.html / popup.js        # Run | Scroll | Comment | Dist | Safety
```

## Docs

| File | Nội dung |
|------|----------|
| [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) | 3 mode OBS / ENG / FULL + algorithm |
| [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md) | Queue / quota / quiet hours |
| [`docs/ANTI_SHADOWBAN.md`](docs/ANTI_SHADOWBAN.md) | Ban-guard proxy metrics |
| [`docs/THREAT_AUDIT.md`](docs/THREAT_AUDIT.md) | Multi-signal fingerprint audit |
| [`docs/OVERLAY_UI_PROMPT_FOR_CLAUDE.md`](docs/OVERLAY_UI_PROMPT_FOR_CLAUDE.md) | Overlay design prompt |

## Risk

Auto vote + auto comment = **ToS / ban risk**. Dùng account phụ, cap thấp, Observe trước.  
Distribution + ban-guard **giảm tốc độ** — không phải anti-detect hoàn hảo.
