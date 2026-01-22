// Kalas Random Chess - Game Logic

const PIECES = {
    // Internal markers - will be rendered as filled glyphs with CSS colors
    WHITE_KING: 'K',
    WHITE_QUEEN: 'Q',
    WHITE_ROOK: 'R',
    WHITE_BISHOP: 'B',
    WHITE_KNIGHT: 'N',
    WHITE_PAWN: 'P',
    BLACK_KING: 'k',
    BLACK_QUEEN: 'q',
    BLACK_ROOK: 'r',
    BLACK_BISHOP: 'b',
    BLACK_KNIGHT: 'n',
    BLACK_PAWN: 'p'
};

// Map internal markers to display glyphs
// White uses outline glyphs, Black uses filled glyphs
const PIECE_GLYPHS = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

const PIECE_VALUES = {
    'K': 'K', 'k': 'k',
    'Q': 'Q', 'q': 'q',
    'R': 'R', 'r': 'r',
    'B': 'B', 'b': 'b',
    'N': 'N', 'n': 'n',
    'P': 'P', 'p': 'p'
};

class KalasRandomChess {
    constructor(timeControl = 10) {
        this.board = new Array(64).fill(null);
        this.currentTurn = 'white';
        this.moveNumber = 1;
        this.turnCount = 1; // Track individual turns (1, 2, 3, 4, ...)
        this.gameOver = false;
        this.winner = null;
        this.lastMove = null;
        this.moveHistory = [];
        this.enPassantTarget = null; // Square where en passant capture is possible

        // Timer properties (time in milliseconds)
        this.timeControl = timeControl; // minutes
        this.whiteTime = timeControl * 60 * 1000;
        this.blackTime = timeControl * 60 * 1000;
        this.lastTimestamp = null;
        this.timerRunning = false;
    }

    // Convert between different coordinate systems
    // Space number (1-64) to array index (0-63)
    spaceToIndex(space) {
        return space - 1;
    }

    // Array index (0-63) to space number (1-64)
    indexToSpace(index) {
        return index + 1;
    }

    // Array index to algebraic notation (e.g., 0 -> 'a1', 63 -> 'h8')
    indexToAlgebraic(index) {
        const file = String.fromCharCode(97 + (index % 8)); // a-h
        const rank = Math.floor(index / 8) + 1; // 1-8
        return file + rank;
    }

    // Algebraic notation to array index
    algebraicToIndex(algebraic) {
        const file = algebraic.charCodeAt(0) - 97; // 0-7
        const rank = parseInt(algebraic[1]) - 1; // 0-7
        return rank * 8 + file;
    }

    // Get row (0-7) from index
    getRow(index) {
        return Math.floor(index / 8);
    }

    // Get column (0-7) from index
    getCol(index) {
        return index % 8;
    }

    // Check if a piece is white (uppercase letters)
    isWhitePiece(piece) {
        return piece && 'KQRBNP'.includes(piece);
    }

    // Check if a piece is black (lowercase letters)
    isBlackPiece(piece) {
        return piece && 'kqrbnp'.includes(piece);
    }

    // Get piece color
    getPieceColor(piece) {
        if (this.isWhitePiece(piece)) return 'white';
        if (this.isBlackPiece(piece)) return 'black';
        return null;
    }

