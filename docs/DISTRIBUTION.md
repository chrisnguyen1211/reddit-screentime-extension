# Comment distribution (v2.1)

Phân bổ comment có kiểm soát — tab **Dist** trong popup.

## Tính năng

| Feature | Key | Mặc định |
|---------|-----|----------|
| Bật distribution | `rgl_distEnabled` | true |
| Allowlist sub | `rgl_subAllowlist` | trống = all |
| Blocklist | `rgl_subBlocklist` | announcements |
| Max cmt/sub/ngày | `rgl_maxCommentsPerSubDay` | 2 |
| Max cmt/ngày | `rgl_maxCommentsPerDay` | 8 |
| Quiet hours | `rgl_quietHoursStart/End` | 1–7 local |
| Stay in sub | `rgl_stayInSub` | true |
| Queue only | `rgl_queueOnly` | false |
| Prefer promo-invite | `rgl_preferPromoInvite` | true |
| Session max phút | `rgl_sessionMaxMinutes` | 90 |
| Human submit only | `rgl_humanSubmitOnly` | false |
| Stealth UI | `rgl_stealthUi` | false |
| Post URL queue | storage `rgl_postQueue` | — |
| Draft hash dedupe | `rgl_draftHashes` | — |

## Flow

1. **Queue** có URL → Full mode navigate tới post đó.  
2. **Queue empty** + không queue-only → organic feed trong allowlist / stay-in-sub.  
3. Trước comment: quiet hours + day/sub quota + ban-guard + gap + session max.  
4. Promo-invite → seed soft_mention (nếu ban-guard cho phép).  
5. Sau submit: +1 day/sub counter, mark queue `done`, ban-guard record.  
6. Human submit only → fill xong, **không** auto-click Comment.

## Gate order (auto-comment)

```
budgetOk (hour/session/gap)
  → banGuard.allowAuto
  → dist.allowCommentOnPage (quiet / allowlist / day quota / queue-only / draft hash)
  → generate → fill → [human only | submit]
  → dist.recordComment + markQueue(done)
```

## Feed navigation (Full)

`nextFeedAction()`:

| Action | When |
|--------|------|
| `stop` | session max minutes |
| `wait` | quiet hours / day cap / queue empty (queue-only) |
| `navigate` | next pending queue URL (or first allowlist sub feed) |
| `on-queue-post` | already on queued post |
| `organic` | scroll feed normally (respect stayInSub) |

## Queue ops (popup Dist)

- **Add to queue** — dán URL `/r/.../comments/...` (mỗi dòng 1 link)  
- **Refresh status** — pending/done, today count, quiet  
- **Clear done/fail** — dọn item đã xong  
- **Export queue** — JSON backup (queue + day stats)  
- **Import queue** — JSON hoặc plain text URLs  
- **Clear all** — xóa toàn bộ hàng đợi  

Storage keys: `rgl_postQueue`, `rgl_distDayStats`, `rgl_draftHashes`.

## Dùng nhanh

1. Dist → allowlist `micro_saas, SideProject`  
2. Quiet `1`–`7`  
3. Max 2/sub/ngày, 8/ngày  
4. Dán URL posts → **Add to queue** (hoặc Import)  
5. Optional: **Queue only** + **Human submit only** cho an toàn  
6. Safety → tick risk ack  
7. Run → Full → ON  
8. 9router OK (local hoặc Tailscale)  

## File

| File | Role |
|------|------|
| `content/12-distribution.js` | scheduler, queue, quotas, stealth |
| `content/30-auto-comment.js` | gates + recordComment |
| `content/40-orchestrator.js` | feed navigate + `RGL_DIST` messages |
| `content/10-automation.js` | stayInSub navigation |
| `popup.html` / `popup.js` | Dist tab UI |

## Không phải anti-detect

Distribution **giảm tốc độ / phạm vi** (quota, quiet, allowlist).  
Không che `isTrusted:false` hay fingerprint — xem `docs/THREAT_AUDIT.md` + `docs/ANTI_SHADOWBAN.md`.
