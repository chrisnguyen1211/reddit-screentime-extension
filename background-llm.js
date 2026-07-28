// Service worker: calls the LLM (9router / OpenAI-compatible) to draft a comment.
// Content scripts can't reach localhost cross-origin reliably, so the fetch runs
// here (host_permissions grant access).

const DEFAULTS = {
  endpoint: "http://localhost:20128/v1",
  apiKey: "",
  // A/B mode: two models drafted side by side so you pick the better voice.
  modelA: "xai/grok-4",
  modelB: "cc/claude-sonnet-5",
  productContext: "",
  style: "value_only", // "value_only" | "soft_mention"
  // RGL namespaced keys (preferred)
  rgl_endpoint: "http://localhost:20128/v1",
  rgl_apiKey: "",
  rgl_model: "xai/grok-4",
  rgl_productContext: "",
  rgl_seedMode: false,
};

async function getConfig() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const merged = { ...DEFAULTS, ...stored };
  // Prefer rgl_* when set
  const endpoint = merged.rgl_endpoint || merged.endpoint;
  const apiKey = merged.rgl_apiKey || merged.apiKey;
  const productContext = merged.rgl_productContext || merged.productContext;
  const model = merged.rgl_model || merged.modelA;
  const style = merged.rgl_seedMode ? "soft_mention" : merged.style || "value_only";
  return {
    ...merged,
    endpoint,
    apiKey,
    productContext,
    modelA: model,
    modelB: merged.modelB,
    style,
  };
}

// Anti-AI-voice + on-topic contract. Off-topic jokes (e.g. gym membership on a
// school-dropout thread) and "oof yeah…" openers are the main failure modes.
const ANTI_AI_STYLE = `
STYLE — you are ONE more real person in this thread, not an AI and not a helpful assistant:
- The comments above are your STYLE SAMPLES. Match their register, casing, length, slang, energy. Lowercase and loose if they are; careful if they are (then don't force slang).
- MOVE — vary it, do NOT always assert an insight. A real person might ask a genuine question back, float a tentative suggestion (maybe try x, have you tried), just agree and add one small thing, share a quick personal bit ABOUT THE SAME TOPIC, say they're not sure, or mildly push back. Sometimes the best comment is just a good question.
- NOT A CONSULTANT — you're a peer in the thread, not an expert delivering a verdict or a solutions doc. Do NOT build elaborate hypotheses about stuff you can't actually see (their exact architecture, internals, what really happened) — if you're guessing, guess casually the way a person would (wonder if it's just x?), not like a bug report. Even on technical/serious subs redditors are casual and blunt, formal is NOT stiff/corporate. Keep it short, usually one thought.
- VOICE CALIBRATION: type like you're on your phone, not writing an essay. lowercase is fine, fragments are fine, don't proofread it in your head. Compare:
    too polished (NEVER): That would explain the behavior you're seeing. Worth reporting it to their team before it gets buried.
    real person (YES): thatd explain it. report it before it gets buried lol :)
- HUMAN TEXTURE (do this often): real redditors leave fingerprints — text emoticons :) :( :/ ;) xD :P :') , tiny laugh particles (lol, lmao, haha), mild typos/missing apostrophes (dont, im, thats), short fragments. Prefer at least one of these in most drafts unless the thread is dead-serious. Sprinkle, don't stack five in one line.
- VERNACULAR — contractions always. Casual where the vibe fits: tbh, ngl, imo, fwiw, honestly, lowkey, kinda, gonna, wanna, man, bro, dude, damn, fr, lol, haha, lmao, sheesh, welp, ffs. Do NOT lean on "yeah" or "oof" as crutches.
- OPENERS BANNED (hard): never start with yeah / oof / oof yeah / oh yeah / damn yeah / nah yeah / "this" alone / "same" alone / "this is so true". Jump straight into your point or story.
- NO QUOTE-BACK / NO PARAPHRASE: do not restate the title, do not echo their wording back at them ("dropping out of school…"), do not open by summarizing what they said. They already know their post. Answer or add from your angle.
- BANNED — read as AI or as writing-not-talking:
  - characters: em dash, colons that set up a clause (no "heres the thing:" / "my take:"), double quotes, slashes joining words (write "founders or marketers", never "founders/marketers"; and/or becomes just or), semicolons, ellipses, bullets, numbered lists, headers, bold/italic. (ASCII emoticons above are FINE, not banned.)
  - phrases: Great question, Great point, Absolutely, It's worth noting, That said, In conclusion, Additionally, Moreover, Hope this helps, I'd recommend, game changer, dive into.
- No tidy three-part parallel sentences. Real comments are uneven — vary length, can start mid-thought, don't cover everything.
- Output the comment text only, no wrapping quotes.`;

