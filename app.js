// app.js — refactored for clarity + efficiency (same behavior)

// ---------------- Data ----------------
const COUNTRIES = [
  { id: "ca", name: "Canada", region: "north" },
  { id: "us", name: "United States", region: "north" },
  { id: "mx", name: "Mexico", region: "north" },

  { id: "bz", name: "Belize", region: "central" },
  { id: "gt", name: "Guatemala", region: "central" },
  { id: "hn", name: "Honduras", region: "central" },
  { id: "sv", name: "El Salvador", region: "central" },
  { id: "ni", name: "Nicaragua", region: "central" },
  { id: "cr", name: "Costa Rica", region: "central" },
  { id: "pa", name: "Panama", region: "central" },

  { id: "co", name: "Colombia", region: "south" },
  { id: "ve", name: "Venezuela", region: "south" },
  { id: "gy", name: "Guyana", region: "south" },
  { id: "sr", name: "Suriname", region: "south" },
  { id: "ec", name: "Ecuador", region: "south" },
  { id: "pe", name: "Peru", region: "south" },
  { id: "br", name: "Brazil", region: "south" },
  { id: "bo", name: "Bolivia", region: "south" },
  { id: "py", name: "Paraguay", region: "south" },
  { id: "cl", name: "Chile", region: "south" },
  { id: "ar", name: "Argentina", region: "south" },
  { id: "uy", name: "Uruguay", region: "south" },

  { id: "bs", name: "Bahamas", region: "caribbean" },
  { id: "cu", name: "Cuba", region: "caribbean" },
  { id: "jm", name: "Jamaica", region: "caribbean" },
  { id: "ht", name: "Haiti", region: "caribbean" },
  { id: "do", name: "Dominican Republic", region: "caribbean" },
  { id: "tt", name: "Trinidad and Tobago", region: "caribbean" },

  { id: "pr", name: "Puerto Rico (USA)", region: "caribbean" },
  { id: "gf", name: "French Guiana (France)", region: "south" }
];

// If your SVG includes additional tiny islands you disabled previously, keep them here.
const DISABLED_ISLANDS = ["bb", "gd", "lc", "vc", "ag", "kn", "dm"];

// Optional pronunciation overrides
const PRONUNCIATION = {};

// ---------------- Indexes ----------------
const byId = new Map(COUNTRIES.map(c => [c.id, c]));
const disabledSet = new Set(DISABLED_ISLANDS);

// ---------------- DOM ----------------
const mapContainer = document.getElementById("mapContainer");
const mapStatus = document.getElementById("mapStatus");
const promptEl = document.getElementById("prompt");
const subpromptEl = document.getElementById("subprompt");

