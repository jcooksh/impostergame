// Imposter — pass-and-play party game.
// Everyone sees the same secret word except one randomly chosen imposter,
// who sees only "You are the imposter" — no category, no hints. The imposter
// card must be indistinguishable at a glance, so both cards share the same
// label, color, and silhouette.

const STORAGE_PLAYERS = "imposter.players";
const STORAGE_USED_WORDS = "imposter.usedWords";
const STORAGE_GAME = "imposter.game";
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;

let players = loadPlayers();
let game = null; // { word, imposterIndex, viewIndex, firstSpeaker }

// Persistence is best-effort: a full quota or blocked storage must never
// abort rendering or round start.
function safeSetItem(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (e) { /* ignore */ }
}

// ---------- screens ----------

const screens = {
  setup: document.getElementById("screen-setup"),
  resume: document.getElementById("screen-resume"),
  pass: document.getElementById("screen-pass"),
  word: document.getElementById("screen-word"),
  play: document.getElementById("screen-play"),
  confirm: document.getElementById("screen-confirm"),
  result: document.getElementById("screen-result"),
};

// Swallow clicks briefly after each screen swap so a double-tap can't
// activate a button on the next screen (skipping a player's card or
// revealing the next player's word to the current holder).
const SWAP_GUARD_MS = 350;
let swapGuardUntil = 0;

function show(name) {
  swapGuardUntil = Date.now() + SWAP_GUARD_MS;
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", key !== name);
  }
}

document.getElementById("app").addEventListener(
  "click",
  (e) => {
    if (Date.now() < swapGuardUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true
);

// ---------- setup ----------

const playerListEl = document.getElementById("player-list");
const nameInput = document.getElementById("player-name-input");
const startBtn = document.getElementById("start-game-btn");
const setupHint = document.getElementById("setup-hint");
const addError = document.getElementById("add-error");

function loadPlayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_PLAYERS));
    if (Array.isArray(saved)) {
      return saved
        .filter((n) => typeof n === "string" && n.trim())
        .slice(0, MAX_PLAYERS);
    }
  } catch (e) { /* corrupted storage — start fresh */ }
  return [];
}

function savePlayers() {
  safeSetItem(localStorage, STORAGE_PLAYERS, JSON.stringify(players));
}

function renderPlayers() {
  playerListEl.innerHTML = "";
  players.forEach((name, i) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-player";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", `Remove ${name}`);
    remove.addEventListener("click", () => {
      players.splice(i, 1);
      renderPlayers();
      savePlayers();
    });
    li.append(span, remove);
    playerListEl.appendChild(li);
  });

  const ready = players.length >= MIN_PLAYERS;
  startBtn.disabled = !ready;
  setupHint.textContent = ready
    ? `${players.length} players ready.`
    : `Add at least ${MIN_PLAYERS} players to start.`;
}

function showAddError(message) {
  addError.textContent = message;
  addError.hidden = false;
}

document.getElementById("add-player-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  if (players.some((p) => p.toLowerCase() === name.toLowerCase())) {
    showAddError(`"${name}" is already added — try adding a last initial.`);
    nameInput.select();
    return;
  }
  if (players.length >= MAX_PLAYERS) {
    showAddError(`Maximum of ${MAX_PLAYERS} players.`);
    return;
  }
  addError.hidden = true;
  players.push(name);
  renderPlayers();
  savePlayers();
  playerListEl.scrollTop = playerListEl.scrollHeight;
  nameInput.value = "";
  nameInput.focus();
});

nameInput.addEventListener("input", () => {
  addError.hidden = true;
});

// ---------- word selection ----------

function randomInt(n) {
  return Math.floor(Math.random() * n);
}

// Avoid repeating a word until the whole list has been used.
function pickWord() {
  let used;
  try {
    used = new Set(JSON.parse(localStorage.getItem(STORAGE_USED_WORDS)) || []);
  } catch (e) {
    used = new Set();
  }
  let available = WORDS.filter((w) => !used.has(w));
  if (available.length === 0) {
    used = new Set();
    available = WORDS.slice();
  }
  const word = available[randomInt(available.length)];
  used.add(word);
  safeSetItem(localStorage, STORAGE_USED_WORDS, JSON.stringify([...used]));
  return word;
}

