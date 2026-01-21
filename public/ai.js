// Kalas Random Chess - AI Engine

class ChessAI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.maxDepth = this.getDepthForDifficulty();
        this.positionsEvaluated = 0;
    }

    // Set difficulty and adjust parameters
    setDifficulty(difficulty) {
        this.difficulty = difficulty;
        this.maxDepth = this.getDepthForDifficulty();
    }

    // Get search depth based on difficulty
    getDepthForDifficulty() {
        switch (this.difficulty) {
            case 'easy': return 1;
            case 'medium': return 3;
            case 'hard': return 4;
            default: return 3;
        }
    }

    // Piece values for evaluation
    static PIECE_VALUES = {
        '♙': 100, '♟': -100,   // Pawns
        '♘': 320, '♞': -320,   // Knights
        '♗': 330, '♝': -330,   // Bishops
        '♖': 500, '♜': -500,   // Rooks
        '♕': 900, '♛': -900,   // Queens
        '♔': 20000, '♚': -20000 // Kings
    };

    // Piece-square tables for positional evaluation
    // Values from white's perspective (flip for black)
    static PAWN_TABLE = [
        0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
        5,  5, 10, 25, 25, 10,  5,  5,
        0,  0,  0, 20, 20,  0,  0,  0,
        5, -5,-10,  0,  0,-10, -5,  5,
        5, 10, 10,-20,-20, 10, 10,  5,
        0,  0,  0,  0,  0,  0,  0,  0
    ];

    static KNIGHT_TABLE = [
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50
    ];

    static BISHOP_TABLE = [
        -20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20
    ];

    static ROOK_TABLE = [
        0,  0,  0,  0,  0,  0,  0,  0,
        5, 10, 10, 10, 10, 10, 10,  5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        0,  0,  0,  5,  5,  0,  0,  0
    ];

    static QUEEN_TABLE = [
        -20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
        -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20
    ];

    static KING_TABLE = [
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
        20, 20,  0,  0,  0,  0, 20, 20,
        20, 30, 10,  0,  0, 10, 30, 20
    ];

    // Get piece-square table value
    getPieceSquareValue(piece, index, isWhite) {
        let table;
        const pieceType = piece.toLowerCase();

        switch (piece) {
            case '♙': case '♟': table = ChessAI.PAWN_TABLE; break;
            case '♘': case '♞': table = ChessAI.KNIGHT_TABLE; break;
            case '♗': case '♝': table = ChessAI.BISHOP_TABLE; break;
            case '♖': case '♜': table = ChessAI.ROOK_TABLE; break;
            case '♕': case '♛': table = ChessAI.QUEEN_TABLE; break;
            case '♔': case '♚': table = ChessAI.KING_TABLE; break;
            default: return 0;
        }

        // Flip index for black pieces (they see board from opposite side)
        const row = Math.floor(index / 8);
        const col = index % 8;
        const adjustedIndex = isWhite ? ((7 - row) * 8 + col) : (row * 8 + col);

        return isWhite ? table[adjustedIndex] : -table[adjustedIndex];
    }

    // Evaluate the board position
    // Positive = good for white, Negative = good for black
    evaluatePosition(game) {
        if (game.gameOver) {
            if (game.winner === 'white') return 100000;
            if (game.winner === 'black') return -100000;
            return 0; // Stalemate
        }

        let score = 0;

        // Material and positional evaluation
        for (let i = 0; i < 64; i++) {
            const piece = game.board[i];
            if (!piece) continue;

            const isWhite = game.isWhitePiece(piece);

            // Material value
            score += ChessAI.PIECE_VALUES[piece] || 0;

            // Positional value
            score += this.getPieceSquareValue(piece, i, isWhite);
        }

        // Mobility bonus (number of legal moves)
        const currentTurn = game.currentTurn;

        // Count moves for current player
        let whiteMobility = 0;
        let blackMobility = 0;

        for (let i = 0; i < 64; i++) {
            const piece = game.board[i];
            if (!piece) continue;

            // Temporarily set turn to count moves
            if (game.isWhitePiece(piece)) {
                game.currentTurn = 'white';
                whiteMobility += game.getValidMoves(i).length;
            } else {
                game.currentTurn = 'black';
                blackMobility += game.getValidMoves(i).length;
            }
        }

        // Restore turn
        game.currentTurn = currentTurn;

        // Add mobility bonus (small weight)
        score += (whiteMobility - blackMobility) * 5;

        // Check bonus
        if (game.isInCheck('black')) score += 50;
        if (game.isInCheck('white')) score -= 50;

        // Add small random factor for easy mode to make it less predictable
        if (this.difficulty === 'easy') {
            score += (Math.random() - 0.5) * 50;
        }

        return score;
    }

    // Get all possible moves for a color
    getAllMoves(game, color) {
        const moves = [];
        const originalTurn = game.currentTurn;
        game.currentTurn = color;

        for (let i = 0; i < 64; i++) {
            const piece = game.board[i];
            if (!piece) continue;
            if (game.getPieceColor(piece) !== color) continue;

            const pieceMoves = game.getValidMoves(i);
            for (const move of pieceMoves) {
                moves.push({
                    from: i,
                    to: move.to,
                    isCapture: move.isCapture
                });
            }
        }

        game.currentTurn = originalTurn;
        return moves;
    }

    // Make a temporary move and return undo function
    makeTemporaryMove(game, from, to) {
        const capturedPiece = game.board[to];
        const movedPiece = game.board[from];
        const oldTurn = game.currentTurn;
        const oldMoveNumber = game.moveNumber;

        game.board[to] = movedPiece;
        game.board[from] = null;

        // Handle pawn promotion
        let promoted = false;
        if ((movedPiece === '♙' && game.getRow(to) === 7) ||
            (movedPiece === '♟' && game.getRow(to) === 0)) {
            game.board[to] = game.isWhitePiece(movedPiece) ? '♕' : '♛';
            promoted = true;
        }

        // Switch turn
        if (game.currentTurn === 'black') {
            game.moveNumber++;
        }
        game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';

        // Return undo function
        return () => {
            game.board[from] = movedPiece;
            game.board[to] = capturedPiece;
            game.currentTurn = oldTurn;
            game.moveNumber = oldMoveNumber;
        };
    }

    // Minimax with alpha-beta pruning
    minimax(game, depth, alpha, beta, isMaximizing) {
        this.positionsEvaluated++;

        // Terminal conditions
        if (depth === 0) {
            return this.evaluatePosition(game);
        }

        const color = isMaximizing ? 'white' : 'black';
        const moves = this.getAllMoves(game, color);

        // No moves available - check for checkmate/stalemate
        if (moves.length === 0) {
            if (game.isInCheck(color)) {
                // Checkmate - worst possible score
                return isMaximizing ? -100000 + (this.maxDepth - depth) : 100000 - (this.maxDepth - depth);
            }
            // Stalemate
            return 0;
        }

        // Order moves to improve alpha-beta pruning
        // Captures first, then by piece value
        moves.sort((a, b) => {
            if (a.isCapture && !b.isCapture) return -1;
            if (!a.isCapture && b.isCapture) return 1;
            return 0;
        });

        if (isMaximizing) {
            let maxEval = -Infinity;

            for (const move of moves) {
                const undo = this.makeTemporaryMove(game, move.from, move.to);
                const evalScore = this.minimax(game, depth - 1, alpha, beta, false);
                undo();

                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);

                if (beta <= alpha) break; // Beta cutoff
            }

            return maxEval;
        } else {
            let minEval = Infinity;

            for (const move of moves) {
                const undo = this.makeTemporaryMove(game, move.from, move.to);
                const evalScore = this.minimax(game, depth - 1, alpha, beta, true);
                undo();

                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);

                if (beta <= alpha) break; // Alpha cutoff
            }

            return minEval;
        }
    }

    // Find the best move for the AI
    findBestMove(game) {
        this.positionsEvaluated = 0;
        const startTime = Date.now();

        const aiColor = game.currentTurn;
        const isMaximizing = aiColor === 'white';
        const moves = this.getAllMoves(game, aiColor);

        if (moves.length === 0) {
            return null;
        }

        // For easy mode, sometimes make random moves
        if (this.difficulty === 'easy' && Math.random() < 0.3) {
            const randomIndex = Math.floor(Math.random() * moves.length);
            return moves[randomIndex];
        }

        let bestMove = null;
        let bestScore = isMaximizing ? -Infinity : Infinity;

        // Order moves for better pruning
        moves.sort((a, b) => {
            if (a.isCapture && !b.isCapture) return -1;
            if (!a.isCapture && b.isCapture) return 1;
            return 0;
        });

        for (const move of moves) {
            const undo = this.makeTemporaryMove(game, move.from, move.to);
            const score = this.minimax(game, this.maxDepth - 1, -Infinity, Infinity, !isMaximizing);
            undo();

            if (isMaximizing) {
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = move;
                }
            } else {
                if (score < bestScore) {
                    bestScore = score;
                    bestMove = move;
                }
            }
        }

        const elapsed = Date.now() - startTime;
        console.log(`AI (${this.difficulty}): Evaluated ${this.positionsEvaluated} positions in ${elapsed}ms`);
        console.log(`Best move: ${bestMove?.from} -> ${bestMove?.to} (score: ${bestScore})`);

        // For medium difficulty, occasionally miss the best move
        if (this.difficulty === 'medium' && Math.random() < 0.15 && moves.length > 1) {
            // Pick a random move from top 3
            const topMoves = moves.slice(0, Math.min(3, moves.length));
            return topMoves[Math.floor(Math.random() * topMoves.length)];
        }

        return bestMove;
    }

    // Async version with delay for better UX
    async findBestMoveAsync(game, minDelay = 500) {
        const startTime = Date.now();
        const move = this.findBestMove(game);
        const elapsed = Date.now() - startTime;

        // Add artificial delay for UX (so AI doesn't move instantly)
        if (elapsed < minDelay) {
            await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
        }

        return move;
    }
}

// Export for browser use
if (typeof window !== 'undefined') {
    window.ChessAI = ChessAI;
}
