// --- NATIVE SYNTHESIZER SOUND EFFECTS (Web Audio API) ---
let audioCtx = null;
let isMuted = false;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playSynthSound(type) {
    if (isMuted) return;
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        if (type === 'click') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(450, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'success') {
            osc.type = 'sine';
            const notes = [261.63, 329.63, 392.0, 523.25];
            notes.forEach((freq, idx) => {
                const noteOsc = ctx.createOscillator();
                const noteGain = ctx.createGain();
                noteOsc.connect(noteGain);
                noteGain.connect(ctx.destination);
                noteOsc.frequency.setValueAtTime(freq, now + idx * 0.08);
                noteGain.gain.setValueAtTime(0.12, now + idx * 0.08);
                noteGain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.25);
                noteOsc.start(now + idx * 0.08);
                noteOsc.stop(now + idx * 0.08 + 0.25);
            });
        } else if (type === 'fail') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.linearRampToValueAtTime(60, now + 0.3);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'powerup') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(350, now);
            osc.frequency.exponentialRampToValueAtTime(950, now + 0.35);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        }
    } catch (err) {
        console.warn('Audio contextual setup skipped:', err);
    }
}

function toggleSound() {
    isMuted = !isMuted;
    const icon = document.getElementById('soundIcon');
    if (isMuted) {
        icon.className = 'fa-solid fa-volume-xmark text-sm';
    } else {
        icon.className = 'fa-solid fa-volume-high text-sm';
        playSynthSound('click');
    }
}

// --- GAME STATE VARIABLES ---
let currentLevel = 1;
let streak = 0;
let coins = 50;
let targetNumber = 0;
let minRange = 1;
let maxRange = 10;
let attemptsLeft = 5;
let maxAttempts = 5;
let timerActive = false;
let timeRemaining = 0;
let timerInterval = null;
let isLevelFrozen = false;
const inventory = {
    scanner: 1,
    shield: 1,
    freeze: 1,
    compass: 1
};
const prices = {
    scanner: 15,
    shield: 20,
    freeze: 10,
    compass: 25
};

function generateLevelConfig(level) {
    let range = 10;
    let baseAttempts = 5;
    let mode = 'Normal';
    let desc = 'Standard level. Guess the hidden number based on too high/low feedback.';
    if (level <= 5) {
        range = 10 + (level - 1) * 5;
        baseAttempts = 5;
    } else if (level <= 15) {
        range = 30 + (level - 5) * 8;
        baseAttempts = 6;
        if (level % 2 === 0) {
            mode = 'Speed Run';
            desc = 'Hurry up! Guess the secret number before the level timer is empty.';
        }
    } else if (level <= 50) {
        range = 110 + (level - 15) * 12;
        baseAttempts = Math.max(4, 7 - Math.floor(level / 20));
        if (level % 5 === 0) {
            mode = 'Moving Number';
            desc = 'Watch out! The secret number shifts slightly up or down after every 2 attempts!';
        } else if (level % 4 === 0) {
            mode = 'Speed Run';
            desc = 'Beat the clock! Use Freeze power-ups if you need more time.';
        }
    } else {
        range = 530 + (level - 50) * 15;
        baseAttempts = Math.max(3, 8 - Math.floor(level / 35));
        if (level % 10 === 0) {
            mode = 'Mega Boss Level';
            desc = 'Super large range with big bonus coins! Secret number shifting is active.';
            baseAttempts += 2;
        } else if (level % 3 === 0) {
            mode = 'Moving Number';
            desc = 'Tricky mode: the target secret number moves slightly after every turn!';
        } else {
            mode = 'Standard Level';
            desc = 'Find the hidden number. Use helpful items from your shop if you get stuck.';
        }
    }
    return {
        max: range,
        attempts: baseAttempts,
        mode,
        description: desc,
        timeLimit: mode === 'Speed Run' ? Math.max(15, 45 - Math.floor(level / 12)) : 0
    };
}