    // Generate random Kalas starting position
    generateStartingPosition() {
        this.board = new Array(64).fill(null);

        // Helper to get random element and remove from array
        const pickRandom = (arr) => {
            const index = Math.floor(Math.random() * arr.length);
            return arr.splice(index, 1)[0];
        };

        // Available squares for each zone (converted to 0-indexed)
        // White king: spaces #1-8 (indices 0-7, rank 1)
        let whiteKingZone = [0, 1, 2, 3, 4, 5, 6, 7];

        // White pawns: spaces #9-32 (indices 8-31, ranks 2-4)
        let whitePawnZone = [];
        for (let i = 8; i <= 31; i++) whitePawnZone.push(i);

        // White pieces: spaces #1-24 (indices 0-23, ranks 1-3) - remaining after king
        let whitePieceZone = [];
        for (let i = 0; i <= 23; i++) whitePieceZone.push(i);

        // Black king: spaces #57-64 (indices 56-63, rank 8)
        let blackKingZone = [56, 57, 58, 59, 60, 61, 62, 63];

        // Black pawns: spaces #25-56 (indices 24-55, ranks 4-7)
        let blackPawnZone = [];
        for (let i = 24; i <= 55; i++) blackPawnZone.push(i);

        // Black pieces: spaces #41-64 (indices 40-63, ranks 6-8) - remaining after king
        let blackPieceZone = [];
        for (let i = 40; i <= 63; i++) blackPieceZone.push(i);

        // Place White King
        const whiteKingPos = pickRandom(whiteKingZone);
        this.board[whiteKingPos] = PIECES.WHITE_KING;
        // Remove from piece zone
        whitePieceZone = whitePieceZone.filter(i => i !== whiteKingPos);

        // Place White Pawns (8)
        for (let i = 0; i < 8; i++) {
            const pos = pickRandom(whitePawnZone);
            this.board[pos] = PIECES.WHITE_PAWN;
            // Also remove from piece zone if overlapping
            whitePieceZone = whitePieceZone.filter(idx => idx !== pos);
        }

        // Place White Pieces (Q, R, R, B, B, N, N) - only on empty squares
        const whitePieces = [
            PIECES.WHITE_QUEEN,
            PIECES.WHITE_ROOK, PIECES.WHITE_ROOK,
            PIECES.WHITE_BISHOP, PIECES.WHITE_BISHOP,
            PIECES.WHITE_KNIGHT, PIECES.WHITE_KNIGHT
        ];
        // Filter to only empty squares in piece zone
        whitePieceZone = whitePieceZone.filter(idx => this.board[idx] === null);
        for (const piece of whitePieces) {
            const pos = pickRandom(whitePieceZone);
            this.board[pos] = piece;
        }

        // Place Black King
        const blackKingPos = pickRandom(blackKingZone);
        this.board[blackKingPos] = PIECES.BLACK_KING;
        // Remove from piece zone
        blackPieceZone = blackPieceZone.filter(i => i !== blackKingPos);

        // Filter black pawn zone to only empty squares (avoid overwriting white pawns on rank 4)
        blackPawnZone = blackPawnZone.filter(idx => this.board[idx] === null);

        // Place Black Pawns (8)
        for (let i = 0; i < 8; i++) {
            const pos = pickRandom(blackPawnZone);
            this.board[pos] = PIECES.BLACK_PAWN;
            // Also remove from piece zone if overlapping
            blackPieceZone = blackPieceZone.filter(idx => idx !== pos);
        }

        // Place Black Pieces (Q, R, R, B, B, N, N) - only on empty squares
        const blackPieces = [
            PIECES.BLACK_QUEEN,
            PIECES.BLACK_ROOK, PIECES.BLACK_ROOK,
            PIECES.BLACK_BISHOP, PIECES.BLACK_BISHOP,
            PIECES.BLACK_KNIGHT, PIECES.BLACK_KNIGHT
        ];
        // Filter to only empty squares in piece zone
        blackPieceZone = blackPieceZone.filter(idx => this.board[idx] === null);
        for (const piece of blackPieces) {
            const pos = pickRandom(blackPieceZone);
            this.board[pos] = piece;
        }

        return this.board;
    }

    // Check if captures are allowed for current move
    areCapturesAllowed() {
        // Turns 1, 2, 3: no captures allowed
        // Turn 1 = White's first, Turn 2 = Black's first, Turn 3 = White's second
        // Turn 4+ = normal play (captures allowed)
        return this.turnCount >= 4;
    }

