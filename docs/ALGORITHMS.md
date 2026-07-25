# Reddit Growth Lab — Cách hoạt động & Algorithm

Tài liệu kỹ thuật cho extension **Reddit Growth Lab** (**v2.1.0**).  
Giải thích **3 mode**: **Observe (OBS)** · **Engage (ENG)** · **Full**, kèm công thức, state machine, distribution, ban-guard, và anti-pattern nhịp người.

> **Ngôn ngữ:** Tiếng Việt (chi tiết) + English summary cuối mỗi phần lớn.  
> **Scope:** Lab / test account. Auto vote + auto comment có thể vi phạm Reddit ToS.  
> **Docs liên quan:** [DISTRIBUTION.md](./DISTRIBUTION.md) · [ANTI_SHADOWBAN.md](./ANTI_SHADOWBAN.md) · [THREAT_AUDIT.md](./THREAT_AUDIT.md)

---

## 1. Tổng quan sản phẩm

| Thành phần | Vai trò |
|------------|---------|
| **Chrome content scripts** | Chạy trên `reddit.com`: scroll, đọc DOM, upvote, comment |
| **Service worker** | Gọi LLM (9router / OpenAI-compatible), badge, health check |
| **Popup** | Tabs: **Run · Scroll · Comment · Dist · Safety** |
| **Overlay UI** | Panel góc phải: phase, metrics, job timeline, budget, ban/dist flash |

### 1.1 Kiến trúc module

```
content/
  00-shared.js        # RNG, DEFAULTS, promo-invite detect, session log
  05-overlay.js       # UI overlay (Claude design → production)
  08-ban-guard.js     # Proxy 9:1 / velocity / multi-sub gates
  10-automation.js    # Scroll, dwell theo chữ, upvote, config drift, stayInSub
  12-distribution.js  # Queue, quotas, quiet hours, session max, stealth
  20-assist-ui.js     # Bram mascot, ✨ manual, fill/submit composer
  30-auto-comment.js  # Full auto comment/reply + typing latency + dist gates
  40-orchestrator.js  # Main loop OBS / ENG / FULL + RGL_DIST messages
background.js         # Badge + HEALTH
background-llm.js     # Prompt, scrub, generate, vision
popup.html / popup.js # Settings + Dist queue UI
```

### 1.2 Master switch

- `rgl_enabled` = false → mọi loop dừng (STOP).
- `rgl_mode` ∈ `{ observe, engage, full }`.
- Full bắt buộc `rgl_ackRisk = true`.

---

## 2. Ba mode (OBS / ENG / FULL)

### 2.1 Bảng so sánh

| Hành vi | **Observe (OBS)** | **Engage (ENG)** | **Full** |
|---------|-------------------|------------------|----------|
| Auto scroll feed | ✅ | ✅ | ✅ |
| Dwell theo số chữ post | ✅ | ✅ | ✅ |
| Config drift (nhịp đổi theo thời gian) | ✅ | ✅ | ✅ |
| Auto upvote post | ❌ | ✅ | ✅ |
| Auto upvote comment | ❌ | ✅ | ✅ |
| Auto mở post (`/comments/…`) | ❌* | ✅ | ✅ |
| Auto comment / reply (LLM → fill → click) | ❌ | ❌ | ✅ |
| Cần 9router / API key | Không | Không | **Có** |
| Cần tick “ack risk” | Không | Không | **Có** |
| Rủi ro ban | Thấp (chỉ browse) | Trung bình (vote) | **Cao** |

\* Observe vẫn có thể đang đứng trên trang post nếu user tự mở; orchestrator sẽ scroll/đọc nhẹ nhưng **không** upvote / comment.

### 2.2 Observe — “chỉ screentime”

**Mục tiêu:** Giữ tab “sống” như người lướt, **không** tương tác vote/comment.

**Algorithm (mỗi tick feed):**

