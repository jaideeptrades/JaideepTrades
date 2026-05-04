const express = require(“express”);
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

async function sendTelegram(msg) {
try {
const res = await fetch(
“https://api.telegram.org/bot” + TELEGRAM_TOKEN + “/sendMessage”,
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

function parseSignal(raw) {
if (!raw || typeof raw !== “object” || Object.keys(raw).length === 0) {
return { valid: false, error: “Empty payload.” };
}

const signal = {
ticker:    raw.ticker    || raw.symbol    || “MNQ”,
action:    raw.action    || raw.side      || raw.direction || null,
price:     raw.price     || raw.close     || null,
timeframe: raw.timeframe || raw.tf        || “unknown”,
account:   Number(raw.account || 50000),
atr:       raw.atr       || null,
rsi:       raw.rsi       || null,
};

if (!signal.action) return { valid: false, error: “Missing field: action (BUY or SELL)” };
if (!signal.price)  return { valid: false, error: “Missing field: price” };

return { valid: true, signal };
}

async function analyzeWithClaude(signal) {
const extras = [
signal.atr ? “ATR: “ + signal.atr : null,
signal.rsi ? “RSI: “ + signal.rsi : null,
].filter(Boolean).join(”\n”);

const prompt = “You are an elite futures trading coach for Apex Trader Funding prop firm accounts.\n”
+ “A TradingView alert fired on MNQ (Micro Nasdaq Futures).\n”
+ “Produce a structured actionable trade plan.\n\n”
+ “=== SIGNAL ===\n”
+ “Ticker: “ + signal.ticker + “\n”
+ “Direction: “ + signal.action.toUpperCase() + “\n”
+ “Entry Price: “ + signal.price + “\n”
+ “Timeframe: “ + signal.timeframe + “\n”
+ “Account Size: $” + signal.account.toLocaleString() + “\n”
+ extras + “\n\n”
+ “=== RULES ===\n”
+ “- Risk exactly 10f account\n”
+ “- MNQ = $2.00 per point\n”
+ “- Contracts = Risk$ / (stop points x 2)\n”
+ “- Stop: ATR x 1.5 if provided, else 0.40f entry\n”
+ “- Target 1 = 2R, Target 2 = 3R\n”
+ “- AVOID if signal looks weak\n\n”
+ “=== FORMAT ===\n”
+ “VERDICT: BUY or SELL or AVOID\n”
+ “CONTRACTS: X\n”
+ “ENTRY: X\n”
+ “STOP: X\n”
+ “TARGET 1 (2R): X\n”
+ “TARGET 2 (3R): X\n”
+ “RISK: $X\n”
+ “REWARD T1: $X | REWARD T2: $X\n”
+ “SUMMARY: 2 sentences”;

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

if (data.content && data.content[0] && data.content[0].text) {
  return data.content[0].text;
}
if (data.error) {
  return "Claude error: " + data.error.message;
}
return "Unexpected Claude response. Check logs.";
```

} catch (err) {
return “Could not reach Claude: “ + err.message;
}
}

app.post(”/webhook”, async function(req, res) {
console.log(“Webhook hit:”, JSON.stringify(req.body));

var parsed = parseSignal(req.body);

if (!parsed.valid) {
console.warn(“Invalid signal:”, parsed.error);
sendTelegram(“INVALID SIGNAL\n\n” + parsed.error);
return res.status(400).json({ ok: false, error: parsed.error });
}

res.json({ ok: true });

var signal = parsed.signal;

sendTelegram(
“SIGNAL: “ + signal.ticker + “ “ + signal.action.toUpperCase() + “\n”
+ “Price: “ + signal.price + “ | TF: “ + signal.timeframe + “ | Acct: $” + signal.account.toLocaleString()
);

analyzeWithClaude(signal).then(function(analysis) {
sendTelegram(“TRADE PLAN - “ + signal.ticker + “\n\n” + analysis);
});
});

app.get(”/”, function(req, res) {
res.send(“Apex Alert Server Running”);
});

app.listen(PORT, function() {
console.log(“Server running on port “ + PORT);
});
