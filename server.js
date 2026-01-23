// Kalas Random Chess - Server

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Import game logic (for server-side validation)
const { KalasRandomChess } = require('./public/game-logic.js');

// Import auth and database
const { pool, initializeDatabase } = require('./db');
const authRouter = require('./auth');
const { calculateEloChanges } = require('./elo');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Auth routes
app.use('/auth', authRouter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Email verification redirect (serves the app which handles verification)
app.get('/verify', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game storage
const games = new Map();
const playerGames = new Map(); // socket.id -> gameId
const timerIntervals = new Map(); // gameId -> interval
const playerInfo = new Map(); // socket.id -> { odUserId, username, elo }

// Get list of waiting games for lobby
function getWaitingGames() {
    const waitingGames = [];
    for (const [gameId, gameData] of games.entries()) {
        if (gameData.state === 'waiting') {
            const creatorInfo = playerInfo.get(gameData.white);
            waitingGames.push({
                gameId,
                timeControl: gameData.timeControl,
                createdAt: gameData.createdAt || Date.now(),
                creator: creatorInfo ? {
                    username: creatorInfo.username,
                    elo: creatorInfo.elo
                } : null
            });
        }
    }
    return waitingGames;
}

// Update player ELO in database
async function updatePlayerElo(userId, newElo) {
    try {
        await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newElo, userId]);
    } catch (err) {
        console.error('Failed to update ELO:', err);
    }
}

