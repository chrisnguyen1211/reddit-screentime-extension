# Audit tỉ lệ comment/post bị remove

Script: `scripts/audit-reddit-removals.mjs`

## Chạy (trên máy bạn)

```bash
cd ~/reddit-screentime-extension
git pull

# Thay YOUR_USERNAME
node scripts/audit-reddit-removals.mjs YOUR_USERNAME --kind=both --max=500
```

### Nếu HTTP 403 (Reddit chặn bot/IP)

1. Login [reddit.com](https://www.reddit.com) trên Chrome  
2. DevTools → **Application** → Cookies → `https://www.reddit.com`  
3. Ghép cookie thành `name=value; name2=value2` (cần `reddit_session` / `token_v2` nếu có)  
4. Chạy:

```bash
export REDDIT_COOKIE='reddit_session=...; token_v2=...'
node scripts/audit-reddit-removals.mjs YOUR_USERNAME --kind=both --max=500
```

Hoặc mở trực tiếp trên browser (đã login):

- Comments: `https://www.reddit.com/user/YOUR_USERNAME/comments.json?limit=100`  
- Posts: `https://www.reddit.com/user/YOUR_USERNAME/submitted.json?limit=100`  

Save JSON → có thể mở file và đếm `[removed]` thủ công.

### Output

- Terminal: % OK / removed / self-deleted  
- File: `logs/reddit-audit-<user>-<ts>.json`  
- Top subreddit bị remove  

| status | Ý nghĩa |
|--------|---------|
| `ok` | Còn trên profile |
| `removed` | `[removed]` / mod / reddit / spam |
| `self_deleted` | `[deleted]` do bạn xóa |

## Hạn chế

1. Chỉ thấy item **còn trong listing** profile. Remove sạch hẳn → **không đếm** → tỉ lệ thật có thể **cao hơn**.  
2. Không có mod log.  
3. Data export Reddit (Settings → Download my data) đầy đủ hơn nếu cần audit tuyệt đối.

## Ví dụ

```
COMMENTS — u/You
  Fetched: 200
  OK: 170 (85.0%)
  Removed: 24 (12.0%)   ← remove rate
  Self-deleted: 6 (3.0%)
```