// Light subreddit culture hints so the model posts as a member, not a tourist.
// Unknown subs fall back to name-only inference in the prompt.
const SUB_HINTS = {
  ycombinator: "YC / startup founders — dropouts, funding, building products, batch culture, founder angst",
  startups: "startup founders building companies — product, growth, fundraising, hiring",
  saas: "SaaS builders — pricing, churn, GTM, MRR, product decisions",
  micro_saas: "solo/micro SaaS builders shipping small products",
  buildinpublic: "builders sharing progress publicly — shipping, metrics, lessons",
  entrepreneur: "business builders and side projects",
  growthhacking: "growth / distribution experiments",
  cscareerquestions: "CS careers, school vs work, internships, jobs",
  experienceddevs: "senior eng career/tech talk",
  programming: "software engineering craft",
  webdev: "web development practice",
  machinelearning: "ML research/practice",
  locality: "local community chat — match the place/culture",
};

function subHint(sub) {
  if (!sub) return "";
  const slug = String(sub).replace(/^r\//i, "").toLowerCase();
  return SUB_HINTS[slug] || "";
}

// Per-comment brief pools — randomized each generation so drafts vary in length
// and vibe instead of all converging to the same 1-3 sentence shape.
const LENGTHS = {
  short: "SHORT, one line, a few words max (like 'wait what happened' or 'same boat tbh :/'), under ~12 words",
  medium: "a sentence or two, normal comment length",
  long: "a bit more developed, 2-4 uneven sentences, still casual",
};
const VIBES = {
  react: "brief real reaction ON THE TOPIC (lol / damn / whoa + one on-topic beat), minimal — still about THIS post",
  question: "mainly ask ONE genuine curious question about THEIR situation in the post",
  agree: "agree and add one small on-topic thing from your angle",
  story: "share a quick personal bit that is LITERALLY about the same subject as the post (same domain — school/startup/work/etc). NO cute analogies from unrelated life areas",
  skeptical: "mildly skeptical or devil's advocate on the actual claim in the post, chill",
  humor: "light humor or jab that still answers/engages the post topic — never a random off-topic joke",
  tip: "ONE concrete helpful tip for the exact problem in the post, plain, no lecture",
  hottake: "short opinion or hot take on the actual question/topic of the post",
};
const LENGTH_KEYS = ["short", "short", "medium", "medium", "long"]; // weighted shorter
const VIBE_KEYS = Object.keys(VIBES);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function buildPrompt(cfg, ctx, brief) {
  const b = brief || { length: pick(LENGTH_KEYS), vibe: pick(VIBE_KEYS) };
  const briefRule = `\nTHIS ONE (make it different from other comments): length ${LENGTHS[b.length] || LENGTHS.medium}; move = ${VIBES[b.vibe] || VIBES.react}. Still stay 100% on-topic and real.\n`;
  const styleMode = ctx.style || cfg.style;
  const styleRule =
    styleMode === "soft_mention"
      ? `SEEDING MODE: the user WANTS their product woven in here. Give a genuinely helpful answer FIRST, then weave in ONE natural mention of the product as part of that answer (not a pitch, not a footnote ad — like a person casually saying what they use/built). You MUST disclose ownership in that same sentence, e.g. "...that's actually why I built X" or "(full disclosure, it's my tool)". Only skip the mention if the thread genuinely has nothing to do with the product. Never salesy, one mention max.`
      : `Do NOT mention or promote any product. Pure value only — this is for earning karma / genuine participation.`;
  const who = cfg.productContext?.trim()
    ? `The person commenting builds / knows about: ${cfg.productContext.trim()}\n`
    : "";
  const isReply = !!ctx.replyingTo;
  // Force the OUTPUT language to match the thread, not the product description.
  const langRule = ctx.lang
    ? `LANGUAGE (critical): write the ${isReply ? "reply" : "comment"} in ${ctx.lang} ONLY, matching the thread. Ignore the language of the product description and of these instructions.\n`
    : `LANGUAGE: write in the SAME language as the thread's title/body below — ignore the language of the product description.\n`;
  // Free-text instruction from the user's box (rescan follows it).
  const instrRule = ctx.instruction && ctx.instruction.trim()
    ? `\nUSER INSTRUCTION for THIS draft (highest priority — follow it exactly): ${ctx.instruction.trim()}\n`
    : "";
  const anchorRule = ctx.questions && ctx.questions.length
    ? `\nWHAT THEY'RE ACTUALLY ASKING — the WHOLE comment must answer or engage these. Direct reply; do NOT restate or summarize what they already wrote:\n- ${ctx.questions.join("\n- ")}\n`
    : `\nTOPIC LOCK: engage the specific subject of the title/body (or the parent comment if replying). If it's a yes/no or experience question, answer with a real stance or experience on THAT subject — not a parallel joke from another domain.\n`;

  // Subreddit culture: where you are posting matters as much as the title.
  const hint = subHint(ctx.subreddit);
  const subRule = ctx.subreddit
    ? `\nWHERE YOU ARE POSTING (critical):\n` +
      `- Subreddit: ${ctx.subreddit}${hint ? ` — ${hint}` : ""}\n` +
      `- Write as a regular of this community: shared assumptions, jargon, and stakes of THIS sub.\n` +
      `- Infer culture from the sub name when no hint is given (e.g. r/ycombinator = startup/YC world; r/relationships = personal advice; etc.).\n` +
      `- Your comment must make sense ONLY in this sub + this post. If you could paste it under a random unrelated post, rewrite.\n`
    : "";

  const topicRule =
    `\nON-TOPIC HARD RULES (fail = bad comment):\n` +
    `- Read title + body carefully. Name the real subject in your head before writing (e.g. "regretting dropping out of school for startups" — NOT fitness, dating, random life hacks).\n` +
    `- Stay on that subject end-to-end. Personal stories must be the SAME domain (school, startup, career, etc. as the post), never a cute analogy from an unrelated domain (gym membership, Netflix, weather…).\n` +
    `- Do NOT quote, rephrase, or open by echoing the post. Add something new: your experience, stance, question, or concrete take.\n` +
    `- Humor/reaction still has to engage the actual question. Off-topic witty one-liners are worse than silence.\n`;

  const imgNote = ctx.imageData?.length
    ? `\nThis post has ${ctx.imageData.length} image(s) attached below — LOOK at them, they're the real content (the title alone isn't enough). Comment on what's actually in the image.${ctx.imageCaption ? ` (for reference they show: ${ctx.imageCaption})` : ""}\n`
    : ctx.imageCaption
      ? `\nThis post has an image. Here's what it shows: ${ctx.imageCaption}\nComment on that like you saw it (you did). Never say "based on the description" or that you can't see it.\n`
      : "";

  // Follow-up reply: feed the comment being answered PLUS its whole loaded
  // subthread, so the reply moves the conversation forward instead of repeating.
  let convo = "";
  if (isReply) {
    convo =
      `\nYou are joining an existing comment thread as a FOLLOW-UP reply.\n` +
      `The comment you're replying to${ctx.replyAuthor ? ` (by ${ctx.replyAuthor})` : ""}:\n"${ctx.replyingTo}"\n`;
    if (ctx.subReplies?.length) {
      convo += `\nReplies already under it (oldest first) — READ these so you don't repeat and you actually add something new:\n- ${ctx.subReplies.join("\n- ")}\n`;
    }
  }

  return (
    `You are helping a real Redditor write a GENUINELY HELPFUL ${isReply ? "follow-up reply" : "comment"} that belongs in this exact thread.\n${who}\n` +
    langRule +
    `THREAD:\nTitle: ${ctx.title}\n` +
    (ctx.body ? `Body: ${ctx.body}\n` : "") +
    (ctx.subreddit ? `Subreddit: ${ctx.subreddit}\n` : "") +
    subRule +
    topicRule +
    instrRule +
    anchorRule +
    imgNote +
    convo +
    (!isReply && ctx.topComments?.length ? `\nExisting comments in this thread (context AND style samples — don't repeat their points; use them to stay on-topic):\n- ${ctx.topComments.join("\n- ")}\n` : "") +
    `\nWrite a genuinely useful ${isReply ? "reply that adds something NEW to this subthread" : "comment"} in the same language as the thread. ` +
    `Be specific to THIS post and THIS sub, not generic. Prefer a human fingerprint (emoticon or lol/haha or a slight typo) unless the thread is solemn. ${styleRule}\n${briefRule}${ANTI_AI_STYLE}`
  );
}

// Deterministic scrub — strip AI tells and banned openers the model leaks anyway.
function scrub(text) {
  let t = text.trim();
  t = t.replace(/^["“”'`]+|["“”'`]+$/g, "");                    // wrapping quotes
  t = t.replace(/["“”]/g, "");                                  // ALL double quotes (single ' kept for contractions)
  t = t.replace(/\s*—\s*/g, ", ").replace(/\s+–\s+/g, ", ");    // em/en dash → comma
  t = t.replace(/…/g, ".").replace(/\.{3,}/g, ".");             // ellipses
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1"); // bold/italic
  t = t.replace(/^#+\s+/gm, "").replace(/^[-*•]\s+/gm, "");     // headers/bullets
  // setup-colon after a word ("my take: x" → "my take x"); keeps emoticons (:/ :)),
  // times (3:30), and URLs (://) because those have no letter+space around the colon.
  t = t.replace(/([A-Za-z])\s*:\s+/g, "$1 ");
  t = t.replace(/;/g, ",");                                     // semicolons → comma
  // slashes joining words → "or"; keeps w/, w/o, 24/7, s/o, b/c, URLs.
  t = t.replace(/\band\s*\/\s*or\b/gi, "or");
  t = t.replace(/\s+\/\s+/g, " or ");
  t = t.replace(/\b([A-Za-z]{2,})\/([A-Za-z]{2,})\b/g, "$1 or $2");
  t = t.replace(/^(great (question|post|point)[.!,]?\s*)/i, "");
  t = t.replace(/\s*hope (this|that) helps[.!]?\s*$/i, "");
  // Banned openers the model loves: "oof yeah…", "yeah,", "oof,"
  t = t.replace(/^(oof\s+)?(oh\s+)?yeah[,!.]?\s+/i, "");
  t = t.replace(/^oof[,!.]?\s+/i, "");
  t = t.replace(/^(nah|yep|yup)\s+yeah[,!.]?\s+/i, "");
  // Only strip hollow openers, not real content like "same boat tbh"
  t = t.replace(/^(this is so true|so true)[,!.]?\s+/i, "");
  t = t.replace(/^(this|same)[.!]\s*/i, "");
  t = t.replace(/^(this|same)$/i, "");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

// Parse 9router response — cc/* models ALWAYS stream SSE (chat.completion.chunk
// deltas) with possible <think> blocks; grok returns one JSON object + [DONE].
function extractContent(text) {
  let raw = "";
  if (text.trimStart().startsWith("data:")) {
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") continue;
      try { const o = JSON.parse(payload); raw += o.choices?.[0]?.delta?.content ?? ""; } catch {}
    }
  } else {
    const obj = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    raw = String(obj.choices?.[0]?.message?.content ?? "");
  }
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "");
  return scrub(raw);
}

// Vision: image posts go to a vision-capable model. Verified via 9router:
// xai/grok-4 reads image URLs; Claude (cc/*) vision 400s through the proxy — so
// on image posts BOTH A/B columns use grok (varied temperature for diversity).
const VISION_MODEL = "xai/grok-4";
// Which models can actually SEE images through 9router. Verified: xai/grok reads
// base64; Claude (cc/*) vision 400s through the proxy. Non-vision models get a
// grok-written caption instead (so sonnet keeps its voice AND knows the image).
const isVisionModel = (m) => /^xai\//.test(m);

// Ask grok to describe the post image(s) factually → text a non-vision model can use.
async function captionImages(cfg, imageData) {
  if (!imageData.length) return "";
  const url = `${cfg.endpoint.replace(/\/$/, "")}/chat/completions`;
  const content = [
    { type: "text", text: "Describe what's in this image factually in 1-2 plain sentences for someone who can't see it. Note any text, UI, chart, meme caption, or subject. No preamble." },
    ...imageData.map((u) => ({ type: "image_url", image_url: { url: u } })),
  ];
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: VISION_MODEL, messages: [{ role: "user", content }], temperature: 0.2 }), signal: AbortSignal.timeout(45000) });
    if (!res.ok) return "";
    return extractContent(await res.text()).slice(0, 400);
  } catch { return ""; }
}

