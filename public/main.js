// Kalas Random Chess - Main Application

let socket = null;
let game = null;
let boardUI = null;
let currentGameId = null;
let playerColor = null;
let isLocalGame = false;
let isAIGame = false;
let ai = null;
let aiDifficulty = 'medium';
let selectedTimeControl = 10; // Default 10 minutes
let timerInterval = null;
let aiThinking = false;
let currentGamePlayers = null; // { white: { username, elo }, black: { username, elo } }
let lastReceivedMoveNum = 0; // Track last received move for dedup

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    initializeEventListeners();
});

// Check if there's an active game to rejoin after page refresh
function checkForActiveGame() {
    const savedGame = localStorage.getItem('activeGame');
    if (savedGame) {
        try {
            const gameData = JSON.parse(savedGame);
            // Only try to reconnect if the game data is recent (within last hour)
            if (Date.now() - gameData.savedAt < 3600000) {
                currentGameId = gameData.gameId;
                playerColor = gameData.playerColor;
                // Small delay to allow server to process disconnect first
                setTimeout(() => {
                    socket.emit('reconnectGame', { gameId: gameData.gameId });
                }, 500);
            } else {
                // Clear stale game data
                localStorage.removeItem('activeGame');
            }
        } catch (e) {
            localStorage.removeItem('activeGame');
        }
    }
}

// Save current game to localStorage
function saveActiveGame() {
    if (currentGameId && playerColor && !isLocalGame && !isAIGame) {
        localStorage.setItem('activeGame', JSON.stringify({
            gameId: currentGameId,
            playerColor: playerColor,
            savedAt: Date.now()
        }));
    }
}

// Clear saved game from localStorage
function clearActiveGame() {
    localStorage.removeItem('activeGame');
}

