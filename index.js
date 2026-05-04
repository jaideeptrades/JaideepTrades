const express = require(“express”);

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN   = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
const PORT             = process.env.PORT || 3000;

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(msg) {
try {
const res = await fetch(
`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
{
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
chat_id: TELEGRAM_CHAT_ID,
text: msg,
parse_mode: “Markdown”,
}),
}
);
if (!res.ok) {
const body = await res.text();
console.error(“Telegram failed:”, body);
}
} catch (err) {
console.error(“Telegram error:”, err.message);
}
}

// ─── Signal Validation ────────────────────────────────────────────────────────

function parseSignal(raw) {
if (!raw || typeof raw !== “object” || Object.keys(raw).length === 0) {
return { valid: false, error: “Empty payload. Check your TradingView alert JSON.” };
}

const signal = {
ticker:    raw.ticker    || raw.symbol      || raw.instrument  || “MNQ”,
action:    raw.action    || raw.side        || raw.direction   || null,
price:     raw.price     || raw.close       || raw.last_price  || null,
timeframe: raw.timeframe || raw.tf          || “unknown”,
account:   Number(raw.account || raw.accountSize || 50000),
atr:       raw.atr       || null,
rsi:       raw.rsi       || null,
indicator: raw.indicator || null,
};

if (!signal.action) return { valid: false, error: “Missing field: action (BUY or SELL)” };
if (!signal.price)  return { valid: false, error: “Missing field: price / close” };

return { valid: true, signal };
}

// ─── Claude Analysis ──────────────────────────────────────────────────────────

async function analyzeWithClaude(signal) {
const { ticker, action, price, timeframe, account, atr, rsi, indicator } = signal;

const extras = [
atr       ? `ATR: ${atr}`             : null,
rsi       ? `RSI: ${rsi}`             : null,
indicator ? `Indicator: ${indicator}` : null,
].filter(Boolean).join(”\n”);

const prompt = `You are an elite futures trading coach for Apex Trader Funding prop firm accounts.
A TradingView alert just fired on MNQ (Micro Nasdaq Futures).
Produce a clear, structured, actionable trade plan based on the signal below.

=== SIGNAL ===
Ticker:       ${ticker}
Direction:    ${action.toUpperCase()}
Entry Price:  ${price}
Timeframe:    ${timeframe}
Account Size: $${account.toLocaleString()}
${extras}

=== RULES ===

- Risk exactly 1% of account per trade
- MNQ point value = $2.00 per point
- Calculate contracts using: Risk $ / (stop distance in points x $2)
- Stop loss: use ATR x 1.5 if ATR provided, otherwise use 0.4% of entry price
- Target 1 = 2R from entry, Target 2 = 3R from entry
- If signal looks weak or contradictory, set VERDICT to AVOID and explain why

=== RESPOND IN THIS EXACT FORMAT ===
VERDICT: BUY or SELL or AVOID
CONTRACTS: [number]
ENTRY: [price]
STOP: [price]
TARGET 1 (2R): [price]
TARGET 2 (3R): [price]
RISK: $[amount]
REWARD T1: $[amount] | REWARD T2: $[amount]
SUMMARY: [2 sentences — reasoning and any caution]`;

try {
const res = await fetch(“https://api.anthropic.com/v1/messages”, {
method: “POST”,
headers: {
“Content-Type”: “application/json”,
“x-api-key”: ANTHROPIC_KEY,
“anthropic-version”: “2023-06-01”,
},
body: JSON.stringify({
model: “claude-sonnet-4-5”,
max_tokens: 800,
messages: [{ role: “user”, content: prompt }],
}),
});

```
const data = await res.json();

if (data.content && data.content[0]?.text) {
  return data.content[0].text;
}
if (data.error) {
  console.error("Claude API error:", data.error);
  return `Claude error: ${data.error.message}`;
}
return "Unexpected response from Claude. Check logs.";
```

} catch (err) {
console.error(“Claude fetch error:”, err.message);
return `Could not reach Claude: ${err.message}`;
}
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

app.post(”/webhook”, async (req, res) => {
console.log(“Webhook hit:”, JSON.stringify(req.body));

const { valid, error, signal } = parseSignal(req.body);

if (!valid) {
console.warn(“Invalid signal:”, error);
await sendTelegram(`*INVALID SIGNAL*\n\n${error}\n\nRaw:\n${JSON.stringify(req.body, null, 2)}`);
return res.status(400).json({ ok: false, error });
}

// Acknowledge immediately so TradingView does not timeout
res.json({ ok: true });

// Send signal summary
await sendTelegram(
`SIGNAL: ${signal.ticker} ${signal.action.toUpperCase()}\n` +
`Price: ${signal.price}  |  TF: ${signal.timeframe}  |  Acct: $${signal.account.toLocaleString()}`
);

// Analyze and send trade plan
const analysis = await analyzeWithClaude(signal);
await sendTelegram(`TRADE PLAN - ${signal.ticker}\n\n${analysis}`);
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get(”/”, (_req, res) => res.send(“Apex Alert Server Running”));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
