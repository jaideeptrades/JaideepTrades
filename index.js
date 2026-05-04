const express = require(“express”);
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ─── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(msg) {
try {
const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
chat_id: TELEGRAM_CHAT_ID,
text: msg,
parse_mode: “Markdown”,
}),
});
if (!res.ok) {
const err = await res.text();
console.error(“Telegram send failed:”, err);
}
} catch (e) {
console.error(“Telegram error:”, e);
}
}

// ─── Signal Validation ───────────────────────────────────────────────────────

function validateSignal(signal) {
const errors = [];

if (!signal || typeof signal !== “object” || Object.keys(signal).length === 0) {
return { valid: false, errors: [“Empty or invalid payload received.”] };
}

// Normalize common TradingView field names
signal.ticker  = signal.ticker  || signal.symbol   || signal.instrument || “MNQ”;
signal.price   = signal.price   || signal.close    || signal.last_price || null;
signal.action  = signal.action  || signal.side     || signal.direction  || null;
signal.account = signal.account || signal.accountSize || 50000; // default $50K

if (!signal.ticker) errors.push(“Missing: ticker/symbol”);
if (!signal.price)  errors.push(“Missing: price/close”);
if (!signal.action) errors.push(“Missing: action/side (BUY/SELL)”);

return { valid: errors.length === 0, errors, signal };
}

// ─── Claude Analysis ─────────────────────────────────────────────────────────

async function analyzeWithClaude(signal) {
try {
const {
ticker,
price,
action,
account,
timeframe = “unknown”,
indicator,
atr,
rsi,
…extras
} = signal;

```
const extraInfo = Object.keys(extras).length
  ? `\nAdditional data: ${JSON.stringify(extras)}`
  : "";

const prompt = `You are an elite futures trading coach for Apex Trader Funding prop firm accounts.
```

A TradingView alert just fired. Your job is to produce a structured, actionable trade plan.

=== SIGNAL DATA ===
Ticker:     ${ticker}
Timeframe:  ${timeframe}
Direction:  ${action?.toUpperCase()}
Entry Price: ${price}
Account Size: $${Number(account).toLocaleString()}
${atr   ? `ATR: ${atr}` : “”}
${rsi   ? `RSI: ${rsi}` : “”}
${indicator ? `Indicator: ${indicator}` : “”}${extraInfo}

=== INSTRUCTIONS ===

- Use 1% account risk to size contracts
- For futures: MNQ = $2/pt, MES = $5/pt, NQ = $20/pt, ES = $50/pt, CL = $1000/pt, GC = $100/pt
- Stop loss: use ATR if provided, otherwise use a logical structure level (~0.3–0.5% from entry)
- Target 1 = 2R, Target 2 = 3R from entry
- If direction conflicts with higher timeframe context or signal looks weak, set VERDICT to AVOID

=== RESPONSE FORMAT (use exactly) ===
VERDICT: BUY | SELL | AVOID
CONTRACTS: X
ENTRY:
STOP:
TARGET 1 (2R):
TARGET 2 (3R):
RISK: $X
REWARD T1: $X | REWARD T2: $X
SUMMARY: (2 sentences max — key reasoning and any caution)`;

```
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_KEY,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  }),
});

console.log("Claude status:", res.status);
const data = await res.json();

if (data.content && data.content[0]?.text) {
  return data.content[0].text;
} else if (data.error) {
  console.error("Claude API error:", data.error);
  return `⚠️ Claude error: ${data.error.message}`;
} else {
  console.error("Unexpected Claude response:", JSON.stringify(data));
  return "⚠️ Claude returned an unexpected response. Check server logs.";
}
```

} catch (e) {
console.error(“Claude fetch error:”, e);
return `⚠️ Failed to reach Claude: ${e.message}`;
}
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

app.post(”/webhook”, async (req, res) => {
try {
const raw = req.body;
console.log(“Webhook received:”, JSON.stringify(raw));

```
// Validate
const { valid, errors, signal } = validateSignal(raw);

if (!valid) {
  const errMsg = `⚠️ *INVALID SIGNAL*\n\nFix your TradingView alert:\n${errors.map(e => `• ${e}`).join("\n")}\n\n*Raw payload:*\n\`\`\`${JSON.stringify(raw, null, 2)}\`\`\``;
  await sendTelegram(errMsg);
  return res.status(400).json({ ok: false, errors });
}

// Notify signal received
await sendTelegram(
  `⚡ *SIGNAL: ${signal.ticker} ${signal.action?.toUpperCase()}*\n` +
  `Price: \`${signal.price}\` | TF: \`${signal.timeframe || "?"}\` | Acct: \`$${Number(signal.account).toLocaleString()}\``
);

// Analyze
const analysis = await analyzeWithClaude(signal);
await sendTelegram(`🤖 *CLAUDE ANALYSIS — ${signal.ticker}*\n\n${analysis}`);

res.json({ ok: true });
```

} catch (err) {
console.error(“Webhook handler error:”, err);
await sendTelegram(`🔴 *SERVER ERROR*\n\`${err.message}``);
res.status(500).json({ error: err.message });
}
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get(”/”, (req, res) => res.send(“Apex Alert Server Running ✅”));

app.listen(3000, () => console.log(“🚀 Server running on port 3000”));