// Initialize Socket.io connection
function initializeSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server');
        // Register player info if logged in
        registerPlayerWithServer();

        if (currentGameId && game && !game.gameOver) {
            // We're in an active game and just reconnected - sync state and fix socket ID
            console.log('Reconnected during active game, requesting state sync...');
            socket.emit('requestSync', { gameId: currentGameId });
        } else {
            // Not in a game - check localStorage for a game to rejoin (e.g. after page refresh)
            checkForActiveGame();
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    // Game created - waiting for opponent
    socket.on('gameCreated', (data) => {
        currentGameId = data.gameId;
        document.getElementById('waiting-time-display').textContent = data.timeControl === 0 ? 'Untimed' : data.timeControl + ' min';
        UI.hide('create-table-form');
        UI.hide('main-lobby');
        UI.show('waiting-room');
    });

    // Game joined successfully - sent to the player who clicked Join
    socket.on('gameJoined', (data) => {
        console.log('gameJoined received:', data.gameId, data.color);
        try {
            currentGameId = data.gameId;
            playerColor = data.color;
            currentGamePlayers = data.players;
            Sounds.opponentJoined();
            startOnlineGame(data.gameState, data.color);
        } catch (err) {
            console.error('Error in gameJoined handler:', err);
            alert('Error starting game: ' + err.message);
        }
    });

    // Game started (both players connected) - sent to the creator when opponent joins
    socket.on('gameStart', (data) => {
        console.log('gameStart received:', data.gameId, 'currentGameId:', currentGameId);
        try {
            currentGameId = data.gameId; // Ensure currentGameId is set (may have been cleared)
            playerColor = data.color;
            currentGamePlayers = data.players;
            Sounds.opponentJoined();
            startOnlineGame(data.gameState, data.color);
        } catch (err) {
            console.error('Error in gameStart handler:', err);
            alert('Error starting game: ' + err.message);
        }
    });

    // ELO update after game ends
    socket.on('eloUpdate', (data) => {
        console.log(`ELO update: ${data.change > 0 ? '+' : ''}${data.change} (new: ${data.newElo})`);
        Auth.updateElo(data.newElo);
        // Show ELO change in game message if visible
        showEloChange(data.change);
    });

    // Opponent made a move
    // Our move was confirmed by server - sync state
    socket.on('moveConfirmed', (data) => {
        if (boardUI && game) {
            // Sync our local state with server's authoritative state
            game.loadState(data.gameState);
            boardUI.render();
            UI.updateGameInfo(game);
            updateTimerDisplay();
            updateCapturedPieces();

            if (data.gameStatus && data.gameStatus.gameOver) {
                handleGameEnd(data.gameStatus);
            }
        }
    });

    // Opponent made a move
    socket.on('moveMade', (data) => {
        console.log('Received moveMade from server:', data);
        if (boardUI && game) {
            // Acknowledge receipt so server stops retrying
            if (data.moveNum && currentGameId) {
                socket.emit('moveAck', { gameId: currentGameId, moveNum: data.moveNum });
            }

            // Skip if we already have this move (duplicate from retry)
            if (data.moveNum && data.moveNum <= lastReceivedMoveNum) {
                console.log(`Skipping duplicate move #${data.moveNum} (already have #${lastReceivedMoveNum})`);
                return;
            }
            if (data.moveNum) {
                lastReceivedMoveNum = data.moveNum;
            }

            const wasCapture = data.gameState.moveHistory.length > 0 &&
                data.gameState.moveHistory[data.gameState.moveHistory.length - 1].captured;

            boardUI.updateFromState(data.gameState);
            UI.updateGameInfo(game);
            updateTimerDisplay();
            updateCapturedPieces();

            // Play appropriate sound
            if (data.gameStatus && data.gameStatus.inCheck) {
                Sounds.check();
            } else if (wasCapture) {
                Sounds.capture();
            } else {
                Sounds.move();
            }

            if (data.gameStatus && data.gameStatus.gameOver) {
                handleGameEnd(data.gameStatus);
            }
        }
    });

    // Full state sync from server (recovery from desync)
    socket.on('fullSync', (data) => {
        console.log('Received fullSync from server');
        if (boardUI && game) {
            lastReceivedMoveNum = data.moveCount || 0;
            boardUI.updateFromState(data.gameState);
            UI.updateGameInfo(game);
            updateTimerDisplay();
            updateCapturedPieces();

            // If the game is actually over (e.g. we missed the checkmate move), handle it
            if (data.gameState.gameOver && !game.gameOver) {
                // loadState already set gameOver, but trigger the UI
            }
            if (game.gameOver) {
                handleGameEnd({
                    gameOver: true,
                    result: game.winner ? 'checkmate' : 'stalemate',
                    winner: game.winner,
                    message: game.winner
                        ? `${game.winner.charAt(0).toUpperCase() + game.winner.slice(1)} wins!`
                        : 'Draw!'
                });
            }
        }
    });

    // Timer sync from server
    socket.on('timerSync', (data) => {
        if (game) {
            game.setTime('white', data.whiteTime);
            game.setTime('black', data.blackTime);
            updateTimerDisplay();
        }
    });

    // Timeout notification from server
    socket.on('timeout', (data) => {
        if (game) {
            Sounds.timeout();
            handleGameEnd(data);
        }
    });

    // Opponent resigned
    socket.on('opponentResigned', (data) => {
        if (game) {
            game.gameOver = true;
            game.winner = playerColor;
            stopTimerInterval();
            Sounds.victory();
            handleGameEnd({
                gameOver: true,
                result: 'resignation',
                winner: playerColor,
                message: `Opponent resigned. You win!`
            });
        }
    });

    // Opponent disconnected (but can reconnect)
    socket.on('opponentDisconnected', (data) => {
        if (game && !game.gameOver) {
            stopTimerInterval();
            UI.showGameMessage('Opponent Disconnected', 'Waiting for opponent to reconnect... (60 seconds)');
        }
    });

    // Opponent reconnected
    socket.on('opponentReconnected', (data) => {
        if (game) {
            game.loadState(data.gameState);
            boardUI.render();
            UI.updateGameInfo(game);
            updateTimerDisplay();
            updateCapturedPieces();
            UI.hideGameMessage();
            game.lastTimestamp = Date.now();
            startTimerInterval();
            Sounds.opponentJoined();
        }
    });

    // Opponent forfeited due to disconnect timeout
    socket.on('opponentForfeit', (data) => {
        if (game && !game.gameOver) {
            game.gameOver = true;
            game.winner = data.winner;
            Sounds.victory();
            handleGameEnd({
                gameOver: true,
                result: 'forfeit',
                winner: data.winner,
                message: data.message
            });
        }
    });

    // Successfully reconnected to game
    socket.on('gameReconnected', (data) => {
        currentGameId = data.gameId;
        playerColor = data.color;
        Sounds.opponentJoined();
        startOnlineGame(data.gameState, data.color);
    });

    // Reconnect errors (don't kick to lobby - game may still be active)
    socket.on('reconnectError', (data) => {
        console.warn('Reconnect error:', data.message);
        // Clear stale saved game if the game is truly gone
        if (data.message === 'Game not found' || data.message === 'Game is already finished') {
            clearActiveGame();
        }
        // Don't show alert or kick to lobby - the player may still be in an active game
    });

    // Move-specific errors (don't kick to lobby)
    socket.on('moveError', (data) => {
        console.error('Move error:', data.message);
        Sounds.invalid();
        // Any move error means our local state is wrong - request a full sync to fix it
        if (currentGameId) {
            console.log('Move rejected by server, requesting full state sync...');
            socket.emit('requestSync', { gameId: currentGameId });
        }
    });

    // Lobby/join errors (return to lobby)
    socket.on('error', (data) => {
        console.error('Socket error received:', data.message);
        Sounds.invalid();
        alert(data.message);
        UI.hide('waiting-room');
        UI.hide('create-table-form');
        UI.show('main-lobby');
    });

    // Lobby updates
    socket.on('lobbyUpdate', (data) => {
        console.log('lobbyUpdate received:', data.games.length, 'games', data.games);
        updateLobbyDisplay(data.games);
    });
}

