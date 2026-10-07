const QUESTION_OPENERS = new Set([
  'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how', 'which',
  'is', 'are', 'am', 'was', 'were', 'do', 'does', 'did', 'can', 'could',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'have', 'has', 'had',
  "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't",
  "can't", "couldn't", "won't", "wouldn't", "shouldn't", "haven't", "hasn't",
]);

const OMEN = {
  idle: 'It answers only questions.',
  statement: 'That is not a question. It answers only questions.',
  tooShort: 'Ask a full question.',
  asking: 'Something stirs…',
  spoken: 'It has answered.',
};

const LETTER_DELAY_MS = 260;

const $ = (sel) => document.querySelector(sel);
const form = $('#ask');
const input = $('#question');
const field = $('#field');
const button = $('#send');
const omen = $('#omen');
const answerEl = $('#answer');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Spores ─────────────────────────────────────────────────────

// Mostly red embers off the gate, with pale ash, dark debris and a few soft out-of-focus ones.
const SPORE_KINDS = [
  { share: 0.4, color: '255, 70, 45', r: () => Math.random() * 1.8 + 0.4, alpha: () => Math.random() * 0.5 + 0.3 },
  { share: 0.15, color: '255, 150, 80', r: () => Math.random() * 1.4 + 0.4, alpha: () => Math.random() * 0.5 + 0.3 },
  { share: 0.2, color: '215, 200, 200', r: () => Math.random() * 1.6 + 0.4, alpha: () => Math.random() * 0.4 + 0.15 },
  { share: 0.17, color: '10, 3, 4', r: () => Math.random() * 2.2 + 0.8, alpha: () => Math.random() * 0.4 + 0.5 },
  { share: 0.08, color: '255, 50, 40', r: () => Math.random() * 4 + 3, alpha: () => Math.random() * 0.12 + 0.06 },
];

function sporeKind() {
  let roll = Math.random();
  return SPORE_KINDS.find((kind) => (roll -= kind.share) < 0) || SPORE_KINDS[0];
}

