const gameArea = document.getElementById("gameArea");
const mainButton = document.getElementById("mainButton");
const stageTitle = document.getElementById("stageTitle");
const hintText = document.getElementById("hintText");
const restartBtn = document.getElementById("restartBtn");

const MAX_STAGE = 9;

let stage = Number(localStorage.getItem("savedStage")) || 1;
if (stage < 1 || stage > MAX_STAGE) stage = 1;

let dvdAnimation;
let spawnTimer;
let audioContext;
let oscillator;
let gainNode;
let invisibleButtonPosition = { x: 0, y: 0 };

let fakeCursor = null;
let fakeCursorX = window.innerWidth / 2;
let fakeCursorY = window.innerHeight / 2;
let cursorMode = null;

let stage10Loop = null;
let stage10Timer = null;
let activeTimeouts = [];

const stages = {
  1: { title: "Stage 1", hint: "I hope you know how to click a button!" },
  2: { title: "Stage 2", hint: "90s kids knows this is DVD Logo" },
  3: { title: "Stage 3", hint: "Lets see how fast you are!" },
  4: { title: "Stage 4", hint: "I dont know, maybe go a bit closer?!" },
  5: { title: "Stage 5", hint: "Are your drunk?" },
  6: { title: "Stage 6", hint: 'Can you please hold my "coffee" for 3 seconds?' },
  7: { title: "Stage 7", hint: "Haha, got you!" },
  8: { title: "Stage 8", hint: "it didn’t work the first time… you didn’t mean it." },
  9: { title: "Stage 9", hint: "Its a zombie button - Survive and dont click!" }
};

restartBtn.onclick = () => {
  localStorage.removeItem("savedStage");
  stage = 1;
  loadStage();
};

function startStageLoading() {
  document.body.classList.add("stage-loading");
  mainButton.style.visibility = "hidden";
}

function finishStageLoading() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove("stage-loading");
      mainButton.style.visibility = "visible";
    });
  });
}

function hideMainButton() {
  mainButton.style.visibility = "hidden";
}

function showMainButton() {
  mainButton.style.visibility = "visible";
}

function safeAddFakeCursorClick() {
  saveTimeout(() => {
    document.addEventListener("click", fakeCursorClickCheck);
  }, 80);
}

function saveTimeout(callback, delay) {
  const timeoutId = setTimeout(callback, delay);
  activeTimeouts.push(timeoutId);
  return timeoutId;
}

function clearAllTimeouts() {
  activeTimeouts.forEach(id => clearTimeout(id));
  activeTimeouts = [];
}

function setStageInfo() {
  stageTitle.textContent = stages[stage].title;
  hintText.textContent = stages[stage].hint;
}

function resetGameArea() {
  startStageLoading();

  clearInterval(dvdAnimation);
  clearInterval(spawnTimer);
  clearInterval(stage10Loop);
  clearInterval(stage10Timer);
  clearAllTimeouts();

  dvdAnimation = null;
  spawnTimer = null;
  stage10Loop = null;
  stage10Timer = null;

  stopSound();
  removeFakeCursor();

  document.querySelectorAll(".fakeButton").forEach(btn => btn.remove());
  document.querySelectorAll(".message").forEach(msg => msg.remove());
  document.querySelectorAll(".timerBox").forEach(timer => timer.remove());

  mainButton.className = "";
  mainButton.removeAttribute("style");

  mainButton.style.position = "absolute";
  mainButton.style.display = "block";
  mainButton.style.zIndex = "20";
  mainButton.style.pointerEvents = "auto";
  mainButton.style.opacity = "1";
  mainButton.style.transform = "none";
  mainButton.style.visibility = "hidden";

  mainButton.textContent = "Click Me!";

  mainButton.onclick = null;
  mainButton.ondblclick = null;
  mainButton.onmousedown = null;
  mainButton.onmouseup = null;
  mainButton.onmouseleave = null;
}

function centerButton() {
  mainButton.style.left = "50%";
  mainButton.style.top = "50%";
  mainButton.style.transform = "translate(-50%, -50%)";
}

function placeButtonRandomly() {
  mainButton.style.transform = "none";
  mainButton.style.left = randomX() + "px";
  mainButton.style.top = randomY() + "px";
}

function nextStage() {
  stage++;

  if (stage > MAX_STAGE) {
    localStorage.removeItem("savedStage");
    winGame();
    return;
  }

  localStorage.setItem("savedStage", stage);
  loadStage();
}

function loadStage() {
  resetGameArea();

  if (stage < 1 || stage > MAX_STAGE) {
    stage = 1;
    localStorage.removeItem("savedStage");
  }

  setStageInfo();

  if (stage === 1) stageOne();
  if (stage === 2) stageTwo();
  if (stage === 3) stageThree();
  if (stage === 4) stageFour();
  if (stage === 5) stageFive();
  if (stage === 6) stageSix();
  if (stage === 7) stageSeven();
  if (stage === 8) stageEight();
  if (stage === 9) stageNine();
}

function stageOne() {
  centerButton();
  finishStageLoading();
  mainButton.onclick = nextStage;
}