// Initialize UI event listeners
function initializeEventListeners() {
    // Rules button
    document.getElementById('btn-rules').addEventListener('click', showRules);

    // Waiting room
    document.getElementById('btn-cancel-waiting').addEventListener('click', cancelWaiting);

    // Create table button (now on main menu)
    document.getElementById('btn-create-table').addEventListener('click', showCreateTableForm);

    // Create table form time options
    document.querySelectorAll('.btn-table-time').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!Auth.requireLogin()) return;
            selectedTimeControl = parseInt(e.target.dataset.time);
            createTableAndJoinLobby();
        });
    });
    document.getElementById('btn-cancel-create-table').addEventListener('click', hideCreateTableForm);

    // Play against computer
    document.getElementById('btn-vs-computer').addEventListener('click', showAIDifficultySelect);
    document.querySelectorAll('.btn-difficulty').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn-difficulty').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            aiDifficulty = e.target.dataset.difficulty;
        });
    });
    document.querySelectorAll('.btn-ai-time').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectedTimeControl = parseInt(e.target.dataset.time);
            startAIGame();
        });
    });
    document.getElementById('btn-cancel-ai').addEventListener('click', hideAIDifficultySelect);

    // Local game
    document.getElementById('btn-local-game').addEventListener('click', showLocalGameSelect);
    document.querySelectorAll('.btn-local-time').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectedTimeControl = parseInt(e.target.dataset.time);
            startLocalGame();
        });
    });
    document.getElementById('btn-cancel-local').addEventListener('click', hideLocalGameSelect);

    // Rules screen
    document.getElementById('btn-back-rules').addEventListener('click', () => {
        UI.showScreen('menu-screen');
    });

    // Game controls
    document.getElementById('btn-resign').addEventListener('click', resignGame);
    document.getElementById('btn-new-game').addEventListener('click', returnToMenu);

    // Sound toggle
    document.getElementById('sound-toggle').addEventListener('click', toggleSound);
    // Initialize sound toggle icon based on saved preference
    updateSoundToggleIcon();

    // Request lobby data on page load
    socket.emit('getLobby');
}