const timerEl = document.getElementById("timer");
const progressEl = document.getElementById("progress");
const percentEl = document.getElementById("percent");
const resultsEl = document.getElementById("results");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const endModal = document.getElementById("endModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const finalPercentEl = document.getElementById("finalPercent");
const finalTimeEl = document.getElementById("finalTime");
const perfectBox = document.getElementById("perfectBox");
const confettiCanvas = document.getElementById("confettiCanvas");

const modebar = document.getElementById("modebar");
const modeButtons = modebar ? Array.from(modebar.querySelectorAll(".modebtn")) : [];

// ---------------- State ----------------
const state = {
  svgEl: null,
  originalViewBox: null,

  mode: "all",          // all | caribbean | central | south
  activeCountries: [],  // array of country objects for current mode

  order: [],            // array of ids (shuffled)
  index: 0,
  score: 0,
  completed: new Set(),
  running: false,
  firstClickUsed: false,

  startTime: 0,
  timerRAF: 0
};

// id -> { rootEl, paintEls[] }
const countryEls = new Map();

// Rings: id -> circleElement
const hitTargets = new Map();

// Cached bboxes in SVG viewBox coordinates: id -> {x,y,w,h}
const bboxCache = new Map();

// ---------------- UI Helpers ----------------
function setStatus(text) {
  mapStatus.textContent = text;
}

function setPrompt(country) {
  promptEl.textContent = country ? country.name : "—";
  if (subpromptEl) subpromptEl.textContent = "";
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeActiveCountries(mode) {
  if (mode === "all") return COUNTRIES;
  return COUNTRIES.filter(c => c.region === mode);
}

function setProgressAndPercent() {
  const total = state.activeCountries.length || 0;
  progressEl.textContent = `${Math.min(state.index, total)} / ${total}`;
  const pct = total ? (state.score / total) * 100 : 0;
  if (percentEl) percentEl.textContent = `${Math.round(pct)}%`;
}

// ---------------- Timer ----------------
function tick() {
  if (!state.running) return;
  timerEl.textContent = `${((performance.now() - state.startTime) / 1000).toFixed(1)}s`;
  state.timerRAF = requestAnimationFrame(tick);
}

function stopTimer() {
  state.running = false;
  cancelAnimationFrame(state.timerRAF);
  state.timerRAF = 0;
}

// ---------------- SVG target mapping ----------------
function getPaintTargets(rootEl) {
  if (!rootEl) return [];
  const tag = (rootEl.tagName || "").toLowerCase();

  // If it's a group, use children; otherwise just the element
  if (tag === "g") {
    const inner = rootEl.querySelectorAll("path, polygon, rect, circle, ellipse, polyline, line");
    return inner.length ? Array.from(inner) : [rootEl];
  }
  return [rootEl];
}

// ---------------- Classes ----------------
function addClassToTargets(id, className) {
  const entry = countryEls.get(id);
  if (!entry) return;
  for (const el of entry.paintEls) el.classList.add(className);
}

function removeClassFromTargets(id, className) {
  const entry = countryEls.get(id);
  if (!entry) return;
  for (const el of entry.paintEls) el.classList.remove(className);
}

function resetClasses() {
  // "country" is added once at load time; we only clear quiz-state classes here
  for (const { id } of COUNTRIES) {
    removeClassFromTargets(id, "wrong");
    removeClassFromTargets(id, "correct");
    removeClassFromTargets(id, "locked");
  }
}

function markWrong(id) {
  addClassToTargets(id, "wrong");
  setTimeout(() => removeClassFromTargets(id, "wrong"), 1000);
}

function markCorrect(id) {
  addClassToTargets(id, "correct");
  addClassToTargets(id, "locked");
}

// ---------------- Audio ----------------
let audioCtx = null;

function ensureAudio() {
  if (!(window.AudioContext || window.webkitAudioContext)) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playWrongBeep() {
  ensureAudio();
  if (!audioCtx) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(240, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.20);
}

function playFanfare() {
  ensureAudio();
  if (!audioCtx) return;

  const t0 = audioCtx.currentTime + 0.02;
  const notes = [523.25, 659.25, 783.99, 1046.5];

  function note(freq, start, dur, vol = 0.20) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  notes.forEach((f, i) => note(f, t0 + i * 0.14, 0.18, 0.22));
  note(1567.98, t0 + 0.60, 0.35, 0.18);
}

// ---------------- Confetti ----------------
let confettiRAF = 0;
let confettiActive = false;

function stopConfetti() {
  confettiActive = false;
  cancelAnimationFrame(confettiRAF);
  confettiRAF = 0;
}

function startConfetti(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  resize();

  const colors = ["#ffffff", "#7aa7ff", "#35d07f", "#ff5c75", "#f7d154"];
  const N = 180;

  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 1.3 * dpr,
    vy: (2.0 + Math.random() * 3.6) * dpr,
    r: (2 + Math.random() * 4) * dpr,
    a: Math.random() * Math.PI * 2,
    va: (Math.random() - 0.5) * 0.25,
    c: colors[(Math.random() * colors.length) | 0],
    wob: (Math.random() * 0.8 + 0.2) * dpr
  }));

  confettiActive = true;

  function frame() {
    if (!confettiActive) return;
    resize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of parts) {
      p.x += p.vx + Math.sin(p.a) * p.wob;
      p.y += p.vy;
      p.a += p.va;

      if (p.y > canvas.height + 20 * dpr) {
        p.y = -20 * dpr;
        p.x = Math.random() * canvas.width;
      }
      if (p.x < -20 * dpr) p.x = canvas.width + 20 * dpr;
      if (p.x > canvas.width + 20 * dpr) p.x = -20 * dpr;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = 0.95;
      ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2.2, p.r * 1.2);
      ctx.restore();
    }

    confettiRAF = requestAnimationFrame(frame);
  }

  frame();
}