```
loop while enabled && mode == observe:
  if on post page:
      light scroll comments / dwell  (không upvote, không auto-comment)
      optional back to feed
  else:
      humanScrollGesture(feed)
      humanPauseAfterScroll()   # dwell scale theo countPostChars(focused)
      # skip maybeUpvote*
      # skip maybeOpenPost  (orchestrator: allowUpvote=false, openPost only if mode≠observe)
```

**Khi nào dùng:** Warm-up account, test overlay/rhythm, máy chưa có LLM.

**EN:** Observe only scrolls and dwells with human-like timing. No votes, no comments.

---

### 2.3 Engage — “scroll + upvote”

**Mục tiêu:** Giống Observe + thỉnh thoảng **upvote** post/comment + **mở post** đọc thread rồi quay lại.

**Algorithm feed phase:**

```
tickFeed(allowUpvote=true):
  tickDynamicConfig()          # drift live params
  humanScrollGesture("feed")
  humanPauseAfterScroll()      # đọc post đang focus
  maybeUpvoteInFeed()          # cooldown + chance
  handleNearBottom()
  if chance(live.openPostChance):
      maybeOpenPost() → navigate /comments/...
```

**Algorithm post phase (Engage):**

```
readPostPageSession():
  dwell OP (estimateReadingMs)
  maybe upvote OP
  loop scroll comments + dwell từng comment visible
  maybeUpvoteComment() theo chance + cooldown
  history.back() / về feed
```

**Upvote rules (cả ENG và FULL):**

| Rule | Chi tiết |
|------|----------|
| Cooldown post | ~7–32s (normal random) giữa 2 upvote post |
| Cooldown comment | ~6–28s |
| Chance | `live.upvoteChance` / `live.commentUpvoteChance` × energy factor |
| Skip | Đã upvote (WeakSet), không tìm thấy nút, `allowUpvote=false` |
| Click | `scrollIntoView` + delay human + `.click()` |

**EN:** Engage = Observe + probabilistic upvotes + opening posts to read comments, still no auto-posting text.

---

### 2.4 Full — “ENG + auto comment/reply”

**Mục tiêu:** Mọi thứ của Engage + **tự soạn & đăng** comment/reply với latency gõ người thật.

**Điều kiện bật:**

1. `rgl_mode = full`
2. `rgl_ackRisk = true`
3. LLM endpoint reachable (local hoặc Tailscale)
4. API key hợp lệ

**Khác ENG ở post phase:**

```
runPostPhase(full):
  for i in 3..10 comment-scroll rounds:
      humanScrollGesture(comments)
      maybeUpvoteComment()
      dwell visible comment by char count
      if i in [1..4]:
          autoComment.considerOnPostPage()  # may start CommentJob
          waitIfBusy()
  # one more chance before leave
  considerOnPostPage()
  waitIfBusy()
  history.back()
```

Trong lúc `CommentJob` chạy: **pause** scroll/upvote (mutual exclusion).

**EN:** Full adds a single-flight auto comment/reply job with typing simulation and hard rate limits.

---

## 3. State machine (Orchestrator)

```
                    ┌──────────┐
                    │   OFF    │  rgl_enabled=false
                    └────┬─────┘
                         │ ON
                         v
              ┌────────────────────┐
         ┌───►│       FEED         │◄──────────────┐
         │    └─────────┬──────────┘               │
         │              │ open post / already on   │
         │              v                          │
         │    ┌────────────────────┐               │
         │    │       POST         │               │
         │    └─────────┬──────────┘               │
         │              │ Full + intent            │
         │              v                          │
         │    ┌────────────────────┐               │
         │    │    COMMENTING      │  pause auto   │
         │    │  (job phases…)     │               │
         │    └─────────┬──────────┘               │
         │              │ done/fail                │
         │              v                          │
         │    ┌────────────────────┐               │
         └────│     COOLDOWN       │── back feed ──┘
              └────────────────────┘
```

Phases hiện trên overlay: `OFF | FEED | POST | COMMENTING | COOLDOWN | ERROR`.

---

## 4. Algorithm nhịp người (shared — mọi mode)

Triết lý: **không interval cố định, không scroll step đều**. Dùng RNG không đều + memory + fatigue.