// Toggle sound on/off
function toggleSound() {
    Sounds.toggle();
    updateSoundToggleIcon();
}

// Update the sound toggle icon based on current state
function updateSoundToggleIcon() {
    const soundOn = document.querySelector('#sound-toggle .sound-on');
    const soundOff = document.querySelector('#sound-toggle .sound-off');
    if (Sounds.isEnabled()) {
        soundOn.classList.remove('hidden');
        soundOff.classList.add('hidden');
    } else {
        soundOn.classList.add('hidden');
        soundOff.classList.remove('hidden');
    }
}

// Register player with server (for ELO tracking)
function registerPlayerWithServer() {
    if (Auth.isLoggedIn() && socket) {
        socket.emit('registerPlayer', {
            userId: Auth.getUserId(),
            username: Auth.currentUser.username,
            elo: Auth.getElo()
        });
    }
}

// Show ELO change after game
function showEloChange(change) {
    const messageEl = document.getElementById('game-message');
    if (messageEl && !messageEl.classList.contains('hidden')) {
        const eloEl = messageEl.querySelector('.elo-change');
        if (!eloEl) {
            const changeText = document.createElement('p');
            changeText.className = 'elo-change';
            changeText.textContent = `ELO: ${change > 0 ? '+' : ''}${change}`;
            changeText.style.color = change > 0 ? '#2ecc71' : '#e74c3c';
            messageEl.appendChild(changeText);
        }
    }
}

// Cancel waiting for opponent
function cancelWaiting() {
    if (currentGameId) {
        socket.emit('cancelGame', { gameId: currentGameId });
    }
    currentGameId = null;
    UI.hide('waiting-room');
    UI.show('main-lobby');
}

// Start AI game
function startAIGame() {
    isLocalGame = false;
    isAIGame = true;
    playerColor = 'white'; // Player is always white against AI

    // Initialize AI
    ai = new ChessAI(aiDifficulty);

    game = new KalasRandomChess(selectedTimeControl);
    game.generateStartingPosition();

    const boardElement = document.getElementById('chess-board');
    boardUI = new ChessBoardUI(boardElement, game);
    boardUI.setPlayerColor('white');

    boardUI.onMove((result) => {
        // Play sound based on move type
        if (result.gameStatus && result.gameStatus.inCheck) {
            Sounds.check();
        } else if (result.move.captured) {
            Sounds.capture();
        } else {
            Sounds.move();
        }

        UI.updateGameInfo(game);
        updateTimerDisplay();
        updateCapturedPieces();

        if (result.gameStatus && result.gameStatus.gameOver) {
            handleGameEnd(result.gameStatus);
        } else {
            // AI's turn
            makeAIMove();
        }
    });

    boardUI.onSelect(() => {
        Sounds.select();
    });

    boardUI.render();
    UI.updateGameInfo(game);
    UI.hideGameMessage();
    UI.hide('ai-difficulty-select');
    UI.showScreen('game-screen');

    // Update player status indicators
    const difficultyLabel = aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1);
    document.getElementById('white-status').textContent = '(You)';
    document.getElementById('black-status').textContent = `(AI - ${difficultyLabel})`;

    // Initialize timers and captured pieces
    updateTimerDisplay();
    updateCapturedPieces();
    game.startTimer();
    startTimerInterval();

    Sounds.gameStart();
}

