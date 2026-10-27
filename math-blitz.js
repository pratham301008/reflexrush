/**
 * ReflexRush - Mental Math Blitz Engine
 * 60-second high-speed arithmetic sprint with combo multipliers.
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    BEST_SOLVED: 'reflexrush_math_best',
    TOTAL_GAMES: 'reflexrush_math_total',
    MUTED: 'reflexrush_muted'
  };

  const GAME_DURATION_SEC = 60;

  const MathState = {
    IDLE: 'idle',
    PLAYING: 'playing',
    GAMEOVER: 'gameover'
  };

  let currentState = MathState.IDLE;
  let scorePoints = 0;
  let questionsSolved = 0;
  let questionsAttempted = 0;
  let streak = 0;
  let maxStreak = 0;
  let timeLeft = GAME_DURATION_SEC;
  let timerInterval = null;
  let currentCorrectAnswer = 0;
  let activeChallenge = null;

  // DOM Elements
  const arena = document.getElementById('gameArena');
  const arenaIcon = document.getElementById('arenaIcon');
  const arenaTitle = document.getElementById('arenaTitle');
  const arenaDesc = document.getElementById('arenaDesc');
  const arenaActions = document.getElementById('arenaActions');
  const heroBestSolved = document.getElementById('heroBestSolved');
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
      case 'correct':
        playTone(700, 'sine', 0.06, 0.15);
        setTimeout(() => playTone(1050, 'sine', 0.1, 0.18), 50);
        break;
      case 'combo':
        playTone(880, 'sine', 0.08, 0.18);
        setTimeout(() => playTone(1320, 'sine', 0.12, 0.2), 60);
        setTimeout(() => playTone(1760, 'sine', 0.16, 0.22), 120);
        break;
      case 'wrong':
        playTone(170, 'sawtooth', 0.18, 0.2);
        break;
      case 'tick':
        playTone(800, 'sine', 0.04, 0.1);
        break;
      case 'fanfare':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          setTimeout(() => playTone(freq, 'sine', 0.15, 0.2), idx * 80);
        });
        break;
    }
  }

  function updateSoundUI() {
    if (soundToggleBtn) {
      soundToggleBtn.textContent = isMuted ? '🔇' : '🔊';
      soundToggleBtn.title = isMuted ? 'Sound Muted' : 'Sound Enabled';
    }
  }

  // --- STORAGE & CHALLENGE ---
  function getPersonalBest() {
    const best = localStorage.getItem(STORAGE_KEYS.BEST_SOLVED);
    const total = localStorage.getItem(STORAGE_KEYS.TOTAL_GAMES) || 0;
    return {
      bestSolved: best ? parseInt(best, 10) : 0,
      totalGames: parseInt(total, 10)
    };
  }

  function saveGameRecord(solvedCount) {
    const pb = getPersonalBest();
    let isNewPB = false;
    if (solvedCount > pb.bestSolved) {
      localStorage.setItem(STORAGE_KEYS.BEST_SOLVED, solvedCount);
      isNewPB = true;
    }
    localStorage.setItem(STORAGE_KEYS.TOTAL_GAMES, pb.totalGames + 1);
    updateHeroStats();
    return isNewPB;
  }

  function updateHeroStats() {
    const pb = getPersonalBest();
    if (heroBestSolved) heroBestSolved.textContent = pb.bestSolved > 0 ? `${pb.bestSolved} Solved` : '--';
    if (heroTotalGames) heroTotalGames.textContent = pb.totalGames;
  }

  function parseChallengeFromURL() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const targetParam = urlParams.get('challenge') || urlParams.get('target');
      const byParam = urlParams.get('by') || urlParams.get('from');

      if (targetParam) {
        const targetSolved = parseInt(targetParam, 10);
        if (!isNaN(targetSolved) && targetSolved >= 1 && targetSolved <= 80) {
          const name = byParam ? sanitizeHTML(byParam.slice(0, 20)) : 'A friend';
          activeChallenge = { targetSolved, challengerName: name };
          showChallengeBanner();
        }
      }
    } catch (e) {
      console.warn('URL notice:', e);
    }
  }

  function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  function showChallengeBanner() {
    if (!challengeBanner || !activeChallenge) return;
    challengeMsg.innerHTML = `🔢 <strong>${activeChallenge.challengerName}</strong> solved <strong>${activeChallenge.targetSolved} problems</strong> in 60s! Think you can do more?`;
    challengeBanner.style.display = 'block';
  }

  function getMathClassification(solved) {
    if (solved >= 35) {
      return { rank: 'Human Calculator', badgeClass: 'rank-god', desc: 'Top 0.1% mental processing speed! Your brain computes faster than an Excel sheet.' };
    } else if (solved >= 26) {
      return { rank: 'Algebraic Beast', badgeClass: 'rank-pro', desc: 'Exceptional speed and rapid mental clarity under severe time pressure!' };
    } else if (solved >= 18) {
      return { rank: 'Quick Thinker', badgeClass: 'rank-quick', desc: 'Sharp mathematical instincts. Well above human average.' };
    } else if (solved >= 11) {
      return { rank: 'Solid Math Reflex', badgeClass: 'rank-avg', desc: 'Standard human arithmetic speed. Keep training to build speed!' };
    } else {
      return { rank: 'Need Scratch Paper', badgeClass: 'rank-slow', desc: 'A bit rusty with mental arithmetic! Warm up your brain and try again.' };
    }
  }

  // --- EQUATION GENERATOR ---
  function generateEquation() {
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, answer;

    if (op === '+') {
      a = Math.floor(Math.random() * 45) + 5;
      b = Math.floor(Math.random() * 45) + 5;
      answer = a + b;
    } else if (op === '-') {
      a = Math.floor(Math.random() * 50) + 20;
      b = Math.floor(Math.random() * (a - 5)) + 5;
      answer = a - b;
    } else {
      // Multiplication
      a = Math.floor(Math.random() * 11) + 2;
      b = Math.floor(Math.random() * 11) + 2;
      answer = a * b;
    }

    // Generate 3 plausible fake options
    const options = new Set([answer]);
    while (options.size < 4) {
      const delta = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? -1 : 1);
      const fake = answer + delta;
      if (fake > 0 && fake !== answer) options.add(fake);
    }

    const shuffled = Array.from(options).sort(() => Math.random() - 0.5);
    return {
      equationStr: `${a} ${op === '*' ? '×' : op} ${b}`,
      answer: answer,
      options: shuffled
    };
  }

  // --- GAME FLOW ---
  function resetGame() {
    clearInterval(timerInterval);
    currentState = MathState.IDLE;
    scorePoints = 0;
    questionsSolved = 0;
    questionsAttempted = 0;
    streak = 0;
    maxStreak = 0;
    timeLeft = GAME_DURATION_SEC;

    arena.className = 'game-arena state-idle';
    arenaIcon.textContent = '🔢';
    arenaTitle.textContent = 'Mental Math Blitz';
    arenaDesc.textContent = 'Solve as many rapid math problems as you can in 60 seconds. Build combos for bonus points!';
    arenaActions.innerHTML = `<button type="button" class="btn btn-primary btn-lg" id="startMathBtn">Start Blitz (60s)</button>`;

    const startBtn = document.getElementById('startMathBtn');
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startGame();
      });
    }
  }

  function startGame() {
    initAudio();
    currentState = MathState.PLAYING;
    scorePoints = 0;
    questionsSolved = 0;
    questionsAttempted = 0;
    streak = 0;
    maxStreak = 0;
    timeLeft = GAME_DURATION_SEC;

    timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 5) playSound('tick');
      updateTopBar();
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        endGame();
      }
    }, 1000);

    nextQuestion();
  }

  function updateTopBar() {
    const mult = streak >= 9 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1;
    arenaDesc.innerHTML = `
      ⏱️ <strong>${timeLeft}s left</strong> &bull; 
      🎯 Solved: <strong>${questionsSolved}</strong> &bull; 
      🔥 Streak: <strong>${streak}</strong> (x${mult})
    `;
  }

  function nextQuestion() {
    if (currentState !== MathState.PLAYING) return;
    const eq = generateEquation();
    currentCorrectAnswer = eq.answer;

    arena.className = 'game-arena state-idle';
    arenaIcon.textContent = '⚡';
    arenaTitle.textContent = 'What is the answer?';
    updateTopBar();

    arenaActions.innerHTML = `
      <div class="math-equation-box">
        <div class="math-equation">${eq.equationStr} = ?</div>
      </div>

      <div class="math-options-grid">
        ${eq.options
          .map(
            (val) => `
          <button type="button" class="math-option-btn" data-val="${val}">
            ${val}
          </button>`
          )
          .join('')}
      </div>
    `;

    const btns = arenaActions.querySelectorAll('.math-option-btn');
    btns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAnswer(parseInt(btn.dataset.val, 10));
      });
    });
  }

  function handleAnswer(val) {
    if (currentState !== MathState.PLAYING) return;
    questionsAttempted++;

    if (val === currentCorrectAnswer) {
      questionsSolved++;
      streak++;
      if (streak > maxStreak) maxStreak = streak;

      const multiplier = streak >= 9 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1;
      scorePoints += 100 * multiplier;

      if (streak % 3 === 0) {
        playSound('combo');
      } else {
        playSound('correct');
      }
    } else {
      streak = 0;
      playSound('wrong');
    }

    nextQuestion();
  }

  function endGame() {
    currentState = MathState.GAMEOVER;
    const isNewPB = saveGameRecord(questionsSolved);
    const classification = getMathClassification(questionsSolved);
    const accuracy = questionsAttempted > 0 ? Math.round((questionsSolved / questionsAttempted) * 100) : 0;

    if (isNewPB && questionsSolved > 5) playSound('fanfare');

    arena.className = 'game-arena state-finished';
    arenaIcon.textContent = '🏆';
    arenaTitle.textContent = 'Time Up!';
    arenaDesc.textContent = 'Here is your 60-second arithmetic performance:';

    let challengeHTML = '';
    if (activeChallenge) {
      const beatOpponent = questionsSolved > activeChallenge.targetSolved;
      const tied = questionsSolved === activeChallenge.targetSolved;
      challengeHTML = `
        <div class="challenge-outcome ${beatOpponent ? 'win' : 'loss'}">
          ${beatOpponent
            ? `🏆 <strong>VICTORY!</strong> You solved ${questionsSolved} equations, beating ${activeChallenge.challengerName}'s target of ${activeChallenge.targetSolved}!`
            : tied
            ? `🤝 <strong>TIED!</strong> Both you and ${activeChallenge.challengerName} solved ${questionsSolved} equations!`
            : `💀 <strong>CLOSE!</strong> ${activeChallenge.challengerName} holds the crown with ${activeChallenge.targetSolved} solved. Try again!`
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

        <div class="score-metrics">
          <div class="metric-card">
            <div class="metric-label">Equations Solved</div>
            <div class="metric-value" style="color: var(--neon-cyan);">${questionsSolved}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Accuracy</div>
            <div class="metric-value" style="color: var(--neon-green);">${accuracy}%</div>
          </div>
        </div>

        ${isNewPB && questionsSolved > 0 ? '<div style="color: var(--neon-green); font-weight: 700; margin-bottom: 1.25rem;">✨ NEW PERSONAL BEST! ✨</div>' : ''}

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

    const challengeBtn = document.getElementById('challengeFriendsBtn');
    if (challengeBtn) {
      challengeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerScoreShare(questionsSolved);
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
  function getChallengeURL(solved) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?challenge=${solved}&by=Friend`;
  }

  function getShareText(solved) {
    const classification = getMathClassification(solved);
    return `🔢 I solved ${solved} math equations in 60s on ReflexRush (${classification.rank})! Can your brain calculate faster? Try here:`;
  }

  function triggerScoreShare(solved) {
    const url = getChallengeURL(solved);
    const text = getShareText(solved);

    if (navigator.share) {
      navigator.share({
        title: 'ReflexRush: Mental Math Blitz',
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

  // --- KEYBOARD 1-4 SHORTCUTS ---
  function handleKeyboard(e) {
    if (currentState !== MathState.PLAYING) return;
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 4) {
      const btns = arenaActions.querySelectorAll('.math-option-btn');
      if (btns[num - 1]) {
        btns[num - 1].click();
      }
    }
  }

  function init() {
    updateSoundUI();
    updateHeroStats();
    parseChallengeFromURL();
    resetGame();

    window.addEventListener('keydown', handleKeyboard);

    if (soundToggleBtn) {
      soundToggleBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        localStorage.setItem(STORAGE_KEYS.MUTED, isMuted);
        updateSoundUI();
        if (!isMuted) {
          initAudio();
          playSound('correct');
        }
      });
    }

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