let currentTutorialStep = 1;
const tutorialSteps = [
    {
        title: 'Find the Secret Number',
        text: 'A secret number is hidden between the two limits shown. Your goal is to guess it in as few turns as possible!',
        icon: 'fa-solid fa-hand-sparkles'
    },
    {
        title: 'Hot and Cold Feedback',
        text: 'Whenever you guess, we\'ll guide you if your guess is too high or too low. Check the color meter: Blue is cold, Orange is warm, and Red is burning hot!',
        icon: 'fa-solid fa-arrows-split-up-and-left'
    },
    {
        title: 'Use Your Power-ups',
        text: 'Spend your earned coins on power-ups! Use Scanners to narrow down ranges, Shields for extra lives, Freeze to stop time, or Compass for clues.',
        icon: 'fa-solid fa-bag-shopping'
    }
];

function nextTutorialStep() {
    playSynthSound('click');
    currentTutorialStep++;
    if (currentTutorialStep > tutorialSteps.length) {
        finishTutorial();
    } else {
        updateTutorialUI();
    }
}

function updateTutorialUI() {
    const step = tutorialSteps[currentTutorialStep - 1];
    document.getElementById('tutorialTitle').innerText = step.title;
    document.getElementById('tutorialText').innerText = step.text;
    document.getElementById('tutorialIcon').className = `${step.icon} text-3xl animate-bounce`;
    document.getElementById('tutorialStepIndicator').innerText = `Step ${currentTutorialStep} of ${tutorialSteps.length}`;
    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById(`dot${i}`);
        if (i === currentTutorialStep) {
            dot.className = 'w-6 h-1.5 rounded-full transition-colors duration-300 bg-blue-500';
        } else {
            dot.className = 'w-2 h-1.5 rounded-full transition-colors duration-300 bg-slate-800';
        }
    }
    document.getElementById('tutorialBtnLabel').innerText = currentTutorialStep === tutorialSteps.length ? 'Start Level 1' : 'Next Step';
}

function skipTutorial() {
    playSynthSound('click');
    finishTutorial();
}

