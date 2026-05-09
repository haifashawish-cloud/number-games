'use strict';

// ============================================================
// DATA
// ============================================================

const NUMBER_WORDS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
  'eighteen','nineteen','twenty'
];

const SEASON_EMOJIS = {
  spring: ['🌸','🌼','🌱','🐣','🦋','🌈','🐝','🌷','🐛','🦔',
            '🌿','🐸','🌺','🐌','🌻','🦜','🌾','🦊','🌲','🍃'],
  summer: ['☀️','🌊','🏖️','🍦','🌴','🌺','🦀','🐠','🌅','🏄',
            '🍉','🌻','🦈','🐚','🌞','🍹','🦩','🐬','⛵','🏝️'],
  autumn: ['🍂','🍁','🎃','🌾','🍄','🦔','🍇','🌰','🦃','🍎',
            '🕷️','🌽','🦉','🐿️','🍂','🌿','🦊','🍁','🌾','🍄'],
  winter: ['❄️','⛄','🎄','🔔','🦌','⭐','🎁','🕯️','🌨️','🧦',
            '🍪','🔥','🌟','🧤','⛷️','🌙','🎿','🏔️','🦢','🐧'],
};

const TITLE_EMOJIS = { spring:'🌸', summer:'☀️', autumn:'🍂', winter:'❄️' };

const PHONICS = {
  a:{hint:'apple',  tts:'a, apple'},
  b:{hint:'ball',   tts:'b, ball'},
  c:{hint:'cat',    tts:'c, cat'},
  d:{hint:'dog',    tts:'d, dog'},
  e:{hint:'egg',    tts:'e, egg'},
  f:{hint:'fish',   tts:'f, fish'},
  g:{hint:'go',     tts:'g, go'},
  h:{hint:'hat',    tts:'h, hat'},
  i:{hint:'ink',    tts:'i, ink'},
  j:{hint:'jam',    tts:'j, jam'},
  k:{hint:'kite',   tts:'k, kite'},
  l:{hint:'log',    tts:'l, log'},
  m:{hint:'map',    tts:'m, map'},
  n:{hint:'net',    tts:'n, net'},
  o:{hint:'orange', tts:'o, orange'},
  p:{hint:'pig',    tts:'p, pig'},
  q:{hint:'queen',  tts:'q, queen'},
  r:{hint:'run',    tts:'r, run'},
  s:{hint:'sun',    tts:'s, sun'},
  t:{hint:'tap',    tts:'t, tap'},
  u:{hint:'up',     tts:'u, up'},
  v:{hint:'van',    tts:'v, van'},
  w:{hint:'wet',    tts:'w, wet'},
  x:{hint:'fox',    tts:'x, fox'},
  y:{hint:'yes',    tts:'y, yes'},
  z:{hint:'zip',    tts:'z, zip'},
};

const BLENDING_WORDS = {
  spring: ['cat','hat','mat','sat','map','nap','tap','cap','bag','rag','van','jam','fan','ran','pan'],
  summer: ['sun','fun','run','bun','hot','dot','pot','mud','bug','mug','tub','hug','cup','pup','bus'],
  autumn: ['log','fog','dog','red','bed','fed','wet','hen','ten','den','leg','peg','jet','set','beg'],
  winter: ['win','tin','pin','bin','sit','hit','bit','fit','pig','big','dig','lip','tip','zip','lid'],
};

// ============================================================
// INDEXEDDB
// ============================================================

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('NumberGamesDB', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('recordings');
    req.onsuccess     = e => resolve(e.target.result);
    req.onerror       = e => reject(e.target.error);
  });
}