// Make AI move
async function makeAIMove() {
    if (!game || game.gameOver || !isAIGame || game.currentTurn !== 'black') {
        return;
    }

    aiThinking = true;
    UI.showAIThinking(true);

    try {
        // Add a small delay based on difficulty for UX
        const minDelay = aiDifficulty === 'easy' ? 300 : aiDifficulty === 'medium' ? 500 : 800;
        const move = await ai.findBestMoveAsync(game, minDelay);

        if (move && !game.gameOver) {
            const result = game.makeMove(move.from, move.to);

            if (result.success) {
                boardUI.render();

                // Play sound
                if (result.gameStatus && result.gameStatus.inCheck) {
                    Sounds.check();
                } else if (result.move.captured) {
                    Sounds.capture();
                } else {
                    Sounds.move();
                }

                UI.updateGameInfo(game);
                updateTimerDisplay();
                updateCapturedPieces();

                if (result.gameStatus && result.gameStatus.gameOver) {
                    handleGameEnd(result.gameStatus);
                }
            }
        }
    } catch (error) {
        console.error('AI error:', error);
    }

    aiThinking = false;
    UI.showAIThinking(false);
}

// Start local game (2 players same device)
function startLocalGame() {
    isLocalGame = true;
    isAIGame = false;
    playerColor = null;
    ai = null;

    game = new KalasRandomChess(selectedTimeControl);
    game.generateStartingPosition();

    const boardElement = document.getElementById('chess-board');
    boardUI = new ChessBoardUI(boardElement, game);
    boardUI.playerColor = null; // Local game - both colors can play

    boardUI.onMove((result) => {
        // Play sound based on move type
        if (result.gameStatus && result.gameStatus.inCheck) {
            Sounds.check();
        } else if (result.move.captured) {
            Sounds.capture();
        } else {
            Sounds.move();
        }

        UI.updateGameInfo(game);
        updateCapturedPieces();

        if (result.gameStatus && result.gameStatus.gameOver) {
            handleGameEnd(result.gameStatus);
        }
    });

    boardUI.onSelect(() => {
        Sounds.select();
    });

    boardUI.render();
    UI.updateGameInfo(game);
    UI.hideGameMessage();
    UI.hide('local-game-select');
    UI.showScreen('game-screen');

    // Update player status indicators
    document.getElementById('white-status').textContent = '(Player 1)';
    document.getElementById('black-status').textContent = '(Player 2)';

    // Initialize timers and captured pieces
    updateTimerDisplay();
    updateCapturedPieces();
    game.startTimer();
    startTimerInterval();

    Sounds.gameStart();
}

// Start online game
function startOnlineGame(gameState, color) {
    console.log('startOnlineGame called with color:', color, 'gameState:', gameState);

    try {
        isLocalGame = false;
        isAIGame = false;
        playerColor = color;
        ai = null;

        console.log('Creating KalasRandomChess instance...');
        game = new KalasRandomChess(gameState.timeControl || 10);
        console.log('Loading game state...');
        game.loadState(gameState);

        // Save game for reconnection on refresh
        saveActiveGame();

        console.log('Getting board element...');
        const boardElement = document.getElementById('chess-board');
        if (!boardElement) {
            throw new Error('chess-board element not found!');
        }
        console.log('Creating ChessBoardUI...');
        boardUI = new ChessBoardUI(boardElement, game);
        boardUI.setPlayerColor(color);

    boardUI.onMove((result) => {
        // Play sound based on move type
        if (result.gameStatus && result.gameStatus.inCheck) {
            Sounds.check();
        } else if (result.move.captured) {
            Sounds.capture();
        } else {
            Sounds.move();
        }

        // Send move to server
        socket.emit('makeMove', {
            gameId: currentGameId,
            move: {
                from: result.move.from,
                to: result.move.to
            }
        });

        UI.updateGameInfo(game);
        updateCapturedPieces();

        if (result.gameStatus && result.gameStatus.gameOver) {
            handleGameEnd(result.gameStatus);
        }
    });

    boardUI.onSelect(() => {
        Sounds.select();
    });

        console.log('Switching to game-screen...');
        UI.hide('waiting-room');
        UI.showScreen('game-screen');

        console.log('Updating UI...');
        UI.updateGameInfo(game);
        UI.hideGameMessage();

        // Update player names and ELO
        const whiteName = currentGamePlayers?.white?.username || 'White';
        const blackName = currentGamePlayers?.black?.username || 'Black';
        const whiteElo = currentGamePlayers?.white?.elo || '?';
        const blackElo = currentGamePlayers?.black?.elo || '?';

        document.querySelector('.player-white .player-name').textContent = whiteName;
        document.querySelector('.player-black .player-name').textContent = blackName;
        document.getElementById('white-status').textContent = `(${whiteElo})`;
        document.getElementById('black-status').textContent = `(${blackElo})`;

        // Reorder header to match board perspective (opponent on left/top, you on right/bottom)
        const header = document.querySelector('.game-header');
        const blackInfo = document.querySelector('.player-black');
        const whiteInfo = document.querySelector('.player-white');
        if (color === 'white') {
            // White player: Black (opponent) should be first
            header.insertBefore(blackInfo, whiteInfo);
        } else {
            // Black player: White (opponent) should be first
            header.insertBefore(whiteInfo, blackInfo);
        }

        // Initialize timers and captured pieces
        updateTimerDisplay();
        updateCapturedPieces();
        game.startTimer();
        startTimerInterval();

        Sounds.gameStart();
        console.log('startOnlineGame completed successfully!');
    } catch (err) {
        console.error('Error in startOnlineGame:', err);
        alert('Failed to start game: ' + err.message);
    }
}

