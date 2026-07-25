# Anti-shadowban framework (RGL) — v2.1

Reddit **không công bố** công thức spam filter. Tài liệu này + `content/08-ban-guard.js` dùng **proxy metrics** từ cộng đồng/growth practice để **tự giám sát rủi ro**.

> Cùng với [DISTRIBUTION.md](./DISTRIBUTION.md) (quota / quiet / queue) và [THREAT_AUDIT.md](./THREAT_AUDIT.md) (fingerprint / isTrusted).

## Nhóm tín hiệu bị flag

| Nhóm | Ví dụ |
|------|--------|
| Bot/spam behavior | Cùng nội dung nhiều sub, tần suất cao, % link self-promo bất thường |
| Account trũng | Mới, karma thấp, chưa ủ tương tác đã quảng bá |
| Tín hiệu tiêu cực | Report/downvote/mod ban cộng dồn, ban evasion, vote manipulation |
| Synthetic client | `isTrusted:false` click/fill — xem threat audit |

## Proxy metrics RGL track

### 1) Tỷ lệ 9:1 (value : promo)

- **Value** ≈ organic comment + upvote (tracked by extension)
- **Promo** ≈ seed_comment (soft_mention / promo-invite)
- **Mục tiêu:** ≥ **9 value : 1 promo** (promo share ≤ ~10%)
- **Gate:** ratio &lt; 5:1 hoặc risk cao → **block auto-seed**

### 2) Velocity

- Comments / 1 giờ, / 24 giờ  
- Actions / 1 giờ  
- **Gate:** quá ngưỡng → block auto-comment

### 3) Multi-sub burst

- Số sub distinct comment trong 1 giờ  
- Cross-post spam pattern  
- **Gate:** ≥ 5 sub/h → risk cao

### 4) Giai đoạn ủ (manual)

Extension **không** biết tuổi account Reddit. Khuyến nghị vận hành:

- Tuần 1–2: Observe/Engage only, **0 seed**  
- Sau khi có karma + history: Full + seed thưa  

### 5) Promo-invite exception

Post mời “Drop your SaaS…” → được seed **có chủ đích**, nhưng vẫn cộng vào **promoActs** và bị 9:1 chặn nếu lạm.

### 6) Distribution layer (v2.1) — bổ sung cho ban-guard

Không thay ban-guard; **giảm tốc độ / phạm vi**:

| Gate | Key |
|------|-----|
| Quiet hours | `rgl_quietHoursStart/End` (default 1–7) |
| Max cmt / ngày | `rgl_maxCommentsPerDay` (8) |
| Max cmt / sub / ngày | `rgl_maxCommentsPerSubDay` (2) |
| Stay in sub | `rgl_stayInSub` |
| Allowlist / blocklist | `rgl_subAllowlist` / `rgl_subBlocklist` |
| Session max phút | `rgl_sessionMaxMinutes` (90 → force OFF) |
| Human submit only | `rgl_humanSubmitOnly` |
| Queue only | `rgl_queueOnly` |
| Draft hash dedupe | storage `rgl_draftHashes` |

## UI

- Overlay footer: `Ban-risk yellow/red … value:promo ~X:1` hoặc quiet/queue flash  
- Popup → **Safety** → Refresh ban-guard  
- Popup → **Dist** → quotas / queue status  

## API (content)

```js
RGL.banGuard.record("comment"|"seed_comment"|"upvote", { sub, promo })
RGL.banGuard.compute()  // risk 0–100, flags, blockSeed, blockComment
RGL.banGuard.allowAuto("seed"|"comment")

RGL.dist.allowCommentOnPage({ sub, draftHash })
RGL.dist.recordComment(sub, draftHash)
RGL.dist.snapshot()
```

## Gate order (Full auto-comment)

```
budgetOk → banGuard.allowAuto → dist.allowCommentOnPage
  → generate → fill → [human submit | auto submit]
  → banGuard.record + dist.recordComment
```

## Không phải

- Không bypass filter Reddit  
- Không đảm bảo tránh ban  
- Không che `isTrusted` / DOM extension fingerprint  
- Không thay thế luật từng sub + ToS  