// Process game result and update ELOs
async function processGameResult(gameData, winner) {
    const whiteInfo = playerInfo.get(gameData.white);
    const blackInfo = playerInfo.get(gameData.black);

    // Only update ELO if both players are logged in
    if (!whiteInfo?.userId || !blackInfo?.userId) {
        console.log('Skipping ELO update - not all players logged in');
        return null;
    }

    const result = winner === 'draw' ? 'draw' : winner;
    const eloChanges = calculateEloChanges(whiteInfo.elo, blackInfo.elo, result);

    // Update database
    await updatePlayerElo(whiteInfo.userId, eloChanges.whiteNewElo);
    await updatePlayerElo(blackInfo.userId, eloChanges.blackNewElo);

    // Update local cache
    whiteInfo.elo = eloChanges.whiteNewElo;
    blackInfo.elo = eloChanges.blackNewElo;

    console.log(`ELO updated: ${whiteInfo.username} ${eloChanges.whiteChange > 0 ? '+' : ''}${eloChanges.whiteChange}, ${blackInfo.username} ${eloChanges.blackChange > 0 ? '+' : ''}${eloChanges.blackChange}`);

    return eloChanges;
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

            // Calculate and update ELO for timeout
            processGameResult(gameData, timeout.winner).then(eloChanges => {
                if (eloChanges) {
                    io.to(gameData.white).emit('eloUpdate', {
                        change: eloChanges.whiteChange,
                        newElo: eloChanges.whiteNewElo
                    });
                    io.to(gameData.black).emit('eloUpdate', {
                        change: eloChanges.blackChange,
                        newElo: eloChanges.blackNewElo
                    });
                }
            });
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

    // Register player info (called when player logs in or page loads)
    socket.on('registerPlayer', (data) => {
        if (data && data.userId && data.username) {
            playerInfo.set(socket.id, {
                userId: data.userId,
                username: data.username,
                elo: data.elo || 1500
            });
            console.log(`Player registered: ${data.username} (ELO: ${data.elo})`);
        }
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
        const whitePlayerInfo = playerInfo.get(gameData.white);
        const blackPlayerInfo = playerInfo.get(gameData.black);

        const players = {
            white: whitePlayerInfo ? { username: whitePlayerInfo.username, elo: whitePlayerInfo.elo } : null,
            black: blackPlayerInfo ? { username: blackPlayerInfo.username, elo: blackPlayerInfo.elo } : null
        };

        // Notify the joining player
        socket.emit('gameJoined', {
            gameId,
            color: creatorIsWhite ? 'black' : 'white',
            gameState,
            players
        });

        // Notify the creating player
        io.to(creatorId).emit('gameStart', {
            gameId,
            color: creatorIsWhite ? 'white' : 'black',
            gameState,
            players
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

        const gameState = gameData.game.getState();

        // Send confirmation to the player who made the move
        socket.emit('moveConfirmed', {
            gameState: gameState,
            gameStatus: result.gameStatus
        });

        // Broadcast to opponent
        const opponentId = playerColor === 'white' ? gameData.black : gameData.white;
        console.log(`Move made by ${playerColor} (${socket.id}), sending to opponent ${opponentId}`);
        io.to(opponentId).emit('moveMade', {
            gameState: gameState,
            gameStatus: result.gameStatus
        });

        // Check if game is over
        if (result.gameStatus && result.gameStatus.gameOver) {
            gameData.state = 'finished';
            stopGameTimer(gameId);

            // Calculate and update ELO
            const winner = result.gameStatus.result === 'stalemate' ? 'draw' : result.gameStatus.winner;
            processGameResult(gameData, winner).then(eloChanges => {
                if (eloChanges) {
                    // Notify both players of ELO changes
                    io.to(gameData.white).emit('eloUpdate', {
                        change: eloChanges.whiteChange,
                        newElo: eloChanges.whiteNewElo
                    });
                    io.to(gameData.black).emit('eloUpdate', {
                        change: eloChanges.blackChange,
                        newElo: eloChanges.blackNewElo
                    });
                }
            });
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
        const winner = playerColor === 'white' ? 'black' : 'white';

        gameData.state = 'finished';
        stopGameTimer(gameId);
        gameData.game.resign(playerColor);

        io.to(opponentId).emit('opponentResigned', {
            gameState: gameData.game.getState()
        });

        // Calculate and update ELO for resignation
        processGameResult(gameData, winner).then(eloChanges => {
            if (eloChanges) {
                io.to(gameData.white).emit('eloUpdate', {
                    change: eloChanges.whiteChange,
                    newElo: eloChanges.whiteNewElo
                });
                io.to(gameData.black).emit('eloUpdate', {
                    change: eloChanges.blackChange,
                    newElo: eloChanges.blackNewElo
                });
            }
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

    // Handle reconnection to a game
    socket.on('reconnectGame', ({ gameId }) => {
        const gameData = games.get(gameId);

        if (!gameData || gameData.state !== 'paused') {
            socket.emit('error', { message: 'Game not found or not paused' });
            return;
        }

        // Determine which player is reconnecting
        const isWhite = gameData.disconnectedPlayer === 'white';
        const isBlack = gameData.disconnectedPlayer === 'black';

        if (!isWhite && !isBlack) {
            socket.emit('error', { message: 'No disconnected player to replace' });
            return;
        }

        // Update the player's socket ID
        if (isWhite) {
            gameData.white = socket.id;
        } else {
            gameData.black = socket.id;
        }

        playerGames.set(socket.id, gameId);
        socket.join(gameId);

        // Clear reconnect timeout
        if (gameData.reconnectTimeout) {
            clearTimeout(gameData.reconnectTimeout);
            delete gameData.reconnectTimeout;
        }

        // Resume the game
        gameData.state = 'playing';
        delete gameData.disconnectedPlayer;
        gameData.game.lastTimestamp = Date.now();
        startGameTimer(gameId);

        const gameState = gameData.game.getState();
        const playerColor = isWhite ? 'white' : 'black';

        // Notify reconnected player
        socket.emit('gameReconnected', {
            gameId,
            color: playerColor,
            gameState
        });

        // Notify opponent that player reconnected
        const opponentId = isWhite ? gameData.black : gameData.white;
        io.to(opponentId).emit('opponentReconnected', { gameState });

        console.log(`Player reconnected to game ${gameId} as ${playerColor}`);
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
                    // Pause the game and allow reconnection
                    stopGameTimer(gameId);
                    gameData.game.updateTime(); // Save current time

                    const playerColor = gameData.white === socket.id ? 'white' : 'black';
                    gameData.disconnectedPlayer = playerColor;
                    gameData.state = 'paused';

                    const opponentId = playerColor === 'white' ? gameData.black : gameData.white;
                    if (opponentId) {
                        io.to(opponentId).emit('opponentDisconnected', {
                            canReconnect: true,
                            gameId: gameId
                        });
                    }

                    // Set timeout for auto-forfeit (60 seconds)
                    gameData.reconnectTimeout = setTimeout(() => {
                        if (gameData.state === 'paused') {
                            gameData.state = 'finished';
                            const winner = playerColor === 'white' ? 'black' : 'white';
                            gameData.game.gameOver = true;
                            gameData.game.winner = winner;

                            if (opponentId) {
                                io.to(opponentId).emit('opponentForfeit', {
                                    winner: winner,
                                    message: `Opponent failed to reconnect. ${winner.charAt(0).toUpperCase() + winner.slice(1)} wins!`
                                });
                            }

                            // Calculate and update ELO for forfeit
                            processGameResult(gameData, winner).then(eloChanges => {
                                if (eloChanges && opponentId) {
                                    const isOpponentWhite = gameData.white !== socket.id;
                                    io.to(opponentId).emit('eloUpdate', {
                                        change: isOpponentWhite ? eloChanges.whiteChange : eloChanges.blackChange,
                                        newElo: isOpponentWhite ? eloChanges.whiteNewElo : eloChanges.blackNewElo
                                    });
                                }
                            });

                            console.log(`Game ${gameId} forfeited due to disconnect timeout`);
                        }
                    }, 60000); // 60 second reconnect window

                    console.log(`Game ${gameId} paused - waiting for ${playerColor} to reconnect`);
                }
            }

            playerGames.delete(socket.id);
        }

        // Clean up player info after a delay (in case they reconnect)
        setTimeout(() => {
            // Only delete if no new game associated with this socket
            if (!playerGames.has(socket.id)) {
                playerInfo.delete(socket.id);
            }
        }, 120000); // 2 minute delay
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
async function startServer() {
    await initializeDatabase();
    server.listen(PORT, () => {
        console.log(`Kalas Random Chess server running on port ${PORT}`);
        console.log(`Open http://localhost:${PORT} in your browser`);
    });
}

startServer();
