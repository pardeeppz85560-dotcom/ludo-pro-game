
const $ = (id) => document.getElementById(id);

const COLORS = {
  red:    { name: "Red",    hex: "#ff5367", start: 0,  bg: "red-bg" },
  green:  { name: "Green",  hex: "#30d6a0", start: 13, bg: "green-bg" },
  yellow: { name: "Yellow", hex: "#ffcb55", start: 26, bg: "yellow-bg" },
  blue:   { name: "Blue",   hex: "#648bff", start: 39, bg: "blue-bg" }
};

const COLOR_ORDER = ["red", "green", "yellow", "blue"];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const TOKENS_PER_PLAYER = 4;
const FINISH = 57;

const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0]
];

const HOME_LANES = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]],
  blue:   [[13,7],[12,7],[11,7],[10,7],[9,7]]
};

const YARDS = {
  red:    [[1,1],[1,4],[4,1],[4,4]],
  green:  [[1,10],[1,13],[4,10],[4,13]],
  yellow: [[10,10],[10,13],[13,10],[13,13]],
  blue:   [[10,1],[10,4],[13,1],[13,4]]
};

const DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const STORE_KEY = "ludoProLeaderboardV1";

let game = null;
let soundOn = true;
let audioContext = null;
let rolling = false;

function getRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(records));
  } catch {
    // The game remains playable if storage is unavailable.
  }
}

function ensureRecord(color) {
  const records = getRecords();
  if (!records[color]) records[color] = { wins: 0, games: 0 };
  return records;
}

function cellKey(r, c) {
  return `${r}-${c}`;
}

function createBoard() {
  const board = $("board");
  board.innerHTML = "";

  const trackMap = new Map();
  TRACK.forEach((p, i) => trackMap.set(cellKey(...p), i));

  const homeMap = new Map();
  Object.entries(HOME_LANES).forEach(([color, cells]) => {
    cells.forEach(p => homeMap.set(cellKey(...p), color));
  });

  const yardMap = new Map();
  Object.entries(YARDS).forEach(([color, cells]) => {
    cells.forEach((p, i) => yardMap.set(cellKey(...p), { color, index: i }));
  });

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.key = cellKey(r, c);

      const key = cellKey(r, c);
      const trackIndex = trackMap.get(key);
      const laneColor = homeMap.get(key);
      const yard = yardMap.get(key);

      if (trackIndex !== undefined) {
        cell.classList.add("track");
        if (SAFE.has(trackIndex)) cell.classList.add("safe");
      } else if (laneColor) {
        cell.classList.add("home-lane", laneColor);
      } else if (yard) {
        cell.classList.add("base", yard.color);
      } else if (r < 6 && c < 6) {
        cell.classList.add("base", "red");
      } else if (r < 6 && c > 8) {
        cell.classList.add("base", "green");
      } else if (r > 8 && c > 8) {
        cell.classList.add("base", "yellow");
      } else if (r > 8 && c < 6) {
        cell.classList.add("base", "blue");
      }

      if (yard) {
        const slot = document.createElement("div");
        slot.className = "base-slot";
        slot.setAttribute("aria-hidden", "true");
        cell.appendChild(slot);
      }

      if (r === 7 && c === 7) {
        cell.classList.add("center");
        cell.innerHTML = '<span class="center-star">✦</span>';
      }

      board.appendChild(cell);
    }
  }
}

function makePlayers(count) {
  const colors = count === 2
    ? ["red", "yellow"]
    : COLOR_ORDER.slice(0, count);

  return colors.map(color => ({
    color,
    name: `${COLORS[color].name} Player`,
    tokens: Array.from({ length: TOKENS_PER_PLAYER }, (_, id) => ({
      id,
      progress: -1
    }))
  }));
}

function previewPlayers() {
  const count = Number($("playerCount").value);
  const colors = count === 2
    ? ["red", "yellow"]
    : COLOR_ORDER.slice(0, count);

  $("playerPreview").innerHTML = colors.map(color => `
    <div class="preview-item">
      <span class="preview-dot" style="background:${COLORS[color].hex}"></span>
      <div>${COLORS[color].name} Player<small>4 tokens</small></div>
    </div>
  `).join("");
}

