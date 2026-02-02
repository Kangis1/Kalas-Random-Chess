// Kalas Random Chess - UI Layer

class ChessBoardUI {
    constructor(boardElement, game) {
        this.boardElement = boardElement;
        this.game = game;
        this.selectedSquare = null;
        this.validMoves = [];
        this.playerColor = null; // 'white', 'black', or null for local game
        this.flipped = false;
        this.onMoveCallback = null;
        this.onSelectCallback = null;
        this.viewingHistory = false;
    }

    // Set callback for when a piece is selected
    onSelect(callback) {
        this.onSelectCallback = callback;
    }

    // Set the player's color (for online play)
    setPlayerColor(color) {
        this.playerColor = color;
        this.flipped = color === 'black';
        this.render();
    }

    // Set callback for when a move is made
    onMove(callback) {
        this.onMoveCallback = callback;
    }

    // Render the board
    render() {
        this.boardElement.innerHTML = '';

        // Render squares from perspective of player
        for (let visualRow = 7; visualRow >= 0; visualRow--) {
            for (let visualCol = 0; visualCol < 8; visualCol++) {
                // If board is flipped, reverse the mapping
                const actualRow = this.flipped ? 7 - visualRow : visualRow;
                const actualCol = this.flipped ? 7 - visualCol : visualCol;
                const index = actualRow * 8 + actualCol;

                const square = document.createElement('div');
                square.className = 'square';
                square.dataset.index = index;

                // Determine square color
                const isLightSquare = (actualRow + actualCol) % 2 === 1;
                square.classList.add(isLightSquare ? 'light' : 'dark');

                // Add piece if present
                const piece = this.game.board[index];
                if (piece) {
                    const pieceSpan = document.createElement('span');
                    pieceSpan.className = 'piece';
                    // Add color class for styling
                    if (this.game.isWhitePiece(piece)) {
                        pieceSpan.classList.add('white-piece');
                    } else if (this.game.isBlackPiece(piece)) {
                        pieceSpan.classList.add('black-piece');
                    }
                    // Render the glyph instead of the internal letter
                    pieceSpan.textContent = PIECE_GLYPHS[piece] || piece;
                    square.appendChild(pieceSpan);
                }

                // Highlight selected square
                if (this.selectedSquare === index) {
                    square.classList.add('selected');
                }

                // Valid move highlighting removed - players must figure out moves themselves

                // Highlight last move
                if (this.game.lastMove) {
                    if (index === this.game.lastMove.from || index === this.game.lastMove.to) {
                        square.classList.add('last-move');
                    }
                }

                // Highlight king in check
                const currentColor = this.game.currentTurn;
                if (this.game.isInCheck(currentColor)) {
                    const kingIndex = this.game.findKing(currentColor);
                    if (index === kingIndex) {
                        square.classList.add('in-check');
                    }
                }

                // Add click handler
                square.addEventListener('click', () => this.handleSquareClick(index));

                this.boardElement.appendChild(square);
            }
        }
    }

    // Handle square click
    handleSquareClick(index) {
        if (this.game.gameOver) return;
        if (this.viewingHistory) return;

        // In online mode, only allow moves on player's turn
        if (this.playerColor && this.playerColor !== this.game.currentTurn) {
            return;
        }

        const piece = this.game.board[index];
        const pieceColor = piece ? this.game.getPieceColor(piece) : null;

        // If a square is already selected
        if (this.selectedSquare !== null) {
            // Check if clicking on a valid move
            const validMove = this.validMoves.find(m => m.to === index);

            if (validMove) {
                // Make the move
                this.makeMove(this.selectedSquare, index);
                this.clearSelection();
                return;
            }

            // If clicking on own piece, select it instead
            if (piece && pieceColor === this.game.currentTurn) {
                this.selectSquare(index);
                return;
            }

            // Otherwise, clear selection
            this.clearSelection();
            return;
        }

        // No square selected - try to select this one
        if (piece && pieceColor === this.game.currentTurn) {
            this.selectSquare(index);
        }
    }

