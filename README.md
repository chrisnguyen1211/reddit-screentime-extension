# Reddit Screentime Scroller v1.1

Human-like auto scroll Reddit: **nhịp không đều**, **dừng theo số chữ post**, thỉnh thoảng **mở post → đọc comment → upvote comment**.

## Cài / cập nhật

1. `chrome://extensions` → bật Developer mode  
2. **Load unpacked** (lần đầu) hoặc **Reload** icon trên card extension  
3. Mở reddit.com → bật toggle ON  

Folder: `/Users/nguyenhuycuong/reddit-screentime-extension`

## Anti-pattern (bot rhythm)

| Cơ chế | Mô tả |
|--------|--------|
| `normal` / `logish` RNG | Pause & scroll **không uniform** |
| Energy drift | Session “mệt / nhanh” thay đổi dần |
| Burst + reverse scroll | Thỉnh thoảng scroll nhỏ liên tiếp hoặc scroll lên lại |
| Long-tail pause | 4% nghỉ dài 8–25s; 8% “đọc kỹ” ×1.6–3.2 |
| Avoid same pause | Nếu pause gần bằng lần trước → nhân jitter |

## Đọc theo số chữ

```js
countPostChars(postEl)  // → { chars, words, title, body }
estimateReadingMs(count) // WPM + skim factor + fatigue + jitter
```

- Post ngắn: hay đọc gần hết  
- Post dài: **skim** (22–70% thời gian) — giống người  
- Debug console: `window.__redditScreentime.countPostChars(...)`

## Mở post + comment

- `% mở post` (default 12%), cooldown ~25–120s  
- Trong post: scroll OP theo char count → scroll comments → `% upvote comment`  
- Xong: `history.back()` về feed  

## Popup settings

- Tốc độ scroll base, pause min/max, px scroll  
- % upvote post / mở post / upvote comment  
- **WPM** (120–400): baseline đọc; chữ nhiều → dừng lâu hơn  

## Lưu ý

Auto vote/bot behavior có thể vi phạm Reddit ToS. Dùng mức vừa.