// Fetch a Reddit image → base64 data URL. We encode it OURSELVES (host_permissions
// grant the fetch) rather than handing the model a URL — the model backend's own
// downloader is flaky (grok "image_download_err"), base64 is 200 every time.
// Returns null on failure/oversize (→ graceful text-only fallback).
async function toDataUrl(u) {
  try {
    const blob = await (await fetch(u)).blob();
    if (!blob.type.startsWith("image/") || blob.size > 6_000_000) return null;
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

// One draft from one model. Multimodal when ctx.imageData (base64) present.
async function draftWith(cfg, ctx, model, temp, brief) {
  const url = `${cfg.endpoint.replace(/\/$/, "")}/chat/completions`;
  const t0 = Date.now();
  const promptText = buildPrompt(cfg, ctx, brief);
  const content = ctx.imageData?.length
    ? [{ type: "text", text: promptText }, ...ctx.imageData.map((u) => ({ type: "image_url", image_url: { url: u } }))]
    : promptText;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content }], temperature: temp ?? 0.6 }),
      signal: AbortSignal.timeout(60000), // no infinite spinner if 9router hangs
    });
    if (!res.ok) return { model, error: `lỗi ${res.status}` };
    const comment = extractContent(await res.text());
    return comment ? { model, comment, ms: Date.now() - t0 } : { model, error: "rỗng" };
  } catch (e) {
    return { model, error: e.name === "TimeoutError" ? "quá 60s (9router treo?)" : e.message };
  }
}

