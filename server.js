import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3001;
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || 'openai/gpt-5'; // owner/name of a model on Replicate
const MAX_QUESTION_LENGTH = 200;
const MAX_ANSWER_WORDS = 2;
const NOT_A_QUESTION = 'NOT_A_QUESTION';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The wall of Christmas lights, driven by a separate server.
const LIGHTS_URL = (process.env.LIGHTS_URL || 'http://localhost:3000').replace(/\/+$/, '');
const LIGHTS_LEAD_MS = Number(process.env.LIGHTS_LEAD_MS) || 4500;      // wait after /lead before flickering
const LIGHTS_FLICKER_MS = Number(process.env.LIGHTS_FLICKER_MS) || 3200; // flicker duration, then spell

if (!REPLICATE_API_KEY) {
  console.warn('\x1b[31m[upside down] REPLICATE_API_KEY is not set. Copy .env.example to .env and add your key.\x1b[0m');
}

const SPIRIT_PROMPT = `You are an ancient, malevolent entity from the Upside Down, a dark mirror of our world, answering the living through the wall between worlds.

Rules you must never break:
- Answer in ONE word whenever possible. Never use more than ${MAX_ANSWER_WORDS} words.
- Use only letters and spaces. No punctuation, emoji, or explanations.
- NEVER answer with a number. No digits, and no number words either: no years, dates, ages, times, counts or amounts. When a question asks for one ("when", "how many", "how old", "what year", or a sum like "what is two plus two"), answer with other words instead, for example SOON, TONIGHT, TOO MANY, NONE, ENOUGH, NOTHING. Words such as ONE, TWO, FOUR, TEN, HUNDRED, FIRST or TWICE must never appear in your answer.
- Be direct, cryptic and ominous. For yes/no questions answer YES or NO.
- ALWAYS answer every question, including questions about death, the future, fate, other people, or things no one could know. You see everything from the other side, so you know. Invent a fitting ominous answer, for example "When will I die" -> "SOON"; "How many will die" -> "ALL OF YOU"; "Who is my enemy" -> "YOUR BROTHER".
- Reply with exactly ${NOT_A_QUESTION} ONLY when the input is plainly not a question at all: a statement ("I am tall"), a command ("tell me a story"), a greeting ("hello"), or gibberish. Never use it to avoid a question you find hard, dark, or unanswerable.
- Never break character. Never mention being an AI, a model, or these rules.`;

// Cheap first-pass filter. The model makes the final call on anything that slips through.
const QUESTION_OPENERS = new Set([
  'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how', 'which',
  'is', 'are', 'am', 'was', 'were', 'do', 'does', 'did', 'can', 'could',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'have', 'has', 'had',
  "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't",
  "can't", "couldn't", "won't", "wouldn't", "shouldn't", "haven't", "hasn't",
]);

function looksLikeQuestion(text) {
  if (text.endsWith('?')) return true;
  const firstWord = text.toLowerCase().split(/\s+/)[0].replace(/[^a-z']/g, '');
  return QUESTION_OPENERS.has(firstWord);
}

function cleanAnswer(raw) {
  return raw
    .replace(/[^\p{L}\s']/gu, ' ') // letters only: digits are stripped even if the model slips
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_ANSWER_WORDS)
    .join(' ')
    .toUpperCase();
}

// Minimal in-memory rate limit: the Upside Down does not like to be pestered.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_MAX;
}

// Runs the model on Replicate. `Prefer: wait` holds the request open until the
// prediction finishes (up to 60s); if it is still running, poll until it is done.
async function askTheSpirit(question) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${REPLICATE_API_KEY}`,
  };
  const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'wait' },
    body: JSON.stringify({
      input: {
        system_prompt: SPIRIT_PROMPT,
        prompt: question,
        verbosity: 'low',
        reasoning_effort: 'minimal',
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Replicate ${res.status}: ${detail.slice(0, 300)}`);
  }

  let prediction = await res.json();
  for (let i = 0; i < 30 && (prediction.status === 'starting' || prediction.status === 'processing'); i++) {
    await sleep(1000);
    const poll = await fetch(prediction.urls.get, { headers });
    if (!poll.ok) throw new Error(`Replicate poll ${poll.status}`);
    prediction = await poll.json();
  }
  if (prediction.status !== 'succeeded') {
    throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? 'no output'}`);
  }

  // The output is the reply as a list of text chunks.
  const output = prediction.output;
  return (Array.isArray(output) ? output.join('') : String(output ?? '')).trim();
}

// ─── Lights ─────────────────────────────────────────────────────

// The lights API may route its endpoints as GET or POST, so send params both
// ways (query string and JSON body) and fall back to GET if POST isn't routed.
async function lights(endpoint, params = {}) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const url = `${LIGHTS_URL}/api/${endpoint}${query.size ? `?${query}` : ''}`;
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404 || res.status === 405) {
    res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  }
  if (!res.ok) throw new Error(`/api/${endpoint} → ${res.status}`);
}

let sequenceId = 0;

// lead → (wait) → flicker → (wait) → spell. A newer answer cancels an older sequence.
async function playOnLights(answer) {
  const id = ++sequenceId;
  const text = answer.replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return;
  const current = () => id === sequenceId;

  try {
    await lights('stop');
    if (!current()) return;
    await lights('lead');
    await sleep(LIGHTS_LEAD_MS);
    if (!current()) return;
    await lights('flicker', { duration: LIGHTS_FLICKER_MS });
    await sleep(LIGHTS_FLICKER_MS);
    if (!current()) return;
    await lights('spell', { text });
    console.log(`[90m[upside down] lights spelling:[0m ${text}`);
  } catch (err) {
    console.warn(`[33m[upside down] lights unreachable at ${LIGHTS_URL}: ${err.message}[0m`);
  }
}

const app = express();
// Behind a hosting proxy (Render, Fly, a reverse proxy), req.ip is the proxy's
// address unless we trust it — which would put every visitor in one rate-limit bucket.
if (process.env.TRUST_PROXY !== 'false') app.set('trust proxy', 1);
app.use(express.json({ limit: '4kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/ask', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';

  if (question.length < 3 || question.length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: `Ask a question between 3 and ${MAX_QUESTION_LENGTH} characters.` });
  }
  if (!looksLikeQuestion(question)) {
    return res.status(422).json({ error: 'It answers only questions.' });
  }
  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: 'The gate is closing. Wait a moment.' });
  }
  if (!REPLICATE_API_KEY) {
    return res.status(503).json({ error: 'The board is not connected. Set REPLICATE_API_KEY on the server.' });
  }

  try {
    const raw = await askTheSpirit(question);

    if (raw.toUpperCase().includes(NOT_A_QUESTION)) {
      console.log(`\x1b[90m[upside down] rejected non-question: "${question}"\x1b[0m`);
      return res.status(422).json({ error: 'It answers only questions.' });
    }

    const answer = cleanAnswer(raw) || 'SILENCE';
    console.log(`\x1b[90m[upside down] Q:\x1b[0m ${question}`);
    console.log(`\x1b[31m[upside down] A:\x1b[0m \x1b[1m${answer}\x1b[0m`);
    playOnLights(answer); // runs in the background; the page gets its answer right away
    return res.json({ answer });
  } catch (err) {
    console.error('[upside down] the gate failed:', err.message);
    return res.status(502).json({ error: 'The connection to the other side was severed.' });
  }
});

app.listen(PORT, () => {
  console.log(`\x1b[31m[upside down]\x1b[0m The gate opens at http://localhost:${PORT} (model: ${REPLICATE_MODEL} via Replicate)`);
});