// Timer interval management
function startTimerInterval() {
    stopTimerInterval(); // Clear any existing interval

    timerInterval = setInterval(() => {
        if (!game || game.gameOver) {
            stopTimerInterval();
            return;
        }

        // Don't tick AI's clock while it's thinking (optional fairness)
        if (isAIGame && aiThinking && game.currentTurn === 'black') {
            // Still update display but don't deduct time
            updateTimerDisplay();
            return;
        }

        game.updateTime();
        updateTimerDisplay();

        // Check for timeout
        const timeout = game.checkTimeout();
        if (timeout) {
            stopTimerInterval();
            Sounds.timeout();
            handleGameEnd(timeout);

            // Notify server in online games
            if (!isLocalGame && !isAIGame && currentGameId) {
                socket.emit('timeout', { gameId: currentGameId });
            }
            return;
        }

        // Low time warning sounds (only for player's turn in AI games)
        const currentTurn = game.currentTurn;
        if (isAIGame && currentTurn === 'black') return; // No warnings for AI

        const currentTime = game.getTimeRemaining(currentTurn);
        if (currentTime <= 10000 && currentTime > 0) {
            // Last 10 seconds - tick sound
            if (currentTime % 1000 < 100) {
                Sounds.tick();
            }
        } else if (currentTime <= 30000 && currentTime > 10000) {
            // Under 30 seconds warning
            if (currentTime % 10000 < 100) {
                Sounds.lowTime();
            }
        }
    }, 100); // Update every 100ms for smooth countdown
}

