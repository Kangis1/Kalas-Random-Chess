// ELO Rating System for Kalas Random Chess

const K_FACTOR = 32; // Standard K-factor for most chess systems

/**
 * Calculate expected score based on ELO ratings
 * @param {number} playerRating - The player's current ELO
 * @param {number} opponentRating - The opponent's current ELO
 * @returns {number} Expected score (0 to 1)
 */
function expectedScore(playerRating, opponentRating) {
    return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

/**
 * Calculate new ELO rating after a game
 * @param {number} currentRating - Player's current ELO
 * @param {number} expectedScore - Expected score from expectedScore()
 * @param {number} actualScore - 1 for win, 0.5 for draw, 0 for loss
 * @returns {number} New ELO rating (rounded to nearest integer)
 */
function calculateNewRating(currentRating, expectedScore, actualScore) {
    return Math.round(currentRating + K_FACTOR * (actualScore - expectedScore));
}

/**
 * Calculate ELO changes for both players after a game
 * @param {number} whiteElo - White player's current ELO
 * @param {number} blackElo - Black player's current ELO
 * @param {string} result - 'white', 'black', or 'draw'
 * @returns {object} { whiteNewElo, blackNewElo, whiteChange, blackChange }
 */
function calculateEloChanges(whiteElo, blackElo, result) {
    const whiteExpected = expectedScore(whiteElo, blackElo);
    const blackExpected = expectedScore(blackElo, whiteElo);

    let whiteActual, blackActual;

    if (result === 'white') {
        whiteActual = 1;
        blackActual = 0;
    } else if (result === 'black') {
        whiteActual = 0;
        blackActual = 1;
    } else {
        // Draw
        whiteActual = 0.5;
        blackActual = 0.5;
    }

    const whiteNewElo = calculateNewRating(whiteElo, whiteExpected, whiteActual);
    const blackNewElo = calculateNewRating(blackElo, blackExpected, blackActual);

    return {
        whiteNewElo,
        blackNewElo,
        whiteChange: whiteNewElo - whiteElo,
        blackChange: blackNewElo - blackElo
    };
}

module.exports = { calculateEloChanges, expectedScore, K_FACTOR };