function finishTutorial() {
    const overlay = document.getElementById('tutorialOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 500);
    initializeLevel(1);
}

function initializeLevel(lvl) {
    currentLevel = lvl;
    const config = generateLevelConfig(lvl);
    minRange = 1;
    maxRange = config.max;
    maxAttempts = config.attempts;
    attemptsLeft = config.attempts;
    isLevelFrozen = false;
    targetNumber = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;
    document.getElementById('levelLabel').innerText = `Level ${currentLevel}`;
    document.getElementById('modeLabel').innerText = config.mode;
    document.getElementById('levelModifierText').innerHTML = `<i class="fa-solid fa-circle-play text-blue-400"></i> ${config.mode}`;
    document.getElementById('levelDescText').innerText = config.description;
    document.getElementById('minBoundLabel').innerText = minRange;
    document.getElementById('maxBoundLabel').innerText = maxRange;
    const guessInput = document.getElementById('guessInput');
    guessInput.min = minRange;
    guessInput.max = maxRange;
    guessInput.value = '';
    guessInput.placeholder = `Guess between ${minRange} and ${maxRange}`;
    document.getElementById('hintMessage').innerText = 'Enter a guess above to see how close you are!';
    document.getElementById('heatGauge').className = 'h-full bg-slate-600 transition-all duration-500 w-0';
    const sphere = document.getElementById('targetMysterySphere');
    sphere.className = 'w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-tr from-slate-900 to-slate-950 border border-blue-500/40 flex items-center justify-center shadow-lg transition-all duration-500';
    document.getElementById('mysterySign').innerText = '?';
    renderLives();
    renderLevelGrid();
    updateInventoryUI();
    if (timerInterval) clearInterval(timerInterval);
    const timerBar = document.getElementById('levelTimerBar');
    timerBar.style.opacity = '0';
    timerBar.style.width = '100%';
    if (config.timeLimit > 0) {
        timeRemaining = config.timeLimit;
        timerBar.style.opacity = '1';
        timerInterval = setInterval(() => {
            if (!isLevelFrozen) {
                timeRemaining--;
                const percent = (timeRemaining / config.timeLimit) * 100;
                timerBar.style.width = `${percent}%`;
                if (timeRemaining <= 0) {
                    clearInterval(timerInterval);
                    levelFailed("Time's Up! You ran out of time.");
                }
            }
        }, 1000);
    }
}

function renderLevelGrid() {
    const container = document.getElementById('levelContainer');
    container.innerHTML = '';
    let start = Math.max(1, currentLevel - 2);
    let end = Math.min(250, start + 6);
    if (end - start < 6) {
        start = Math.max(1, end - 6);
    }
    for (let i = start; i <= end; i++) {
        const isCurrent = i === currentLevel;
        const isPassed = i < currentLevel;
        const isBoss = i % 10 === 0;
        let stateClass = 'bg-slate-900/40 text-slate-500 border-slate-800/60';
        let statusIcon = `<i class="fa-solid fa-lock text-[10px] ml-1 opacity-50"></i>`;
        if (isCurrent) {
            stateClass = 'bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 border-blue-500/40 font-bold scale-[1.01] shadow-sm';
            statusIcon = `<span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping ml-1"></span>`;
        } else if (isPassed) {
            stateClass = 'bg-slate-800/30 text-emerald-400 border-emerald-500/20';
            statusIcon = `<i class="fa-solid fa-circle-check text-[10px] ml-1"></i>`;
        }
        const item = document.createElement('div');
        item.className = `flex justify-between items-center px-3 py-2 rounded-xl border text-xs transition-all ${stateClass}`;
        item.innerHTML = `
            <div class="flex items-center space-x-2">
                <span class="font-semibold">Lvl ${i}</span>
                ${isBoss ? '<span class="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.2 rounded border border-red-500/30 font-bold">Boss</span>' : ''}
            </div>
            <div class="flex items-center">
                <span class="text-[10px] text-slate-400 mr-1">Range 1-${generateLevelConfig(i).max}</span>
                ${statusIcon}
            </div>
        `;
        if (isPassed || isCurrent) {
            item.classList.add('cursor-pointer', 'hover:bg-slate-800/50');
            item.onclick = () => {
                playSynthSound('click');
                initializeLevel(i);
            };
        }
        container.appendChild(item);
    }
}

function renderLives() {
    const tracker = document.getElementById('livesTracker');
    tracker.innerHTML = '';
    for (let i = 0; i < maxAttempts; i++) {
        const heart = document.createElement('i');
        if (i < attemptsLeft) {
            heart.className = 'fa-solid fa-heart text-red-500 pulsing-heart drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]';
        } else {
            heart.className = 'fa-solid fa-heart text-slate-800';
        }
        tracker.appendChild(heart);
    }
}

function modifyGuess(val) {
    playSynthSound('click');
    const input = document.getElementById('guessInput');
    let current = parseInt(input.value) || 0;
    if (current === 0) {
        current = Math.round((minRange + maxRange) / 2);
    } else {
        current += val;
    }
    current = Math.max(minRange, Math.min(maxRange, current));
    input.value = current;
}

function clearGuess() {
    playSynthSound('click');
    document.getElementById('guessInput').value = '';
}

function updateInventoryUI() {
    document.getElementById('inventory-scanner').innerText = inventory.scanner;
    document.getElementById('inventory-shield').innerText = inventory.shield;
    document.getElementById('inventory-freeze').innerText = inventory.freeze;
    document.getElementById('inventory-compass').innerText = inventory.compass;
    document.getElementById('coinCounter').innerText = coins;
    document.getElementById('streakCounter').innerText = streak;
}

function buyPowerUp(type) {
    if (inventory[type] > 0) {
        usePowerUp(type);
        return;
    }
    const cost = prices[type];
    if (coins >= cost) {
        coins -= cost;
        inventory[type]++;
        playSynthSound('powerup');
        updateInventoryUI();
        showCustomModal(
            'Item Acquired!',
            `You bought 1x ${type.toUpperCase()} power-up helper tool!`,
            'fa-solid fa-cart-shopping',
            'text-blue-400'
        );
    } else {
        playSynthSound('fail');
        showCustomModal(
            'Not Enough Coins',
            'Complete more challenges successfully to earn coins.',
            'fa-solid fa-circle-exclamation',
            'text-amber-500'
        );
    }
}

function usePowerUp(type) {
    if (inventory[type] <= 0) return;
    playSynthSound('powerup');
    inventory[type]--;
    updateInventoryUI();
    const hintBox = document.getElementById('hintMessage');
    if (type === 'scanner') {
        const margin = Math.max(1, Math.floor((maxRange - minRange) * 0.25));
        const newMin = Math.max(minRange, targetNumber - Math.floor(Math.random() * margin));
        const newMax = Math.min(maxRange, targetNumber + Math.floor(Math.random() * margin));
        minRange = newMin;
        maxRange = newMax;
        document.getElementById('minBoundLabel').innerText = minRange;
        document.getElementById('maxBoundLabel').innerText = maxRange;
        hintBox.innerText = `Scanner deployed! The range is narrowed down to: ${minRange} - ${maxRange}`;
    } else if (type === 'shield') {
        attemptsLeft++;
        maxAttempts = Math.max(maxAttempts, attemptsLeft);
        renderLives();
        hintBox.innerText = 'Shield used! You gained +1 extra guess turn.';
    } else if (type === 'freeze') {
        isLevelFrozen = true;
        hintBox.innerText = 'Timer Frozen! Your level countdown clock is paused for 15 seconds.';
        setTimeout(() => {
            isLevelFrozen = false;
            hintBox.innerText = 'Freeze expired! The level countdown is running again.';
        }, 15000);
    } else if (type === 'compass') {
        const distance = Math.abs(targetNumber - Math.round((minRange + maxRange) / 2));
        hintBox.innerText = `Clue Finder Hint: The secret number is about ${distance} away from the middle range.`;
    }
}

function submitGuess() {
    const input = document.getElementById('guessInput');
    const userVal = parseInt(input.value);
    const gameBox = document.getElementById('gameWindow');
    if (isNaN(userVal) || userVal < minRange || userVal > maxRange) {
        playSynthSound('fail');
        gameBox.classList.add('shake-animation');
        setTimeout(() => gameBox.classList.remove('shake-animation'), 400);
        document.getElementById('hintMessage').innerText = `Oops! Make sure your guess is between ${minRange} and ${maxRange}.`;
        return;
    }
    attemptsLeft--;
    renderLives();
    const maxSpread = Math.max(1, maxRange - minRange);
    const distance = Math.abs(targetNumber - userVal);
    const relativeDistance = distance / maxSpread;
    let heatClass = 'bg-blue-500 w-1/4';
    let heatText = 'Very Cold';
    let colorFilter = 'rgba(59, 130, 246, 0.1)';
    if (distance === 0) {
        heatClass = 'bg-emerald-500 w-full';
        heatText = 'SUCCESSFUL ALIGNMENT';
        colorFilter = 'rgba(16, 185, 129, 0.4)';
    } else if (relativeDistance < 0.1) {
        heatClass = 'bg-red-500 w-full';
        heatText = 'Very Hot! Extremely close to the number!';
        colorFilter = 'rgba(239, 68, 68, 0.3)';
    } else if (relativeDistance < 0.25) {
        heatClass = 'bg-orange-500 w-3/4';
        heatText = 'Warm! Getting closer now.';
        colorFilter = 'rgba(249, 115, 22, 0.2)';
    } else if (relativeDistance < 0.5) {
        heatClass = 'bg-yellow-500 w-1/2';
        heatText = 'Lukewarm. Keep looking!';
        colorFilter = 'rgba(234, 179, 8, 0.15)';
    } else {
        heatClass = 'bg-blue-500 w-1/4';
        heatText = 'Cold. You are far away.';
        colorFilter = 'rgba(59, 130, 246, 0.1)';
    }
    const gauge = document.getElementById('heatGauge');
    gauge.className = `h-full transition-all duration-500 ${heatClass}`;
    document.getElementById('targetMysterySphere').style.backgroundColor = colorFilter;
    if (userVal === targetNumber) {
        levelPassed();
    } else {
        const config = generateLevelConfig(currentLevel);
        if (config.mode === 'Moving Number' && attemptsLeft > 0) {
            const shift = Math.random() > 0.5 ? 1 : -1;
            targetNumber = Math.max(1, targetNumber + shift);
            document.getElementById('hintMessage').innerHTML = `${heatText}!<br><span class="text-xs text-purple-400 font-bold"><i class="fa-solid fa-arrows-spin"></i> The secret number just shifted by ${shift}!</span>`;
        } else {
            const direction = userVal < targetNumber ? 'Too Low' : 'Too High';
            document.getElementById('hintMessage').innerText = `${direction}! (${heatText})`;
        }
        if (attemptsLeft <= 0) {
            levelFailed(`Out of turns! The secret number was ${targetNumber}.`);
        } else {
            playSynthSound('fail');
            gameBox.classList.add('shake-animation');
            setTimeout(() => gameBox.classList.remove('shake-animation'), 400);
        }
    }
}

function levelPassed() {
    playSynthSound('success');
    if (timerInterval) clearInterval(timerInterval);
    const rewardCoins = 10 + Math.floor(currentLevel / 5);
    coins += rewardCoins;
    streak++;
    triggerConfettiBurst();
    const sphere = document.getElementById('targetMysterySphere');
    sphere.className = 'w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg scale-110 transition-all duration-500';
    document.getElementById('mysterySign').innerText = targetNumber;
    setTimeout(() => {
        showCustomModal(
            'Victory!',
            `Great guess! The secret number was indeed ${targetNumber}. You earned +${rewardCoins} coins!`,
            'fa-solid fa-circle-check',
            'text-emerald-400',
            () => {
                initializeLevel(currentLevel + 1);
            }
        );
    }, 600);
}

function levelFailed(reason) {
    playSynthSound('fail');
    if (timerInterval) clearInterval(timerInterval);
    streak = 0;
    const sphere = document.getElementById('targetMysterySphere');
    sphere.className = 'w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-tr from-red-500 to-rose-600 flex items-center justify-center shadow-lg transition-all duration-500';
    document.getElementById('mysterySign').innerText = '✕';
    setTimeout(() => {
        showCustomModal(
            'Level Failed',
            `${reason} Let's try this level again with fresh focus!`,
            'fa-solid fa-triangle-exclamation',
            'text-red-400',
            () => {
                initializeLevel(currentLevel);
            }
        );
    }, 600);
}

let modalCallback = null;

function showCustomModal(title, text, icon, colorClass, callback = null) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalDescription').innerText = text;
    const iconElem = document.getElementById('modalIcon');
    iconElem.className = `${icon} ${colorClass}`;
    modalCallback = callback;
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('modalBox').classList.remove('scale-90');
}