function stageTwo() {
  let x = 120;
  let y = 180;
  let dx = 4;
  let dy = 4;

  mainButton.style.left = x + "px";
  mainButton.style.top = y + "px";
  finishStageLoading();

  dvdAnimation = setInterval(() => {
    const btnWidth = mainButton.offsetWidth;
    const btnHeight = mainButton.offsetHeight;

    x += dx;
    y += dy;

    if (x <= 0 || x + btnWidth >= window.innerWidth) dx *= -1;
    if (y <= 110 || y + btnHeight >= window.innerHeight) dy *= -1;

    mainButton.style.left = x + "px";
    mainButton.style.top = y + "px";
  }, 16);

  mainButton.onclick = nextStage;
}

function stageThree() {
  mainButton.onclick = nextStage;

  function spawn() {
    hideMainButton();

    const maxX = window.innerWidth - mainButton.offsetWidth;
    const maxY = window.innerHeight - mainButton.offsetHeight - 120;

    const x = Math.random() * maxX;
    const y = 120 + Math.random() * maxY;

    mainButton.style.left = x + "px";
    mainButton.style.top = y + "px";
    mainButton.style.display = "block";

    requestAnimationFrame(() => {
      if (stage === 3) finishStageLoading();
    });

    saveTimeout(() => {
      if (stage === 3) {
        hideMainButton();
        mainButton.style.display = "none";
      }
    }, 1000);
  }

  spawn();
  spawnTimer = setInterval(spawn, 1400);
}

function stageFour() {
  mainButton.classList.add("invisible");

  const btnWidth = mainButton.offsetWidth;
  const btnHeight = mainButton.offsetHeight;
  const padding = 20;

  const maxX = window.innerWidth - btnWidth - padding;
  const maxY = window.innerHeight - btnHeight - 120 - padding;

  const x = padding + Math.random() * maxX;
  const y = 120 + padding + Math.random() * maxY;

  invisibleButtonPosition.x = x;
  invisibleButtonPosition.y = y;

  mainButton.style.left = x + "px";
  mainButton.style.top = y + "px";

  document.body.classList.remove("stage-loading");
  mainButton.style.visibility = "visible";

  startSound();
  document.addEventListener("mousemove", handleSoundDistance);

  mainButton.onclick = (event) => {
    event.stopPropagation();
    document.removeEventListener("mousemove", handleSoundDistance);
    stopSound();
    nextStage();
  };
}

  startSound();
  document.addEventListener("mousemove", handleSoundDistance);

  mainButton.onclick = (event) => {
    event.stopPropagation();
    document.removeEventListener("mousemove", handleSoundDistance);
    stopSound();
    nextStage();
  };


function stageFive() {
  placeButtonRandomly();
  createFakeCursor("invert");
  finishStageLoading();
  safeAddFakeCursorClick();
}

function stageSix() {
  centerButton();
  finishStageLoading();

  let holdTimer = null;
  let holdProgress = 0;

  mainButton.textContent = "Click Me!";

  mainButton.onmousedown = () => {
    holdProgress = 0;
    mainButton.textContent = "Click Me!";

    holdTimer = setInterval(() => {
      holdProgress += 100;

      const secondsLeft = Math.ceil((3000 - holdProgress) / 1000);
      mainButton.textContent = secondsLeft > 0 ? `${secondsLeft}...` : "Done!";

      if (holdProgress >= 3000) {
        clearInterval(holdTimer);
        nextStage();
      }
    }, 100);
  };

  function cancelHold() {
    clearInterval(holdTimer);
    holdProgress = 0;
    mainButton.textContent = "Click Me!";
  }

  mainButton.onmouseup = cancelHold;
  mainButton.onmouseleave = cancelHold;
}

function stageSeven() {
  const realX = randomX();
  const realY = randomY();

  for (let i = 0; i < 45; i++) {
    const fake = document.createElement("button");
    fake.className = "fakeButton";
    fake.textContent = "Click Me!";
    fake.style.left = randomX() + "px";
    fake.style.top = randomY() + "px";

    fake.onclick = () => {
      fake.remove();
      showMessage("Nope 😭");
    };

    gameArea.appendChild(fake);
  }

  mainButton.style.left = realX + "px";
  mainButton.style.top = realY + "px";
  mainButton.style.zIndex = "999";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      finishStageLoading();
    });
  });

  mainButton.onclick = nextStage;
}

function stageEight() {
  centerButton();
  finishStageLoading();

  mainButton.textContent = "Click Me!";

  mainButton.onclick = () => {
    showMessage("You are weak and slow!");
  };

  mainButton.ondblclick = (event) => {
    event.preventDefault();
    nextStage();
  };
}