function stopTimerInterval() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// Update captured pieces display
function updateCapturedPieces() {
    if (!game) return;

    // Piece glyphs mapping (all filled/solid with text variation selector)
    const VS15 = '\uFE0E';
    const pieceGlyphs = {
        'K': '♚' + VS15, 'Q': '♛' + VS15, 'R': '♜' + VS15, 'B': '♝' + VS15, 'N': '♞' + VS15, 'P': '♟' + VS15,
        'k': '♚' + VS15, 'q': '♛' + VS15, 'r': '♜' + VS15, 'b': '♝' + VS15, 'n': '♞' + VS15, 'p': '♟' + VS15
    };

    // Piece order for sorting (queen first, then rooks, bishops, knights, pawns)
    const pieceOrder = { 'q': 0, 'Q': 0, 'r': 1, 'R': 1, 'b': 2, 'B': 2, 'n': 3, 'N': 3, 'p': 4, 'P': 4 };

    // Collect captured pieces by color
    const whiteCaptured = []; // Pieces white has captured (black pieces)
    const blackCaptured = []; // Pieces black has captured (white pieces)

    for (const move of game.moveHistory) {
        if (move.captured) {
            const capturedPiece = move.captured;
            // Determine who captured whom based on piece case
            if (capturedPiece === capturedPiece.toLowerCase()) {
                // Lowercase = black piece was captured by white
                whiteCaptured.push(capturedPiece);
            } else {
                // Uppercase = white piece was captured by black
                blackCaptured.push(capturedPiece);
            }
        }
    }

    // Sort by piece value (most valuable first)
    const sortPieces = (a, b) => pieceOrder[a.toLowerCase()] - pieceOrder[b.toLowerCase()];
    whiteCaptured.sort(sortPieces);
    blackCaptured.sort(sortPieces);

    // Render captured pieces
    const whiteCapturedEl = document.getElementById('white-captured');
    const blackCapturedEl = document.getElementById('black-captured');

    // White's captured pieces (black pieces they took)
    whiteCapturedEl.innerHTML = whiteCaptured.map(p =>
        `<span class="captured-piece black-piece">${pieceGlyphs[p]}</span>`
    ).join('');

    // Black's captured pieces (white pieces they took)
    blackCapturedEl.innerHTML = blackCaptured.map(p =>
        `<span class="captured-piece white-piece">${pieceGlyphs[p]}</span>`
    ).join('');
}

// Update timer display
function updateTimerDisplay() {
    if (!game) return;

    const whiteTimerEl = document.getElementById('white-timer');
    const blackTimerEl = document.getElementById('black-timer');

    // Handle untimed games
    if (game.isUntimed()) {
        whiteTimerEl.textContent = '--:--';
        blackTimerEl.textContent = '--:--';
        whiteTimerEl.classList.remove('active', 'low-time', 'expired');
        blackTimerEl.classList.remove('active', 'low-time', 'expired');
        return;
    }

    const whiteTime = game.getTimeRemaining('white');
    const blackTime = game.getTimeRemaining('black');

    whiteTimerEl.textContent = game.formatTime(whiteTime);
    blackTimerEl.textContent = game.formatTime(blackTime);

    // Update active timer styling
    whiteTimerEl.classList.toggle('active', game.currentTurn === 'white' && !game.gameOver);
    blackTimerEl.classList.toggle('active', game.currentTurn === 'black' && !game.gameOver);

    // Low time warning styling
    whiteTimerEl.classList.toggle('low-time', whiteTime <= 30000 && whiteTime > 0);
    blackTimerEl.classList.toggle('low-time', blackTime <= 30000 && blackTime > 0);

    // Expired styling
    whiteTimerEl.classList.toggle('expired', whiteTime <= 0);
    blackTimerEl.classList.toggle('expired', blackTime <= 0);
}

// Show rules screen
function showRules() {
    UI.showScreen('rules-screen');
}

// Handle game end
function handleGameEnd(status) {
    stopTimerInterval();
    clearActiveGame(); // Clear saved game since game is over
    aiThinking = false;
    UI.showAIThinking(false);

    let title, subtitle;
    let isVictory = false;

    switch (status.result) {
        case 'checkmate':
            title = 'Checkmate!';
            subtitle = `${status.winner.charAt(0).toUpperCase() + status.winner.slice(1)} wins!`;
            isVictory = (isLocalGame || status.winner === playerColor);
            break;
        case 'stalemate':
            title = 'Stalemate!';
            subtitle = 'The game is a draw.';
            break;
        case 'resignation':
            title = 'Resignation';
            subtitle = status.message;
            isVictory = (status.winner === playerColor);
            break;
        case 'disconnect':
            title = 'Opponent Disconnected';
            subtitle = 'You win by default!';
            isVictory = true;
            break;
        case 'timeout':
            title = 'Time Out!';
            subtitle = status.message;
            isVictory = (status.winner === playerColor);
            break;
        default:
            title = 'Game Over';
            subtitle = status.message || '';
    }

    // Play appropriate sound (if not already played)
    if (status.result === 'checkmate' || status.result === 'stalemate') {
        if (isVictory) {
            Sounds.victory();
        } else {
            Sounds.gameOver();
        }
    }

    UI.showGameMessage(title, subtitle);
}

