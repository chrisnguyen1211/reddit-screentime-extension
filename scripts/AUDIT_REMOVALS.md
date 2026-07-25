# Audit tỉ lệ comment/post bị remove

Script: `scripts/audit-reddit-removals.mjs`  
Dùng để đo **% comment/post bị remove** (mod / spam / deleted) từ dump JSON Reddit (login browser).

## 403 từ Node? Dùng browser dump (khuyến nghị)

Reddit chặn script/`fetch` không cookie → **HTTP 403**. Cách chắc chắn:

### Bước 1 — Mở JSON khi đã login Chrome

Comments (thay `Sea-Big3772` nếu khác):

```
https://www.reddit.com/user/Sea-Big3772/comments.json?limit=100
```

Posts:

```
https://www.reddit.com/user/Sea-Big3772/submitted.json?limit=100
```

Phải thấy JSON dạng `{"kind": "Listing", "data": { "children": [...] }}`.

### Bước 2 — Lưu file

- **Cmd+S** → lưu vào  
  `~/reddit-screentime-extension/logs/comments-1.json`  
  `~/reddit-screentime-extension/logs/posts-1.json`

### Bước 3 — Lấy thêm trang (nếu có `"after": "t1_xxx"`)

Mở:

```
https://www.reddit.com/user/Sea-Big3772/comments.json?limit=100&after=t1_XXXX
```

Lưu `comments-2.json`, v.v.

### Bước 4 — Chạy audit offline

```bash
cd ~/reddit-screentime-extension

node scripts/audit-reddit-removals.mjs Sea-Big3772 \
  --comments-file=logs/comments-1.json \
  --posts-file=logs/posts-1.json
```

Hoặc cả thư mục dumps:

```bash
mkdir -p logs/dumps
# copy mọi *.json vào logs/dumps
node scripts/audit-reddit-removals.mjs Sea-Big3772 --dir=logs/dumps
```

## Cách 2 — Cookie (live fetch)

```bash
# DevTools → Application → Cookies → copy reddit_session + token_v2
export REDDIT_COOKIE='reddit_session=...; token_v2=...'
node scripts/audit-reddit-removals.mjs Sea-Big3772 --kind=both --max=500
```

## Output

- Terminal: % OK / **removed** / self-deleted  
- `logs/reddit-audit-….json`  
- Top subreddit bị remove  

| status | Ý nghĩa |
|--------|---------|
| `ok` | Còn |
| `removed` | Mod/reddit `[removed]` |
| `self_deleted` | Bạn xóa `[deleted]` |

## Caveat

Item remove rồi **biến mất listing** → không đếm → % remove in ra là **tối thiểu**.
