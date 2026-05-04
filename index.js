const express = require("express");
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function sendTelegram(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        chat_id: TELEGRAM_CHAT_ID, 
        text: msg, 
        parse_mode: "Markdown" 
      }),
    });
  } catch (e) {
    console.error("Telegram error:", e);
  }
}

async function analyzeWithClaude(signal) {
  try {
    console.log("Calling Claude with key:", ANTHROPIC_KEY ? "Key exists" : "NO KEY");
    
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ 
          role: "user", 
          content: `You are an elite futures trading coach for Apex Trader Funding prop accounts.

A TradingView alert just fired. Analyze this signal and give a concise trade plan.

Signal: ${JSON.stringify(signal)}

Respond in this exact format:
VERDICT: BUY or SELL or AVOID
CONTRACTS: number based on $${signal.account} account at 1% risk
ENTRY: ${signal.price}
STOP: suggest a stop loss
TARGET 1 (2R): price
TARGET 2 (3R): price
RISK: dollar amount
SUMMARY: 2 sentence assessment`
        }],
      }),
    });

    console.log("Claude response status:", res.status);
    const data = await res.json();
    console.log("Claude data:", JSON.stringify(data));

    if (data.content && data.content.length > 0) {
      return data.content[0].text;
    } else if (data.error) {
      return `Claude error: ${data.error.message}`;
    } else {
      return `Unexpected response: ${JSON.stringify(data)}`;
    }
  } catch (e) {
    console.error("Claude error:", e);
    return `Error: ${e.message}`;
  }
}

app.post("/webhook", async (req, res) => {
  try {
    const signal = req.body;
    console.log("Signal received:", signal);

    await sendTelegram(`⚡ *SIGNAL RECEIVED*\n\`\`\`${JSON.stringify(signal, null, 2)}\`\`\``);

    const analysis = await analyzeWithClaude(signal);
    await sendTelegram(`🤖 *CLAUDE ANALYSIS*\n\n${analysis}`);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => res.send("Apex Alert Server Running ✅"));

app.listen(3000, () => console.log("Server running on port 3000"));
