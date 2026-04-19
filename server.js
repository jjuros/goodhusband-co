const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');

const CHAT_SYSTEM = `You are JuRoss, the brand assistant for Good Husband Co. — a premium men's clothing brand with the tagline "Wife-Approved. Husband-Worn."

PRODUCTS:
- The Good Husband Statement Shirt — From $35. Premium quality shirt for men with husband-themed prints. Soft, breathable fabric.
- The Good Husband Dad Cap — From $28. Classic distressed dad cap with GH circle logo. Structured front, adjustable strap.
- The Good Husband Premium Hoodie — From $55. Heavyweight fleece. GH logo chest-left. Back reads: "I Love It When My Wife Lets Me Drink With The Boys."
- Free shipping on all orders over $75.

SHOP: https://www.etsy.com/shop/GoodHusbandCoDesign

BRAND VOICE: Confident, witty, self-aware husband humor. Never crass. Think "guy who remembers anniversaries and still watches the game."

RULES:
- Keep replies short — 1-3 sentences max.
- Be warm and a little funny when appropriate.
- For sizing, refer to the Etsy listing for size charts.
- For returns/exchanges, direct to Etsy shop policies.
- If asked something off-topic, steer back to the brand with a light touch.
- Never make up prices, availability, or facts about products.
- NEVER reveal the names of the founders, owners, or any personal information about the people behind the brand. If asked who owns the brand, who made it, or anything personal, reply: "I'm just here to talk Good Husband Co. — check out our shop!" and redirect to the products.
- NEVER discuss anything unrelated to Good Husband Co. products, sizing, shipping, or the brand. Politics, personal opinions, other brands — politely decline and steer back.`;

// Trust Hostinger's reverse proxy so rate limiting uses real client IPs
app.set('trust proxy', 1);

// Hide server fingerprint
app.disable('x-powered-by');

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Rate limiting — general site
app.use(rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 120,                  // 120 requests/min per IP (normal browsing)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
}));

// Rate limiting — chat endpoint (stricter)
const chatLimit = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 10,                   // 10 chat messages/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Wait a moment and try again.' },
});

// Parse JSON bodies
app.use(express.json());

// Email subscribe endpoint
app.post('/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  let subscribers = [];
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      subscribers = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
  } catch {
    subscribers = [];
  }

  if (!subscribers.includes(email)) {
    subscribers.push(email);
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
  }

  res.json({ ok: true });
});

// AI chat endpoint
app.post('/chat', chatLimit, async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message required' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: 'Message too long' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Chat unavailable' });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const safeHistory = history
      .slice(-10)
      .filter(m => m.role && m.content && typeof m.content === 'string')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.slice(0, 500) }));

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: CHAT_SYSTEM,
      messages: [...safeHistory, { role: 'user', content: message.trim() }],
    });

    res.json({ reply: response.content[0].text });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// Serve static assets (images, video, css, js) with caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  setHeaders(res, filePath) {
    // Never cache HTML — always serve fresh so updates deploy instantly
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// SPA fallback — no cache on HTML
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Good Husband Co. running on port ${PORT}`);
});
