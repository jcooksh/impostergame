// Imposter — pass-and-play party game.
// Everyone sees the same secret word except the randomly chosen imposters,
// who see only "You are the imposter" — no category, no hints, and imposters
// don't learn who the other imposters are. The imposter card must be
// indistinguishable at a glance, so both cards share the same label, color,
// and silhouette.

const STORAGE_PLAYERS = "imposter.players";
const STORAGE_USED_WORDS = "imposter.usedWords";
const STORAGE_WORD_LIST = "imposter.wordList";
const STORAGE_IMPOSTER_COUNT = "imposter.imposterCount";
const STORAGE_PARTY = "imposter.party";
const STORAGE_GAME = "imposter.game";
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;
const MAX_IMPOSTERS = 4;

let players = loadPlayers();
let wordListId = loadWordListId();
let imposterCount = loadImposterCount();
let game = null; // { word, imposterIndexes, viewIndex, firstSpeaker }

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

function updateSetupState() {
  const ready = players.length >= MIN_PLAYERS;
  startBtn.disabled = !ready;
  setupHint.textContent = ready
    ? `${players.length} players ready.`
    : `Add at least ${MIN_PLAYERS} players to start.`;
  renderImposterToggle();
}

function makePlayerItem(name) {
  const li = document.createElement("li");
  const span = document.createElement("span");
  span.textContent = name;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-player";
  remove.textContent = "✕";
  remove.setAttribute("aria-label", `Remove ${name}`);
  remove.addEventListener("click", () => {
    if (li.classList.contains("removing")) return;
    // Update state immediately; the exit animation is only cosmetic, so a
    // fast second tap elsewhere can't act on stale player indexes.
    const idx = players.indexOf(name);
    if (idx !== -1) {
      players.splice(idx, 1);
      savePlayers();
      updateSetupState();
    }
    li.classList.add("removing");
    li.addEventListener("animationend", () => li.remove(), { once: true });
    setTimeout(() => li.remove(), 400); // in case animationend never fires
  });
  li.append(span, remove);
  return li;
}

function renderPlayers() {
  playerListEl.innerHTML = "";
  players.forEach((name) => playerListEl.appendChild(makePlayerItem(name)));
  updateSetupState();
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
  savePlayers();
  const li = makePlayerItem(name);
  li.classList.add("pop-in");
  playerListEl.appendChild(li);
  updateSetupState();
  playerListEl.scrollTop = playerListEl.scrollHeight;
  nameInput.value = "";
  nameInput.focus();
});

nameInput.addEventListener("input", () => {
  addError.hidden = true;
});

// ---------- word list selection ----------

const wordListToggle = document.getElementById("word-list-toggle");

function loadWordListId() {
  try {
    const saved = localStorage.getItem(STORAGE_WORD_LIST);
    if (saved && WORD_LISTS[saved]) return saved;
  } catch (e) { /* ignore */ }
  return "classic";
}

function renderWordListToggle() {
  for (const btn of wordListToggle.children) {
    const active = btn.dataset.list === wordListId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
}

for (const [id, list] of Object.entries(WORD_LISTS)) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "toggle-btn";
  btn.dataset.list = id;
  btn.textContent = list.label;
  btn.addEventListener("click", () => {
    wordListId = id;
    safeSetItem(localStorage, STORAGE_WORD_LIST, id);
    renderWordListToggle();
  });
  wordListToggle.appendChild(btn);
}
renderWordListToggle();

// ---------- imposter count selection ----------

const imposterToggle = document.getElementById("imposter-count-toggle");
const imposterHint = document.getElementById("imposter-count-hint");

function loadImposterCount() {
  try {
    const saved = parseInt(localStorage.getItem(STORAGE_IMPOSTER_COUNT), 10);
    if (Number.isInteger(saved) && saved >= 1 && saved <= MAX_IMPOSTERS) {
      return saved;
    }
  } catch (e) { /* ignore */ }
  return 1;
}

// Imposters must stay a strict minority, or the discussion can't out them:
// 2 imposters need 5 players, 3 need 7, 4 need 9.
function maxImpostersFor(playerCount) {
  return Math.max(1, Math.ceil(playerCount / 2) - 1);
}

function renderImposterToggle() {
  const max = Math.min(MAX_IMPOSTERS, maxImpostersFor(players.length));
  if (imposterCount > max) {
    imposterCount = max;
    safeSetItem(localStorage, STORAGE_IMPOSTER_COUNT, String(imposterCount));
  }
  for (const btn of imposterToggle.children) {
    const value = Number(btn.dataset.count);
    btn.disabled = value > max;
    const active = value === imposterCount;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
  imposterHint.textContent =
    max < MAX_IMPOSTERS && players.length >= MIN_PLAYERS
      ? `Imposters (${maxImpostersFor(players.length) + 1}+ need more players)`
      : "Imposters";
}

for (let n = 1; n <= MAX_IMPOSTERS; n++) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "toggle-btn";
  btn.dataset.count = String(n);
  btn.textContent = String(n);
  btn.addEventListener("click", () => {
    imposterCount = n;
    safeSetItem(localStorage, STORAGE_IMPOSTER_COUNT, String(n));
    renderImposterToggle();
  });
  imposterToggle.appendChild(btn);
}
renderImposterToggle();

// ---------- word selection ----------

function randomInt(n) {
  return Math.floor(Math.random() * n);
}

