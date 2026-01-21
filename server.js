// Kalas Random Chess - Server

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Import game logic (for server-side validation)
const { KalasRandomChess } = require('./public/game-logic.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game storage
const games = new Map();
const playerGames = new Map(); // socket.id -> gameId
const timerIntervals = new Map(); // gameId -> interval

// Get list of waiting games for lobby
function getWaitingGames() {
    const waitingGames = [];
    for (const [gameId, gameData] of games.entries()) {
        if (gameData.state === 'waiting') {
            waitingGames.push({
                gameId,
                timeControl: gameData.timeControl,
                createdAt: gameData.createdAt || Date.now()
            });
        }
    }
    return waitingGames;
}

// Broadcast lobby update to all connected clients
function broadcastLobbyUpdate() {
    io.emit('lobbyUpdate', { games: getWaitingGames() });
}

// Generate random 6-character game code
function generateGameCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (games.has(code)) {
        return generateGameCode();
    }
    return code;
}

// Start timer interval for a game
function startGameTimer(gameId) {
    stopGameTimer(gameId); // Clear any existing

    const interval = setInterval(() => {
        const gameData = games.get(gameId);
        if (!gameData || gameData.state !== 'playing') {
            stopGameTimer(gameId);
            return;
        }

        // Update time on server
        gameData.game.updateTime();

        // Check for timeout
        const timeout = gameData.game.checkTimeout();
        if (timeout) {
            stopGameTimer(gameId);
            gameData.state = 'finished';

            // Notify both players
            io.to(gameData.white).emit('timeout', timeout);
            io.to(gameData.black).emit('timeout', timeout);
            return;
        }

        // Sync timers to both players periodically (every second)
        io.to(gameId).emit('timerSync', {
            whiteTime: gameData.game.whiteTime,
            blackTime: gameData.game.blackTime
        });
    }, 1000); // Update every second

    timerIntervals.set(gameId, interval);
}