function dbPut(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    tx.objectStore('recordings').put(value, key);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

function dbGet(key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('recordings', 'readonly');
    const req = tx.objectStore('recordings').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbDelete(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    tx.objectStore('recordings').delete(key);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

function dbGetAllKeys() {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('recordings', 'readonly');
    const req = tx.objectStore('recordings').getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ============================================================
// STATE
// ============================================================

let currentSeason = 'spring';

const rec = {
  key:      null,
  recorder: null,
  chunks:   [],
  blob:     null,
  timerID:  null,
  startMs:  0,
  audioCtx: null,
  animID:   null,
};

// ============================================================
// TTS PLAYBACK
// ============================================================

function ttsSpeak(text, rate = 0.82, pitch = 1.05) {
  if (!window.speechSynthesis) return;
  const u   = new SpeechSynthesisUtterance(text);
  u.rate    = rate;
  u.pitch   = pitch;
  window.speechSynthesis.speak(u);
}

// ============================================================
// PLAY ITEM  (custom recording or TTS fallback)
// ============================================================

async function playItem(key, ttsTexts) {
  // Animate the card
  const card = document.querySelector(`[data-key="${key}"]`);
  if (card) {
    card.classList.remove('playing');
    void card.offsetWidth; // reflow to restart animation
    card.classList.add('playing');
    setTimeout(() => card.classList.remove('playing'), 700);
  }

  // Prefer custom recording
  const blob = await dbGet(key);
  if (blob) {
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
    return;
  }

  // TTS fallback — queue each text segment
  window.speechSynthesis.cancel();
  for (const text of ttsTexts) ttsSpeak(text);
}

// ============================================================
// HELPERS
// ============================================================

async function recordedKeys() {
  try { return new Set(await dbGetAllKeys()); }
  catch { return new Set(); }
}

function micButton(key, label, hasRec) {
  const btn = document.createElement('button');
  btn.className   = 'mic-btn' + (hasRec ? ' has-rec' : '');
  btn.textContent = '🎙️';
  btn.title       = 'Record your voice';
  btn.setAttribute('aria-label', label);
  return btn;
}

// ============================================================
// RENDER: NUMBERS  (1–20, season emoji)
// ============================================================

async function renderNumbers() {
  const grid    = document.getElementById('numbers-grid');
  grid.innerHTML = '';
  const keys    = await recordedKeys();
  const emojis  = SEASON_EMOJIS[currentSeason];

  for (let i = 1; i <= 20; i++) {
    const key  = `number-${i}`;
    const word = NUMBER_WORDS[i - 1];

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.key = key;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${i}, ${word}. Tap to hear.`);

    const mic = micButton(key, `Record your voice for number ${i}`, keys.has(key));
    card.appendChild(mic);

    card.insertAdjacentHTML('beforeend', `
      <div class="card-emoji">${emojis[i - 1]}</div>
      <div class="card-main">${i}</div>
      <div class="card-sub">${word}</div>
    `);

    mic.addEventListener('click', e => { e.stopPropagation(); openModal(key, `Number ${i} — "${word}"`); });
    card.addEventListener('click', () => playItem(key, [word]));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') playItem(key, [word]); });

    grid.appendChild(card);
  }
}

// ============================================================
// RENDER: SOUNDS  (A–Z phonics)
// ============================================================

async function renderSounds() {
  const grid     = document.getElementById('sounds-grid');
  grid.innerHTML = '';
  const keys     = await recordedKeys();

  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const key = `sound-${letter}`;
    const ph  = PHONICS[letter];

    const card = document.createElement('div');
    card.className   = 'card';
    card.dataset.key = key;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Letter ${letter.toUpperCase()}, as in ${ph.hint}. Tap to hear.`);

    const mic = micButton(key, `Record your voice for letter ${letter.toUpperCase()}`, keys.has(key));
    card.appendChild(mic);

    card.insertAdjacentHTML('beforeend', `
      <div class="card-main">${letter.toUpperCase()}</div>
      <div class="card-main card-main-lower">${letter}</div>
      <div class="card-sub">${ph.hint}</div>
    `);

    mic.addEventListener('click', e => { e.stopPropagation(); openModal(key, `Letter ${letter.toUpperCase()} — "${ph.hint}"`); });
    card.addEventListener('click', () => playItem(key, [ph.tts]));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') playItem(key, [ph.tts]); });

    grid.appendChild(card);
  }
}

// ============================================================
// RENDER: BLENDING WORDS  (season-specific)
// ============================================================

async function renderBlending() {
  const grid     = document.getElementById('blending-grid');
  grid.innerHTML = '';
  const keys     = await recordedKeys();
  const words    = BLENDING_WORDS[currentSeason];

  for (const word of words) {
    const key  = `blend-${word}`;
    const tts  = [...word.split(''), word]; // spell then say

    const card = document.createElement('div');
    card.className   = 'card card-blend';
    card.dataset.key = key;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Blend the word "${word}". Tap to hear.`);

    const mic = micButton(key, `Record your voice for the word "${word}"`, keys.has(key));
    card.appendChild(mic);

    const chips = word.split('').map(l => `<span class="blend-l">${l}</span>`).join('');
    card.insertAdjacentHTML('beforeend', `
      <div class="card-main">${word}</div>
      <div class="blend-letters">${chips}</div>
    `);

    mic.addEventListener('click', e => { e.stopPropagation(); openModal(key, `Word: "${word}"`); });
    card.addEventListener('click', () => playItem(key, tts));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') playItem(key, tts); });

    grid.appendChild(card);
  }
}

// ============================================================
// SEASON & TAB SWITCHING
// ============================================================

function setSeason(season) {
  currentSeason = season;
  document.body.dataset.season = season;
  document.getElementById('title-emoji').textContent = TITLE_EMOJIS[season];

  document.querySelectorAll('.season-btn').forEach(btn => {
    const on = btn.dataset.season === season;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  renderNumbers();  // refresh emojis
  renderBlending(); // refresh words
}

function setTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.content-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `${tab}-section`);
  });
}

// ============================================================
// RECORDING MODAL — open / close
// ============================================================

function setStatus(msg) {
  document.getElementById('record-status').textContent = msg;
}

function openModal(key, label) {
  rec.key   = key;
  rec.blob  = null;
  rec.chunks = [];

  document.getElementById('modal-item-label').textContent = label;
  document.getElementById('btn-play-preview').disabled = true;
  document.getElementById('btn-save').disabled         = true;
  document.getElementById('record-timer').textContent  = '';

  const recBtn = document.getElementById('btn-record');
  recBtn.className = 'btn btn-record';
  recBtn.querySelector('.btn-label').textContent = 'Record';
  recBtn.querySelector('.btn-icon').textContent  = '🎙️';

  setStatus('Click Record to start');
  clearWaveform();

  dbGet(key).then(existing => {
    const del = document.getElementById('btn-delete');
    del.style.display = existing ? 'block' : 'none';
    if (existing) setStatus('You have a saved recording. Record again to replace it.');
  });

  document.getElementById('record-modal').classList.add('open');
  document.getElementById('modal-close').focus();
}

function closeModal() {
  stopRecording();
  document.getElementById('record-modal').classList.remove('open');
}

// ============================================================
// RECORDING — start / stop
// ============================================================

async function toggleRecording() {
  if (rec.recorder && rec.recorder.state === 'recording') {
    rec.recorder.stop();
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    setStatus('❌ Microphone access denied. Please allow microphone access and try again.');
    return;
  }

  rec.chunks = [];
  rec.blob   = null;
  rec.recorder = new MediaRecorder(stream);

  rec.recorder.ondataavailable = e => {
    if (e.data.size > 0) rec.chunks.push(e.data);
  };

  rec.recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    stopWaveform();
    clearInterval(rec.timerID);

    rec.blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || 'audio/webm' });

    const btn = document.getElementById('btn-record');
    btn.className = 'btn btn-record';
    btn.querySelector('.btn-label').textContent = 'Record Again';
    btn.querySelector('.btn-icon').textContent  = '🎙️';

    document.getElementById('btn-play-preview').disabled = false;
    document.getElementById('btn-save').disabled         = false;
    setStatus('Done! Preview it or save to keep it.');
  };

  rec.recorder.start();

  const btn = document.getElementById('btn-record');
  btn.className = 'btn btn-record recording';
  btn.querySelector('.btn-label').textContent = 'Stop';
  btn.querySelector('.btn-icon').textContent  = '⏹️';
  setStatus('Recording… tap Stop when done.');

  // Live timer
  rec.startMs = Date.now();
  rec.timerID = setInterval(() => {
    const s   = Math.floor((Date.now() - rec.startMs) / 1000);
    const min = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, '0');
    document.getElementById('record-timer').textContent = `${min}:${sec}`;
  }, 500);

  startWaveform(stream);
}

function stopRecording() {
  if (rec.recorder && rec.recorder.state === 'recording') rec.recorder.stop();
  clearInterval(rec.timerID);
  stopWaveform();
}

// ============================================================
// PREVIEW & SAVE
// ============================================================

function playPreview() {
  if (!rec.blob) return;
  const url   = URL.createObjectURL(rec.blob);
  const audio = new Audio(url);
  setStatus('Playing preview…');
  audio.onended = () => {
    URL.revokeObjectURL(url);
    setStatus('Preview done. Save to keep it.');
  };
  audio.play().catch(() => setStatus('Could not play audio.'));
}

async function saveRecording() {
  if (!rec.blob || !rec.key) return;
  await dbPut(rec.key, rec.blob);

  const card = document.querySelector(`[data-key="${rec.key}"]`);
  if (card) card.querySelector('.mic-btn')?.classList.add('has-rec');

  setStatus('✓ Saved!');
  setTimeout(closeModal, 750);
}

async function deleteExistingRecording() {
  if (!rec.key) return;
  await dbDelete(rec.key);

  const card = document.querySelector(`[data-key="${rec.key}"]`);
  if (card) card.querySelector('.mic-btn')?.classList.remove('has-rec');

  document.getElementById('btn-delete').style.display = 'none';
  setStatus('Custom recording removed.');
  setTimeout(closeModal, 750);
}

// ============================================================
// WAVEFORM VISUALISER
// ============================================================

function startWaveform(stream) {
  const waveEl = document.getElementById('waveform');
  const idleEl = document.getElementById('viz-idle');
  idleEl.style.display = 'none';
  waveEl.innerHTML     = '';

  const BAR_COUNT = 26;
  const bars      = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const b = document.createElement('div');
    b.className = 'wave-bar';
    waveEl.appendChild(b);
    bars.push(b);
  }

  rec.audioCtx      = new (window.AudioContext || window.webkitAudioContext)();
  const analyser    = rec.audioCtx.createAnalyser();
  analyser.fftSize  = 64;
  rec.audioCtx.createMediaStreamSource(stream).connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    rec.animID = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    bars.forEach((bar, i) => {
      const val = data[Math.floor(i * data.length / BAR_COUNT)] || 0;
      bar.style.height = Math.max(3, Math.round((val / 255) * 58)) + 'px';
    });
  }
  draw();
}

function stopWaveform() {
  if (rec.animID)   { cancelAnimationFrame(rec.animID); rec.animID = null; }
  if (rec.audioCtx) { rec.audioCtx.close().catch(() => {}); rec.audioCtx = null; }
  clearWaveform();
}

function clearWaveform() {
  const waveEl = document.getElementById('waveform');
  const idleEl = document.getElementById('viz-idle');
  if (waveEl) waveEl.innerHTML   = '';
  if (idleEl) idleEl.style.display = '';
}

// ============================================================
// BOOT
// ============================================================

async function init() {
  db = await openDB();

  // Season switcher
  document.querySelectorAll('.season-btn').forEach(btn =>
    btn.addEventListener('click', () => setSeason(btn.dataset.season))
  );

  // Tab switcher
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => setTab(btn.dataset.tab))
  );

  // Modal controls
  document.getElementById('modal-close')
    .addEventListener('click', closeModal);
  document.getElementById('record-modal')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('btn-record')
    .addEventListener('click', toggleRecording);
  document.getElementById('btn-play-preview')
    .addEventListener('click', playPreview);
  document.getElementById('btn-save')
    .addEventListener('click', saveRecording);
  document.getElementById('btn-delete')
    .addEventListener('click', deleteExistingRecording);

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('record-modal').classList.contains('open'))
      closeModal();
  });

  // Render all sections in parallel
  await Promise.all([renderNumbers(), renderSounds(), renderBlending()]);
}

init().catch(console.error);
