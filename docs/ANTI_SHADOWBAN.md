# Anti-shadowban framework (RGL)

Reddit **không công bố** công thức spam filter. Tài liệu này + `content/08-ban-guard.js` dùng **proxy metrics** từ cộng đồng/growth practice để **tự giám sát rủi ro**.

## Nhóm tín hiệu bị flag

| Nhóm | Ví dụ |
|------|--------|
| Bot/spam behavior | Cùng nội dung nhiều sub, tần suất cao, % link self-promo bất thường |
| Account trũng | Mới, karma thấp, chưa ủ tương tác đã quảng bá |
| Tín hiệu tiêu cực | Report/downvote/mod ban cộng dồn, ban evasion, vote manipulation |

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

## UI

- Overlay footer: `Ban-risk yellow/red … value:promo ~X:1`
- Popup → **Safety** → Refresh ban-guard

## API (content)

```js
RGL.banGuard.record("comment"|"seed_comment"|"upvote", { sub, promo })
RGL.banGuard.compute()  // risk 0–100, flags, blockSeed, blockComment
RGL.banGuard.allowAuto("seed"|"comment")
```

## Không phải

- Không bypass filter Reddit  
- Không đảm bảo tránh ban  
- Không thay thế luật từng sub + ToS  