### 4.1 Bộ RNG

| Hàm | Ý nghĩa |
|-----|---------|
| `rand(a,b)` | Uniform |
| `normal(mean, std, min, max)` | Box–Muller, clamp — giá trị “quanh mean” |
| `logish(min, max, skew)` | Nghiêng về min (pause ngắn nhiều, dài thỉnh thoảng) |
| `longTail(base, p, mult)` | Với xác suất `p`, nhân base × [multMin, multMax] |
| `chance(pct)` | Bernoulli % |

### 4.2 Energy (mệt / hưng phấn)

- `energy ∈ [0.15, 0.95]`, mỗi gesture: `energy += normal(0, 0.07)`.
- Energy cao → scroll nhanh hơn, pause ngắn hơn.
- Session dài → `fatigue` tăng nhẹ thời gian đọc.
- Sau comment (Full): energy có thể giảm (gắng sức).

### 4.3 Human scroll gesture

```
amount ≈ normal(lastAmount * jitter, …) * scrollSpeed * f(energy)
optional:
  - burst: 2–5 micro-scrolls
  - reverse: scroll lên lại (9–18%)
  - big jump: skip boring stretch (~7%)
behavior: mix smooth / auto
```

### 4.4 Dwell theo số chữ — `countPostChars` + `estimateReadingMs`

**Bước 1 — đếm chữ post đang focus (gần giữa viewport):**

- Lấy title + body (kể cả shadow DOM shreddit).
- Clean UI chrome (“Share”, “Upvote”, `u/…`, URL…).
- Output: `{ chars, words, title, body }`.

**Bước 2 — ước lượng thời gian đọc (ms):**

```
sec = (words / wpm) * 60
sec = max(sec, title_glance)
skim factor:
  words < 40  → ~0.85–1.15  (đọc gần hết)
  < 120       → ~0.55–0.95
  < 400       → ~0.35–0.70
  else        → ~0.22–0.50  (skim)
sec *= fatigue * energy_factor
sec *= normal(1, 0.18)      # jitter
sec = longTail(sec, 8%)     # thỉnh thoảng đọc kỹ
clamp → [minSec, maxSec]
```

→ Post dài **không** dừng tuyến tính forever; người skim.

### 4.5 Config drift (dynamic config)

**Base** = slider popup. **Live** = giá trị runtime đang dùng.

| Cơ chế | Mô tả |
|--------|--------|
| Full re-roll | Mỗi `logish(driftIntervalMin, Max)` phút, mỗi key ±`driftPercent` quanh base (normal) |
| Micro-drift | Mỗi vòng scroll: random walk nhỏ + mean-reversion về base |
| Mood bias | ~35% re-roll: cả profile calm/snappy cùng lúc |
| Comment keys (Full) | `commentChance`, `commentWpm`, `minGapSec` drift **cùng** mood scroll |

Keys drift:  
`scrollSpeed, upvoteChance, openPostChance, commentUpvoteChance, pauseMin/Max, scrollMin/Max, wpm, commentChance, commentWpm, minGapSec`.

---

## 5. Algorithm auto comment / reply (Full only)

### 5.1 Điều kiện trước khi tốn LLM

```
budgetOk:
  commentsThisSession < maxPerSession     (default 8)
  commentsThisHour    < maxPerHour        (default 4)
  now - lastComment   >= max(hardMinGap, live.minGapSec)   (default ≥ 240s)
banGuard.allowAuto(seed|comment):
  risk band, 9:1 value:promo, velocity, multi-sub
dist.allowCommentOnPage:
  quiet hours | allowlist/blocklist | day/sub quota
  | queue-only | session max | draft-hash dedupe
intent:
  chance(live.commentChance)              (base 12%, drifts)
  # promo-invite có thể skip roll
thread:
  chưa comment thread này trong session
page:
  phải là /comments/...  (đã vào post)
```

### 5.1b Promo-invite → auto seeding

Nếu title/body/comment khớp mẫu mời promote (vd. *“Drop your SaaS in the comments…”*, *launch board*, *honest feedback*, *self-promo welcome*…):