// ---------------- End modal ----------------
function openEndModal({ percentText, timeText, perfect }) {
  if (finalPercentEl) finalPercentEl.textContent = percentText;
  if (finalTimeEl) finalTimeEl.textContent = timeText;

  if (perfect) {
    if (perfectBox) perfectBox.classList.remove("hidden");
    if (confettiCanvas) startConfetti(confettiCanvas);
    playFanfare();
  } else {
    if (perfectBox) perfectBox.classList.add("hidden");
    stopConfetti();
  }

  endModal.classList.remove("hidden");
}

function closeEndModal() {
  endModal.classList.add("hidden");
  stopConfetti();
}

// ---------------- Speech ----------------
let selectedVoice = null;

function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  const isEnglish = (v) => /^en(-|_)?/i.test(v.lang || "");
  const preferredNameMatchers = [
    /google (us )?english/i,
    /google english/i,
    /samantha/i,
    /alex/i
  ];

  for (const rx of preferredNameMatchers) {
    const v = voices.find(v => isEnglish(v) && rx.test(v.name || ""));
    if (v) { selectedVoice = v; return; }
  }

  selectedVoice =
    voices.find(v => (v.lang || "").toLowerCase() === "en-us") ||
    voices.find(isEnglish) ||
    voices[0];
}

if ("speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = () => pickVoice();
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;

  if (synth.speaking || synth.pending) synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  if (selectedVoice) u.voice = selectedVoice;
  u.rate = 0.95;
  u.pitch = 1.05;
  u.volume = 1.0;

  let started = false;
  u.onstart = () => { started = true; };

  setTimeout(() => { try { synth.speak(u); } catch (_) {} }, 40);

  // fallback retry (same behavior)
  setTimeout(() => {
    if (!started && !synth.speaking) {
      try {
        synth.cancel();
        const u2 = new SpeechSynthesisUtterance(text);
        u2.lang = "en-US";
        if (selectedVoice) u2.voice = selectedVoice;
        u2.rate = 0.95;
        u2.pitch = 1.05;
        u2.volume = 1.0;
        synth.speak(u2);
      } catch (_) {}
    }
  }, 220);
}

// ---------------- Zoom + BBox (robust) ----------------
function getBBoxInSvgViewBoxCoords(el) {
  const svgEl = state.svgEl;
  if (!svgEl || !el || typeof el.getBBox !== "function") return null;

  let bb;
  try { bb = el.getBBox(); } catch { return null; }

  const elemM = el.getScreenCTM?.();
  const svgM = svgEl.getScreenCTM?.();
  if (!elemM || !svgM) return null;

  let invSvg;
  try { invSvg = svgM.inverse(); } catch { return null; }

  const toSvgPt = (x, y) => {
    const sx = elemM.a * x + elemM.c * y + elemM.e;
    const sy = elemM.b * x + elemM.d * y + elemM.f;
    const vx = invSvg.a * sx + invSvg.c * sy + invSvg.e;
    const vy = invSvg.b * sx + invSvg.d * sy + invSvg.f;
    return { x: vx, y: vy };
  };

  const p1 = toSvgPt(bb.x, bb.y);
  const p2 = toSvgPt(bb.x + bb.width, bb.y);
  const p3 = toSvgPt(bb.x, bb.y + bb.height);
  const p4 = toSvgPt(bb.x + bb.width, bb.y + bb.height);

  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function unionBBox(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function setViewBox(vb) {
  const svgEl = state.svgEl;
  if (!svgEl) return;
  svgEl.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function restoreViewBox() {
  const svgEl = state.svgEl;
  if (!svgEl || !state.originalViewBox) return;
  svgEl.setAttribute("viewBox", state.originalViewBox);
}

function getCountryBBoxCached(id) {
  if (bboxCache.has(id)) return bboxCache.get(id);

  const entry = countryEls.get(id);
  if (!entry) return null;

  let b = getBBoxInSvgViewBoxCoords(entry.rootEl);
  if (!b) {
    for (const pe of entry.paintEls) {
      b = getBBoxInSvgViewBoxCoords(pe);
      if (b) break;
    }
  }

  if (!b || !Number.isFinite(b.w) || !Number.isFinite(b.h) || b.w <= 0 || b.h <= 0) return null;

  bboxCache.set(id, b);
  return b;
}

function zoomToActiveCountries() {
  if (!state.svgEl) return;

  if (state.mode === "all") {
    restoreViewBox();
    return;
  }

  let bbox = null;
  for (const c of state.activeCountries) {
    const b = getCountryBBoxCached(c.id);
    if (b) bbox = unionBBox(bbox, b);
  }

  if (!bbox || !Number.isFinite(bbox.w) || !Number.isFinite(bbox.h) || bbox.w <= 0 || bbox.h <= 0) {
    restoreViewBox();
    return;
  }

  const padPct =
    state.mode === "caribbean" ? 0.06 :
    state.mode === "central" ? 0.08 :
    0.10;

  const padX = bbox.w * padPct;
  const padY = bbox.h * padPct;

  setViewBox({
    x: bbox.x - padX,
    y: bbox.y - padY,
    w: bbox.w + padX * 2,
    h: bbox.h + padY * 2
  });
}

function zoomNextFrame() {
  requestAnimationFrame(() => requestAnimationFrame(zoomToActiveCountries));
}

// ---------------- Click helper rings ----------------
function removeHitTarget(id) {
  const el = hitTargets.get(id);
  if (el && el.parentNode) el.parentNode.removeChild(el);
  hitTargets.delete(id);
}

function addHitCircleForCountry(id, radius) {
  const svgEl = state.svgEl;
  if (!svgEl) return;
  if (!countryEls.has(id)) return;

  removeHitTarget(id);

  const b = getCountryBBoxCached(id);
  if (!b) return;

  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  const ns = "http://www.w3.org/2000/svg";
  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(radius));
  circle.classList.add("hit-target");

  circle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleCountryClick(id);
  });

  svgEl.appendChild(circle);
  hitTargets.set(id, circle);
}

