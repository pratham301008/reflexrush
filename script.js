/**
 * ReflexRush - Core Game Engine & Viral Growth Logic
 * Built with Vanilla JavaScript, Web Audio API, and Web Share API.
 * 
 * Complies with strict AdSense and performance guidelines.
 */

(function () {
  'use strict';

  // --- CONFIGURATION & CONSTANTS ---
  const TOTAL_ROUNDS = 5;
  const MIN_DELAY_MS = 1500;
  const MAX_DELAY_MS = 4500;
  const STORAGE_KEYS = {
    BEST_AVG: 'reflexrush_best_avg',
    BEST_SINGLE: 'reflexrush_best_single',
    TOTAL_GAMES: 'reflexrush_total_games',
    MUTED: 'reflexrush_muted',
    COOKIE_CONSENT: 'reflexrush_cookie_consent'
  };

  // --- STATE MANAGEMENT ---
  const GameState = {
    IDLE: 'idle',
    WAITING: 'waiting',
    READY: 'ready',
    ROUND_RESULT: 'result',
    EARLY: 'early',
    FINISHED: 'finished'
  };

  let currentState = GameState.IDLE;
  let currentRound = 0;
  let roundScores = [];
  let waitTimeout = null;
  let startTime = 0;
  let lastClickTimestamp = 0;
  let activeChallenge = null;

  // --- DOM ELEMENTS ---
  const arena = document.getElementById('gameArena');
  const arenaIcon = document.getElementById('arenaIcon');
  const arenaTitle = document.getElementById('arenaTitle');
  const arenaDesc = document.getElementById('arenaDesc');
  const arenaActions = document.getElementById('arenaActions');
  const roundTracker = document.getElementById('roundTracker');
  const historyChips = document.getElementById('historyChips');
  const heroBestScore = document.getElementById('heroBestScore');
  const heroTotalGames = document.getElementById('heroTotalGames');

  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const shareModal = document.getElementById('shareModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const shareInput = document.getElementById('shareInput');
  const copyShareBtn = document.getElementById('copyShareBtn');
  const toastNotice = document.getElementById('toastNotice');
  const toastMsg = document.getElementById('toastMsg');

  const challengeBanner = document.getElementById('challengeBanner');
  const challengeMsg = document.getElementById('challengeMsg');
  const challengeCloseBtn = document.getElementById('challengeCloseBtn');

  const cookieBanner = document.getElementById('cookieBanner');
  const acceptCookiesBtn = document.getElementById('acceptCookiesBtn');

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  let audioCtx = null;
  let isMuted = localStorage.getItem(STORAGE_KEYS.MUTED) === 'true';

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
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
      console.warn('Audio play error:', e);
    }
  }

  function playSound(name) {
    if (isMuted) return;
    initAudio();
    switch (name) {
      case 'tick':
        playTone(650, 'sine', 0.05, 0.12);
        break;
      case 'ready':
        playTone(440, 'triangle', 0.08, 0.15);
        break;
      case 'clickGreen':
        // Crisp dual chime
        playTone(880, 'sine', 0.1, 0.2);
        setTimeout(() => playTone(1320, 'sine', 0.15, 0.18), 50);
        break;
      case 'earlyError':
        // Low error buzz
        playTone(160, 'sawtooth', 0.22, 0.2);
        break;
      case 'fanfare':
        // Victorious 4-note arpeggio
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          setTimeout(() => playTone(freq, 'sine', 0.18, 0.2), idx * 80);
        });
        break;
    }
  }

  function updateSoundUI() {
    if (soundToggleBtn) {
      soundToggleBtn.textContent = isMuted ? '🔇' : '🔊';
      soundToggleBtn.setAttribute('aria-label', isMuted ? 'Unmute Sound' : 'Mute Sound');
      soundToggleBtn.title = isMuted ? 'Sound Muted' : 'Sound Enabled';
    }
  }

  // --- LOCAL STORAGE HELPERS ---
  function getPersonalBest() {
    const avg = localStorage.getItem(STORAGE_KEYS.BEST_AVG);
    const single = localStorage.getItem(STORAGE_KEYS.BEST_SINGLE);
    const total = localStorage.getItem(STORAGE_KEYS.TOTAL_GAMES) || 0;
    return {
      bestAvg: avg ? parseInt(avg, 10) : null,
      bestSingle: single ? parseInt(single, 10) : null,
      totalGames: parseInt(total, 10)
    };
  }

  function saveGameRecord(avgMs, bestSingleMs) {
    const pb = getPersonalBest();
    let isNewBestAvg = false;

    if (!pb.bestAvg || avgMs < pb.bestAvg) {
      localStorage.setItem(STORAGE_KEYS.BEST_AVG, avgMs);
      isNewBestAvg = true;
    }
    if (!pb.bestSingle || bestSingleMs < pb.bestSingle) {
      localStorage.setItem(STORAGE_KEYS.BEST_SINGLE, bestSingleMs);
    }
    localStorage.setItem(STORAGE_KEYS.TOTAL_GAMES, pb.totalGames + 1);

    updateHeroStats();
    return isNewBestAvg;
  }

  function updateHeroStats() {
    const pb = getPersonalBest();
    if (heroBestScore) {
      heroBestScore.textContent = pb.bestAvg ? `${pb.bestAvg} ms` : '-- ms';
    }
    if (heroTotalGames) {
      heroTotalGames.textContent = pb.totalGames;
    }
  }

  // --- QUERY STRING & CHALLENGE PARSER ---
  function parseChallengeFromURL() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const targetParam = urlParams.get('challenge') || urlParams.get('target');
      const byParam = urlParams.get('by') || urlParams.get('from');

      if (targetParam) {
        const targetMs = parseInt(targetParam, 10);
        if (!isNaN(targetMs) && targetMs > 80 && targetMs < 2000) {
          const challengerName = byParam ? sanitizeHTML(byParam.slice(0, 20)) : 'A friend';
          activeChallenge = { targetMs, challengerName };
          showChallengeBanner();
        }
      }
    } catch (e) {
      console.warn('URL parsing notice:', e);
    }
  }

  function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  function showChallengeBanner() {
    if (!challengeBanner || !activeChallenge) return;
    challengeMsg.innerHTML = `🔥 <strong>${activeChallenge.challengerName}</strong> challenged you to beat <strong>${activeChallenge.targetMs} ms</strong>!`;
    challengeBanner.style.display = 'block';
  }

  // --- RANKING LOGIC ---
  function getScoreClassification(ms) {
    if (ms < 190) {
      return {
        rank: 'Godspeed Cyborg',
        badgeClass: 'rank-god',
        desc: 'Top 0.1% human reflex speed. Your neurons fire faster than fiber optic internet!'
      };
    } else if (ms < 230) {
      return {
        rank: 'Pro Gamer Reflexes',
        badgeClass: 'rank-pro',
        desc: 'Phenomenal speed! You easily out-react 95% of casual gamers.'
      };
    } else if (ms < 275) {
      return {
        rank: 'Lightning Fast',
        badgeClass: 'rank-quick',
        desc: 'Sharp, responsive, and above average. Keep warming up!'
      };
    } else if (ms < 340) {
      return {
        rank: 'Human Average',
        badgeClass: 'rank-avg',
        desc: 'Solid human reaction speed. A bit of focus and caffeine can push you into pro tier.'
      };
    } else {
      return {
        rank: 'Need More Coffee',
        badgeClass: 'rank-slow',
        desc: 'A bit sluggish today! Take a breath, shake out your fingers, and try again.'
      };
    }
  }

  // --- UI RENDERERS ---
  function renderRoundTracker() {
    if (!roundTracker) return;
    roundTracker.innerHTML = '';
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      const dot = document.createElement('div');
      dot.className = 'tracker-dot';
      if (i < currentRound) {
        dot.classList.add('completed');
      } else if (i === currentRound && (currentState === GameState.WAITING || currentState === GameState.READY)) {
        dot.classList.add('active');
      }
      roundTracker.appendChild(dot);
    }
  }

  function renderHistoryChips() {
    if (!historyChips) return;
    if (roundScores.length === 0) {
      historyChips.innerHTML = '';
      return;
    }
    const minScore = Math.min(...roundScores);
    historyChips.innerHTML = roundScores
      .map((score, idx) => {
        const isFastest = score === minScore && roundScores.length > 1;
        return `<span class="history-chip ${isFastest ? 'fastest' : ''}">R${idx + 1}: ${score}ms</span>`;
      })
      .join('');
  }

  function setArenaState(state) {
    currentState = state;
    arena.className = `game-arena state-${state}`;
    renderRoundTracker();
  }

  // --- GAMEPLAY FLOW ---

  // 1. Start or Restart Complete Game
  function resetGame() {
    clearTimeout(waitTimeout);
    currentRound = 0;
    roundScores = [];
    setArenaState(GameState.IDLE);
    arenaIcon.textContent = '⚡';
    arenaTitle.textContent = 'Beat Your Friends';
    arenaDesc.textContent = 'Test your raw human reflex speed across 5 rounds. Click or press Space to begin.';
    arenaActions.innerHTML = `<button type="button" class="btn btn-primary btn-lg" id="startBtn">Play Round 1 of ${TOTAL_ROUNDS}</button>`;
    renderRoundTracker();
    renderHistoryChips();

    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startNextRound();
      });
    }
  }

  // 2. Begin next round countdown
  function startNextRound() {
    initAudio();
    clearTimeout(waitTimeout);
    setArenaState(GameState.WAITING);

    arenaIcon.textContent = '🔴';
    arenaTitle.textContent = 'WAIT FOR GREEN...';
    arenaDesc.textContent = `Round ${currentRound + 1} of ${TOTAL_ROUNDS}. Keep your finger steady. Do NOT click yet!`;
    arenaActions.innerHTML = '';

    playSound('tick');

    // Random delay between 1.5s and 4.5s
    const delay = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;

    waitTimeout = setTimeout(() => {
      triggerReady();
    }, delay);
  }

  // 3. Screen turns green
  function triggerReady() {
    setArenaState(GameState.READY);
    startTime = performance.now();

    arenaIcon.textContent = '🟢';
    arenaTitle.textContent = 'CLICK NOW!';
    arenaDesc.textContent = 'Tap or click as fast as humanly possible!';
    arenaActions.innerHTML = '';

    playSound('ready');
  }

  // 4. Handle early click (penalty / retry round)
  function handleEarlyClick() {
    clearTimeout(waitTimeout);
    playSound('earlyError');
    setArenaState(GameState.EARLY);

    arenaIcon.textContent = '⚠️';
    arenaTitle.textContent = 'TOO EARLY!';
    arenaDesc.textContent = `Premature click detected! Wait until the screen turns GREEN. Let's retry Round ${currentRound + 1}.`;
    arenaActions.innerHTML = `<button type="button" class="btn btn-secondary" id="retryRoundBtn">Retry Round ${currentRound + 1}</button>`;

    const retryBtn = document.getElementById('retryRoundBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startNextRound();
      });
    }
  }

  // 5. Handle successful reaction click
  function handleSuccessClick() {
    const reactionTime = Math.round(performance.now() - startTime);
    playSound('clickGreen');

    roundScores.push(reactionTime);
    currentRound++;

    renderHistoryChips();

    if (currentRound >= TOTAL_ROUNDS) {
      showFinalResults();
    } else {
      showRoundResult(reactionTime);
    }
  }

  // 6. Interim round result screen
  function showRoundResult(reactionTime) {
    setArenaState(GameState.ROUND_RESULT);

    arenaIcon.textContent = '⚡';
    arenaTitle.innerHTML = `<span class="result-time">${reactionTime} <span style="font-size: 1.5rem;">ms</span></span>`;
    arenaDesc.textContent = `Round ${currentRound} of ${TOTAL_ROUNDS} completed. Great reaction!`;
    arenaActions.innerHTML = `<button type="button" class="btn btn-primary" id="nextRoundBtn">Continue to Round ${currentRound + 1} &rarr;</button>`;

    const nextBtn = document.getElementById('nextRoundBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startNextRound();
      });
    }
  }

  // 7. Final Game Over & Scorecard
  function showFinalResults() {
    setArenaState(GameState.FINISHED);

    const sum = roundScores.reduce((acc, val) => acc + val, 0);
    const avgScore = Math.round(sum / TOTAL_ROUNDS);
    const bestSingle = Math.min(...roundScores);

    const isNewPB = saveGameRecord(avgScore, bestSingle);
    const classification = getScoreClassification(avgScore);

    if (isNewPB) {
      playSound('fanfare');
    }

    // Check challenge match
    let challengeHTML = '';
    if (activeChallenge) {
      const beatOpponent = avgScore < activeChallenge.targetMs;
      challengeHTML = `
        <div class="challenge-outcome ${beatOpponent ? 'win' : 'loss'}">
          ${beatOpponent
            ? `🏆 <strong>VICTORY!</strong> You crushed ${activeChallenge.challengerName}'s target of ${activeChallenge.targetMs} ms with your <strong>${avgScore} ms</strong>!`
            : `💀 <strong>CLOSE CALL!</strong> ${activeChallenge.challengerName} keeps the crown with ${activeChallenge.targetMs} ms. Try again to beat them!`
          }
        </div>
      `;
    }

    arenaIcon.textContent = '🏆';
    arenaTitle.textContent = 'Game Complete!';
    arenaDesc.textContent = 'Here is your official reaction breakdown:';

    arenaActions.innerHTML = `
      <div class="scorecard">
        <div class="scorecard-header">
          <div class="rank-badge ${classification.badgeClass}">${classification.rank}</div>
          <p style="font-size: 0.95rem; color: #cbd5e1; margin-top: 0.5rem;">${classification.desc}</p>
        </div>

        ${challengeHTML}

        <div class="score-metrics">
          <div class="metric-card">
            <div class="metric-label">5-Round Average</div>
            <div class="metric-value" style="color: var(--neon-green);">${avgScore} ms</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Fastest Single Round</div>
            <div class="metric-value" style="color: var(--neon-cyan);">${bestSingle} ms</div>
          </div>
        </div>

        ${isNewPB ? '<div style="color: var(--neon-green); font-weight: 700; margin-bottom: 1.25rem;">✨ NEW PERSONAL BEST! ✨</div>' : ''}

        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-viral" id="challengeFriendsBtn">
            🚀 Challenge a Friend
          </button>
          <button type="button" class="btn btn-secondary" id="playAgainBtn">
            🔄 Play Again
          </button>
        </div>
      </div>
    `;

    // Bind Scorecard actions
    const challengeBtn = document.getElementById('challengeFriendsBtn');
    if (challengeBtn) {
      challengeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerScoreShare(avgScore);
      });
    }

    const playAgainBtn = document.getElementById('playAgainBtn');
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetGame();
      });
    }
  }

  // --- VIRAL SHARING & CHALLENGE URL GENERATOR ---
  function getChallengeURL(scoreMs) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?challenge=${scoreMs}&by=Friend`;
  }

  function getShareText(scoreMs) {
    const classification = getScoreClassification(scoreMs);
    return `⚡ I scored ${scoreMs} ms on ReflexRush (${classification.rank})! Think you can beat me? Prove it here:`;
  }

  function triggerScoreShare(scoreMs) {
    const challengeUrl = getChallengeURL(scoreMs);
    const shareText = getShareText(scoreMs);

    // Try Web Share API (mobile native share sheet)
    if (navigator.share) {
      navigator.share({
        title: 'ReflexRush: Beat My Score!',
        text: shareText,
        url: challengeUrl
      }).catch((err) => {
        // User aborted or unallowed -> fallback to modal
        if (err.name !== 'AbortError') {
          openShareModal(challengeUrl, shareText);
        }
      });
    } else {
      openShareModal(challengeUrl, shareText);
    }
  }

  function openShareModal(url, text) {
    if (!shareModal) return;
    shareInput.value = url;

    // Configure third-party share buttons
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);

    const waBtn = document.getElementById('shareWhatsApp');
    if (waBtn) waBtn.href = `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`;

    const xBtn = document.getElementById('shareX');
    if (xBtn) xBtn.href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;

    const tgBtn = document.getElementById('shareTelegram');
    if (tgBtn) tgBtn.href = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;

    shareModal.classList.add('open');
  }

  function closeShareModal() {
    if (shareModal) {
      shareModal.classList.remove('open');
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
      showToast('Please copy the link manually.');
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

  // --- INTERACTION DISPATCHER ---
  // Unifies touch, pointer, click, and keyboard triggers safely with debounce
  function handleMainInteraction(e) {
    const now = Date.now();
    // 150ms debounce prevents double-fire from pointerdown + click
    if (now - lastClickTimestamp < 150) return;
    lastClickTimestamp = now;

    // If click happened on an interactive button inside arena, let button event handle it
    if (e.target && e.target.closest('button')) {
      return;
    }

    switch (currentState) {
      case GameState.IDLE:
        startNextRound();
        break;

      case GameState.WAITING:
        handleEarlyClick();
        break;

      case GameState.READY:
        handleSuccessClick();
        break;

      case GameState.EARLY:
        startNextRound();
        break;

      case GameState.ROUND_RESULT:
        startNextRound();
        break;

      case GameState.FINISHED:
        // Already on finished scorecard
        break;
    }
  }

  // --- GLOBAL EVENT LISTENERS & LIFECYCLE ---
  function init() {
    // 1. Initial State & Stats
    updateSoundUI();
    updateHeroStats();
    parseChallengeFromURL();
    resetGame();

    // 2. Arena Click / Pointer
    if (arena) {
      arena.addEventListener('pointerdown', handleMainInteraction);
    }

    // 3. Keyboard Spacebar & Enter Support
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        // Prevent page scroll if active in game
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleMainInteraction(e);
        }
      }
    });

    // 4. Tab Blur / Visibility Safety
    // If player leaves tab during waiting state, reset to avoid bogus reaction calculation
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && currentState === GameState.WAITING) {
        clearTimeout(waitTimeout);
        setArenaState(GameState.IDLE);
        arenaIcon.textContent = '⚡';
        arenaTitle.textContent = 'Game Paused';
        arenaDesc.textContent = 'Round cancelled because the browser tab lost focus. Click to resume.';
      }
    });

    // 5. Sound Toggle
    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        localStorage.setItem(STORAGE_KEYS.MUTED, isMuted);
        updateSoundUI();
        if (!isMuted) {
          initAudio();
          playSound('tick');
        }
      });
    }

    // 6. Modal Listeners
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeShareModal);
    }
    if (shareModal) {
      shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) closeShareModal();
      });
    }
    if (copyShareBtn && shareInput) {
      copyShareBtn.addEventListener('click', () => {
        copyToClipboard(shareInput.value, 'Challenge link copied to clipboard!');
      });
    }

    // 7. Challenge Banner Close
    if (challengeCloseBtn && challengeBanner) {
      challengeCloseBtn.addEventListener('click', () => {
        challengeBanner.style.display = 'none';
      });
    }

    // 8. GDPR Cookie Banner Logic
    const consentGiven = localStorage.getItem(STORAGE_KEYS.COOKIE_CONSENT);
    if (!consentGiven && cookieBanner) {
      setTimeout(() => {
        cookieBanner.classList.add('visible');
      }, 1200);
    }

    if (acceptCookiesBtn && cookieBanner) {
      acceptCookiesBtn.addEventListener('click', () => {
        localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'accepted');
        cookieBanner.classList.remove('visible');
      });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