    // Get all valid moves for a piece at given index
    getValidMoves(fromIndex) {
        const piece = this.board[fromIndex];
        if (!piece) return [];

        const pieceColor = this.getPieceColor(piece);
        if (pieceColor !== this.currentTurn) return [];

        let moves = [];
        const pieceType = piece.toLowerCase();

        switch (pieceType) {
            case 'p': // Pawn
                moves = this.getPawnMoves(fromIndex, pieceColor);
                break;
            case 'n': // Knight
                moves = this.getKnightMoves(fromIndex, pieceColor);
                break;
            case 'b': // Bishop
                moves = this.getBishopMoves(fromIndex, pieceColor);
                break;
            case 'r': // Rook
                moves = this.getRookMoves(fromIndex, pieceColor);
                break;
            case 'q': // Queen
                moves = this.getQueenMoves(fromIndex, pieceColor);
                break;
            case 'k': // King
                moves = this.getKingMoves(fromIndex, pieceColor);
                break;
        }

        // Filter out captures if not allowed
        if (!this.areCapturesAllowed()) {
            moves = moves.filter(move => !move.isCapture);
        }

        // Note: Players CAN make moves that leave their king in check
        // If they do, they lose the game (checked after the move)

        return moves;
    }

    // Pawn moves
    getPawnMoves(fromIndex, color) {
        const moves = [];
        const row = this.getRow(fromIndex);
        const col = this.getCol(fromIndex);
        const direction = color === 'white' ? 1 : -1;
        const startRow = color === 'white' ? 1 : 6; // 2nd rank for each color

        // Forward move (one square)
        const forwardOne = fromIndex + (8 * direction);
        if (forwardOne >= 0 && forwardOne < 64 && !this.board[forwardOne]) {
            moves.push({ to: forwardOne, isCapture: false });

            // Double move from starting rank
            if (row === startRow) {
                const forwardTwo = fromIndex + (16 * direction);
                if (forwardTwo >= 0 && forwardTwo < 64 && !this.board[forwardTwo]) {
                    moves.push({ to: forwardTwo, isCapture: false, isDoublePush: true });
                }
            }
        }

        // Diagonal captures
        const captureOffsets = [7, 9];
        for (const offset of captureOffsets) {
            const captureIndex = fromIndex + (offset * direction);
            const captureCol = this.getCol(captureIndex);

            // Check column difference to prevent wrapping
            if (Math.abs(captureCol - col) === 1 && captureIndex >= 0 && captureIndex < 64) {
                const targetPiece = this.board[captureIndex];
                if (targetPiece && this.getPieceColor(targetPiece) !== color) {
                    moves.push({ to: captureIndex, isCapture: true });
                }
            }
        }

        // En passant
        if (this.enPassantTarget !== null) {
            const epCol = this.getCol(this.enPassantTarget);
            // Check if pawn is adjacent to en passant target column and on correct rank
            const epRow = color === 'white' ? 4 : 3; // Row where en passant capture happens
            if (row === epRow && Math.abs(col - epCol) === 1) {
                // The en passant target is the square the capturing pawn moves to
                const epCaptureSquare = this.enPassantTarget;
                moves.push({ to: epCaptureSquare, isCapture: true, isEnPassant: true });
            }
        }

        return moves;
    }

    // Knight moves
    getKnightMoves(fromIndex, color) {
        const moves = [];
        const row = this.getRow(fromIndex);
        const col = this.getCol(fromIndex);

        const offsets = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];

