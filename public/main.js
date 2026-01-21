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
let pendingGameType = null; // 'create', 'local', 'ai', or 'join'
let aiThinking = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    initializeEventListeners();
    checkForActiveGame();
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
                // Request reconnection from server
                socket.emit('reconnectGame', { gameId: gameData.gameId });
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
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    // Game created - waiting for opponent
    socket.on('gameCreated', (data) => {
        currentGameId = data.gameId;
        document.getElementById('waiting-code-display').textContent = '#' + data.gameId;
        document.getElementById('waiting-time-display').textContent = data.timeControl === 0 ? 'Untimed' : data.timeControl + ' min';
        UI.hide('time-control-select');
        UI.hide('create-table-form');
        UI.hide('online-lobby');
        UI.show('waiting-room');
    });

    // Game joined successfully
    socket.on('gameJoined', (data) => {
        currentGameId = data.gameId;
        playerColor = data.color;
        Sounds.opponentJoined();
        startOnlineGame(data.gameState, data.color);
    });

    // Game started (both players connected)
    socket.on('gameStart', (data) => {
        playerColor = data.color;
        Sounds.opponentJoined();
        startOnlineGame(data.gameState, data.color);
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
        if (boardUI && game) {
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

    // Error handling
    socket.on('error', (data) => {
        Sounds.invalid();
        alert(data.message);
        UI.hide('waiting-room');
        UI.hide('join-form');
        UI.hide('time-control-select');
        UI.hide('ai-difficulty-select');
        UI.hide('create-table-form');
    });

    // Lobby updates
    socket.on('lobbyUpdate', (data) => {
        updateLobbyDisplay(data.games);
    });
}

// Initialize UI event listeners
function initializeEventListeners() {
    // Menu buttons
    document.getElementById('btn-vs-computer').addEventListener('click', showDifficultySelect);
    document.getElementById('btn-play-online').addEventListener('click', showOnlineLobby);
    document.getElementById('btn-local-game').addEventListener('click', () => showTimeControl('local'));
    document.getElementById('btn-rules').addEventListener('click', showRules);

    // AI Difficulty selection
    document.querySelectorAll('.btn-difficulty').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.target.closest('.btn-difficulty');
            aiDifficulty = button.dataset.difficulty;
            showTimeControl('ai');
        });
    });
    document.getElementById('btn-cancel-difficulty').addEventListener('click', hideDifficultySelect);

    // Time control selection
    document.querySelectorAll('.btn-time').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectedTimeControl = parseInt(e.target.dataset.time);
            document.querySelectorAll('.btn-time').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            confirmTimeControl();
        });
    });
    document.getElementById('btn-cancel-time').addEventListener('click', hideTimeControl);

    // Join form
    document.getElementById('btn-submit-join').addEventListener('click', joinGame);
    document.getElementById('btn-cancel-join').addEventListener('click', hideJoinForm);
    document.getElementById('game-code-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame();
    });

    // Waiting room
    document.getElementById('btn-cancel-waiting').addEventListener('click', cancelWaiting);

    // Online lobby
    document.getElementById('btn-create-table').addEventListener('click', showCreateTableForm);
    document.getElementById('btn-join-code').addEventListener('click', joinByCode);
    document.getElementById('btn-back-lobby').addEventListener('click', hideOnlineLobby);
    document.getElementById('lobby-code-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinByCode();
    });

    // Create table form
    document.querySelectorAll('.btn-table-time').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectedTimeControl = parseInt(e.target.dataset.time);
            createTableAndJoinLobby();
        });
    });
    document.getElementById('btn-cancel-create-table').addEventListener('click', hideCreateTableForm);

    // Rules screen
    document.getElementById('btn-back-rules').addEventListener('click', () => {
        UI.showScreen('menu-screen');
    });

    // Game controls
    document.getElementById('btn-resign').addEventListener('click', resignGame);
    document.getElementById('btn-new-game').addEventListener('click', returnToMenu);
}

// Show AI difficulty selection
function showDifficultySelect() {
    UI.hide('join-form');
    UI.hide('waiting-room');
    UI.hide('time-control-select');
    UI.show('ai-difficulty-select');
}

// Hide AI difficulty selection
function hideDifficultySelect() {
    UI.hide('ai-difficulty-select');
}

// Show time control selection
function showTimeControl(gameType) {
    pendingGameType = gameType;
    UI.hide('join-form');
    UI.hide('waiting-room');
    UI.hide('ai-difficulty-select');
    UI.show('time-control-select');
    // Reset selection highlight
    document.querySelectorAll('.btn-time').forEach(b => b.classList.remove('selected'));
}

// Hide time control selection
function hideTimeControl() {
    UI.hide('time-control-select');
    pendingGameType = null;
}

