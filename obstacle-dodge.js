/**
 * ReflexRush - Obstacle Dodge Engine
 * High-framerate 2D Canvas evasion micro-game with touch & keyboard controls.
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    BEST_TIME: 'reflexrush_dodge_best',
    TOTAL_GAMES: 'reflexrush_dodge_total',
    MUTED: 'reflexrush_muted'
  };

  const GameState = {
    IDLE: 'idle',
    PLAYING: 'playing',
    GAMEOVER: 'gameover'
  };

  let currentState = GameState.IDLE;
  let canvas, ctx;
  let animId = null;
  let startTime = 0;
  let survivalTimeSec = 0;
  let activeChallenge = null;

  // Player properties
  const player = {
    x: 200,
    y: 440,
    size: 16,
    speed: 7,
    movingLeft: false,
    movingRight: false,
    targetX: null
  };

  // Game entities
  let obstacles = [];
  let particles = [];
  let lastObstacleSpawn = 0;
  let spawnIntervalMs = 700;
  let baseObstacleSpeed = 3.5;

  // DOM Elements
  const arena = document.getElementById('gameArena');
  const heroBestTime = document.getElementById('heroBestTime');
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
      case 'start':
        playTone(440, 'sine', 0.1, 0.15);
        setTimeout(() => playTone(880, 'sine', 0.15, 0.2), 60);
        break;
      case 'crash':
        playTone(130, 'sawtooth', 0.35, 0.3);
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
    const best = localStorage.getItem(STORAGE_KEYS.BEST_TIME);
    const total = localStorage.getItem(STORAGE_KEYS.TOTAL_GAMES) || 0;
    return {
      bestTime: best ? parseFloat(best) : 0,
      totalGames: parseInt(total, 10)
    };
  }

  function saveGameRecord(timeVal) {
    const pb = getPersonalBest();
    let isNewPB = false;
    if (timeVal > pb.bestTime) {
      localStorage.setItem(STORAGE_KEYS.BEST_TIME, timeVal.toFixed(2));
      isNewPB = true;
    }
    localStorage.setItem(STORAGE_KEYS.TOTAL_GAMES, pb.totalGames + 1);
    updateHeroStats();
    return isNewPB;
  }

  function updateHeroStats() {
    const pb = getPersonalBest();
    if (heroBestTime) heroBestTime.textContent = pb.bestTime > 0 ? `${pb.bestTime}s` : '--';
    if (heroTotalGames) heroTotalGames.textContent = pb.totalGames;
  }

  function parseChallengeFromURL() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const targetParam = urlParams.get('challenge') || urlParams.get('target');
      const byParam = urlParams.get('by') || urlParams.get('from');

      if (targetParam) {
        const targetVal = parseFloat(targetParam);
        if (!isNaN(targetVal) && targetVal >= 3 && targetVal <= 200) {
          const name = byParam ? sanitizeHTML(byParam.slice(0, 20)) : 'A friend';
          activeChallenge = { targetTime: targetVal, challengerName: name };
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
    challengeMsg.innerHTML = `🚀 <strong>${activeChallenge.challengerName}</strong> survived <strong>${activeChallenge.targetTime.toFixed(1)}s</strong> on Obstacle Dodge! Think you can dodge longer?`;
    challengeBanner.style.display = 'block';
  }

  function getDodgeClassification(timeVal) {
    if (timeVal >= 45) {
      return { rank: 'Matrix Navigator', badgeClass: 'rank-god', desc: 'Godlike evasive agility! You see laser trajectories in slow motion.' };
    } else if (timeVal >= 30) {
      return { rank: 'Cyber Ace', badgeClass: 'rank-pro', desc: 'Outstanding micro-dodging dexterity! Top 5% spatial survival.' };
    } else if (timeVal >= 20) {
      return { rank: 'Dexterous Dodger', badgeClass: 'rank-quick', desc: 'Solid hand-eye coordination. Well above human average.' };
    } else if (timeVal >= 12) {
      return { rank: 'Casual Cruiser', badgeClass: 'rank-avg', desc: 'Standard arcade reflexes. Watch the edges and anticipate lane changes!' };
    } else {
      return { rank: 'Crash Test Dummy', badgeClass: 'rank-slow', desc: 'Caught in the laser crossfire! Tap lighter and predict patterns.' };
    }
  }

  // --- CANVAS & GAME LOOP ---
  function initCanvas() {
    canvas = document.getElementById('dodgeCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width = 400;
    canvas.height = 500;
    player.x = canvas.width / 2;
    player.y = canvas.height - 50;

    // Direct touch / drag on canvas
    canvas.addEventListener('pointerdown', handleCanvasPointer);
    canvas.addEventListener('pointermove', handleCanvasPointer);
    canvas.addEventListener('pointerup', () => { player.targetX = null; });
  }

  function handleCanvasPointer(e) {
    if (currentState !== GameState.PLAYING) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    player.targetX = (e.clientX - rect.left) * scaleX;
  }

  function resetGame() {
    cancelAnimationFrame(animId);
    currentState = GameState.IDLE;
    obstacles = [];
    particles = [];
    survivalTimeSec = 0;
    player.x = 200;
    player.targetX = null;
    player.movingLeft = false;
    player.movingRight = false;

    renderIdleCanvas();

    const startOverlay = document.getElementById('startOverlay');
    if (startOverlay) startOverlay.style.display = 'flex';
    const endOverlay = document.getElementById('endOverlay');
    if (endOverlay) endOverlay.style.display = 'none';
  }

  function renderIdleCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw grid background
    drawGrid();
    // Draw player
    drawPlayer();
  }

  function startGame() {
    initAudio();
    currentState = GameState.PLAYING;
    obstacles = [];
    particles = [];
    survivalTimeSec = 0;
    player.x = canvas.width / 2;
    startTime = performance.now();
    lastObstacleSpawn = performance.now();
    spawnIntervalMs = 700;
    baseObstacleSpeed = 3.5;

    const startOverlay = document.getElementById('startOverlay');
    if (startOverlay) startOverlay.style.display = 'none';
    const endOverlay = document.getElementById('endOverlay');
    if (endOverlay) endOverlay.style.display = 'none';

    playSound('start');
    lastObstacleSpawn = performance.now();
    loop(performance.now());
  }

  function spawnObstacle() {
    const width = Math.floor(Math.random() * 60) + 40;
    const x = Math.random() * (canvas.width - width);
    const speed = baseObstacleSpeed + (Math.random() * 1.5);
    const color = Math.random() < 0.5 ? '#a855f7' : '#ff3366';

    obstacles.push({
      x,
      y: -25,
      width,
      height: 18,
      speed,
      color
    });
  }

  function spawnParticles(x, y, color) {
    for (let i = 0; i < 16; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        size: Math.random() * 4 + 2,
        life: 1,
        color
      });
    }
  }

  function loop(now) {
    if (currentState !== GameState.PLAYING) return;

    survivalTimeSec = (now - startTime) / 1000;

    // Difficulty scaling: speed and spawn rate increase over time
    baseObstacleSpeed = 3.5 + Math.min(6, survivalTimeSec * 0.12);
    spawnIntervalMs = Math.max(260, 700 - (survivalTimeSec * 12));

    if (now - lastObstacleSpawn > spawnIntervalMs) {
      spawnObstacle();
      lastObstacleSpawn = now;
    }

    // Update Player position
    if (player.targetX !== null) {
      const dx = player.targetX - player.x;
      player.x += dx * 0.25;
    } else {
      if (player.movingLeft) player.x -= player.speed;
      if (player.movingRight) player.x += player.speed;
    }
    // Clamp to canvas edges
    player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));

    // Update Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.y += o.speed;

      // Collision check with player triangle
      if (
        player.x + player.size > o.x &&
        player.x - player.size < o.x + o.width &&
        player.y + player.size > o.y &&
        player.y - player.size < o.y + o.height
      ) {
        handleGameOver();
        return;
      }

      if (o.y > canvas.height + 30) {
        obstacles.splice(i, 1);
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.03;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Draw scene
    render();

    animId = requestAnimationFrame(loop);
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    ctx.save();
    ctx.fillStyle = '#00f5a0';
    ctx.shadowColor = '#00f5a0';
    ctx.shadowBlur = 15;

    // Draw cyber ship triangle
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - player.size);
    ctx.lineTo(player.x - player.size, player.y + player.size);
    ctx.lineTo(player.x, player.y + player.size * 0.4);
    ctx.lineTo(player.x + player.size, player.y + player.size);
    ctx.closePath();
    ctx.fill();

    // Thruster flame
    if (currentState === GameState.PLAYING) {
      ctx.fillStyle = '#00d9f5';
      ctx.beginPath();
      ctx.moveTo(player.x - 4, player.y + player.size * 0.6);
      ctx.lineTo(player.x + 4, player.y + player.size * 0.6);
      ctx.lineTo(player.x, player.y + player.size + (Math.random() * 8 + 4));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    // Draw obstacles
    for (const o of obstacles) {
      ctx.save();
      ctx.fillStyle = o.color;
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, o.width, o.height, 6);
      ctx.fill();
      ctx.restore();
    }

    // Draw particles
    for (const p of particles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw player
    drawPlayer();

    // HUD: Survival time
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 20px -apple-system, BlinkMacSystemFont, monospace';
    ctx.fillText(`${survivalTimeSec.toFixed(2)}s`, 16, 32);
    ctx.restore();
  }

  function handleGameOver() {
    currentState = GameState.GAMEOVER;
    cancelAnimationFrame(animId);
    playSound('crash');
    spawnParticles(player.x, player.y, '#ff3366');
    render();

    const finalSec = survivalTimeSec;
    const isNewPB = saveGameRecord(finalSec);
    const classification = getDodgeClassification(finalSec);

    if (isNewPB && finalSec > 15) playSound('fanfare');

    let challengeHTML = '';
    if (activeChallenge) {
      const beatOpponent = finalSec > activeChallenge.targetTime;
      challengeHTML = `
        <div class="challenge-outcome ${beatOpponent ? 'win' : 'loss'}">
          ${beatOpponent
            ? `🏆 <strong>VICTORY!</strong> You survived <strong>${finalSec.toFixed(2)}s</strong>, beating ${activeChallenge.challengerName}'s target of ${activeChallenge.targetTime.toFixed(1)}s!`
            : `💀 <strong>CLOSE!</strong> ${activeChallenge.challengerName} survived ${activeChallenge.targetTime.toFixed(1)}s. Try again!`
          }
        </div>
      `;
    }

    const endOverlay = document.getElementById('endOverlay');
    if (endOverlay) {
      endOverlay.innerHTML = `
        <div class="scorecard" style="margin: 1rem auto;">
          <div class="scorecard-header">
            <div class="rank-badge ${classification.badgeClass}">${classification.rank}</div>
            <p style="font-size: 0.95rem; color: #cbd5e1; margin-top: 0.5rem;">${classification.desc}</p>
          </div>

          ${challengeHTML}

          <div class="score-metrics" style="grid-template-columns: 1fr;">
            <div class="metric-card">
              <div class="metric-label">Survival Time</div>
              <div class="metric-value" style="color: var(--neon-cyan); font-size: 2.4rem;">${finalSec.toFixed(2)}s</div>
            </div>
          </div>

          ${isNewPB ? '<div style="color: var(--neon-green); font-weight: 700; margin-bottom: 1.25rem;">✨ NEW PERSONAL RECORD! ✨</div>' : ''}

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
      endOverlay.style.display = 'block';

      const challengeBtn = document.getElementById('challengeFriendsBtn');
      if (challengeBtn) {
        challengeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerScoreShare(finalSec);
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
  }

  // --- VIRAL SHARING ---
  function getChallengeURL(sec) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?challenge=${sec.toFixed(1)}&by=Friend`;
  }

  function getShareText(sec) {
    const classification = getDodgeClassification(sec);
    return `🚀 I survived ${sec.toFixed(2)} seconds on ReflexRush Obstacle Dodge (${classification.rank})! Think your reflexes can dodge longer? Play here:`;
  }

  function triggerScoreShare(sec) {
    const url = getChallengeURL(sec);
    const text = getShareText(sec);

    if (navigator.share) {
      navigator.share({
        title: 'ReflexRush: Obstacle Dodge Challenge',
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

  // --- KEYBOARD & TOUCH BUTTON CONTROLS ---
  function setupControls() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        player.movingLeft = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        player.movingRight = true;
      }
      if (e.code === 'Space' && currentState === GameState.IDLE) {
        startGame();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        player.movingLeft = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        player.movingRight = false;
      }
    });

    const leftBtn = document.getElementById('touchLeftBtn');
    const rightBtn = document.getElementById('touchRightBtn');
    if (leftBtn && rightBtn) {
      leftBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); player.movingLeft = true; });
      leftBtn.addEventListener('pointerup', (e) => { e.preventDefault(); player.movingLeft = false; });
      leftBtn.addEventListener('pointerleave', (e) => { e.preventDefault(); player.movingLeft = false; });

      rightBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); player.movingRight = true; });
      rightBtn.addEventListener('pointerup', (e) => { e.preventDefault(); player.movingRight = false; });
      rightBtn.addEventListener('pointerleave', (e) => { e.preventDefault(); player.movingRight = false; });
    }

    const startBtn = document.getElementById('startDodgeBtn');
    if (startBtn) {
      startBtn.addEventListener('click', startGame);
    }
  }

  function init() {
    initCanvas();
    setupControls();
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
          playSound('start');
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