// Resign game
function resignGame() {
    if (!game || game.gameOver) return;

    if (confirm('Are you sure you want to resign?')) {
        stopTimerInterval();
        Sounds.gameOver();

        if (isLocalGame || isAIGame) {
            const result = game.resign(isAIGame ? 'white' : game.currentTurn);
            boardUI.render();
            handleGameEnd(result);
        } else {
            socket.emit('resign', { gameId: currentGameId });
            const result = game.resign(playerColor);
            boardUI.render();
            handleGameEnd(result);
        }
    }
}

// Return to menu
function returnToMenu() {
    stopTimerInterval();
    clearActiveGame(); // Clear saved game
    currentGameId = null;
    playerColor = null;
    game = null;
    boardUI = null;
    isLocalGame = false;
    isAIGame = false;
    ai = null;
    aiThinking = false;
    lastReceivedMoveNum = 0;

    UI.hide('waiting-room');
    UI.hide('create-table-form');
    UI.show('main-lobby');
    UI.hideGameMessage();
    UI.showAIThinking(false);
    UI.showScreen('menu-screen');

    // Refresh lobby data
    socket.emit('getLobby');
}

// Show create table form
function showCreateTableForm() {
    if (!Auth.requireLogin()) return;
    UI.hide('main-lobby');
    UI.show('create-table-form');
}

// Hide create table form
function hideCreateTableForm() {
    UI.hide('create-table-form');
    UI.show('main-lobby');
}

// Show AI difficulty selection
function showAIDifficultySelect() {
    UI.hide('main-lobby');
    UI.show('ai-difficulty-select');
    // Default to medium difficulty
    document.querySelectorAll('.btn-difficulty').forEach(b => b.classList.remove('selected'));
    document.querySelector('.btn-difficulty[data-difficulty="medium"]').classList.add('selected');
    aiDifficulty = 'medium';
}

// Hide AI difficulty selection
function hideAIDifficultySelect() {
    UI.hide('ai-difficulty-select');
    UI.show('main-lobby');
}

// Show local game time selection
function showLocalGameSelect() {
    UI.hide('main-lobby');
    UI.show('local-game-select');
}

// Hide local game time selection
function hideLocalGameSelect() {
    UI.hide('local-game-select');
    UI.show('main-lobby');
}

// Create table and show in lobby
function createTableAndJoinLobby() {
    socket.emit('createGame', { timeControl: selectedTimeControl });
    UI.hide('create-table-form');
}

// Join a table from lobby
function joinTable(gameId) {
    console.log('joinTable called with gameId:', gameId);
    socket.emit('joinGame', { gameId });
}

// Format time control for display
function formatTimeControl(timeControl) {
    return timeControl === 0 ? 'Untimed' : `${timeControl} min`;
}

// Update lobby display with available games
function updateLobbyDisplay(games) {
    const tablesList = document.getElementById('tables-list');
    if (!tablesList) return;

    // Filter out our own game if we're waiting
    const availableGames = games.filter(g => g.gameId !== currentGameId);

    if (availableGames.length === 0) {
        tablesList.innerHTML = '<p class="no-tables">No players waiting</p>';
        return;
    }

    tablesList.innerHTML = availableGames.map(game => {
        const creatorName = game.creator?.username || 'Anonymous';
        const creatorElo = game.creator?.elo || '?';
        return `
        <div class="table-item">
            <div class="table-creator">
                <span class="creator-name">${creatorName}</span>
                <span class="creator-elo">(${creatorElo})</span>
            </div>
            <div class="table-info">
                <span class="table-time">${formatTimeControl(game.timeControl)}</span>
            </div>
            <button class="btn-join-table" onclick="joinTable('${game.gameId}')">Join</button>
        </div>
    `;
    }).join('');
}