function buildClickHelperRings() {
  // Only add rings if those shapes exist in the SVG
  if (countryEls.has("bs")) addHitCircleForCountry("bs", 45); // Bahamas
  if (countryEls.has("tt")) addHitCircleForCountry("tt", 40); // Trinidad & Tobago
}

// ---------------- Quiz flow ----------------
function nextPrompt() {
  if (state.index >= state.activeCountries.length) {
    finishQuiz();
    return;
  }

  state.firstClickUsed = false;
  const targetId = state.order[state.index];
  const country = byId.get(targetId);

  setPrompt(country);
  speak(PRONUNCIATION[country.id] || country.name);

  setStatus("Click the correct country on the map.");
}

function finishQuiz() {
  stopTimer();
  setPrompt(null);
  setStatus("Finished.");

  const elapsed = (performance.now() - state.startTime) / 1000;
  const total = state.activeCountries.length || 0;
  const pct = total ? (state.score / total) * 100 : 0;
  const perfect = total > 0 && state.score === total;

  resultsEl.classList.remove("muted");
  resultsEl.innerHTML = `
    <div><strong>Score:</strong> ${state.score} / ${total} (${pct.toFixed(1)}%)</div>
    <div><strong>Time:</strong> ${elapsed.toFixed(1)}s</div>
  `;

  openEndModal({
    percentText: `${pct.toFixed(1)}%`,
    timeText: `${elapsed.toFixed(1)}s`,
    perfect
  });

  setProgressAndPercent();
}

function handleCountryClick(id) {
  if (!state.running) return;
  if (state.completed.has(id)) return;

  const targetId = state.order[state.index];

  if (id === targetId) {
    if (!state.firstClickUsed) state.score++;
    state.completed.add(id);
    markCorrect(id);

    state.index++;
    setProgressAndPercent();
    nextPrompt();
  } else {
    if (!state.firstClickUsed) state.firstClickUsed = true;
    playWrongBeep();
    markWrong(id);
    setStatus("Nope — try again.");
  }
}

// ---------------- Lifecycle: mode/reset/start ----------------
function resetToIdle() {
  stopTimer();

  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  state.order = [];
  state.index = 0;
  state.score = 0;
  state.firstClickUsed = false;
  state.completed.clear();

  resultsEl.classList.add("muted");
  resultsEl.textContent = "Press Start to begin.";
  timerEl.textContent = "0.0s";

  startBtn.disabled = false;
  restartBtn.disabled = true;

  setPrompt(null);
  setStatus("Ready.");

  resetClasses();
  closeEndModal();

  setProgressAndPercent();
  zoomNextFrame();
}

function setMode(mode) {
  if (state.running) return;

  state.mode = mode;
  state.activeCountries = computeActiveCountries(mode);

  modeButtons.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));

  resetToIdle();
}