function startGame() {
  if (game && !game.winner) {
    const confirmNew = window.confirm("Start a new match? The current match will end.");
    if (!confirmNew) return;
  }

  const count = Number($("playerCount").value);
  game = {
    players: makePlayers(count),
    turn: 0,
    dice: null,
    awaitingMove: false,
    legalTokens: [],
    moves: 0,
    captures: 0,
    sixes: 0,
    winner: null,
    turnCount: 1
  };

  $("setupPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  $("gameStatus").textContent = "MATCH IN PROGRESS";
  $("rollBtn").disabled = false;
  $("dice").textContent = "⚄";
  $("diceMessage").textContent = "Roll to begin your journey!";
  $("helperText").textContent = "Roll the dice. A six gets a token out of the yard.";
  $("turnNumber").textContent = "01";

  renderGame();
}

function currentPlayer() {
  return game?.players[game.turn];
}

function currentLegalTokens() {
  if (!game || !game.awaitingMove) return [];
  return game.legalTokens.map(id => currentPlayer().tokens[id]);
}

function getGlobalIndex(player, token) {
  return (COLORS[player.color].start + token.progress) % TRACK.length;
}

function getTokenPosition(player, token) {
  if (token.progress === -1) return YARDS[player.color][token.id];

  if (token.progress >= FINISH) return [7, 7];

  if (token.progress >= 52) {
    return HOME_LANES[player.color][token.progress - 52];
  }

  return TRACK[getGlobalIndex(player, token)];
}

function allFinished(player) {
  return player.tokens.every(token => token.progress === FINISH);
}

function tokenAt(player, token, index) {
  return token.progress >= 0 &&
    token.progress < 52 &&
    getGlobalIndex(player, token) === index;
}

function legalMoves(player, dice) {
  return player.tokens
    .filter(token => {
      if (token.progress === FINISH) return false;
      if (token.progress === -1) return dice === 6;
      return token.progress + dice <= FINISH;
    })
    .map(token => token.id);
}

function renderTokens() {
  document.querySelectorAll(".token").forEach(el => el.remove());

  if (!game) return;

  const active = currentPlayer();
  const legal = currentLegalTokens().map(token => token.id);

  game.players.forEach(player => {
    player.tokens.forEach(token => {
      const [r, c] = getTokenPosition(player, token);
      const cell = document.querySelector(
        `.cell[data-key="${cellKey(r, c)}"]`
      );
      if (!cell) return;

      const button = document.createElement("button");
      button.className = `token ${player.color}`;
      button.textContent = token.id + 1;
      button.type = "button";
      button.setAttribute("aria-label",
        `${player.name}, token ${token.id + 1}` +
        (token.progress === -1 ? ", in yard" : "") +
        (token.progress === FINISH ? ", finished" : "")
      );

      if (token.progress === FINISH) button.classList.add("finished");

      if (
        player === active &&
        game.awaitingMove &&
        legal.includes(token.id)
      ) {
        button.classList.add("selectable");
        button.title = "Click to move this token";
      }

      button.addEventListener("click", () => {
        if (player !== currentPlayer()) return;
        moveToken(token.id);
      });

      cell.appendChild(button);
    });
  });
}

function renderScoreboard() {
  if (!game) {
    $("scoreboard").innerHTML = "";
    return;
  }

  $("scoreboard").innerHTML = game.players.map((player, index) => {
    const finished = player.tokens.filter(t => t.progress === FINISH).length;
    const isActive = index === game.turn && !game.winner;

    return `
      <div class="score-row ${isActive ? "active" : ""}">
        <span class="score-swatch" style="background:${COLORS[player.color].hex}"></span>
        <div class="score-info">
          <b>${player.name}${isActive ? " ◂" : ""}</b>
          <small>${finished === 4 ? "All tokens finished!" : `${finished}/4 tokens home`}</small>
        </div>
        <span class="score-count">${finished}/4</span>
      </div>
    `;
  }).join("");
}

function renderGame() {
  if (!game) return;

  const player = currentPlayer();

  $("currentAvatar").className = `player-avatar ${COLORS[player.color].bg}`;
  $("currentAvatar").textContent = COLORS[player.color].name[0];
  $("currentPlayerName").textContent = player.name;

  if (game.winner) {
    $("currentPlayerHint").textContent = "Match champion!";
    $("gameStatus").textContent = "MATCH COMPLETE";
    $("rollBtn").disabled = true;
  } else if (game.awaitingMove) {
    $("currentPlayerHint").textContent = "Choose a highlighted token";
  } else {
    $("currentPlayerHint").textContent = "It's your turn to roll";
  }

  $("movesStat").textContent = game.moves;
  $("capturesStat").textContent = game.captures;
  $("sixStat").textContent = game.sixes;
  $("turnNumber").textContent = String(game.turnCount).padStart(2, "0");
  $("rollBtn").disabled = game.winner !== null ||
    game.awaitingMove || rolling;

  renderTokens();
  renderScoreboard();
  renderLeaderboard();
}

function playTone(frequency = 440, duration = 0.1) {
  if (!soundOn) return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    audioContext ??= new AudioCtx();
    if (audioContext.state === "suspended") audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001, audioContext.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Sound is optional.
  }
}

