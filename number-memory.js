/**
 * ReflexRush - Number Memory Challenge Engine
 * Visual working memory benchmark with mobile keypad and viral sharing.
 */

(function () {
  'use strict';

  // --- CONFIGURATION & STORAGE ---
  const STORAGE_KEYS = {
    BEST_DIGITS: 'reflexrush_mem_best',
    TOTAL_GAMES: 'reflexrush_mem_total_games',
    MUTED: 'reflexrush_muted'
  };

  const MemState = {
    IDLE: 'idle',
    MEMORIZING: 'memorizing',
    INPUT: 'input',
    SUCCESS: 'success',
    GAMEOVER: 'gameover'
  };

  let currentState = MemState.IDLE;
  let currentLevel = 1;
  let currentTargetNumber = '';
  let activeChallenge = null;
  let memoryTimer = null;
  let timerAnimFrame = null;
  let timerStartTime = 0;
  let timerDuration = 0;

  // --- DOM ELEMENTS ---
  const arena = document.getElementById('gameArena');
  const arenaIcon = document.getElementById('arenaIcon');
  const arenaTitle = document.getElementById('arenaTitle');
  const arenaDesc = document.getElementById('arenaDesc');
  const arenaActions = document.getElementById('arenaActions');
  const heroBestDigits = document.getElementById('heroBestDigits');
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

  // --- AUDIO SYNTHESIS ---
  let audioCtx = null;
  let isMuted = localStorage.getItem(STORAGE_KEYS.MUTED) === 'true';

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
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
      console.warn('Audio tone error:', e);
    }
  }

  function playSound(type) {
    if (isMuted) return;
    initAudio();
    switch (type) {
      case 'levelStart':
        playTone(520, 'triangle', 0.08, 0.15);
        break;
      case 'keyTap':
        playTone(400, 'sine', 0.03, 0.08);
        break;
      case 'correct':
        playTone(660, 'sine', 0.1, 0.18);
        setTimeout(() => playTone(990, 'sine', 0.18, 0.2), 80);
        break;
      case 'wrong':
        playTone(200, 'sawtooth', 0.2, 0.22);
        setTimeout(() => playTone(160, 'sawtooth', 0.3, 0.25), 100);
        break;
      case 'fanfare':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          setTimeout(() => playTone(freq, 'sine', 0.16, 0.2), idx * 90);
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
    const best = localStorage.getItem(STORAGE_KEYS.BEST_DIGITS);
    const total = localStorage.getItem(STORAGE_KEYS.TOTAL_GAMES) || 0;
    return {
      bestDigits: best ? parseInt(best, 10) : 0,
      totalGames: parseInt(total, 10)
    };
  }

  function saveGameRecord(digitsCleared) {
    const pb = getPersonalBest();
    let isNewPB = false;
    if (digitsCleared > pb.bestDigits) {
      localStorage.setItem(STORAGE_KEYS.BEST_DIGITS, digitsCleared);
      isNewPB = true;
    }
    localStorage.setItem(STORAGE_KEYS.TOTAL_GAMES, pb.totalGames + 1);
    updateHeroStats();
    return isNewPB;
  }

  function updateHeroStats() {
    const pb = getPersonalBest();
    if (heroBestDigits) {
      heroBestDigits.textContent = pb.bestDigits > 0 ? `${pb.bestDigits} Digits` : '--';
    }
    if (heroTotalGames) {
      heroTotalGames.textContent = pb.totalGames;
    }
  }

  // --- CHALLENGE PARSER ---
  function parseChallengeFromURL() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const targetParam = urlParams.get('challenge') || urlParams.get('target');
      const byParam = urlParams.get('by') || urlParams.get('from');

      if (targetParam) {
        const targetDigits = parseInt(targetParam, 10);
        if (!isNaN(targetDigits) && targetDigits >= 1 && targetDigits <= 35) {
          const name = byParam ? sanitizeHTML(byParam.slice(0, 20)) : 'A friend';
          activeChallenge = { targetDigits, challengerName: name };
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
    challengeMsg.innerHTML = `🧠 <strong>${activeChallenge.challengerName}</strong> challenged you to remember <strong>${activeChallenge.targetDigits} Digits</strong>! Can you beat their brain?`;
    challengeBanner.style.display = 'block';
  }

  // --- MEMORY BENCHMARK CLASSIFICATION ---
  function getMemoryClassification(digits) {
    if (digits >= 12) {
      return {
        rank: 'Photographic Savant',
        badgeClass: 'rank-god',
        desc: 'Top 0.1% working memory! You have near-eidetic memory capacity.'
      };
    } else if (digits >= 9) {
      return {
        rank: 'Memory Champion',
        badgeClass: 'rank-pro',
        desc: 'Exceptional visual working memory. You easily surpass 95% of the population.'
      };
    } else if (digits >= 7) {
      return {
        rank: 'Sharp Working Memory',
        badgeClass: 'rank-quick',
        desc: 'Right at and above Miller’s Law (7 ± 2 items). Strong cognitive processing.'
      };
    } else if (digits >= 5) {
      return {
        rank: 'Human Average',
        badgeClass: 'rank-avg',
        desc: 'Typical human working memory span. Practice and chunking can push you higher!'
      };
    } else {
      return {
        rank: 'Warm-Up Phase',
        badgeClass: 'rank-slow',
        desc: 'A bit distracted today! Take a deep breath, minimize tabs, and try again.'
      };
    }
  }

  // --- RANDOM DIGIT GENERATOR ---
  function generateRandomNumber(length) {
    // Generate a number string with exact length (leading digit 1-9)
    let result = (Math.floor(Math.random() * 9) + 1).toString();
    for (let i = 1; i < length; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }
    return result;
  }

  // --- GAME FLOW ---
  function resetGame() {
    clearTimeout(memoryTimer);
    cancelAnimationFrame(timerAnimFrame);
    currentLevel = 1;
    currentState = MemState.IDLE;

    arena.className = 'game-arena state-idle';
    arenaIcon.textContent = '🧠';
    arenaTitle.textContent = 'Number Memory';
    arenaDesc.textContent = 'The average person can remember 7 numbers at once. How many can you remember?';
    arenaActions.innerHTML = `<button type="button" class="btn btn-primary btn-lg" id="startMemBtn">Start Challenge (Level 1)</button>`;

    const startBtn = document.getElementById('startMemBtn');
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startLevel(1);
      });
    }
  }

  function startLevel(level) {
    initAudio();
    clearTimeout(memoryTimer);
    cancelAnimationFrame(timerAnimFrame);

    currentLevel = level;
    currentState = MemState.MEMORIZING;
    currentTargetNumber = generateRandomNumber(currentLevel);

    arena.className = 'game-arena state-idle';
    arenaIcon.textContent = '⚡';
    arenaTitle.textContent = `Level ${currentLevel} (${currentLevel} Digit${currentLevel > 1 ? 's' : ''})`;
    arenaDesc.textContent = 'Memorize the number before the progress bar runs out:';

    arenaActions.innerHTML = `
      <div class="memory-display-box">
        <div class="memory-digits" id="numberDisplay">${currentTargetNumber}</div>
        <div class="memory-progress-wrapper">
          <div class="memory-progress-bar" id="memProgressBar"></div>
        </div>
      </div>
    `;

    playSound('levelStart');

    // Dynamic timer: 1400ms base + 600ms per digit
    timerDuration = 1400 + (currentLevel * 600);
    timerStartTime = performance.now();

    const progressBar = document.getElementById('memProgressBar');

    function updateProgress(now) {
      const elapsed = now - timerStartTime;
      const remaining = Math.max(0, timerDuration - elapsed);
      const pct = (remaining / timerDuration) * 100;
      if (progressBar) {
        progressBar.style.transform = `scaleX(${pct / 100})`;
      }

      if (remaining > 0 && currentState === MemState.MEMORIZING) {
        timerAnimFrame = requestAnimationFrame(updateProgress);
      } else if (remaining <= 0) {
        transitionToInput();
      }
    }

    timerAnimFrame = requestAnimationFrame(updateProgress);
  }

  function transitionToInput() {
    currentState = MemState.INPUT;
    arenaIcon.textContent = '✍️';
    arenaTitle.textContent = `What was the number?`;
    arenaDesc.textContent = `Enter the ${currentLevel} digit number you just memorized:`;

    arenaActions.innerHTML = `
      <div style="width: 100%; max-width: 380px; margin: 0 auto;">
        <input type="text" id="recallInput" class="recall-input-display" inputmode="numeric" autocomplete="off" placeholder="?" maxlength="${currentLevel + 5}">
        
        <!-- Touch-Friendly Onscreen Keypad -->
        <div class="keypad-grid" id="onscreenKeypad">
          <button type="button" class="keypad-btn" data-key="1">1</button>
          <button type="button" class="keypad-btn" data-key="2">2</button>
          <button type="button" class="keypad-btn" data-key="3">3</button>
          <button type="button" class="keypad-btn" data-key="4">4</button>
          <button type="button" class="keypad-btn" data-key="5">5</button>
          <button type="button" class="keypad-btn" data-key="6">6</button>
          <button type="button" class="keypad-btn" data-key="7">7</button>
          <button type="button" class="keypad-btn" data-key="8">8</button>
          <button type="button" class="keypad-btn" data-key="9">9</button>
          <button type="button" class="keypad-btn action-btn" id="keypadClear">⌫</button>
          <button type="button" class="keypad-btn" data-key="0">0</button>
          <button type="button" class="keypad-btn submit-btn" id="keypadSubmit">&check;</button>
        </div>

        <button type="button" class="btn btn-primary" id="submitAnswerBtn" style="width: 100%; margin-top: 0.5rem;">
          Submit Answer &rarr;
        </button>
      </div>
    `;

    const input = document.getElementById('recallInput');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          checkAnswer();
        }
      });
    }

    // Bind on-screen keypad
    const keypad = document.getElementById('onscreenKeypad');
    if (keypad) {
      keypad.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        playSound('keyTap');
        const key = btn.dataset.key;
        if (key && input) {
          input.value += key;
          input.focus();
        }
      });
    }

    const clearBtn = document.getElementById('keypadClear');
    if (clearBtn && input) {
      clearBtn.addEventListener('click', () => {
        input.value = input.value.slice(0, -1);
        input.focus();
      });
    }

    const submitKeyBtn = document.getElementById('keypadSubmit');
    if (submitKeyBtn) {
      submitKeyBtn.addEventListener('click', checkAnswer);
    }

    const submitBtn = document.getElementById('submitAnswerBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', checkAnswer);
    }
  }

  function checkAnswer() {
    const input = document.getElementById('recallInput');
    if (!input) return;

    const userGuess = input.value.trim();
    if (!userGuess) {
      showToast('Please type your answer first!');
      return;
    }

    if (userGuess === currentTargetNumber) {
      handleSuccess();
    } else {
      handleGameOver(userGuess);
    }
  }

  function handleSuccess() {
    currentState = MemState.SUCCESS;
    playSound('correct');

    arena.className = 'game-arena state-ready';
    arenaIcon.textContent = '🎉';
    arenaTitle.textContent = `Correct!`;
    arenaDesc.textContent = `You remembered all ${currentLevel} digits! Ready for Level ${currentLevel + 1}?`;

    arenaActions.innerHTML = `
      <div style="margin-top: 1rem;">
        <button type="button" class="btn btn-primary btn-lg" id="nextLevelBtn">
          Continue to Level ${currentLevel + 1} (${currentLevel + 1} Digits) &rarr;
        </button>
      </div>
    `;

    const nextBtn = document.getElementById('nextLevelBtn');
    if (nextBtn) {
      nextBtn.focus();
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startLevel(currentLevel + 1);
      });
    }
  }

  function handleGameOver(userGuess) {
    currentState = MemState.GAMEOVER;
    playSound('wrong');

    const digitsCleared = currentLevel - 1;
    const isNewPB = saveGameRecord(digitsCleared);
    const classification = getMemoryClassification(digitsCleared);

    if (isNewPB && digitsCleared > 3) {
      playSound('fanfare');
    }

    arena.className = 'game-arena state-finished';
    arenaIcon.textContent = '💀';
    arenaTitle.textContent = `Game Over`;
    arenaDesc.textContent = `Your memory reached its limit at Level ${currentLevel}.`;

    // Challenge outcome banner
    let challengeHTML = '';
    if (activeChallenge) {
      const beatOpponent = digitsCleared > activeChallenge.targetDigits;
      const tied = digitsCleared === activeChallenge.targetDigits;
      challengeHTML = `
        <div class="challenge-outcome ${beatOpponent ? 'win' : 'loss'}">
          ${beatOpponent
            ? `🏆 <strong>VICTORY!</strong> You crushed ${activeChallenge.challengerName}'s record of ${activeChallenge.targetDigits} digits with your <strong>${digitsCleared} digits</strong>!`
            : tied
            ? `🤝 <strong>TIED!</strong> You matched ${activeChallenge.challengerName} with ${digitsCleared} digits!`
            : `💀 <strong>CLOSE!</strong> ${activeChallenge.challengerName} keeps the crown with ${activeChallenge.targetDigits} digits. Try again!`
          }
        </div>
      `;
    }

    arenaActions.innerHTML = `
      <div class="scorecard">
        <div class="scorecard-header">
          <div class="rank-badge ${classification.badgeClass}">${classification.rank}</div>
          <p style="font-size: 0.95rem; color: #cbd5e1; margin-top: 0.5rem;">${classification.desc}</p>
        </div>

        ${challengeHTML}

        <!-- Number Diff Comparison -->
        <div class="diff-box">
          <div class="diff-row">
            <span>Correct Number:</span>
            <span class="diff-actual">${currentTargetNumber}</span>
          </div>
          <div class="diff-row">
            <span>Your Answer:</span>
            <span class="diff-entered">${userGuess || '(empty)'}</span>
          </div>
        </div>

        <div class="score-metrics" style="grid-template-columns: 1fr;">
          <div class="metric-card">
            <div class="metric-label">Max Digits Cleared</div>
            <div class="metric-value" style="color: var(--neon-cyan);">${digitsCleared} Digits</div>
          </div>
        </div>

        ${isNewPB && digitsCleared > 0 ? '<div style="color: var(--neon-green); font-weight: 700; margin-bottom: 1.25rem;">✨ NEW PERSONAL BEST! ✨</div>' : ''}

        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-viral" id="challengeFriendsBtn">
            🚀 Challenge a Friend
          </button>
          <button type="button" class="btn btn-secondary" id="playAgainBtn">
            🔄 Try Again
          </button>
        </div>
      </div>
    `;

    // Bind Scorecard actions
    const challengeBtn = document.getElementById('challengeFriendsBtn');
    if (challengeBtn) {
      challengeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerScoreShare(digitsCleared);
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

  // --- VIRAL SHARING ---
  function getChallengeURL(digits) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?challenge=${digits}&by=Friend`;
  }

  function getShareText(digits) {
    const classification = getMemoryClassification(digits);
    return `🧠 I remembered ${digits} digits on ReflexRush Number Memory (${classification.rank})! Think your brain can beat mine? Play here:`;
  }

  function triggerScoreShare(digits) {
    const url = getChallengeURL(digits);
    const text = getShareText(digits);

    if (navigator.share) {
      navigator.share({
        title: 'ReflexRush: Number Memory Challenge',
        text: text,
        url: url
      }).catch((err) => {
        if (err.name !== 'AbortError') openShareModal(url, text);
      });
    } else {
      openShareModal(url, text);
    }
  }

  function openShareModal(url, text) {
    if (!shareModal) return;
    shareInput.value = url;

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
    if (shareModal) shareModal.classList.remove('open');
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

  // --- INITIALIZATION ---
  function init() {
    updateSoundUI();
    updateHeroStats();
    parseChallengeFromURL();
    resetGame();

    // Sound toggle
    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        localStorage.setItem(STORAGE_KEYS.MUTED, isMuted);
        updateSoundUI();
        if (!isMuted) {
          initAudio();
          playSound('levelStart');
        }
      });
    }

    // Modal listeners
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeShareModal);
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

    // Challenge banner close
    if (challengeCloseBtn && challengeBanner) {
      challengeCloseBtn.addEventListener('click', () => {
        challengeBanner.style.display = 'none';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