function stageNine() {
  createFakeCursor("normal");

  mainButton.textContent = "BRAINS...";
  mainButton.classList.add("zombie");

  let btnX = 100;
  let btnY = 220;

  mainButton.style.left = btnX + "px";
  mainButton.style.top = btnY + "px";

  finishStageLoading();

  const timerBox = document.createElement("div");
  timerBox.className = "timerBox";
  timerBox.textContent = "10";
  document.body.appendChild(timerBox);

  let timeLeft = 10;
  let levelEnded = false;

  stage10Timer = setInterval(() => {
    timeLeft--;
    timerBox.textContent = timeLeft;

    if (timeLeft <= 0 && !levelEnded) {
      levelEnded = true;
      nextStage();
    }
  }, 1000);

  stage10Loop = setInterval(() => {
    if (levelEnded) return;

    const btnWidth = mainButton.offsetWidth;
    const btnHeight = mainButton.offsetHeight;

    const btnCenterX = btnX + btnWidth / 2;
    const btnCenterY = btnY + btnHeight / 2;

    const dx = fakeCursorX - btnCenterX;
    const dy = fakeCursorY - btnCenterY;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = 3.2;

    if (distance > 1) {
      const moveX = (dx / distance) * speed;
      const moveY = (dy / distance) * speed;

      btnX += moveX;
      btnY += moveY;

      btnX = Math.max(0, Math.min(window.innerWidth - btnWidth, btnX));
      btnY = Math.max(120, Math.min(window.innerHeight - btnHeight, btnY));

      mainButton.style.left = btnX + "px";
      mainButton.style.top = btnY + "px";
    }

    mainButton.style.transform = `rotate(${Math.random() * 6 - 3}deg)`;

    if (isCursorTouchingButton()) {
      levelEnded = true;
      showMessage("Zombie got you 🧟 Restarting level...");

      saveTimeout(() => {
        loadStage();
      }, 700);
    }
  }, 16);
}

function randomX() {
  return Math.random() * (window.innerWidth - 160);
}

function randomY() {
  return 120 + Math.random() * (window.innerHeight - 220);
}

function createFakeCursor(mode) {
  cursorMode = mode;
  fakeCursorX = window.innerWidth / 2;
  fakeCursorY = window.innerHeight / 2;

  document.body.classList.add("hide-real-cursor");

  fakeCursor = document.createElement("div");
  fakeCursor.className = "fake-cursor";
  document.body.appendChild(fakeCursor);

  document.addEventListener("mousemove", moveFakeCursor);
  updateFakeCursorPosition();
}

function removeFakeCursor() {
  document.body.classList.remove("hide-real-cursor");
  document.removeEventListener("mousemove", moveFakeCursor);
  document.removeEventListener("click", fakeCursorClickCheck);
  document.removeEventListener("mousemove", handleSoundDistance);

  if (fakeCursor) {
    fakeCursor.remove();
    fakeCursor = null;
  }

  cursorMode = null;
}

function moveFakeCursor(e) {
  if (!fakeCursor) return;

  if (cursorMode === "invert") {
    fakeCursorX = window.innerWidth - e.clientX;
    fakeCursorY = window.innerHeight - e.clientY;
  }

  if (cursorMode === "normal") {
    fakeCursorX = e.clientX;
    fakeCursorY = e.clientY;
  }

  limitFakeCursor();
  updateFakeCursorPosition();
}

function limitFakeCursor() {
  fakeCursorX = Math.max(10, Math.min(window.innerWidth - 10, fakeCursorX));
  fakeCursorY = Math.max(10, Math.min(window.innerHeight - 10, fakeCursorY));
}

function updateFakeCursorPosition() {
  if (!fakeCursor) return;
  fakeCursor.style.left = fakeCursorX + "px";
  fakeCursor.style.top = fakeCursorY + "px";
}

function fakeCursorClickCheck(event) {
  if (event) event.stopPropagation();

  if (isCursorTouchingButton()) {
    nextStage();
  } else {
    showMessage("Missed 😭");
  }
}

function isCursorTouchingButton() {
  const rect = mainButton.getBoundingClientRect();

  return (
    fakeCursorX >= rect.left &&
    fakeCursorX <= rect.right &&
    fakeCursorY >= rect.top &&
    fakeCursorY <= rect.bottom
  );
}

function startSound() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  oscillator = audioContext.createOscillator();
  gainNode = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 440;
  gainNode.gain.value = 0.03;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
}

function stopSound() {
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
  }

  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

function handleSoundDistance(e) {
  if (!gainNode || !oscillator) return;

  const buttonCenterX = invisibleButtonPosition.x + mainButton.offsetWidth / 2;
  const buttonCenterY = invisibleButtonPosition.y + mainButton.offsetHeight / 2;

  const dx = e.clientX - buttonCenterX;
  const dy = e.clientY - buttonCenterY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const maxDistance = 700;
  const closeness = Math.max(0, 1 - distance / maxDistance);

  gainNode.gain.value = 0.02 + closeness * 0.35;
  oscillator.frequency.value = 300 + closeness * 900;
}

function showMessage(text) {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.textContent = text;
  document.body.appendChild(msg);

  saveTimeout(() => {
    msg.remove();
  }, 800);
}

function winGame() {
  resetGameArea();

  localStorage.removeItem("savedStage");

  stageTitle.textContent = "You Won!";
  hintText.textContent = "Okay fine, you can click buttons.";

  centerButton();
  mainButton.textContent = "Play Again";
  finishStageLoading();

  mainButton.onclick = () => {
    localStorage.removeItem("savedStage");
    stage = 1;
    loadStage();
  };
}

loadStage();