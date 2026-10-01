// Live mel spectrogram for the hero: synthetic speech at rest, the visitor's microphone or a piano phrase on demand.
// Everything runs in the browser; no audio is recorded or sent anywhere.
(() => {
  const canvas = document.getElementById('spec');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const axisEl = document.getElementById('axis');
  const statusEl = document.getElementById('status');
  const noteEl = document.getElementById('note');
  const micBtn = document.getElementById('mic');
  const micLbl = micBtn.querySelector('.lbl');
  const pianoBtn = document.getElementById('piano');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IDLE = 'idle · synthetic speech';

  const F_MIN = 60, F_MAX = 8000;
  const mel = f => 2595 * Math.log10(1 + f / 700);
  const imel = m => 700 * (Math.pow(10, m / 2595) - 1);
  const M0 = mel(F_MIN), M1 = mel(F_MAX);

  [[250, '250 Hz'], [500, '500'], [1000, '1 kHz'], [2000, '2k'], [4000, '4k'], [8000, '8k']].forEach(([f, label]) => {
    const s = document.createElement('span');
    const y = 1 - (mel(f) - M0) / (M1 - M0);
    s.style.top = Math.min(96, Math.max(4, y * 100)) + '%';
    s.textContent = label;
    axisEl.appendChild(s);
  });

  // Colour map from theme tokens: floor → mid → ultramarine → gold
  const lut = new Uint8ClampedArray(256 * 3);
  function rgb(str) {
    const probe = document.createElement('i');
    probe.style.color = str;
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g).map(Number);
    probe.remove();
    return m.slice(0, 3);
  }
  function buildLut() {
    const cs = getComputedStyle(document.documentElement);
    const stops = [
      [0.00, rgb(cs.getPropertyValue('--spec-floor').trim())],
      [0.38, rgb(cs.getPropertyValue('--spec-mid').trim())],
      [0.72, rgb(cs.getPropertyValue('--ultramarine').trim())],
      [1.00, rgb(cs.getPropertyValue('--gold').trim())],
    ];
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      let k = 0;
      while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
      const [a, ca] = stops[k], [b, cb] = stops[k + 1];
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = ca[c] + (cb[c] - ca[c]) * t;
    }
  }

  let W = 0, H = 0, colW = 2, rowFreq = new Float32Array(0), column = null;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    H = Math.max(2, Math.round(canvas.clientHeight * dpr));
    canvas.width = W;
    canvas.height = H;
    colW = Math.max(1, Math.round(2 * dpr));
    rowFreq = new Float32Array(H);
    for (let y = 0; y < H; y++) rowFreq[y] = imel(M0 + (M1 - M0) * (1 - y / (H - 1)));
    column = ctx.createImageData(colW, H);
    binOfRow = null;
    prefill();
  }

  // Synthetic speech: voiced harmonics shaped by moving formants, syllable rhythm and soft fricatives
  function synthValue(f, t, rnd) {
    const gate = Math.max(0, Math.sin(2 * Math.PI * 0.31 * t) + 0.55);
    const syl = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 3.1 * t)), 1.4) * Math.min(1, gate);
    const f0 = 135 + 28 * Math.sin(2 * Math.PI * 0.45 * t) + 10 * Math.sin(2 * Math.PI * 1.7 * t);
    const h = f / f0, d = h - Math.round(h);
    const comb = h < 0.5 ? 0 : Math.exp(-(d * d) / (2 * 0.05 * 0.05));
    const lf = Math.log(f);
    const F1 = 520 + 230 * Math.sin(2 * Math.PI * 1.3 * t);
    const F2 = 1550 + 620 * Math.sin(2 * Math.PI * 0.8 * t + 1.1);
    const F3 = 2650 + 180 * Math.sin(2 * Math.PI * 0.5 * t);
    const g = (F, bw) => Math.exp(-Math.pow(lf - Math.log(F), 2) / (2 * bw * bw));
    const env = g(F1, 0.28) + 0.75 * g(F2, 0.22) + 0.45 * g(F3, 0.18) + 0.25 * g(240, 0.5);
    const tilt = 1 / (1 + f / 2600);
    const burst = Math.max(0, Math.sin(2 * Math.PI * 1.55 * t + 2) - 0.8) * 5;
    const hp = Math.min(1, Math.max(0, (f - 2500) / 2500));
    const fric = (1 - syl) * Math.min(1, gate) * burst * hp * 0.16 * rnd * rnd;
    const v = syl * comb * env * tilt * 1.8 + fric + 0.004 * rnd;
    return Math.min(1, Math.sqrt(Math.max(0, v)));
  }

  function paintColumn(valueAt) {
    const d = column.data;
    for (let y = 0; y < H; y++) {
      const i = Math.max(0, Math.min(255, (valueAt(y) * 255) | 0)) * 3;
      for (let x = 0; x < colW; x++) {
        const p = (y * colW + x) * 4;
        d[p] = lut[i]; d[p + 1] = lut[i + 1]; d[p + 2] = lut[i + 2]; d[p + 3] = 255;
      }
    }
  }

  let tSynth = 0;
  function synthColumn() {
    paintColumn(y => synthValue(rowFreq[y], tSynth, Math.random()));
    tSynth += 1 / 60;
  }
  function prefill() {
    if (!column) return;
    tSynth = 0;
    const cols = Math.ceil(W / colW);
    for (let c = 0; c < cols; c++) { synthColumn(); ctx.putImageData(column, c * colW, 0); }
  }

  // Audio
  let ac = null, analyser = null, freq = null, binOfRow = null, mode = 'idle', micStream = null, micSource = null;
  let pianoNodes = [], pianoTimer = 0;
  function ensureAudio() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.15;
    freq = new Float32Array(analyser.frequencyBinCount);
  }
  function mapBins() {
    const nyq = ac.sampleRate / 2, n = analyser.frequencyBinCount;
    binOfRow = new Uint16Array(H);
    for (let y = 0; y < H; y++) binOfRow[y] = Math.min(n - 1, Math.round(rowFreq[y] / nyq * n));
  }
  function liveColumn() {
    analyser.getFloatFrequencyData(freq);
    if (!binOfRow) mapBins();
    paintColumn(y => Math.min(1, Math.max(0, (freq[binOfRow[y]] + 100) / 72)));
  }

  function setMode(next, label) {
    mode = next;
    statusEl.textContent = label;
    micBtn.setAttribute('aria-pressed', String(next === 'mic'));
    pianoBtn.setAttribute('aria-pressed', String(next === 'piano'));
    micLbl.textContent = next === 'mic' ? 'Stop listening' : 'Say hello';
    if (!running) loop();
  }

  async function toggleMic() {
    if (mode === 'mic') { stopMic(); setMode('idle', IDLE); noteEl.textContent = ''; return; }
    stopPiano();
    try {
      ensureAudio();
      await ac.resume();
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      micSource = ac.createMediaStreamSource(micStream);
      micSource.connect(analyser);
      mapBins();
      setMode('mic', 'listening · your microphone');
      noteEl.textContent = 'Your voice is analysed in this browser tab. Nothing is recorded or sent.';
    } catch (e) {
      noteEl.textContent = 'The microphone isn’t available here. Allow it in your browser, or try the piano phrase.';
    }
  }
  function stopMic() {
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  }

  // Additive piano: decaying, slightly inharmonic partials
  function playPiano() {
    if (mode === 'piano') { stopPiano(); setMode('idle', IDLE); return; }
    stopMic();
    noteEl.textContent = '';
    ensureAudio();
    ac.resume();
    const out = ac.createGain();
    out.gain.value = 0.55;
    out.connect(analyser);
    out.connect(ac.destination);
    const A = 220, semis = [0, 3, 7, 12, 10, 7, 5, 7, 3, 0], step = 0.34;
    const now = ac.currentTime + 0.05;
    semis.forEach((s, i) => {
      const f = A * Math.pow(2, s / 12), t0 = now + i * step;
      for (let k = 1; k <= 9; k++) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f * k * Math.sqrt(1 + 0.0004 * k * k);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.22 / Math.pow(k, 1.15), t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8 / Math.sqrt(k));
        o.connect(g).connect(out);
        o.start(t0);
        o.stop(t0 + 2);
        pianoNodes.push(o);
      }
    });
    mapBins();
    setMode('piano', 'playing · piano phrase in A minor');
    clearTimeout(pianoTimer);
    pianoTimer = setTimeout(() => { pianoNodes = []; if (mode === 'piano') setMode('idle', IDLE); }, (semis.length * step + 2) * 1000);
  }
  function stopPiano() {
    pianoNodes.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } });
    pianoNodes = [];
    clearTimeout(pianoTimer);
  }

  // Render loop: shift left, paint the newest column on the right
  let running = false, visible = true;
  function loop() {
    running = true;
    const tick = () => {
      if ((mode === 'idle' && (reduce || !visible)) || !column) { running = false; return; }
      ctx.drawImage(canvas, -colW, 0);
      if (mode === 'idle') synthColumn(); else liveColumn();
      ctx.putImageData(column, W - colW, 0);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !running && !reduce) loop(); }).observe(canvas);

  micBtn.addEventListener('click', toggleMic);
  pianoBtn.addEventListener('click', playPiano);

  function rethemed() { buildLut(); prefill(); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rethemed);
  new MutationObserver(rethemed).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  buildLut();
  let lastW = 0, lastH = 0;
  new ResizeObserver(() => {
    if (canvas.clientWidth === lastW && canvas.clientHeight === lastH) return;
    lastW = canvas.clientWidth; lastH = canvas.clientHeight;
    resize();
  }).observe(canvas);
  if (!reduce) loop();
})();