    // Select a square
    selectSquare(index) {
        this.selectedSquare = index;
        this.validMoves = this.game.getValidMoves(index);
        this.render();

        if (this.onSelectCallback) {
            this.onSelectCallback(index);
        }
    }

    // Clear selection
    clearSelection() {
        this.selectedSquare = null;
        this.validMoves = [];
        this.render();
    }

    // Make a move
    makeMove(fromIndex, toIndex) {
        const result = this.game.makeMove(fromIndex, toIndex);

        if (result.success) {
            this.render();

            if (this.onMoveCallback) {
                this.onMoveCallback(result);
            }
        }

        return result;
    }

    // Update the board from external state (for multiplayer sync)
    updateFromState(state) {
        this.game.loadState(state);
        this.clearSelection();
    }

    // Display a historical board position (read-only, no game state change)
    displayPosition(board, lastMove) {
        this.viewingHistory = true;
        this.boardElement.innerHTML = '';

        for (let visualRow = 7; visualRow >= 0; visualRow--) {
            for (let visualCol = 0; visualCol < 8; visualCol++) {
                const actualRow = this.flipped ? 7 - visualRow : visualRow;
                const actualCol = this.flipped ? 7 - visualCol : visualCol;
                const index = actualRow * 8 + actualCol;

                const square = document.createElement('div');
                square.className = 'square';
                square.dataset.index = index;

                const isLightSquare = (actualRow + actualCol) % 2 === 1;
                square.classList.add(isLightSquare ? 'light' : 'dark');

                const piece = board[index];
                if (piece) {
                    const pieceSpan = document.createElement('span');
                    pieceSpan.className = 'piece';
                    if (this.game.isWhitePiece(piece)) {
                        pieceSpan.classList.add('white-piece');
                    } else if (this.game.isBlackPiece(piece)) {
                        pieceSpan.classList.add('black-piece');
                    }
                    pieceSpan.textContent = PIECE_GLYPHS[piece] || piece;
                    square.appendChild(pieceSpan);
                }

                // Highlight last move
                if (lastMove) {
                    if (index === lastMove.from || index === lastMove.to) {
                        square.classList.add('last-move');
                    }
                }

                this.boardElement.appendChild(square);
            }
        }
    }

    // Return to live board view
    returnToLive() {
        this.viewingHistory = false;
        this.render();
    }
}

// UI Helper Functions
const UI = {
    // Show a screen
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    },

    // Show/hide element
    show(elementId) {
        document.getElementById(elementId).classList.remove('hidden');
    },

    hide(elementId) {
        document.getElementById(elementId).classList.add('hidden');
    },

    // Update game info display
    updateGameInfo(game) {
        document.getElementById('move-number').textContent = `Turn ${game.turnCount}`;
        document.getElementById('turn-indicator').textContent =
            `${game.currentTurn.charAt(0).toUpperCase() + game.currentTurn.slice(1)}'s turn`;

        // Show/hide capture restriction warning
        const restrictionEl = document.getElementById('capture-restriction');
        if (game.areCapturesAllowed()) {
            restrictionEl.classList.add('hidden');
        } else {
            restrictionEl.classList.remove('hidden');
        }
    },

    // Show game message (checkmate, etc.)
    showGameMessage(title, subtitle) {
        const messageEl = document.getElementById('game-message');
        messageEl.innerHTML = `
            <h2>${title}</h2>
            <p>${subtitle}</p>
        `;
        messageEl.classList.remove('hidden');
        document.getElementById('btn-new-game').classList.remove('hidden');
    },

    // Hide game message
    hideGameMessage() {
        document.getElementById('game-message').classList.add('hidden');
        document.getElementById('btn-new-game').classList.add('hidden');
    },

    // Show error/notification toast (simple alert for now)
    notify(message) {
        console.log('Notification:', message);
        // Could be enhanced with a toast system
    },

    // Show/hide AI thinking indicator
    showAIThinking(show) {
        const indicator = document.getElementById('ai-thinking-indicator');
        if (indicator) {
            if (show) {
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChessBoardUI, UI };
}