// Stop timer interval for a game
function stopGameTimer(gameId) {
    const interval = timerIntervals.get(gameId);
    if (interval) {
        clearInterval(interval);
        timerIntervals.delete(gameId);
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Send current lobby state when client connects
    socket.emit('lobbyUpdate', { games: getWaitingGames() });

    // Client requests lobby update
    socket.on('getLobby', () => {
        socket.emit('lobbyUpdate', { games: getWaitingGames() });
    });

    // Create a new game
    socket.on('createGame', (data) => {
        const timeControl = data?.timeControl || 10; // Default 10 minutes
        const gameId = generateGameCode();
        const game = new KalasRandomChess(timeControl);
        game.generateStartingPosition();

        games.set(gameId, {
            game: game,
            white: socket.id,
            black: null,
            state: 'waiting', // waiting, playing, finished
            timeControl: timeControl,
            createdAt: Date.now()
        });

        playerGames.set(socket.id, gameId);
        socket.join(gameId);

        socket.emit('gameCreated', { gameId, timeControl });
        broadcastLobbyUpdate(); // Notify all clients about new game
        console.log(`Game created: ${gameId} by ${socket.id} (${timeControl} min)`);
    });

    // Join an existing game
    socket.on('joinGame', ({ gameId }) => {
        const gameData = games.get(gameId);

        if (!gameData) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }

        if (gameData.state !== 'waiting') {
            socket.emit('error', { message: 'Game already in progress' });
            return;
        }

        const creatorId = gameData.white; // Creator was temporarily stored as white
        if (creatorId === socket.id) {
            socket.emit('error', { message: 'Cannot join your own game' });
            return;
        }

        // Randomly assign colors
        const creatorIsWhite = Math.random() < 0.5;
        if (creatorIsWhite) {
            gameData.white = creatorId;
            gameData.black = socket.id;
        } else {
            gameData.white = socket.id;
            gameData.black = creatorId;
        }

        gameData.state = 'playing';
        playerGames.set(socket.id, gameId);
        socket.join(gameId);

        // Start the game timer
        gameData.game.startTimer();
        startGameTimer(gameId);

        // Notify both players
        const gameState = gameData.game.getState();

        // Notify the joining player
        socket.emit('gameJoined', {
            gameId,
            color: creatorIsWhite ? 'black' : 'white',
            gameState
        });

        // Notify the creating player
        io.to(creatorId).emit('gameStart', {
            gameId,
            color: creatorIsWhite ? 'white' : 'black',
            gameState
        });

        broadcastLobbyUpdate(); // Game is no longer waiting
        console.log(`Player ${socket.id} joined game ${gameId}`);
    });

    // Make a move
    socket.on('makeMove', ({ gameId, move }) => {
        const gameData = games.get(gameId);

        if (!gameData) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }

        if (gameData.state !== 'playing') {
            socket.emit('error', { message: 'Game not in progress' });
            return;
        }

        // Verify it's this player's turn
        const playerColor = gameData.white === socket.id ? 'white' : 'black';
        if (gameData.game.currentTurn !== playerColor) {
            socket.emit('error', { message: 'Not your turn' });
            return;
        }

        // Update time before making move
        gameData.game.updateTime();

        // Make the move on server
        const result = gameData.game.makeMove(move.from, move.to);

        if (!result.success) {
            socket.emit('error', { message: result.error });
            return;
        }

        // Reset timestamp for the new player's turn
        gameData.game.lastTimestamp = Date.now();

        // Broadcast to opponent
        const opponentId = playerColor === 'white' ? gameData.black : gameData.white;
        io.to(opponentId).emit('moveMade', {
            gameState: gameData.game.getState(),
            gameStatus: result.gameStatus
        });

        // Check if game is over
        if (result.gameStatus && result.gameStatus.gameOver) {
            gameData.state = 'finished';
            stopGameTimer(gameId);
        }
    });

    // Handle timeout notification from client
    socket.on('timeout', ({ gameId }) => {
        const gameData = games.get(gameId);

        if (!gameData || gameData.state !== 'playing') {
            return;
        }

        // Verify timeout on server
        const timeout = gameData.game.checkTimeout();
        if (timeout) {
            gameData.state = 'finished';
            stopGameTimer(gameId);

            // Notify opponent
            const playerColor = gameData.white === socket.id ? 'white' : 'black';
            const opponentId = playerColor === 'white' ? gameData.black : gameData.white;
            io.to(opponentId).emit('timeout', timeout);
        }
    });

    // Player resigns
    socket.on('resign', ({ gameId }) => {
        const gameData = games.get(gameId);

        if (!gameData || gameData.state !== 'playing') {
            return;
        }

        const playerColor = gameData.white === socket.id ? 'white' : 'black';
        const opponentId = playerColor === 'white' ? gameData.black : gameData.white;

        gameData.state = 'finished';
        stopGameTimer(gameId);
        gameData.game.resign(playerColor);

        io.to(opponentId).emit('opponentResigned', {
            gameState: gameData.game.getState()
        });
    });

    // Cancel waiting game
    socket.on('cancelGame', ({ gameId }) => {
        const gameData = games.get(gameId);

        if (gameData && gameData.state === 'waiting' && gameData.white === socket.id) {
            games.delete(gameId);
            playerGames.delete(socket.id);
            socket.leave(gameId);
            broadcastLobbyUpdate(); // Game removed from lobby
            console.log(`Game cancelled: ${gameId}`);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);

        const gameId = playerGames.get(socket.id);
        if (gameId) {
            const gameData = games.get(gameId);

            if (gameData) {
                if (gameData.state === 'waiting') {
                    // Delete waiting game
                    games.delete(gameId);
                    broadcastLobbyUpdate(); // Game removed from lobby
                } else if (gameData.state === 'playing') {
                    // Stop timer and notify opponent
                    stopGameTimer(gameId);
                    const opponentId = gameData.white === socket.id ? gameData.black : gameData.white;
                    if (opponentId) {
                        io.to(opponentId).emit('opponentDisconnected');
                    }
                    gameData.state = 'finished';
                }
            }

            playerGames.delete(socket.id);
        }
    });
});

// Cleanup old games periodically (every 30 minutes)
setInterval(() => {
    for (const [gameId, gameData] of games.entries()) {
        if (gameData.state === 'finished') {
            stopGameTimer(gameId);
            games.delete(gameId);
        }
    }
    console.log(`Active games: ${games.size}`);
}, 30 * 60 * 1000);

// Start server
server.listen(PORT, () => {
    console.log(`Kalas Random Chess server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
