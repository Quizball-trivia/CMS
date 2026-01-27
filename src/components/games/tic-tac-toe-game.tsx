'use client';

import { useState, useEffect, useCallback } from 'react';
import { findBestMove, checkWinner, isBoardFull, getWinningLine } from '@/lib/game-ai/minimax';
import { cn } from '@/lib/utils';

type Cell = 'X' | 'O' | null;
type Board = Cell[];
type GameStatus = 'playing' | 'player-won' | 'ai-won' | 'draw';

interface TicTacToeGameProps {
  uploadProgress: {
    successful: number;
    failed: number;
    total: number;
  };
  onUploadComplete?: () => void;
  className?: string;
}

export function TicTacToeGame({ uploadProgress, onUploadComplete, className }: TicTacToeGameProps) {
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true); // Player (X) goes first
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [winningLine, setWinningLine] = useState<number[] | null>(null);

  // Check if upload is complete
  const uploadComplete =
    uploadProgress.successful + uploadProgress.failed >= uploadProgress.total &&
    uploadProgress.total > 0;

  // Handle cell click (player move)
  const handleCellClick = (index: number) => {
    if (board[index] !== null || !isPlayerTurn || gameStatus !== 'playing') {
      return; // Cell occupied, not player's turn, or game over
    }

    // Make player move
    const newBoard = [...board];
    newBoard[index] = 'X';
    setBoard(newBoard);
    setIsPlayerTurn(false);

    // Check game status after player move
    updateGameStatus(newBoard);
  };

  // Update game status (check win/draw)
  const updateGameStatus = useCallback((currentBoard: Board) => {
    const winner = checkWinner(currentBoard);

    if (winner === 'X') {
      setGameStatus('player-won');
      setWinningLine(getWinningLine(currentBoard));
    } else if (winner === 'O') {
      setGameStatus('ai-won');
      setWinningLine(getWinningLine(currentBoard));
    } else if (isBoardFull(currentBoard)) {
      setGameStatus('draw');
    }
  }, []); // No dependencies - uses only its parameters and setters

  // AI move (runs after player move)
  useEffect(() => {
    if (!isPlayerTurn && gameStatus === 'playing') {
      // Small delay for natural feel
      const timer = setTimeout(() => {
        const aiMove = findBestMove(board, 'O', 'X');

        if (aiMove !== -1) {
          const newBoard = [...board];
          newBoard[aiMove] = 'O';
          setBoard(newBoard);
          setIsPlayerTurn(true);

          // Check game status after AI move
          updateGameStatus(newBoard);
        }
      }, 500); // 500ms delay for AI "thinking"

      return () => clearTimeout(timer);
    }
  }, [isPlayerTurn, gameStatus, board, updateGameStatus]);

  // Reset game
  const resetGame = useCallback(() => {
    setBoard(Array(9).fill(null));
    setIsPlayerTurn(true);
    setGameStatus('playing');
    setWinningLine(null);
  }, []); // No dependencies - uses only setters

  // Auto-restart game if upload still in progress
  useEffect(() => {
    if (gameStatus !== 'playing' && !uploadComplete) {
      const timer = setTimeout(() => {
        resetGame();
      }, 2000); // 2 second delay before restart

      return () => clearTimeout(timer);
    }
  }, [gameStatus, uploadComplete, resetGame]);

  // Call completion callback when upload done
  useEffect(() => {
    if (uploadComplete && onUploadComplete) {
      onUploadComplete();
    }
  }, [uploadComplete, onUploadComplete]);

  // Status message
  const getStatusMessage = () => {
    if (uploadComplete) {
      return 'Upload complete!';
    }

    switch (gameStatus) {
      case 'player-won':
        return 'You win! Starting new game...';
      case 'ai-won':
        return 'AI wins! Starting new game...';
      case 'draw':
        return 'Draw! Starting new game...';
      case 'playing':
        return isPlayerTurn ? 'Your turn!' : 'AI is thinking...';
    }
  };

  return (
    <div className={cn('flex flex-col items-center space-y-6', className)}>
      {/* Game title */}
      <div className="text-center space-y-1">
        <h3 className="text-xl font-bold text-gray-900">
          Play Tic-Tac-Toe While Waiting!
        </h3>
        <p className="text-sm text-gray-600">
          {getStatusMessage()}
        </p>
      </div>

      {/* Game board */}
      <div className="grid grid-cols-3 gap-2 p-4 bg-white rounded-xl shadow-lg">
        {board.map((cell, index) => {
          const isWinningCell = winningLine?.includes(index);

          return (
            <button
              key={index}
              onClick={() => handleCellClick(index)}
              disabled={cell !== null || !isPlayerTurn || gameStatus !== 'playing'}
              className={cn(
                'w-20 h-20 border-2 rounded-lg',
                'flex items-center justify-center',
                'text-4xl font-bold transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-blue-500',
                cell === null && isPlayerTurn && gameStatus === 'playing'
                  ? 'border-gray-300 hover:bg-gray-50 hover:scale-105 cursor-pointer'
                  : 'border-gray-200 cursor-not-allowed',
                isWinningCell && 'bg-gradient-to-br from-green-100 to-green-200 border-green-400 animate-pulse'
              )}
            >
              {cell && (
                <span
                  className={cn(
                    'transition-all duration-300 transform',
                    cell === 'X' ? 'text-blue-600' : 'text-red-600',
                    'scale-100'
                  )}
                >
                  {cell}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-600">X</span>
          <span>You</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-red-600">O</span>
          <span>AI</span>
        </div>
      </div>
    </div>
  );
}