        for (const [rowOff, colOff] of offsets) {
            const newRow = row + rowOff;
            const newCol = col + colOff;

            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                const toIndex = newRow * 8 + newCol;
                const targetPiece = this.board[toIndex];

                if (!targetPiece) {
                    moves.push({ to: toIndex, isCapture: false });
                } else if (this.getPieceColor(targetPiece) !== color) {
                    moves.push({ to: toIndex, isCapture: true });
                }
            }
        }

        return moves;
    }

    // Bishop moves (diagonal sliding)
    getBishopMoves(fromIndex, color) {
        return this.getSlidingMoves(fromIndex, color, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
    }

    // Rook moves (orthogonal sliding)
    getRookMoves(fromIndex, color) {
        return this.getSlidingMoves(fromIndex, color, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
    }

    // Queen moves (all directions)
    getQueenMoves(fromIndex, color) {
        return this.getSlidingMoves(fromIndex, color, [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ]);
    }

    // Generic sliding piece moves
    getSlidingMoves(fromIndex, color, directions) {
        const moves = [];
        const row = this.getRow(fromIndex);
        const col = this.getCol(fromIndex);

        for (const [rowDir, colDir] of directions) {
            let currentRow = row + rowDir;
            let currentCol = col + colDir;

            while (currentRow >= 0 && currentRow < 8 && currentCol >= 0 && currentCol < 8) {
                const toIndex = currentRow * 8 + currentCol;
                const targetPiece = this.board[toIndex];

                if (!targetPiece) {
                    moves.push({ to: toIndex, isCapture: false });
                } else {
                    if (this.getPieceColor(targetPiece) !== color) {
                        moves.push({ to: toIndex, isCapture: true });
                    }
                    break; // Blocked by piece
                }

                currentRow += rowDir;
                currentCol += colDir;
            }
        }

        return moves;
    }

    // King moves
    getKingMoves(fromIndex, color) {
        const moves = [];
        const row = this.getRow(fromIndex);
        const col = this.getCol(fromIndex);

        const offsets = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ];

        for (const [rowOff, colOff] of offsets) {
            const newRow = row + rowOff;
            const newCol = col + colOff;

            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                const toIndex = newRow * 8 + newCol;
                const targetPiece = this.board[toIndex];

                if (!targetPiece) {
                    moves.push({ to: toIndex, isCapture: false });
                } else if (this.getPieceColor(targetPiece) !== color) {
                    moves.push({ to: toIndex, isCapture: true });
                }
            }
        }

        return moves;
    }

    // Find king position for a color
    findKing(color) {
        const kingPiece = color === 'white' ? PIECES.WHITE_KING : PIECES.BLACK_KING;
        return this.board.findIndex(p => p === kingPiece);
    }

    // Check if a square is attacked by opponent
    isSquareAttacked(squareIndex, byColor) {
        for (let i = 0; i < 64; i++) {
            const piece = this.board[i];
            if (!piece || this.getPieceColor(piece) !== byColor) continue;

            // Get raw moves without checking for check (to avoid recursion)
            const pieceType = piece.toLowerCase();
            let attacks = [];

            switch (pieceType) {
                case 'p':
                    attacks = this.getPawnAttacks(i, byColor);
                    break;
                case 'n':
                    attacks = this.getKnightMoves(i, byColor).map(m => m.to);
                    break;
                case 'b':
                    attacks = this.getBishopMoves(i, byColor).map(m => m.to);
                    break;
                case 'r':
                    attacks = this.getRookMoves(i, byColor).map(m => m.to);
                    break;
                case 'q':
                    attacks = this.getQueenMoves(i, byColor).map(m => m.to);
                    break;
                case 'k':
                    attacks = this.getKingMoves(i, byColor).map(m => m.to);
                    break;
            }

            if (attacks.includes(squareIndex)) {
                return true;
            }
        }
        return false;
    }

    // Get pawn attack squares (not moves, just where they threaten)
    getPawnAttacks(fromIndex, color) {
        const attacks = [];
        const col = this.getCol(fromIndex);
        const direction = color === 'white' ? 1 : -1;

        const captureOffsets = [7, 9];
        for (const offset of captureOffsets) {
            const attackIndex = fromIndex + (offset * direction);
            const attackCol = this.getCol(attackIndex);

            if (Math.abs(attackCol - col) === 1 && attackIndex >= 0 && attackIndex < 64) {
                attacks.push(attackIndex);
            }
        }

        return attacks;
    }

    // Check if moving a piece would leave own king in check
    wouldBeInCheck(fromIndex, toIndex, color) {
        // Make temporary move
        const originalFrom = this.board[fromIndex];
        const originalTo = this.board[toIndex];

        this.board[toIndex] = originalFrom;
        this.board[fromIndex] = null;

        // Find king position (might have moved)
        const kingIndex = this.findKing(color);
        const opponentColor = color === 'white' ? 'black' : 'white';
        const inCheck = this.isSquareAttacked(kingIndex, opponentColor);

        // Undo move
        this.board[fromIndex] = originalFrom;
        this.board[toIndex] = originalTo;

        return inCheck;
    }

    // Check if current player is in check
    isInCheck(color) {
        const kingIndex = this.findKing(color);
        if (kingIndex === -1) return false;
        const opponentColor = color === 'white' ? 'black' : 'white';
        return this.isSquareAttacked(kingIndex, opponentColor);
    }

    // Check if current player has any valid moves
    hasValidMoves(color) {
        for (let i = 0; i < 64; i++) {
            const piece = this.board[i];
            if (piece && this.getPieceColor(piece) === color) {
                const moves = this.getValidMoves(i);
                if (moves.length > 0) return true;
            }
        }
        return false;
    }

    // Make a move
    makeMove(fromIndex, toIndex) {
        const piece = this.board[fromIndex];
        if (!piece) return { success: false, error: 'No piece at source' };

        const pieceColor = this.getPieceColor(piece);
        if (pieceColor !== this.currentTurn) {
            return { success: false, error: 'Not your turn' };
        }

        const validMoves = this.getValidMoves(fromIndex);
        const move = validMoves.find(m => m.to === toIndex);

        if (!move) {
            return { success: false, error: 'Invalid move' };
        }

        // Record the move
        let capturedPiece = this.board[toIndex];
        const moveRecord = {
            from: fromIndex,
            to: toIndex,
            piece: piece,
            captured: capturedPiece,
            moveNumber: this.moveNumber
        };

        // Handle en passant capture
        if (move.isEnPassant) {
            // The captured pawn is on a different square than where we're moving
            const capturedPawnIndex = toIndex + (pieceColor === 'white' ? -8 : 8);
            capturedPiece = this.board[capturedPawnIndex];
            moveRecord.captured = capturedPiece;
            moveRecord.isEnPassant = true;
            this.board[capturedPawnIndex] = null;
        }

        // Execute the move
        this.board[toIndex] = piece;
        this.board[fromIndex] = null;

        // Set en passant target if this was a double pawn push
        if (move.isDoublePush) {
            // En passant target is the square the pawn skipped over
            this.enPassantTarget = fromIndex + (8 * (pieceColor === 'white' ? 1 : -1));
        } else {
            this.enPassantTarget = null;
        }

        // Handle pawn promotion (auto-queen for simplicity)
        if ((piece === PIECES.WHITE_PAWN && this.getRow(toIndex) === 7) ||
            (piece === PIECES.BLACK_PAWN && this.getRow(toIndex) === 0)) {
            this.board[toIndex] = pieceColor === 'white' ? PIECES.WHITE_QUEEN : PIECES.BLACK_QUEEN;
            moveRecord.promotion = this.board[toIndex];
        }

        this.lastMove = { from: fromIndex, to: toIndex };
        this.moveHistory.push(moveRecord);

        // Update the timer for the player who just moved BEFORE switching turns
        this.updateTime();

        // Switch turn and increment counters
        if (this.currentTurn === 'black') {
            this.moveNumber++;
        }
        this.turnCount++; // Increment turn count for every move
        this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';

        // Reset the timestamp so the new player's timer starts fresh
        this.lastTimestamp = Date.now();

        // Check for game end conditions
        const gameStatus = this.checkGameStatus();

        return {
            success: true,
            move: moveRecord,
            gameStatus: gameStatus
        };
    }

    // Check game status (checkmate, stalemate, etc.)
    checkGameStatus() {
        const currentColor = this.currentTurn;
        const previousColor = currentColor === 'white' ? 'black' : 'white';

        // Check if the player who just moved left their own king in check
        // This means they lose the game
        if (this.isInCheck(previousColor)) {
            this.gameOver = true;
            this.winner = currentColor;
            return {
                gameOver: true,
                result: 'left-in-check',
                winner: this.winner,
                message: `${previousColor.charAt(0).toUpperCase() + previousColor.slice(1)} left their king in check and loses!`
            };
        }

        const inCheck = this.isInCheck(currentColor);
        const hasMoves = this.hasValidMoves(currentColor);

        if (!hasMoves) {
            this.gameOver = true;
            if (inCheck) {
                this.winner = currentColor === 'white' ? 'black' : 'white';
                return {
                    gameOver: true,
                    result: 'checkmate',
                    winner: this.winner,
                    message: `Checkmate! ${this.winner.charAt(0).toUpperCase() + this.winner.slice(1)} wins!`
                };
            } else {
                return {
                    gameOver: true,
                    result: 'stalemate',
                    winner: null,
                    message: 'Stalemate! The game is a draw.'
                };
            }
        }

        if (inCheck) {
            return {
                gameOver: false,
                inCheck: true,
                message: `${currentColor.charAt(0).toUpperCase() + currentColor.slice(1)} is in check!`
            };
        }

        return { gameOver: false };
    }

    // Get game state for syncing
    getState() {
        this.updateTime();
        return {
            board: [...this.board],
            currentTurn: this.currentTurn,
            moveNumber: this.moveNumber,
            turnCount: this.turnCount,
            gameOver: this.gameOver,
            winner: this.winner,
            lastMove: this.lastMove,
            capturesAllowed: this.areCapturesAllowed(),
            moveHistory: [...this.moveHistory],
            whiteTime: this.whiteTime,
            blackTime: this.blackTime,
            timeControl: this.timeControl,
            enPassantTarget: this.enPassantTarget
        };
    }

    // Load game state
    loadState(state) {
        this.board = [...state.board];
        this.currentTurn = state.currentTurn;
        this.moveNumber = state.moveNumber;
        this.turnCount = state.turnCount ?? (state.moveHistory ? state.moveHistory.length + 1 : 1);
        this.gameOver = state.gameOver || false;
        this.winner = state.winner || null;
        this.lastMove = state.lastMove || null;
        this.moveHistory = state.moveHistory || [];
        this.whiteTime = state.whiteTime ?? this.whiteTime;
        this.blackTime = state.blackTime ?? this.blackTime;
        this.timeControl = state.timeControl ?? this.timeControl;
        this.enPassantTarget = state.enPassantTarget ?? null;
    }

    // Resign
    resign(color) {
        this.gameOver = true;
        this.winner = color === 'white' ? 'black' : 'white';
        this.timerRunning = false;
        return {
            gameOver: true,
            result: 'resignation',
            winner: this.winner,
            message: `${color.charAt(0).toUpperCase() + color.slice(1)} resigned. ${this.winner.charAt(0).toUpperCase() + this.winner.slice(1)} wins!`
        };
    }

    // Check if game is untimed
    isUntimed() {
        return this.timeControl === 0;
    }

    // Timer methods
    startTimer() {
        if (this.isUntimed()) return; // Don't start timer for untimed games
        this.lastTimestamp = Date.now();
        this.timerRunning = true;
    }

    stopTimer() {
        if (this.timerRunning) {
            this.updateTime();
            this.timerRunning = false;
        }
    }

    // Update time for current player
    updateTime() {
        if (this.isUntimed()) return; // No time tracking for untimed games
        if (!this.timerRunning || !this.lastTimestamp) return;

        const now = Date.now();
        const elapsed = now - this.lastTimestamp;
        this.lastTimestamp = now;

        if (this.currentTurn === 'white') {
            this.whiteTime = Math.max(0, this.whiteTime - elapsed);
        } else {
            this.blackTime = Math.max(0, this.blackTime - elapsed);
        }
    }

    // Check if a player has run out of time
    checkTimeout() {
        if (this.isUntimed()) return null; // No timeout for untimed games
        this.updateTime();

        if (this.whiteTime <= 0) {
            this.gameOver = true;
            this.winner = 'black';
            this.timerRunning = false;
            return {
                gameOver: true,
                result: 'timeout',
                winner: 'black',
                message: 'White ran out of time! Black wins!'
            };
        }

        if (this.blackTime <= 0) {
            this.gameOver = true;
            this.winner = 'white';
            this.timerRunning = false;
            return {
                gameOver: true,
                result: 'timeout',
                winner: 'white',
                message: 'Black ran out of time! White wins!'
            };
        }

        return null;
    }

    // Get time remaining for a color (in milliseconds)
    getTimeRemaining(color) {
        this.updateTime();
        return color === 'white' ? this.whiteTime : this.blackTime;
    }

    // Format time as mm:ss
    formatTime(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Set time for a specific color (used for syncing in multiplayer)
    setTime(color, timeMs) {
        if (color === 'white') {
            this.whiteTime = timeMs;
        } else {
            this.blackTime = timeMs;
        }
    }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { KalasRandomChess, PIECES };
}