// ---------- round persistence (survive accidental refresh) ----------

function saveGame() {
  try {
    if (game) {
      sessionStorage.setItem(STORAGE_GAME, JSON.stringify(game));
    } else {
      sessionStorage.removeItem(STORAGE_GAME);
    }
  } catch (e) { /* ignore */ }
}

function loadSavedGame() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_GAME));
    if (
      saved &&
      typeof saved.word === "string" &&
      Number.isInteger(saved.imposterIndex) &&
      saved.imposterIndex >= 0 &&
      saved.imposterIndex < players.length &&
      Number.isInteger(saved.viewIndex) &&
      saved.viewIndex >= 0 &&
      saved.viewIndex <= players.length &&
      typeof saved.firstSpeaker === "string" &&
      players.length >= MIN_PLAYERS
    ) {
      return saved;
    }
  } catch (e) { /* corrupted — discard */ }
  return null;
}

// ---------- game flow ----------

function startRound() {
  game = {
    word: pickWord(),
    imposterIndex: randomInt(players.length),
    viewIndex: 0,
    firstSpeaker: players[randomInt(players.length)],
  };
  saveGame();
  showPassScreen();
}

const revealBtn = document.getElementById("reveal-btn");

function showPassScreen() {
  document.getElementById("pass-name").textContent = players[game.viewIndex];
  // Disarm the reveal button for a moment so the previous holder can't
  // "accidentally" peek at the next player's card while handing over.
  revealBtn.disabled = true;
  setTimeout(() => {
    revealBtn.disabled = false;
  }, 1000);
  show("pass");
}

function showPlayScreen() {
  document.getElementById("first-speaker").textContent = game.firstSpeaker;
  show("play");
}

document.getElementById("start-game-btn").addEventListener("click", startRound);

revealBtn.addEventListener("click", () => {
  const isImposter = game.viewIndex === game.imposterIndex;
  // Same label, size, and color for both cards — nothing distinguishable
  // at a glance from across the table.
  document.getElementById("word-text").textContent = isImposter
    ? "You are the imposter"
    : game.word;
  show("word");
});

document.getElementById("hide-btn").addEventListener("click", () => {
  // Clear the secret from the DOM before anything else is shown.
  document.getElementById("word-text").textContent = "";
  game.viewIndex++;
  saveGame();
  if (game.viewIndex < players.length) {
    showPassScreen();
  } else {
    showPlayScreen();
  }
});

document.getElementById("show-reveal-btn").addEventListener("click", () => show("confirm"));
document.getElementById("cancel-reveal-btn").addEventListener("click", () => show("play"));

document.getElementById("confirm-reveal-btn").addEventListener("click", () => {
  document.getElementById("result-imposter").textContent = players[game.imposterIndex];
  document.getElementById("result-word").textContent = game.word;
  try {
    sessionStorage.removeItem(STORAGE_GAME);
  } catch (e) { /* ignore */ }
  show("result");
});

document.getElementById("new-round-btn").addEventListener("click", () => {
  // Starting over from the discussion screen throws away an unrevealed
  // imposter — make sure it's deliberate.
  if (!window.confirm("Start a new round without revealing the imposter?")) return;
  startRound();
});

document.getElementById("play-again-btn").addEventListener("click", startRound);

document.getElementById("edit-players-btn").addEventListener("click", () => {
  game = null;
  saveGame();
  renderPlayers();
  show("setup");
});

// ---------- resume after an accidental refresh ----------

document.getElementById("resume-btn").addEventListener("click", () => {
  game = loadSavedGame();
  if (!game) {
    show("setup");
    return;
  }
  if (game.viewIndex < players.length) {
    showPassScreen();
  } else {
    showPlayScreen();
  }
});

document.getElementById("abandon-btn").addEventListener("click", () => {
  game = null;
  saveGame();
  show("setup");
});

// ---------- init ----------

renderPlayers();
if (loadSavedGame()) {
  show("resume");
} else {
  show("setup");
}
