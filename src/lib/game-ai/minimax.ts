type Board = ('X' | 'O' | null)[];
type Player = 'X' | 'O';

/**
 * Find best move for AI using Minimax algorithm
 * @param board Current board state
 * @param aiPlayer AI's symbol ('O')
 * @param humanPlayer Human's symbol ('X')
 * @returns Index of best move (0-8)
 */
export function findBestMove(
  board: Board,
  aiPlayer: Player,
  humanPlayer: Player
): number {
  let bestScore = -Infinity;
  let bestMove = -1;

  // Try each empty cell
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      // Create a copy and make move
      const newBoard = [...board];
      newBoard[i] = aiPlayer;

      // Calculate score with minimax
      const score = minimax(newBoard, 0, false, aiPlayer, humanPlayer);

      // Update best move
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }

  return bestMove;
}

/**
 * Minimax recursive algorithm
 * @param board Current board state
 * @param depth Current depth in game tree
 * @param isMaximizing True if maximizing (AI turn), false if minimizing (human turn)
 * @param aiPlayer AI's symbol
 * @param humanPlayer Human's symbol
 * @returns Score for current board state
 */
function minimax(
  board: Board,
  depth: number,
  isMaximizing: boolean,
  aiPlayer: Player,
  humanPlayer: Player
): number {
  // Check terminal states
  const winner = checkWinner(board);

  if (winner === aiPlayer) return 10 - depth; // AI wins (prefer faster wins)
  if (winner === humanPlayer) return depth - 10; // Human wins (prefer slower losses)
  if (isBoardFull(board)) return 0; // Draw

  if (isMaximizing) {
    // AI's turn - maximize score
    let bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        const newBoard = [...board];
        newBoard[i] = aiPlayer;
        const score = minimax(newBoard, depth + 1, false, aiPlayer, humanPlayer);
        bestScore = Math.max(bestScore, score);
      }
    }
    return bestScore;
  } else {
    // Human's turn - minimize score
    let bestScore = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        const newBoard = [...board];
        newBoard[i] = humanPlayer;
        const score = minimax(newBoard, depth + 1, true, aiPlayer, humanPlayer);
        bestScore = Math.min(bestScore, score);
      }
    }
    return bestScore;
  }
}

/**
 * Check if there's a winner
 * @returns Winning player ('X' | 'O') or null
 */
export function checkWinner(board: Board): Player | null {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

/**
 * Check if board is full (draw condition)
 */
export function isBoardFull(board: Board): boolean {
  return board.every(cell => cell !== null);
}

/**
 * Find winning line indices
 * @returns Array of winning cell indices or null
 */
export function getWinningLine(board: Board): number[] | null {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return pattern;
    }
  }

  return null;
}
