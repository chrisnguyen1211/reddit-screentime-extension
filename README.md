# Reddit Growth Lab `2.0.0-test`

Gộp **screentime scroll** + **upvote** + **LLM comment/reply (fill → click submit)** thành một Chrome extension.

> Lab cá nhân / account test. **Không** merge vào Bravestep production (Bravestep cố ý no-auto-vote).

## Cài

1. `chrome://extensions` → Developer mode → **Load unpacked**
2. Chọn folder:
   ```
   /Users/nguyenhuycuong/reddit-screentime-extension
   ```
3. Mở [reddit.com](https://www.reddit.com), **F5** sau mỗi lần reload extension
4. Popup → tab **Comment**: endpoint + API key (9router)
5. Tab **Safety**: tick ack risk nếu dùng Full
6. Tab **Run**: chọn mode → bật ON

## LLM endpoint: local vs máy khác (Tailscale)

| Máy | Endpoint trong popup |
|-----|----------------------|
| Cùng máy chạy 9router | `http://localhost:20128/v1` |
| Máy khác (Tailscale) | `http://100.x.x.x:20128/v1` hoặc MagicDNS `http://<hostname>:20128/v1` |

### Setup Tailscale (khuyến nghị)

1. Cài Tailscale **cả 2 máy**, login cùng account, check online.
2. **Máy host** (chạy 9router):
   ```bash
   # Lấy IP Tailscale
   tailscale ip -4
   # ví dụ: 100.91.23.45
   ```
   - Chạy 9router **bind `0.0.0.0:20128`**, không chỉ `127.0.0.1`  
     (nếu chỉ localhost thì máy kia không vào được).
3. **Máy client** (chỉ Chrome extension):
   - Popup → Comment → endpoint:
     ```
     http://100.91.23.45:20128/v1
     ```
   - Cùng API key như máy host
   - Bấm **Test endpoint (HEALTH)** → phải OK
4. Firewall macOS: cho phép node/9router accept incoming trên port 20128 (Tailscale thường OK nếu bind 0.0.0.0).

Test nhanh từ máy client:
```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 \
  http://100.x.x.x:20128/v1/models
# mong đợi 200 (hoặc 401 nếu cần key — vẫn là “reachable”)
```

**Không cần** expose 9router ra internet public.

## Modes

| Mode | Scroll | Upvote | Auto comment/reply |
|------|--------|--------|--------------------|
| **Observe** | ✓ | — | — |
| **Engage** | ✓ | ✓ | — |
| **Full** | ✓ | ✓ | ✓ (cần ack risk) |

## Comment / Reply flow (Full)

1. Mở **trang post** (`/comments/...`) — không comment từ feed list  
2. Score target: **câu hỏi** + engagement + substance; skip bài thấp eng  
3. LLM generate (9router)  
4. **Think** + **typing latency** ∝ số từ / WPM (vd ~30s cho ~20 từ)  
5. **Detect field** comment/reply → **fill** → **click** Comment/Reply  
6. Gap + chance **drift** giống scroll (không interval cố định)  
7. Max 1 comment / thread / session; hour/session caps  

Manual ✨ **Comment/Reply** (Bram) vẫn inject — human-in-the-loop bất kỳ mode.

## File layout

```
content/00-shared.js
content/10-automation.js    # scroll / dwell / upvote / drift
content/20-assist-ui.js     # Bram + fill/submit helpers (from Bravestep)
content/30-auto-comment.js  # job queue + typing latency + submit
content/40-orchestrator.js  # modes + main loop + overlay
background.js + background-llm.js
docs/OVERLAY_UI_PROMPT_FOR_CLAUDE.md
```

## Overlay design

Prompt để Claude generate UI overlay:  
[`docs/OVERLAY_UI_PROMPT_FOR_CLAUDE.md`](docs/OVERLAY_UI_PROMPT_FOR_CLAUDE.md)

## Risk

Auto vote + auto comment = **ToS / ban risk**. Dùng account phụ, cap thấp, Observe trước.