// Avoid repeating a word until the whole list has been used.
// Used words are tracked separately per list.
function pickWord() {
  const words = WORD_LISTS[wordListId].words;
  const usedKey = `${STORAGE_USED_WORDS}.${wordListId}`;
  let used;
  try {
    used = new Set(JSON.parse(localStorage.getItem(usedKey)) || []);
  } catch (e) {
    used = new Set();
  }
  let available = words.filter((w) => !used.has(w));
  if (available.length === 0) {
    used = new Set();
    available = words.slice();
  }
  const word = available[randomInt(available.length)];
  used.add(word);
  safeSetItem(localStorage, usedKey, JSON.stringify([...used]));
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
      Array.isArray(saved.imposterIndexes) &&
      saved.imposterIndexes.length >= 1 &&
      saved.imposterIndexes.length < players.length &&
      saved.imposterIndexes.every(
        (i) => Number.isInteger(i) && i >= 0 && i < players.length
      ) &&
      new Set(saved.imposterIndexes).size === saved.imposterIndexes.length &&
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

function pickImposters(count) {
  const indexes = players.map((_, i) => i);
  // Partial Fisher-Yates: the first `count` slots end up a uniform sample.
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(indexes.length - i);
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes.slice(0, count);
}

function startRound() {
  game = {
    word: pickWord(),
    imposterIndexes: pickImposters(
      Math.min(imposterCount, maxImpostersFor(players.length))
    ),
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
  revealBtn.classList.add("arming");
  setTimeout(() => {
    revealBtn.disabled = false;
    revealBtn.classList.remove("arming");
  }, 1000);
  show("pass");
}

function showPlayScreen() {
  const plural = game.imposterIndexes.length > 1;
  document.getElementById("first-speaker").textContent = game.firstSpeaker;
  document.getElementById("vote-text").textContent = plural
    ? `Then vote on who the ${game.imposterIndexes.length} imposters are.`
    : "Then vote on who the imposter is.";
  document.getElementById("show-reveal-btn").textContent = plural
    ? "Reveal the imposters"
    : "Reveal the imposter";
  document.getElementById("confirm-title").textContent = plural
    ? "Reveal the imposters?"
    : "Reveal the imposter?";
  show("play");
}

document.getElementById("start-game-btn").addEventListener("click", startRound);

revealBtn.addEventListener("click", () => {
  const isImposter = game.imposterIndexes.includes(game.viewIndex);
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

// ---------- party mode ----------

const PARTY_EMOJI = ["✨", "🎉", "🪩", "🌈", "⭐", "💫", "🎊", "🔥", "🕺", "💃"];
const partyToggle = document.getElementById("party-toggle");
const partyBg = document.getElementById("party-bg");
let partyMode = false;
try {
  partyMode = localStorage.getItem(STORAGE_PARTY) === "1";
} catch (e) { /* ignore */ }
let partyTimer = null;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function spawnPartyEmoji() {
  if (partyBg.childElementCount > 24) return;
  const emoji = document.createElement("span");
  emoji.className = "party-emoji";
  emoji.textContent = PARTY_EMOJI[randomInt(PARTY_EMOJI.length)];
  emoji.style.left = `${Math.random() * 100}%`;
  emoji.style.setProperty("--size", `${18 + randomInt(26)}px`);
  emoji.style.setProperty("--dur", `${4 + Math.random() * 4}s`);
  emoji.style.setProperty("--sway", `${randomInt(120) - 60}px`);
  emoji.style.setProperty("--twirl", `${randomInt(720) - 360}deg`);
  emoji.addEventListener("animationend", () => emoji.remove(), { once: true });
  partyBg.appendChild(emoji);
}

function applyPartyMode() {
  document.body.classList.toggle("party", partyMode);
  partyToggle.setAttribute("aria-pressed", String(partyMode));
  partyBg.hidden = !partyMode;
  if (partyMode && !partyTimer && !reducedMotion()) {
    partyTimer = setInterval(spawnPartyEmoji, 450);
  } else if (!partyMode && partyTimer) {
    clearInterval(partyTimer);
    partyTimer = null;
    partyBg.innerHTML = "";
  }
}

partyToggle.addEventListener("click", () => {
  partyMode = !partyMode;
  safeSetItem(localStorage, STORAGE_PARTY, partyMode ? "1" : "0");
  applyPartyMode();
});

// ---------- confetti ----------

const CONFETTI_COLORS = ["#6c8cff", "#ff5d73", "#ffd166", "#6ee7a0", "#c792ea"];
const confettiBox = document.getElementById("confetti");

function launchConfetti() {
  if (reducedMotion()) return;
  confettiBox.innerHTML = "";
  const count = partyMode ? 140 : 60;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)];
    piece.style.setProperty("--fall", `${2 + Math.random() * 1.5}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.6}s`);
    piece.style.setProperty("--drift", `${randomInt(160) - 80}px`);
    piece.style.setProperty("--spin", `${360 + randomInt(540)}deg`);
    confettiBox.appendChild(piece);
  }
  setTimeout(() => {
    confettiBox.innerHTML = "";
  }, 4800);
}

document.getElementById("show-reveal-btn").addEventListener("click", () => show("confirm"));
document.getElementById("cancel-reveal-btn").addEventListener("click", () => show("play"));

document.getElementById("confirm-reveal-btn").addEventListener("click", () => {
  const names = game.imposterIndexes.map((i) => players[i]);
  document.getElementById("result-label").textContent =
    names.length > 1 ? "The imposters were" : "The imposter was";
  document.getElementById("result-imposter").textContent =
    names.length > 2
      ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
      : names.join(" & ");
  document.getElementById("result-word").textContent = game.word;
  try {
    sessionStorage.removeItem(STORAGE_GAME);
  } catch (e) { /* ignore */ }
  show("result");
  launchConfetti();
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
applyPartyMode();
if (loadSavedGame()) {
  show("resume");
} else {
  show("setup");
}