function closeModal() {
    playSynthSound('click');
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('modalBox').classList.add('scale-90');
    if (modalCallback) {
        modalCallback();
        modalCallback = null;
    }
}

const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let particles = [];
let confetti = [];
const maxParticles = 40;
let mouseX = 0;
let mouseY = 0;

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = (Math.random() - 0.5) * 0.3;
        this.speedY = (Math.random() - 0.5) * 0.3;
        this.hue = 200 + Math.random() * 40;
        this.alpha = Math.random();
        this.pulseSpeed = 0.005 + Math.random() * 0.01;
    }
    update() {
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) {
            this.x += (dx / dist) * 0.15;
            this.y += (dy / dist) * 0.15;
        }
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
        this.alpha += this.pulseSpeed;
        if (this.alpha > 1 || this.alpha < 0.1) {
            this.pulseSpeed = -this.pulseSpeed;
        }
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.hue}, 80%, 65%, ${Math.abs(this.alpha)})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsla(${this.hue}, 80%, 65%, 0.3)`;
        ctx.fill();
    }
}

class Confetti {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.size = Math.random() * 6 + 4;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = -Math.random() * 6 - 4;
        this.gravity = 0.18;
        this.hue = Math.random() * 360;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 10;
        this.alpha = 1;
    }
    update() {
        this.speedY += this.gravity;
        this.x += this.speedX;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;
        this.alpha -= 0.015;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.fillStyle = `hsla(${this.hue}, 90%, 60%, ${this.alpha})`;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}

function triggerConfettiBurst() {
    for (let i = 0; i < 70; i++) {
        confetti.push(new Confetti());
    }
}

function initParticles() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = [];
    for (let i = 0; i < maxParticles; i++) {
        particles.push(new Particle());
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    for (let i = confetti.length - 1; i >= 0; i--) {
        confetti[i].update();
        confetti[i].draw();
        if (confetti[i].alpha <= 0) {
            confetti.splice(i, 1);
        }
    }
    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

window.onload = function() {
    initParticles();
    animate();
    updateTutorialUI();
    document.getElementById('guessInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitGuess();
        }
    });
};
