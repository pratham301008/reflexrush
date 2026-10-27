/**
 * ReflexRush - Daily Reflex Trial Engine
 * Seeded daily trial with identical delays for all global players and Wordle-style score cards.
 */

(function () {
  'use strict';

  const STORAGE_KEY_PREFIX = 'reflexrush_daily_';
  const TOTAL_ROUNDS = 5;

  const DailyState = {
    IDLE: 'idle',
    WAITING: 'waiting',
    READY: 'ready',
    EARLY: 'early',
    ROUND_RESULT: 'result',
    COMPLETED: 'completed'
  };

  let currentState = DailyState.IDLE;
  let currentRound = 0;
  let roundScores = [];
  let waitTimeout = null;
  let startTime = 0;
  let todayKey = '';
  let seededDelays = [];
  let alreadyPlayedToday = false;

  // DOM Elements
  const arena = document.getElementById('gameArena');
  const arenaIcon = document.getElementById('arenaIcon');
  const arenaTitle = document.getElementById('arenaTitle');
  const arenaDesc = document.getElementById('arenaDesc');
  const arenaActions = document.getElementById('arenaActions');
  const dailyDateBadge = document.getElementById('dailyDateBadge');
  const heroDailyStatus = document.getElementById('heroDailyStatus');
  const soundToggleBtn = document.getElementById('soundToggleBtn');

  const shareModal = document.getElementById('shareModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const copyShareBtn = document.getElementById('copyShareBtn');
  const toastNotice = document.getElementById('toastNotice');
  const toastMsg = document.getElementById('toastMsg');

  // --- AUDIO SYNTHESIS ---
  let audioCtx = null;
  let isMuted = localStorage.getItem('reflexrush_muted') === 'true';

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.15) {
    if (isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio notice:', e);
    }
  }

  function playSound(type) {
    if (isMuted) return;
    initAudio();
    switch (type) {
      case 'tick':
        playTone(600, 'sine', 0.05, 0.12);
        break;
      case 'ready':
        playTone(880, 'sine', 0.08, 0.15);
        break;
      case 'success':
        playTone(900, 'sine', 0.1, 0.18);
        setTimeout(() => playTone(1350, 'sine', 0.15, 0.2), 60);
        break;
      case 'early':
        playTone(160, 'sawtooth', 0.2, 0.2);
        break;
      case 'fanfare':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          setTimeout(() => playTone(freq, 'sine', 0.15, 0.2), idx * 80);
        });
        break;
    }
  }

  // --- SEEDED PSEUDO-RANDOM NUMBER GENERATOR (Mulberry32) ---
  function getTodayString() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function seedFromString(str) {
    let hash = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      hash = Math.imul(hash ^ str.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generateDailyDelays() {
    todayKey = getTodayString();
    const seed = seedFromString(todayKey + '_reflex_daily');
    const rng = mulberry32(seed);

    seededDelays = [];
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      // Delays between 1600ms and 4200ms
      const delay = Math.floor(rng() * 2600) + 1600;
      seededDelays.push(delay);
    }
  }

  function getDailyScoreRecord() {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + todayKey);
    return saved ? JSON.parse(saved) : null;
  }

  function saveDailyScoreRecord(avgScore, rounds) {
    const data = {
      avgScore,
      rounds,
      date: todayKey,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY_PREFIX + todayKey, JSON.stringify(data));
    return data;
  }

  function getClassification(ms) {
    if (ms < 190) return { rank: 'Godspeed Cyborg', badgeClass: 'rank-god', emoji: '⚡' };
    if (ms < 230) return { rank: 'Pro Gamer Reflexes', badgeClass: 'rank-pro', emoji: '🔥' };
    if (ms < 275) return { rank: 'Lightning Fast', badgeClass: 'rank-quick', emoji: '🟢' };
    if (ms < 340) return { rank: 'Human Average', badgeClass: 'rank-avg', emoji: '🟡' };
    return { rank: 'Need More Coffee', badgeClass: 'rank-slow', emoji: '☕' };
  }

  // --- GAMEPLAY FLOW ---
  function initDailyUI() {
    generateDailyDelays();

    if (dailyDateBadge) {
      dailyDateBadge.textContent = `📅 Daily Trial: ${todayKey} (UTC)`;
    }

    const record = getDailyScoreRecord();
    if (record) {
      alreadyPlayedToday = true;
      if (heroDailyStatus) heroDailyStatus.textContent = `${record.avgScore} ms (Completed)`;
      showFinalScorecard(record.avgScore, record.rounds, false);
    } else {
      alreadyPlayedToday = false;
      if (heroDailyStatus) heroDailyStatus.textContent = 'Not Played Yet';
      resetDailyGame();
    }
  }

  function resetDailyGame() {
    clearTimeout(waitTimeout);
    currentRound = 0;
    roundScores = [];
    currentState = DailyState.IDLE;

    arena.className = 'game-arena state-idle';
    arenaIcon.textContent = '📅';
    arenaTitle.textContent = `Daily Trial (${todayKey})`;
    arenaDesc.textContent = 'Compete with every player globally on today’s synchronized delays. 5 rounds for your official daily rating.';
    arenaActions.innerHTML = `<button type="button" class="btn btn-primary btn-lg" id="startDailyBtn">Start Today's Official Trial</button>`;

    const startBtn = document.getElementById('startDailyBtn');
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startRound();
      });
    }
  }

  function startRound() {
    initAudio();
    clearTimeout(waitTimeout);
    currentState = DailyState.WAITING;

    arena.className = 'game-arena state-waiting';
    arenaIcon.textContent = '🔴';
    arenaTitle.textContent = 'WAIT FOR GREEN...';
    arenaDesc.textContent = `Daily Round ${currentRound + 1} of ${TOTAL_ROUNDS}. Don't jump early!`;
    arenaActions.innerHTML = '';

    playSound('tick');

    const delay = seededDelays[currentRound] || 2500;
    waitTimeout = setTimeout(triggerReady, delay);
  }

  function triggerReady() {
    currentState = DailyState.READY;
    startTime = performance.now();

    arena.className = 'game-arena state-ready';
    arenaIcon.textContent = '🟢';
    arenaTitle.textContent = 'CLICK NOW!';
    arenaDesc.textContent = 'Tap or click as fast as possible!';
    arenaActions.innerHTML = '';

    playSound('ready');
  }

  function handleEarlyClick() {
    clearTimeout(waitTimeout);
    currentState = DailyState.EARLY;
    playSound('early');

    arena.className = 'game-arena state-early';
    arenaIcon.textContent = '⚠️';
    arenaTitle.textContent = 'TOO EARLY!';
    arenaDesc.textContent = `Premature click! Restarting Daily Round ${currentRound + 1}.`;
    arenaActions.innerHTML = `<button type="button" class="btn btn-secondary" id="retryRoundBtn">Retry Round ${currentRound + 1}</button>`;

    const retryBtn = document.getElementById('retryRoundBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startRound();
      });
    }
  }

  function handleSuccessClick() {
    const reaction = Math.round(performance.now() - startTime);
    playSound('success');
    roundScores.push(reaction);
    currentRound++;

    if (currentRound >= TOTAL_ROUNDS) {
      const sum = roundScores.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / TOTAL_ROUNDS);
      const record = saveDailyScoreRecord(avg, roundScores);
      alreadyPlayedToday = true;
      if (heroDailyStatus) heroDailyStatus.textContent = `${avg} ms (Completed)`;
      playSound('fanfare');
      showFinalScorecard(avg, roundScores, true);
    } else {
      showInterimRound(reaction);
    }
  }

  function showInterimRound(reaction) {
    currentState = DailyState.ROUND_RESULT;
    arena.className = 'game-arena state-result';
    arenaIcon.textContent = '⚡';
    arenaTitle.innerHTML = `<span class="result-time">${reaction} <span style="font-size: 1.5rem;">ms</span></span>`;
    arenaDesc.textContent = `Daily Round ${currentRound} of ${TOTAL_ROUNDS} completed.`;
    arenaActions.innerHTML = `<button type="button" class="btn btn-primary" id="nextDailyRoundBtn">Continue to Round ${currentRound + 1} &rarr;</button>`;

    const nextBtn = document.getElementById('nextDailyRoundBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startRound();
      });
    }
  }

  function showFinalScorecard(avg, rounds, isNew) {
    currentState = DailyState.COMPLETED;
    const classification = getClassification(avg);

    arena.className = 'game-arena state-finished';
    arenaIcon.textContent = '🏆';
    arenaTitle.textContent = `Daily Trial Complete!`;
    arenaDesc.textContent = `Your official synchronized benchmark for ${todayKey}:`;

    const shareSnippet = generateShareSnippet(avg, rounds);

    arenaActions.innerHTML = `
      <div class="scorecard">
        <div class="scorecard-header">
          <div class="rank-badge ${classification.badgeClass}">${classification.rank}</div>
          <div class="metric-value" style="color: var(--neon-cyan); font-size: 3rem; margin: 0.5rem 0;">${avg} ms</div>
          <p style="color: var(--text-muted); font-size: 0.85rem;">Official global seed for ${todayKey}</p>
        </div>

        <div class="daily-grid-display">
          ${rounds
            .map((r, i) => `<div class="daily-box-chip ${r < 200 ? 'gold' : ''}">R${i + 1}: ${r}ms</div>`)
            .join('')}
        </div>

        <div class="wordle-share-preview" id="wordleShareBox">${shareSnippet}</div>

        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-top: 1rem;">
          <button type="button" class="btn btn-viral" id="copyDailyResultBtn">
            📋 Copy Daily Result Card
          </button>
          <button type="button" class="btn btn-secondary" id="practiceModeBtn">
            🔄 Practice Again
          </button>
        </div>
      </div>
    `;

    const copyBtn = document.getElementById('copyDailyResultBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(shareSnippet, 'Daily scorecard copied to clipboard!');
      });
    }

    const practiceBtn = document.getElementById('practiceModeBtn');
    if (practiceBtn) {
      practiceBtn.addEventListener('click', () => {
        resetDailyGame();
      });
    }
  }

  function generateShareSnippet(avg, rounds) {
    const classification = getClassification(avg);
    const roundChips = rounds
      .map((r) => (r < 200 ? '⚡' : r < 240 ? '🟢' : r < 300 ? '🟡' : '🔴'))
      .join(' ');

    return `⚡ ReflexRush Daily Trial (${todayKey})\n🎯 Official Score: ${avg} ms (${classification.rank})\n${roundChips}\n👉 Play today: https://reflexrush.example.com/daily-puzzle.html`;
  }

  // Interaction dispatcher
  function handleMainInteraction(e) {
    if (e.target && e.target.closest('button')) return;

    switch (currentState) {
      case DailyState.IDLE:
        startRound();
        break;
      case DailyState.WAITING:
        handleEarlyClick();
        break;
      case DailyState.READY:
        handleSuccessClick();
        break;
      case DailyState.EARLY:
        startRound();
        break;
      case DailyState.ROUND_RESULT:
        startRound();
        break;
    }
  }

  function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
      }).catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch (err) {
      showToast('Please copy manually.');
    }
    document.body.removeChild(textarea);
  }

  function showToast(message) {
    if (!toastNotice || !toastMsg) return;
    toastMsg.textContent = message;
    toastNotice.classList.add('show');
    setTimeout(() => {
      toastNotice.classList.remove('show');
    }, 2800);
  }

  function init() {
    initDailyUI();

    if (arena) {
      arena.addEventListener('pointerdown', handleMainInteraction);
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleMainInteraction(e);
        }
      }
    });

    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        localStorage.setItem('reflexrush_muted', isMuted);
        soundToggleBtn.textContent = isMuted ? '🔇' : '🔊';
        if (!isMuted) {
          initAudio();
          playSound('tick');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