function rollDice() {
  if (!game || game.winner || game.awaitingMove || rolling) return;

  rolling = true;
  $("rollBtn").disabled = true;
  $("dice").classList.add("rolling");
  $("diceMessage").textContent = "Rolling...";

  let ticks = 0;
  const interval = setInterval(() => {
    $("dice").textContent = DICE_FACES[1 + Math.floor(Math.random() * 6)];
    ticks++;

    if (ticks >= 7) {
      clearInterval(interval);
      finishRoll(1 + Math.floor(Math.random() * 6));
    }
  }, 65);
}

function finishRoll(value) {
  rolling = false;
  $("dice").classList.remove("rolling");

  game.dice = value;
  if (value === 6) game.sixes++;

  $("dice").textContent = DICE_FACES[value];
  $("diceMessage").textContent = `You rolled a ${value}!`;
  playTone(value === 6 ? 740 : 480, 0.13);

  const player = currentPlayer();
  game.legalTokens = legalMoves(player, value);

  if (game.legalTokens.length === 0) {
    $("helperText").textContent = "No legal moves. Your turn passes.";
    game.awaitingMove = false;
    renderGame();

    setTimeout(() => {
      if (!game || game.winner) return;
      if (value === 6) {
        $("diceMessage").textContent = "No move available — roll again!";
      } else {
        nextTurn();
      }
    }, 900);

    return;
  }

  game.awaitingMove = true;
  $("helperText").textContent = value === 6
    ? "Six! Choose a token to launch or move."
    : "Select one of the glowing tokens to move.";

  renderGame();
}

function moveToken(tokenId) {
  if (!game || !game.awaitingMove || game.winner) return;
  if (!game.legalTokens.includes(tokenId)) return;

  const player = currentPlayer();
  const token = player.tokens[tokenId];
  const rolled = game.dice;

  if (token.progress === -1) {
    if (rolled !== 6) return;
    token.progress = 0;
  } else {
    token.progress += rolled;
  }

  game.moves++;
  game.awaitingMove = false;
  game.legalTokens = [];
  game.dice = null;

  playTone(600, 0.09);

  let captured = false;

  if (token.progress >= 0 && token.progress < 52) {
    const landingIndex = getGlobalIndex(player, token);

    if (!SAFE.has(landingIndex)) {
      game.players.forEach(opponent => {
        if (opponent === player) return;

        opponent.tokens.forEach(enemyToken => {
          if (tokenAt(opponent, enemyToken, landingIndex)) {
            enemyToken.progress = -1;
            captured = true;
            game.captures++;
          }
        });
      });
    }
  }

  renderGame();

  if (allFinished(player)) {
    finishGame(player);
    return;
  }

  const extraTurn = rolled === 6 || captured;

  if (captured) {
    $("diceMessage").textContent = "Capture! Opponent sent home.";
    playTone(850, 0.2);
  } else if (token.progress === FINISH) {
    $("diceMessage").textContent = "Token reached home! ✨";
  } else if (rolled === 6) {
    $("diceMessage").textContent = "Lucky six! Roll again.";
  } else {
    $("diceMessage").textContent = "Nice move!";
  }

  if (extraTurn) {
    $("helperText").textContent = captured
      ? "Capture bonus: you get another turn."
      : "Lucky six: you get another turn.";

    setTimeout(() => {
      if (!game || game.winner) return;
      game.turnCount++;
      $("turnNumber").textContent = String(game.turnCount).padStart(2, "0");
      $("rollBtn").disabled = false;
      renderGame();
    }, 450);
  } else {
    setTimeout(nextTurn, 650);
  }
}