| Hành vi | Chi tiết |
|---------|----------|
| Detect | `detectPromoInvite(text)` — regex + combo comment+feedback+product |
| Score | +0.55… boost; eng gate nới |
| Intent | **Bỏ qua** roll chance% (ưu tiên comment) |
| Target | Ưu tiên **OP** (không random reply) |
| Style | Force `soft_mention` / seeding **kể cả** toggle 🌱 global đang tắt |
| UI | Bubble hiện `🌱 SEED` |

Manual ✨ trên post promo cũng auto bật 🌱.

### 5.2 Chọn target (70% reply / 30% OP)

**Scoring:**

```
score =
  + engagementScore * 0.45     # log1p(comments), log1p(score) → [0,1]
  + substance(words) * 0.20
  + questionBoost              # mỗi câu "?" +0.25, cap +0.5
  + preferQuestions bonus
  − automod / ads / quá ngắn
```

**Engagement hard skip:**

- `eng < minEngagementScore` (default 0.35) **và** không có `?` → skip.
- Có câu hỏi → threshold giảm ×0.6 (rescue).

**Ưu tiên:** comment visible có `?` ranked cao hơn.

### 5.3 CommentJob phases (timeline người)

```
SELECTED / DWELL
  → estimateReadingMs(target)  ≥ ~8–45s đọc trước

GENERATING
  → background GENERATE (9router)
  → Bram pose writing

THINKING
  → thinkMs = (draftChars/100)*thinkSecPer100 * jitter
  → clamp 2s … 25s

TYPING  ← latency chính
  → typingMs = (wordCount / live.commentWpm) * 60s
  → * normal + longTail
  → clamp 12s … 180s
  → ví dụ: 20 từ @ 38 wpm ≈ 31s
  → sau ~40–60% typingMs: fillComposer
  → chờ hết typingMs

REREAD
  → logish(1.2s, 8s) * f(chars)

SUBMIT
  → nếu rgl_humanSubmitOnly || !autoSubmit:
        STOP sau fill — user bấm Comment (không đếm dist day)
  → else submitComposer: click Comment/Reply
    else Meta/Ctrl+Enter
  → fail-soft: copy clipboard, không spam click
  → markQueue(done|fail), banGuard.record, dist.recordComment

DONE / FAIL
  → record budget, touchedThreads
  → aftercare 3–15s, back feed
```

### 5.4 Composer path (comment post **và** reply)

Cùng pipeline DOM:

1. (Reply) click control **Reply** trên comment owner nếu composer chưa mở.  
2. `findComposerForTarget` — textarea hoặc Lexical contenteditable (shadow DOM).  
3. `fillComposerForTarget` — native setter / `execCommand('insertText')`.  
4. `submitComposerForTarget` — nút Comment/Reply/Post trong scope → fallback hotkey.

**Không** comment từ feed listing: phải vào trang post trước.

### 5.5 Typing formulas (code-level)

```js
estimateTypingMs(draft, wpmLive) {
  words = max(1, split words)
  ms = (words / wpmLive) * 60_000
  ms *= normal(1, 0.18, 0.7, 1.45)
  ms = longTail(ms, 0.08, 1.5, 2.2)
  return clamp(ms, 12_000, 180_000)
}

estimateThinkMs(draft, thinkSecPer100) {
  ms = (chars/100) * thinkSecPer100 * 1000
  return clamp(ms * normal(...), 2_000, 25_000)
}
```

### 5.6 Ví dụ wall-clock 1 comment ~22 từ

| Phase | Thời gian xấp xỉ |
|-------|------------------|
| Dwell target | 8–40s |
| LLM generate | 3–15s |
| Think | 4–12s |
| Typing | **~30–40s** |
| Reread + submit | 3–15s |
| **Gap tới comment kế** | ≥ 4 phút (live minGap, drift) |

→ Không burst 3 comment / 30 giây.

---

## 6. LLM path (Full + manual ✨)

### 6.1 Manual (mọi mode)

