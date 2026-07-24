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
4. Popup → tab **Comment**: endpoint `http://localhost:20128/v1` + API key (9router)
5. Tab **Safety**: tick ack risk nếu dùng Full
6. Tab **Run**: chọn mode → bật ON

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