function nextTurn() {
  if (!game || game.winner) return;

  game.turn = (game.turn + 1) % game.players.length;
  game.turnCount++;
  game.dice = null;
  game.awaitingMove = false;
  game.legalTokens = [];

  $("dice").textContent = "⚄";
  $("diceMessage").textContent = `${currentPlayer().name}'s turn`;
  $("helperText").textContent = "Roll the dice to continue.";

  renderGame();
}

function finishGame(winner) {
  game.winner = winner.color;
  game.awaitingMove = false;

  const records = ensureRecord(winner.color);
  records[winner.color].wins++;
  records[winner.color].games++;

  game.players.forEach(player => {
    if (player.color !== winner.color) {
      records[player.color] ??= { wins: 0, games: 0 };
      records[player.color].games++;
    }
  });

  saveRecords(records);

  $("diceMessage").textContent = "🏆 We have a champion!";
  $("helperText").textContent = `${winner.name} wins the match!`;
  $("messageTitle").textContent = "🏆 Victory!";
  $("messageText").textContent =
    `${winner.name} got all four tokens home. What a game!`;
  $("heroWins").textContent = records[winner.color].wins;

  renderGame();
  playTone(880, 0.3);
  setTimeout(() => $("messageDialog").showModal(), 300);
}

function renderLeaderboard() {
  const records = getRecords();

  const ranking = COLOR_ORDER.map(color => ({
    color,
    wins: records[color]?.wins || 0,
    games: records[color]?.games || 0
  })).sort((a, b) => b.wins - a.wins || a.games - b.games);

  $("leaderboardBody").innerHTML = ranking.map((row, i) => {
    const rate = row.games
      ? Math.round(row.wins / row.games * 100)
      : 0;

    return `
      <tr>
        <td class="rank-cell">${["🥇", "🥈", "🥉", "4"][i]}</td>
        <td><div class="table-player">
          <span class="preview-dot" style="background:${COLORS[row.color].hex}"></span>
          ${COLORS[row.color].name} Player
        </div></td>
        <td>${row.wins}</td>
        <td>${row.games}</td>
        <td>${rate}%</td>
      </tr>
    `;
  }).join("");

  const totalWins = COLOR_ORDER.reduce(
    (sum, color) => sum + (records[color]?.wins || 0), 0
  );
  $("heroWins").textContent = totalWins;
}

$("playerCount").addEventListener("change", previewPlayers);
$("startBtn").addEventListener("click", startGame);
$("rollBtn").addEventListener("click", rollDice);

$("newGameBtn").addEventListener("click", startGame);
$("modalNewGameBtn").addEventListener("click", () => {
  $("messageDialog").close();
  startGame();
});

$("rulesBtn").addEventListener("click", () => $("rulesDialog").showModal());
$("closeRulesBtn").addEventListener("click", () => $("rulesDialog").close());
$("closeMessageBtn").addEventListener("click", () => $("messageDialog").close());

$("soundBtn").addEventListener("click", () => {
  soundOn = !soundOn;
  $("soundBtn").textContent = soundOn ? "♫" : "♪";
  $("soundBtn").title = soundOn ? "Turn sound off" : "Turn sound on";
  $("soundBtn").setAttribute("aria-pressed", String(soundOn));
  if (soundOn) playTone(520, 0.08);
});

$("resetStatsBtn").addEventListener("click", () => {
  if (!window.confirm("Reset all saved leaderboard records?")) return;

  saveRecords({});
  renderLeaderboard();
});

createBoard();
previewPlayers();
renderLeaderboard();