Nút **✨ Comment / Reply** (Bram) → generate → user **Fill** / copy → user tự đăng.  
Human-in-the-loop; không auto-submit trừ khi Full job chạy.

### 6.2 Background generate

1. `buildPrompt` — anti-AI style, language lock, question anchor, optional seeding.  
2. Vision: tải ảnh redd.it → base64; grok đọc ảnh; model khác nhận caption.  
3. `scrub()` — gỡ AI-tells (em dash, listicle openers…).  
4. Parser SSE cho Claude qua 9router (`cc/*`).

### 6.3 Endpoint: local vs Tailscale

| Máy | Endpoint popup |
|-----|----------------|
| Cùng máy 9router | `http://localhost:20128/v1` |
| Máy khác (Tailscale) | `http://<host-tailscale-ip>:20128/v1` |

Ví dụ lab hiện tại:

- Host MacBook: `100.76.171.112` (chạy 9router)  
- Client Mac Mini: `100.79.172.21` → endpoint `http://100.76.171.112:20128/v1`

9router host phải bind **`0.0.0.0:20128`**.  
Nút **Test endpoint (HEALTH)** trong popup.

---

## 7. Overlay — đọc trạng thái

| UI | Ý nghĩa |
|----|---------|
| Badge **OBS / ENG / FULL** | Mode |
| Phase **FEED / POST / COMMENTING…** | State machine |
| Energy bar | 0–100% mood |
| Metrics | scrolls · upvotes · comments · opens |
| Job steps | DWELL→…→TYPING (progress bar)→SUBMIT |
| Rhythm strip | scroll speed, comment %, wpm, budget, eng gate |
| Footer | 9router ok/down · model · status sentence |
| Status flash | Ban-risk band · quiet hours · queue pending |

Click header → collapse pill; click pill → expand.  
`rgl_stealthUi` → mờ mascot/overlay (`html.rgl-stealth`).

---

## 8. Comment distribution (v2.1)

Chi tiết: [`DISTRIBUTION.md`](./DISTRIBUTION.md). Module: `content/12-distribution.js`.

### 8.1 Feed (Full) — `nextFeedAction()`

```
if quiet hours          → wait / COOLDOWN
if session max minutes  → stop + force OFF
if queue pending        → navigate URL (Full only)
if queueOnly + empty    → wait
else organic            → stayInSub / allowlist feed
```

### 8.2 Defaults distribution

| Key | Default |
|-----|---------|
| `rgl_distEnabled` | true |
| `rgl_maxCommentsPerSubDay` | 2 |
| `rgl_maxCommentsPerDay` | 8 |
| `rgl_quietHoursStart/End` | 1–7 local |
| `rgl_stayInSub` | true |
| `rgl_queueOnly` | false |
| `rgl_sessionMaxMinutes` | 90 |
| `rgl_humanSubmitOnly` | false |
| `rgl_stealthUi` | false |
| `rgl_subBlocklist` | announcements,reddit.com |

Storage: `rgl_postQueue`, `rgl_distDayStats`, `rgl_draftHashes`.

---

## 9. Ban-guard (proxy, không phải anti-detect)

Chi tiết: [`ANTI_SHADOWBAN.md`](./ANTI_SHADOWBAN.md). Module: `content/08-ban-guard.js`.

| Metric | Gate |
|--------|------|
| Value : promo ≥ ~9:1 | Block auto-seed nếu quá thấp |
| Comments / 1h, /24h | Block auto-comment nếu burst |
| Distinct subs / 1h | Multi-sub burst risk |

---

## 10. Defaults quan trọng (scroll / comment)

