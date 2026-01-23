// Tests for Kalas Random Chess game logic
const { KalasRandomChess, PIECES } = require('../public/game-logic.js');

describe('KalasRandomChess', () => {
    let game;

    beforeEach(() => {
        game = new KalasRandomChess(10);
    });

    describe('initialization', () => {
        test('creates empty 64-square board', () => {
            expect(game.board.length).toBe(64);
            expect(game.board.every(sq => sq === null)).toBe(true);
        });

        test('starts with white to move', () => {
            expect(game.currentTurn).toBe('white');
        });

        test('starts at move 1', () => {
            expect(game.moveNumber).toBe(1);
        });

        test('initializes timer correctly', () => {
            expect(game.timeControl).toBe(10);
            expect(game.whiteTime).toBe(10 * 60 * 1000);
            expect(game.blackTime).toBe(10 * 60 * 1000);
        });
    });

    describe('coordinate conversions', () => {
        test('indexToAlgebraic converts correctly', () => {
            expect(game.indexToAlgebraic(0)).toBe('a1');
            expect(game.indexToAlgebraic(7)).toBe('h1');
            expect(game.indexToAlgebraic(56)).toBe('a8');
            expect(game.indexToAlgebraic(63)).toBe('h8');
            expect(game.indexToAlgebraic(27)).toBe('d4');
        });

        test('algebraicToIndex converts correctly', () => {
            expect(game.algebraicToIndex('a1')).toBe(0);
            expect(game.algebraicToIndex('h1')).toBe(7);
            expect(game.algebraicToIndex('a8')).toBe(56);
            expect(game.algebraicToIndex('h8')).toBe(63);
            expect(game.algebraicToIndex('d4')).toBe(27);
        });

        test('getRow returns correct row', () => {
            expect(game.getRow(0)).toBe(0);
            expect(game.getRow(8)).toBe(1);
            expect(game.getRow(63)).toBe(7);
        });

        test('getCol returns correct column', () => {
            expect(game.getCol(0)).toBe(0);
            expect(game.getCol(7)).toBe(7);
            expect(game.getCol(8)).toBe(0);
        });
    });

    describe('piece identification', () => {
        test('isWhitePiece identifies white pieces', () => {
            expect(game.isWhitePiece('K')).toBe(true);
            expect(game.isWhitePiece('Q')).toBe(true);
            expect(game.isWhitePiece('P')).toBe(true);
            expect(game.isWhitePiece('k')).toBe(false);
            expect(game.isWhitePiece(null)).toBeFalsy();
        });

        test('isBlackPiece identifies black pieces', () => {
            expect(game.isBlackPiece('k')).toBe(true);
            expect(game.isBlackPiece('q')).toBe(true);
            expect(game.isBlackPiece('p')).toBe(true);
            expect(game.isBlackPiece('K')).toBe(false);
            expect(game.isBlackPiece(null)).toBeFalsy();
        });

        test('getPieceColor returns correct color', () => {
            expect(game.getPieceColor('K')).toBe('white');
            expect(game.getPieceColor('k')).toBe('black');
            expect(game.getPieceColor(null)).toBe(null);
        });
    });

    describe('generateStartingPosition', () => {
        beforeEach(() => {
            game.generateStartingPosition();
        });

        test('places exactly 32 pieces', () => {
            const pieceCount = game.board.filter(p => p !== null).length;
            expect(pieceCount).toBe(32);
        });

        test('places white king in back row (rank 1)', () => {
            const whiteKingIndex = game.board.findIndex(p => p === 'K');
            expect(whiteKingIndex).toBeGreaterThanOrEqual(0);
            expect(whiteKingIndex).toBeLessThan(8);
        });

        test('places black king in back row (rank 8)', () => {
            const blackKingIndex = game.board.findIndex(p => p === 'k');
            expect(blackKingIndex).toBeGreaterThanOrEqual(56);
            expect(blackKingIndex).toBeLessThan(64);
        });

        test('places 8 white pawns', () => {
            const whitePawnCount = game.board.filter(p => p === 'P').length;
            expect(whitePawnCount).toBe(8);
        });

        test('places 8 black pawns', () => {
            const blackPawnCount = game.board.filter(p => p === 'p').length;
            expect(blackPawnCount).toBe(8);
        });

        test('places white pawns in rows 2-4 (indices 8-31)', () => {
            for (let i = 0; i < 64; i++) {
                if (game.board[i] === 'P') {
                    expect(i).toBeGreaterThanOrEqual(8);
                    expect(i).toBeLessThan(32);
                }
            }
        });

        test('places black pawns in rows 5-7 (indices 32-55)', () => {
            for (let i = 0; i < 64; i++) {
                if (game.board[i] === 'p') {
                    expect(i).toBeGreaterThanOrEqual(32);
                    expect(i).toBeLessThan(56);
                }
            }
        });
    });

    describe('capture restrictions', () => {
        test('captures not allowed on turns 1-3', () => {
            game.turnCount = 1;
            expect(game.areCapturesAllowed()).toBe(false);
            game.turnCount = 2;
            expect(game.areCapturesAllowed()).toBe(false);
            game.turnCount = 3;
            expect(game.areCapturesAllowed()).toBe(false);
        });

        test('captures allowed from turn 4', () => {
            game.turnCount = 4;
            expect(game.areCapturesAllowed()).toBe(true);
            game.turnCount = 10;
            expect(game.areCapturesAllowed()).toBe(true);
        });
    });

    describe('knight moves', () => {
        test('knight in center has 8 moves', () => {
            game.board[27] = 'N'; // d4
            game.currentTurn = 'white';
            const moves = game.getKnightMoves(27, 'white');
            expect(moves.length).toBe(8);
        });

        test('knight in corner has 2 moves', () => {
            game.board[0] = 'N'; // a1
            game.currentTurn = 'white';
            const moves = game.getKnightMoves(0, 'white');
            expect(moves.length).toBe(2);
        });

        test('knight can capture enemy pieces', () => {
            game.board[27] = 'N'; // d4
            game.board[42] = 'p'; // c6 - enemy pawn
            game.currentTurn = 'white';
            const moves = game.getKnightMoves(27, 'white');
            const captureMove = moves.find(m => m.to === 42);
            expect(captureMove).toBeDefined();
            expect(captureMove.isCapture).toBe(true);
        });
    });

    describe('pawn moves', () => {
        test('white pawn on rank 2 can move 1 or 2 squares', () => {
            game.board[8] = 'P'; // a2
            game.currentTurn = 'white';
            const moves = game.getPawnMoves(8, 'white');
            expect(moves.length).toBe(2);
            expect(moves.some(m => m.to === 16)).toBe(true); // a3
            expect(moves.some(m => m.to === 24)).toBe(true); // a4
        });

        test('pawn cannot move forward if blocked', () => {
            game.board[8] = 'P'; // a2
            game.board[16] = 'p'; // a3 - blocking pawn
            game.currentTurn = 'white';
            const moves = game.getPawnMoves(8, 'white');
            expect(moves.length).toBe(0);
        });

        test('pawn can capture diagonally', () => {
            game.board[27] = 'P'; // d4
            game.board[36] = 'p'; // e5 - enemy pawn
            game.currentTurn = 'white';
            const moves = game.getPawnMoves(27, 'white');
            const captureMove = moves.find(m => m.to === 36);
            expect(captureMove).toBeDefined();
            expect(captureMove.isCapture).toBe(true);
        });
    });

    describe('makeMove', () => {
        beforeEach(() => {
            game.board[8] = 'P'; // white pawn on a2
            game.board[0] = 'K'; // white king on a1
            game.board[63] = 'k'; // black king on h8
            game.currentTurn = 'white';
            game.turnCount = 4; // Allow captures
        });

        test('valid move succeeds', () => {
            const result = game.makeMove(8, 16); // a2 to a3
            expect(result.success).toBe(true);
            expect(game.board[16]).toBe('P');
            expect(game.board[8]).toBe(null);
        });

        test('switches turn after move', () => {
            game.makeMove(8, 16);
            expect(game.currentTurn).toBe('black');
        });

        test('increments turn count', () => {
            const beforeTurnCount = game.turnCount;
            game.makeMove(8, 16);
            expect(game.turnCount).toBe(beforeTurnCount + 1);
        });

        test('rejects move from empty square', () => {
            const result = game.makeMove(32, 40);
            expect(result.success).toBe(false);
        });

        test('rejects move of wrong color piece', () => {
            game.board[48] = 'p'; // black pawn
            const result = game.makeMove(48, 40);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Not your turn');
        });
    });

    describe('check detection', () => {
        test('detects when king is in check', () => {
            game.board[0] = 'K'; // white king on a1
            game.board[8] = 'r'; // black rook on a2 - checking king
            expect(game.isInCheck('white')).toBe(true);
        });

        test('detects when king is not in check', () => {
            game.board[0] = 'K'; // white king on a1
            game.board[63] = 'k'; // black king on h8
            expect(game.isInCheck('white')).toBe(false);
        });
    });

    describe('game state', () => {
        test('getState returns complete state', () => {
            game.generateStartingPosition();
            const state = game.getState();
            expect(state.board).toBeDefined();
            expect(state.board.length).toBe(64);
            expect(state.currentTurn).toBe('white');
            expect(state.moveNumber).toBe(1);
            expect(state.whiteTime).toBeDefined();
            expect(state.blackTime).toBeDefined();
        });

        test('loadState restores game correctly', () => {
            game.generateStartingPosition();
            const originalState = game.getState();

            const newGame = new KalasRandomChess(10);
            newGame.loadState(originalState);

            expect(newGame.board).toEqual(originalState.board);
            expect(newGame.currentTurn).toBe(originalState.currentTurn);
        });
    });

    describe('resignation', () => {
        test('white resignation gives black the win', () => {
            const result = game.resign('white');
            expect(result.gameOver).toBe(true);
            expect(result.winner).toBe('black');
            expect(game.gameOver).toBe(true);
        });

        test('black resignation gives white the win', () => {
            const result = game.resign('black');
            expect(result.gameOver).toBe(true);
            expect(result.winner).toBe('white');
        });
    });

    describe('timer', () => {
        test('untimed games have no timeout', () => {
            const untimedGame = new KalasRandomChess(0);
            expect(untimedGame.isUntimed()).toBe(true);
            expect(untimedGame.checkTimeout()).toBe(null);
        });

        test('formatTime formats correctly', () => {
            expect(game.formatTime(600000)).toBe('10:00');
            expect(game.formatTime(65000)).toBe('1:05');
            expect(game.formatTime(5000)).toBe('0:05');
            expect(game.formatTime(0)).toBe('0:00');
        });
    });
});