// A/B: both models in parallel. `only` (a model id) runs just one (for regen).
// `forced` = {length?, vibe?} from the tweak UI; unset fields are randomized so
// drafts stay varied. The two columns get DISTINCT briefs.
async function generate(ctx, only, forced) {
  const cfg = await getConfig();
  if (!cfg.apiKey || !cfg.endpoint) {
    return { error: "Chưa cấu hình API key / endpoint. Mở popup extension để nhập." };
  }
  // Resolve images ONCE (base64), then reuse across both columns.
  const imageData = ctx.images?.length
    ? (await Promise.all(ctx.images.slice(0, 3).map(toDataUrl))).filter(Boolean)
    : [];
  const hasImg = imageData.length > 0;
  // Caption via grok so non-vision models (sonnet) still know what's in the image.
  const imageCaption = hasImg ? await captionImages(cfg, imageData) : "";
  const ctx2 = { ...ctx, imageData, imageCaption };
  // Keep the user's A/B models. Vision models get the real image; others get the
  // caption (draftWith drops imageData for them → text-only + caption in prompt).
  const models = only ? [only] : [cfg.modelA, cfg.modelB];
  const temps = [0.75, 0.85];
  const briefFor = (otherVibe) => {
    const length = (forced && forced.length) || pick(LENGTH_KEYS);
    let vibe = (forced && forced.vibe) || pick(VIBE_KEYS);
    if (!(forced && forced.vibe) && otherVibe && vibe === otherVibe) vibe = pick(VIBE_KEYS.filter((v) => v !== otherVibe));
    return { length, vibe };
  };
  const b0 = briefFor();
  const briefs = [b0, briefFor(b0.vibe)];
  const drafts = await Promise.all(models.map((m, i) => {
    const ctxForModel = hasImg && !isVisionModel(m) ? { ...ctx2, imageData: [] } : ctx2;
    return draftWith(cfg, ctxForModel, m, temps[i] ?? 0.8, briefs[i] || briefs[0]);
  }));
  return { drafts };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "generate") {
    generate(msg.context, msg.only, msg.forced).then(sendResponse);
    return true; // async
  }
});