function startSpores() {
  const canvas = $('#spores');
  const ctx = canvas.getContext('2d');
  let spores = [];

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(((innerWidth * innerHeight) / 9000) * 1.4);
    spores = Array.from({ length: count }, () => sporeKind()).map((kind) => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      r: kind.r(),
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(Math.random() * 0.25 + 0.05),
      phase: Math.random() * Math.PI * 2,
      alpha: kind.alpha(),
      color: kind.color,
    }));
  }

  function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const s of spores) {
      s.x += s.vx + Math.sin(t / 2000 + s.phase) * 0.12;
      s.y += s.vy;
      if (s.y < -5) { s.y = innerHeight + 5; s.x = Math.random() * innerWidth; }
      if (s.x < -5) s.x = innerWidth + 5;
      if (s.x > innerWidth + 5) s.x = -5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.color}, ${s.alpha})`;
      ctx.fill();
    }
    if (!reducedMotion) requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', resize);
  requestAnimationFrame(frame);
}

// ─── Backdrop ───────────────────────────────────────────────────

const backdrop = $('#backdrop');

function startBackdrop() {
  if (reducedMotion) {
    backdrop.pause(); // the poster frame stays
    return;
  }
  // Autoplay can be refused until the page is touched; retry on the first interaction.
  const play = () => backdrop.play().catch(() => {});
  play();
  addEventListener('pointerdown', play, { once: true });
  addEventListener('keydown', play, { once: true });
}

// ─── Lightning ──────────────────────────────────────────────────

const storm = $('.storm');
const glare = $('.glare');

const between = (a, b) => a + Math.random() * (b - a);

// Cloud billows around the strike point, lit from inside.
function cloudGlow(x, y) {
  const billows = Array.from({ length: 7 }, () => {
    const bx = x + between(-18, 18);
    const by = y + between(-8, 12);
    const w = between(12, 30);
    const h = w * between(0.5, 0.8);
    return `radial-gradient(ellipse ${w}% ${h}% at ${bx}% ${by}%, rgba(255, ${Math.round(between(50, 110))}, ${Math.round(between(40, 80))}, ${between(0.5, 0.9)}), transparent 70%)`;
  });
  const core = `radial-gradient(ellipse 26% 18% at ${x}% ${y}%, rgba(255, 150, 120, 0.6), transparent 75%)`;
  const wash = `radial-gradient(ellipse 120% 90% at ${x}% ${y}%, rgba(210, 35, 22, 0.5), transparent 75%)`;
  return [core, ...billows, wash].join(', ');
}

// An uneven flicker: a few sharp flashes of different strength, then a slow fade.
function flickerCurve() {
  const frames = [{ offset: 0, v: 0 }];
  const pulses = Math.floor(between(2, 5));
  let t = 0;
  for (let i = 0; i < pulses; i++) {
    t += between(0.03, 0.12);
    frames.push({ offset: t, v: i === 0 ? between(0.8, 1) : between(0.5, 1) });
    t += between(0.02, 0.06);
    frames.push({ offset: t, v: between(0, 0.25) });
  }
  frames.push({ offset: Math.min(t + 0.05, 0.6), v: between(0.4, 0.8) });
  frames.push({ offset: 1, v: 0 });
  return frames;
}

function strike() {
  if (reducedMotion) return;
  const x = between(10, 90);
  const y = between(-10, 10);
  storm.style.background = cloudGlow(x, y);
  glare.style.background = `radial-gradient(ellipse 90% 70% at ${x}% ${y}%, rgba(255, 90, 60, 0.4), transparent 80%)`;

  const curve = flickerCurve();
  const timing = { duration: between(1100, 1900), easing: 'linear' };
  storm.animate(curve.map(({ offset, v }) => ({ offset, opacity: v })), timing);
  glare.animate(curve.map(({ offset, v }) => ({ offset, opacity: v * 0.8 })), timing);
  backdrop.animate(curve.map(({ offset, v }) => ({ offset, filter: `brightness(${1 + v * 0.7}) saturate(${1 + v * 0.3})` })), timing);
}

function scheduleAmbientLightning() {
  if (reducedMotion) return;
  setTimeout(() => {
    strike();
    scheduleAmbientLightning();
  }, 9000 + Math.random() * 14000);
}

// ─── Answer ─────────────────────────────────────────────────────

function showAnswer(text) {
  answerEl.replaceChildren();
  answerEl.setAttribute('aria-label', text);
  [...text].forEach((char, i) => {
    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    if (char === ' ') {
      span.className = 'gap';
    } else {
      span.className = 'letter';
      span.textContent = char;
      span.style.animationDelay = `${i * LETTER_DELAY_MS}ms`;
    }
    answerEl.append(span);
  });
}

function clearAnswer() {
  answerEl.replaceChildren();
  answerEl.removeAttribute('aria-label');
}

// ─── Input rules ────────────────────────────────────────────────

function looksLikeQuestion(text) {
  if (text.endsWith('?')) return true;
  const firstWord = text.toLowerCase().split(/\s+/)[0].replace(/[^a-z']/g, '');
  return QUESTION_OPENERS.has(firstWord);
}

function setOmen(message, tone = '') {
  omen.textContent = message;
  omen.className = `ask__omen${tone ? ` is-${tone}` : ''}`;
}

function reject(message) {
  setOmen(message, 'warning');
  field.classList.remove('is-rejected');
  void field.offsetWidth; // restart the animation
  field.classList.add('is-rejected');
  input.focus();
}

input.addEventListener('input', () => {
  const text = input.value.trim();
  const firstWordDone = /\s/.test(input.value.trimStart());
  if (!text) return setOmen(OMEN.idle);
  if (firstWordDone && !looksLikeQuestion(text)) return setOmen(OMEN.statement, 'warning');
  setOmen(OMEN.idle);
});

// ─── Asking ─────────────────────────────────────────────────────

function setAsking(active) {
  document.body.classList.toggle('is-asking', active);
  button.disabled = active;
  input.readOnly = active;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = input.value.trim();

  if (question.length < 3) return reject(OMEN.tooShort);
  if (!looksLikeQuestion(question)) return reject(OMEN.statement);

  setAsking(true);
  setOmen(OMEN.asking);
  clearAnswer();

  const startedAt = performance.now();
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json().catch(() => ({}));

    // Let the silence hang for a moment. Instant answers feel wrong.
    const elapsed = performance.now() - startedAt;
    if (elapsed < 1800) await new Promise((r) => setTimeout(r, 1800 - elapsed));

    if (!res.ok) return reject(data.error || 'Nothing answers.');

    console.log(`[upside down] ${question} → ${data.answer}`);
    strike();
    showAnswer(data.answer);
    setOmen(OMEN.spoken);
    input.value = '';
  } catch (err) {
    console.error('[upside down]', err);
    reject('The connection to the other side was severed.');
  } finally {
    setAsking(false);
    input.focus();
  }
});

startBackdrop();
startSpores();
scheduleAmbientLightning();
input.focus();