| Key | Default | Ghi chú |
|-----|---------|---------|
| `rgl_mode` | `observe` | An toàn nhất khi mới bật |
| `rgl_scrollSpeed` | 1.2 | Base; live drifts |
| `rgl_upvoteChance` | 8% | ENG/FULL |
| `rgl_openPostChance` | 12% | ENG/FULL |
| `rgl_commentChanceBase` | 12% | FULL intent roll (max UI ~40) |
| `rgl_commentWpmBase` | 38 | Mobile-ish typing |
| `rgl_minSecondsBetweenComments` | 240 | Hard floor gap |
| `rgl_maxCommentsPerHour` | 4 | Ceiling |
| `rgl_maxCommentsPerSession` | 8 | Ceiling |
| `rgl_minEngagementScore` | 0.35 | Skip low eng |
| `rgl_preferQuestions` | true | Boost `?` |
| `rgl_autoSubmit` | true | Full click Comment (tắt = fill only) |
| `rgl_dynamicConfig` | true | Drift on |
| `rgl_driftPercent` | 35 | ±% re-roll |

---

## 11. Flow chart tóm tắt

```
START
  │
  ├─ OBS ──► scroll + dwell (+ optional post read) ──► loop
  │
  ├─ ENG ──► scroll + dwell + upvote + open post ──► read thread ──► back ──► loop
  │
  └─ FULL ─► dist.nextFeedAction (queue / quiet / stayInSub)
              │
              └─ on post:
                    budget + banGuard + dist gates
                    score target (question + eng + promo)
                    │
                    ├─ skip ──► continue scroll comments
                    │
                    └─ job ──► dwell → LLM → think → type → fill
                                → [human submit | auto click]
                                → record dist + banGuard
                                └── budget / gap / 1-per-thread ──► back feed
```

---

## 12. English summary (modes)

### Observe
Human-like feed scrolling only. Pause duration scales with post text length (skim on long posts). Config parameters drift over time. **No** votes, **no** comments.

### Engage
Everything in Observe, plus:
- Probabilistic post/comment upvotes with cooldowns  
- Occasional navigation into a post to read comments  
- Still **no** automated text posting  

### Full
Everything in Engage, plus:
- On post pages, may start a **single-flight CommentJob**  
- Prefer high-engagement, **question-bearing**, and **promo-invite** targets  
- LLM draft → simulated think + **typing time ∝ words/WPM** → detect field → fill → click Comment/Reply (or human-submit-only)  
- Hard rate limits + **distribution** (daily/sub quotas, quiet hours, queue, session max) + **ban-guard** (9:1, velocity)  
- One comment per thread per session  

### Why uneven rhythm
Fixed intervals and fixed scroll deltas are easy bot fingerprints. RGL uses normal/log-ish distributions, energy drift, micro-drift of live config, long-tail pauses, reverse scrolls, and content-dependent dwell/typing so timing never stays periodic.

---

## 13. File tham chiếu trong repo

| File | Nội dung |
|------|----------|
| `content/00-shared.js` | DEFAULTS, RNG, promo detect |
| `content/08-ban-guard.js` | 9:1 / velocity gates |
| `content/10-automation.js` | Scroll, dwell, upvote, drift |
| `content/12-distribution.js` | Queue, quotas, quiet hours |
| `content/30-auto-comment.js` | Job score + typing + submit |
| `content/40-orchestrator.js` | Mode loops + Dist messages |
| `content/05-overlay.js` | Overlay render |
| `background-llm.js` | Prompt / generate |
| `README.md` | Cài đặt nhanh + Tailscale |
| `docs/DISTRIBUTION.md` | Dist tab guide |
| `docs/ANTI_SHADOWBAN.md` | Ban-guard |
| `docs/THREAT_AUDIT.md` | Fingerprint audit |

---

## 14. Cảnh báo

1. Auto upvote + auto comment = **vote/comment manipulation risk**.  
2. Dùng **account phụ**, cap thấp, Observe trước khi Full.  
3. Không merge logic auto-vote/comment ngược vào Bravestep production (đã từ chối HITL-only).  
4. Reddit đổi DOM → fill/submit có thể FAIL (overlay hiện error, fail-soft).  
5. Distribution + ban-guard **giảm tốc độ** — không che synthetic `isTrusted`.

---

*Tài liệu đồng bộ codebase Reddit Growth Lab **v2.1.0**. Cập nhật khi đổi algorithm mode/scoring/latency/distribution.*
