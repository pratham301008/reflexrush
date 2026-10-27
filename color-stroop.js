/**
 * ReflexRush - Color Stroop Clash Engine
 * Rapid-fire cognitive conflict test measuring neural inhibition speed.
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    BEST_SCORE: 'reflexrush_stroop_best',
    TOTAL_GAMES: 'reflexrush_stroop_total',
    MUTED: 'reflexrush_muted'
  };

  const TOTAL_QUESTIONS = 20;
  const TIME_PER_QUESTION_MS = 2500;

  const COLORS = [
    { name: 'Red', hex: '#ef4444', btnClass: 'btn-color-red' },
    { name: 'Blue', hex: '#3b82f6', btnClass: 'btn-color-blue' },
    { name: 'Green', hex: '#22c55e', btnClass: 'btn-color-green' },
    { name: 'Yellow', hex: '#eab308', btnClass: 'btn-color-yellow' },
    { name: 'Purple', hex: '#a855f7', btnClass: 'btn-color-purple' }
  ];

  const StroopState = {
    IDLE: 'idle',
    PLAYING: 'playing',
    GAMEOVER: 'gameover'
  };

  let currentState = StroopState.IDLE;
  let currentQuestion = 0;
  let score = 0;
  let streak = 0;
  let maxStreak = 0;
  let reactionTimes = [];
  let questionStartTime = 0;
  let questionTimer = null;
  let timerAnimFrame = null;
  let timerDuration = TIME_PER_QUESTION_MS;
  let timerStart = 0;
  let currentTargetColor = null;
  let activeChallenge = null;

  // DOM Elements
  const arena = document.getElementById('gameArena');
  const arenaIcon = document.getElementById('arenaIcon');
  const arenaTitle = document.getElementById('arenaTitle');
  const arenaDesc = document.getElementById('arenaDesc');
  const arenaActions = document.getElementById('arenaActions');
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
        playTone(784, 'sine', 0.08, 0.18);
        setTimeout(() => playTone(1174, 'sine', 0.12, 0.2), 60);
        break;
      case 'wrong':
        playTone(180, 'sawtooth', 0.2, 0.2);
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
    const best = localStorage.getItem(STORAGE_KEYS.BEST_SCORE);
    const total = localStorage.getItem(STORAGE_KEYS.TOTAL_GAMES) || 0;
    return {
      bestScore: best ? parseInt(best, 10) : 0,
      totalGames: parseInt(total, 10)
    };
  }

  function saveGameRecord(finalScore) {
    const pb = getPersonalBest();
    let isNewPB = false;
    if (finalScore > pb.bestScore) {
      localStorage.setItem(STORAGE_KEYS.BEST_SCORE, finalScore);
      isNewPB = true;
    }
    localStorage.setItem(STORAGE_KEYS.TOTAL_GAMES, pb.totalGames + 1);
    updateHeroStats();
    return isNewPB;
  }

  function updateHeroStats() {
    const pb = getPersonalBest();
    if (heroBestScore) heroBestScore.textContent = pb.bestScore > 0 ? `${pb.bestScore}/${TOTAL_QUESTIONS}` : '--';
    if (heroTotalGames) heroTotalGames.textContent = pb.totalGames;
  }

  function parseChallengeFromURL() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const targetParam = urlParams.get('challenge') || urlParams.get('target');
      const byParam = urlParams.get('by') || urlParams.get('from');

      if (targetParam) {
        const targetScore = parseInt(targetParam, 10);
        if (!isNaN(targetScore) && targetScore >= 1 && targetScore <= TOTAL_QUESTIONS) {
          const name = byParam ? sanitizeHTML(byParam.slice(0, 20)) : 'A friend';
          activeChallenge = { targetScore, challengerName: name };
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
    challengeMsg.innerHTML = `🎨 <strong>${activeChallenge.challengerName}</strong> scored <strong>${activeChallenge.targetScore}/${TOTAL_QUESTIONS}</strong> on Color Stroop! Can you beat their brain?`;
    challengeBanner.style.display = 'block';
  }

  function getStroopClassification(scoreVal) {
    if (scoreVal >= 19) {
      return { rank: 'Cognitive Chameleon', badgeClass: 'rank-god', desc: 'Flawless neural inhibition! Your frontal cortex overrides sensory traps with surgical precision.' };
    } else if (scoreVal >= 16) {
      return { rank: 'Neural Ninja', badgeClass: 'rank-pro', desc: 'Outstanding speed & focus! You easily out-process 90% of players.' };
    } else if (scoreVal >= 13) {
      return { rank: 'Sharp Synapse', badgeClass: 'rank-quick', desc: 'Solid cognitive reflexes. A bit more practice will make you unstoppable.' };
    } else if (scoreVal >= 10) {
      return { rank: 'Human Average', badgeClass: 'rank-avg', desc: 'Classic Stroop interference! Your brain instinctively reads the word instead of seeing the ink.' };
    } else {
      return { rank: 'Brain Glitcher', badgeClass: 'rank-slow', desc: 'Total sensory overload! Shake off the mental fog and try again.' };
    }
  }

  // --- GAMEPLAY FLOW ---
  function resetGame() {
    clearTimeout(questionTimer);
    cancelAnimationFrame(timerAnimFrame);
    currentState = StroopState.IDLE;
    currentQuestion = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    reactionTimes = [];

    arena.className = 'game-arena state-idle';
    arenaIcon.textContent = '🎨';
    arenaTitle.textContent = 'Color Stroop Clash';
    arenaDesc.textContent = 'Tap the button matching the INK COLOR of the word, NOT what the word spells! 20 rapid rounds.';
    arenaActions.innerHTML = `<button type="button" class="btn btn-primary btn-lg" id="startStroopBtn">Start Clash (20 Rounds)</button>`;

    const startBtn = document.getElementById('startStroopBtn');
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startGame();
      });
    }
  }

  function startGame() {
    initAudio();
    currentState = StroopState.PLAYING;
    currentQuestion = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    reactionTimes = [];
    nextQuestion();
  }

  function nextQuestion() {
    clearTimeout(questionTimer);
    cancelAnimationFrame(timerAnimFrame);

    if (currentQuestion >= TOTAL_QUESTIONS) {
      endGame();
      return;
    }

    currentQuestion++;

    // Select random word text and random ink color (75% chance of conflict to trigger Stroop effect!)
    const textIdx = Math.floor(Math.random() * COLORS.length);
    let inkIdx = Math.floor(Math.random() * COLORS.length);
    if (Math.random() < 0.8 && inkIdx === textIdx) {
      inkIdx = (textIdx + 1 + Math.floor(Math.random() * (COLORS.length - 1))) % COLORS.length;
    }

    const wordText = COLORS[textIdx].name;
    currentTargetColor = COLORS[inkIdx];

    // Pick 4 options including target
    const optionSet = new Set([currentTargetColor]);
    while (optionSet.size < 4) {
      optionSet.add(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
    const shuffledOptions = Array.from(optionSet).sort(() => Math.random() - 0.5);

    arena.className = 'game-arena state-idle';
    arenaIcon.textContent = '🎯';
    arenaTitle.textContent = `Match the INK COLOR!`;
    arenaDesc.innerHTML = `<span class="streak-counter">🔥 Streak: ${streak}</span> &bull; Round ${currentQuestion} of ${TOTAL_QUESTIONS}`;

    arenaActions.innerHTML = `
      <div class="stroop-word-card">
        <div class="stroop-word" style="color: ${currentTargetColor.hex};">${wordText}</div>
        <div class="stroop-timer-bar">
          <div class="stroop-timer-fill" id="stroopTimerFill"></div>
        </div>
      </div>

      <div class="stroop-buttons-grid">
        ${shuffledOptions
          .map(
            (c) => `
          <button type="button" class="stroop-color-btn ${c.btnClass}" data-color="${c.name}">
            ${c.name}
          </button>`
          )
          .join('')}
      </div>
    `;

    questionStartTime = performance.now();
    timerStart = performance.now();
    timerDuration = Math.max(1200, TIME_PER_QUESTION_MS - (currentQuestion * 40));

    const fillBar = document.getElementById('stroopTimerFill');

    function updateTimer(now) {
      const elapsed = now - timerStart;
      const remaining = Math.max(0, timerDuration - elapsed);
      const pct = (remaining / timerDuration) * 100;
      if (fillBar) fillBar.style.transform = `scaleX(${pct / 100})`;

      if (remaining > 0 && currentState === StroopState.PLAYING) {
        timerAnimFrame = requestAnimationFrame(updateTimer);
      } else if (remaining <= 0) {
        handleTimeout();
      }
    }

    timerAnimFrame = requestAnimationFrame(updateTimer);

    // Bind color buttons
    const buttons = arenaActions.querySelectorAll('.stroop-color-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAnswer(btn.dataset.color);
      });
    });
  }

  function handleAnswer(selectedColorName) {
    if (currentState !== StroopState.PLAYING) return;
    cancelAnimationFrame(timerAnimFrame);

    const reaction = Math.round(performance.now() - questionStartTime);
    reactionTimes.push(reaction);

    if (selectedColorName === currentTargetColor.name) {
      score++;
      streak++;
      if (streak > maxStreak) maxStreak = streak;
      playSound('correct');
    } else {
      streak = 0;
      playSound('wrong');
    }

    nextQuestion();
  }

  function handleTimeout() {
    if (currentState !== StroopState.PLAYING) return;
    streak = 0;
    playSound('wrong');
    reactionTimes.push(timerDuration);
    nextQuestion();
  }

  function endGame() {
    currentState = StroopState.GAMEOVER;
    const isNewPB = saveGameRecord(score);
    const classification = getStroopClassification(score);

    const avgReaction = reactionTimes.length
      ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
      : 0;

    if (isNewPB && score > 10) playSound('fanfare');

    arena.className = 'game-arena state-finished';
    arenaIcon.textContent = '🏆';
    arenaTitle.textContent = 'Clash Complete!';
    arenaDesc.textContent = 'Here is your cognitive Stroop assessment:';

    let challengeHTML = '';
    if (activeChallenge) {
      const beatOpponent = score > activeChallenge.targetScore;
      const tied = score === activeChallenge.targetScore;
      challengeHTML = `
        <div class="challenge-outcome ${beatOpponent ? 'win' : 'loss'}">
          ${beatOpponent
            ? `🏆 <strong>VICTORY!</strong> You crushed ${activeChallenge.challengerName}'s score of ${activeChallenge.targetScore} with your <strong>${score}/${TOTAL_QUESTIONS}</strong>!`
            : tied
            ? `🤝 <strong>TIED!</strong> You and ${activeChallenge.challengerName} both scored ${score}/${TOTAL_QUESTIONS}!`
            : `💀 <strong>CLOSE!</strong> ${activeChallenge.challengerName} keeps the crown with ${activeChallenge.targetScore}. Try again!`
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
            <div class="metric-label">Accuracy Score</div>
            <div class="metric-value" style="color: var(--neon-green);">${score}/${TOTAL_QUESTIONS}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Avg Decision Speed</div>
            <div class="metric-value" style="color: var(--neon-cyan);">${avgReaction} ms</div>
          </div>
        </div>

        ${isNewPB && score > 0 ? '<div style="color: var(--neon-green); font-weight: 700; margin-bottom: 1.25rem;">✨ NEW PERSONAL RECORD! ✨</div>' : ''}

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
        triggerScoreShare(score);
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
  function getChallengeURL(scoreVal) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?challenge=${scoreVal}&by=Friend`;
  }

  function getShareText(scoreVal) {
    const classification = getStroopClassification(scoreVal);
    return `🎨 I scored ${scoreVal}/${TOTAL_QUESTIONS} on ReflexRush Color Stroop (${classification.rank})! Think your brain can resist the interference? Try here:`;
  }

  function triggerScoreShare(scoreVal) {
    const url = getChallengeURL(scoreVal);
    const text = getShareText(scoreVal);

    if (navigator.share) {
      navigator.share({
        title: 'ReflexRush: Color Stroop Clash',
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