function startQuiz() {
  ensureAudio();
  pickVoice();
  closeEndModal();

  state.activeCountries = computeActiveCountries(state.mode);
  zoomNextFrame();

  // Only include countries that actually exist in the loaded SVG
  const available = state.activeCountries.filter(c => countryEls.has(c.id));
  state.order = shuffle(available.map(c => c.id));

  state.index = 0;
  state.score = 0;
  state.completed.clear();
  state.firstClickUsed = false;

  resultsEl.classList.add("muted");
  resultsEl.textContent = "Quiz running…";

  startBtn.disabled = true;
  restartBtn.disabled = false;

  resetClasses();

  state.startTime = performance.now();
  state.running = true;
  tick();

  setProgressAndPercent();
  nextPrompt();
}

// ---------------- SVG: event delegation ----------------
function onSvgClick(e) {
  if (!state.svgEl) return;

  // Walk upward until we find a parent whose id is a real country id
  let el = e.target;

  while (el && el !== state.svgEl) {
    const id = el.id;

    if (
      id &&
      byId.has(id) &&
      !disabledSet.has(id) &&
      countryEls.has(id)
    ) {
      e.preventDefault();
      e.stopPropagation();
      handleCountryClick(id);
      return;
    }

    el = el.parentElement;
  }
}


// ---------------- Load SVG ----------------
async function loadSVG() {
  try {
    setStatus("Loading map…");
    const res = await fetch("americas.svg", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    mapContainer.innerHTML = await res.text();

    state.svgEl = mapContainer.querySelector("svg");
    if (!state.svgEl) throw new Error("No <svg> found in americas.svg");

    state.originalViewBox = state.svgEl.getAttribute("viewBox");
    if (!state.originalViewBox) {
      const w = Number(state.svgEl.getAttribute("width")) || 2752.766;
      const h = Number(state.svgEl.getAttribute("height")) || 1537.631;
      state.originalViewBox = `0 0 ${w} ${h}`;
      state.svgEl.setAttribute("viewBox", state.originalViewBox);
    }

    // Clear maps/caches if hot-reloading / reloading
    countryEls.clear();
    hitTargets.clear();
    bboxCache.clear();

    // Wire up country elements by id (no per-country click listeners)
    for (const { id } of COUNTRIES) {
      const rootEl = mapContainer.querySelector(`#${CSS.escape(id)}`);
      if (!rootEl) continue;

      const paintEls = getPaintTargets(rootEl);
      countryEls.set(id, { rootEl, paintEls });

      // Add base class once
      for (const el of paintEls) el.classList.add("country");
    }

    // Disable small islands (optional)
    for (const id of DISABLED_ISLANDS) {
      const rootEl = mapContainer.querySelector(`#${CSS.escape(id)}`);
      if (!rootEl) continue;
      const paintEls = getPaintTargets(rootEl);
      for (const el of paintEls) {
        el.classList.add("disabled-island");
        el.style.pointerEvents = "none";
      }
      rootEl.style.pointerEvents = "none";
    }

    // One delegated click listener for the whole svg
    state.svgEl.addEventListener("click", onSvgClick);

    // Cache bboxes once after a layout frame so CTMs are stable
    requestAnimationFrame(() => {
      for (const { id } of COUNTRIES) getCountryBBoxCached(id);
      buildClickHelperRings();
      zoomNextFrame();
    });

    setStatus("Map loaded.");
    resetClasses();

    // Sync active list + stats
    state.activeCountries = computeActiveCountries(state.mode);
    setProgressAndPercent();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load "americas.svg"');
    resultsEl.classList.remove("muted");
    resultsEl.textContent = 'Could not load americas.svg. Make sure it is in the repo root.';
  }
}

// ---------------- Events ----------------
modeButtons.forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

startBtn.addEventListener("click", startQuiz);
restartBtn.addEventListener("click", resetToIdle);

closeModalBtn.addEventListener("click", closeEndModal);
endModal.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("modal-backdrop")) closeEndModal();
});

// SPACEBAR CONTROLS
// - Idle: Space starts (same as clicking Start)
// - Running: Space resets to idle (Start Over), does NOT auto-start
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;

  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  e.preventDefault();

  if (state.running) {
    resetToIdle();
  } else {
    startBtn.click();
  }
});

// ---------------- Init ----------------
function init() {
  state.activeCountries = computeActiveCountries(state.mode);
  resetToIdle();
  loadSVG();
  setMode("all"); // preserves your original behavior
}

init();