// Confirm time control and proceed
function confirmTimeControl() {
    if (pendingGameType === 'create') {
        createOnlineGame();
    } else if (pendingGameType === 'local') {
        startLocalGame();
    } else if (pendingGameType === 'ai') {
        startAIGame();
    }
}

// Create online game
function createOnlineGame() {
    socket.emit('createGame', { timeControl: selectedTimeControl });
}

// Show join form
function showJoinForm() {
    UI.hide('time-control-select');
    UI.hide('ai-difficulty-select');
    UI.show('join-form');
    document.getElementById('game-code-input').value = '';
    document.getElementById('game-code-input').focus();
}

// Hide join form
function hideJoinForm() {
    UI.hide('join-form');
}

// Join existing game
function joinGame() {
    const gameId = document.getElementById('game-code-input').value.trim().toUpperCase();
    if (gameId.length === 6) {
        socket.emit('joinGame', { gameId });
    } else {
        Sounds.invalid();
        alert('Please enter a valid 6-character game code');
    }
}

// Cancel waiting for opponent
function cancelWaiting() {
    if (currentGameId) {
        socket.emit('cancelGame', { gameId: currentGameId });
    }
    currentGameId = null;
    UI.hide('waiting-room');
    UI.show('online-lobby');
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
    UI.hide('time-control-select');
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
    UI.hide('time-control-select');
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
    isLocalGame = false;
    isAIGame = false;
    playerColor = color;
    ai = null;

    game = new KalasRandomChess(gameState.timeControl || 10);
    game.loadState(gameState);

    // Save game for reconnection on refresh
    saveActiveGame();

    const boardElement = document.getElementById('chess-board');
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

    UI.updateGameInfo(game);
    UI.hideGameMessage();
    UI.hide('time-control-select');
    UI.hide('waiting-room');
    UI.showScreen('game-screen');

    // Update player status indicators
    document.getElementById('white-status').textContent = color === 'white' ? '(You)' : '(Opponent)';
    document.getElementById('black-status').textContent = color === 'black' ? '(You)' : '(Opponent)';

    // Initialize timers and captured pieces
    updateTimerDisplay();
    updateCapturedPieces();
    game.startTimer();
    startTimerInterval();

    Sounds.gameStart();
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

    // Piece glyphs mapping
    const pieceGlyphs = {
        'K': '\u265A', 'Q': '\u265B', 'R': '\u265C', 'B': '\u265D', 'N': '\u265E', 'P': '\u265F',
        'k': '\u265A', 'q': '\u265B', 'r': '\u265C', 'b': '\u265D', 'n': '\u265E', 'p': '\u265F'
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
    pendingGameType = null;

    UI.hide('waiting-room');
    UI.hide('join-form');
    UI.hide('time-control-select');
    UI.hide('ai-difficulty-select');
    UI.hide('online-lobby');
    UI.hide('create-table-form');
    UI.hideGameMessage();
    UI.showAIThinking(false);
    UI.showScreen('menu-screen');
}

// Show online lobby
function showOnlineLobby() {
    UI.hide('time-control-select');
    UI.hide('ai-difficulty-select');
    UI.hide('join-form');
    UI.hide('waiting-room');
    UI.hide('create-table-form');
    UI.show('online-lobby');
    // Request fresh lobby data
    socket.emit('getLobby');
}

// Hide online lobby
function hideOnlineLobby() {
    UI.hide('online-lobby');
    UI.hide('create-table-form');
}

// Show create table form
function showCreateTableForm() {
    UI.hide('online-lobby');
    UI.show('create-table-form');
}

// Hide create table form
function hideCreateTableForm() {
    UI.hide('create-table-form');
    UI.show('online-lobby');
}

// Create table and show in lobby
function createTableAndJoinLobby() {
    socket.emit('createGame', { timeControl: selectedTimeControl });
    UI.hide('create-table-form');
    UI.hide('online-lobby');
}

// Join game by code from lobby
function joinByCode() {
    const gameId = document.getElementById('lobby-code-input').value.trim().toUpperCase();
    if (gameId.length === 6) {
        socket.emit('joinGame', { gameId });
    } else {
        Sounds.invalid();
        alert('Please enter a valid 6-character game code');
    }
}

// Join a table from lobby
function joinTable(gameId) {
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
        tablesList.innerHTML = '<p class="no-tables">No tables available. Create one!</p>';
        return;
    }

    tablesList.innerHTML = availableGames.map(game => `
        <div class="table-item">
            <div class="table-info">
                <span class="table-time">${formatTimeControl(game.timeControl)}</span>
                <span class="table-code">#${game.gameId}</span>
            </div>
            <button class="btn-join-table" onclick="joinTable('${game.gameId}')">Join</button>
        </div>
    `).join('');
}
