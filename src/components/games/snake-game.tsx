'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Position = { x: number; y: number };

interface SnakeGameProps {
  checkProgress: {
    checked: number;
    total: number;
  };
  onCheckComplete?: () => void;
  className?: string;
}

const GRID_SIZE = 15;
const INITIAL_SPEED = 150;
const SPEED_INCREASE = 5;
const MIN_SPEED = 60;

export function SnakeGame({ checkProgress, onCheckComplete, className }: SnakeGameProps) {
  const [snake, setSnake] = useState<Position[]>([{ x: 7, y: 7 }]);
  const [food, setFood] = useState<Position>({ x: 10, y: 7 });
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(INITIAL_SPEED);

  const directionRef = useRef<Direction>(direction);
  const checkCallbackCalled = useRef(false);
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);

  // Check if duplicate check is complete
  const checkComplete =
    checkProgress.checked >= checkProgress.total && checkProgress.total > 0;

  // Generate random food position
  const generateFood = useCallback((currentSnake: Position[]): Position => {
    let newFood: Position;
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
    } while (currentSnake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
    return newFood;
  }, []);

  // Reset game
  const resetGame = useCallback(() => {
    const initialSnake = [{ x: 7, y: 7 }];
    setSnake(initialSnake);
    setFood(generateFood(initialSnake));
    setDirection('RIGHT');
    directionRef.current = 'RIGHT';
    setGameOver(false);
    setScore(0);
    setSpeed(INITIAL_SPEED);
    setIsPaused(false);
  }, [generateFood]);

  // Move snake
  const moveSnake = useCallback(() => {
    if (gameOver || isPaused) return;

    setSnake(prevSnake => {
      const head = prevSnake[0];
      const currentDirection = directionRef.current;
      let newHead: Position;

      switch (currentDirection) {
        case 'UP':
          newHead = { x: head.x, y: head.y - 1 };
          break;
        case 'DOWN':
          newHead = { x: head.x, y: head.y + 1 };
          break;
        case 'LEFT':
          newHead = { x: head.x - 1, y: head.y };
          break;
        case 'RIGHT':
          newHead = { x: head.x + 1, y: head.y };
          break;
      }

      // Check wall collision
      if (
        newHead.x < 0 ||
        newHead.x >= GRID_SIZE ||
        newHead.y < 0 ||
        newHead.y >= GRID_SIZE
      ) {
        setGameOver(true);
        return prevSnake;
      }

      // Check self collision
      if (prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
        setGameOver(true);
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // Check if ate food
      if (newHead.x === food.x && newHead.y === food.y) {
        setScore(s => s + 10);
        setFood(generateFood(newSnake));
        // Increase speed
        setSpeed(s => Math.max(MIN_SPEED, s - SPEED_INCREASE));
        return newSnake; // Don't remove tail - snake grows
      }

      // Remove tail
      newSnake.pop();
      return newSnake;
    });
  }, [gameOver, isPaused, food, generateFood]);

  // Game loop
  useEffect(() => {
    if (gameOver || isPaused) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
      return;
    }

    gameLoopRef.current = setInterval(moveSnake, speed);

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
    };
  }, [moveSnake, speed, gameOver, isPaused]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for arrow keys to avoid scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === ' ') {
        if (gameOver) {
          resetGame();
        } else {
          setIsPaused(p => !p);
        }
        return;
      }

      if (gameOver || isPaused) return;

      const currentDir = directionRef.current;

      switch (e.key) {
        case 'ArrowUp':
          if (currentDir !== 'DOWN') {
            setDirection('UP');
            directionRef.current = 'UP';
          }
          break;
        case 'ArrowDown':
          if (currentDir !== 'UP') {
            setDirection('DOWN');
            directionRef.current = 'DOWN';
          }
          break;
        case 'ArrowLeft':
          if (currentDir !== 'RIGHT') {
            setDirection('LEFT');
            directionRef.current = 'LEFT';
          }
          break;
        case 'ArrowRight':
          if (currentDir !== 'LEFT') {
            setDirection('RIGHT');
            directionRef.current = 'RIGHT';
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, isPaused, resetGame]);

  // Auto-restart when game over and check still running
  useEffect(() => {
    if (gameOver && !checkComplete) {
      const timer = setTimeout(() => {
        resetGame();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [gameOver, checkComplete, resetGame]);

  // Call completion callback when check done
  useEffect(() => {
    if (checkComplete && onCheckComplete && !checkCallbackCalled.current) {
      checkCallbackCalled.current = true;
      onCheckComplete();
    }
  }, [checkComplete, onCheckComplete]);

  // Progress percentage
  const progressPercent = checkProgress.total > 0
    ? Math.round((checkProgress.checked / checkProgress.total) * 100)
    : 0;

  // Status message
  const getStatusMessage = () => {
    if (checkComplete) {
      return 'Check complete!';
    }
    if (gameOver) {
      return 'Game Over! Starting new game...';
    }
    if (isPaused) {
      return 'Paused - Press Space to continue';
    }
    return 'Use arrow keys to move';
  };

  return (
    <div className={cn('flex flex-col items-center space-y-4', className)}>
      {/* Game title */}
      <div className="text-center space-y-1">
        <h3 className="text-xl font-bold text-gray-900">
          Play Snake While Checking Duplicates!
        </h3>
        <p className="text-sm text-gray-600">
          {getStatusMessage()}
        </p>
      </div>

      {/* Progress indicator */}
      <div className="w-full max-w-xs space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Checking duplicates...</span>
          <span>{checkProgress.checked} / {checkProgress.total}</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Score */}
      <div className="flex items-center gap-4 text-sm">
        <span className="font-semibold text-gray-700">Score: {score}</span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-600">Length: {snake.length}</span>
      </div>

      {/* Game board */}
      <div
        className="relative bg-gray-900 rounded-lg shadow-lg p-1"
        style={{
          width: GRID_SIZE * 20 + 8,
          height: GRID_SIZE * 20 + 8,
        }}
      >
        <div
          className="relative bg-gray-800 rounded"
          style={{
            width: GRID_SIZE * 20,
            height: GRID_SIZE * 20,
          }}
        >
          {/* Grid lines (subtle) */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(to right, #fff 1px, transparent 1px),
                linear-gradient(to bottom, #fff 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
            }}
          />

          {/* Food */}
          <div
            className="absolute w-4 h-4 bg-red-500 rounded-full shadow-lg animate-pulse"
            style={{
              left: food.x * 20 + 2,
              top: food.y * 20 + 2,
            }}
          />

          {/* Snake */}
          {snake.map((segment, index) => (
            <div
              key={index}
              className={cn(
                'absolute rounded transition-all duration-75',
                index === 0
                  ? 'bg-green-400 shadow-md'
                  : 'bg-green-500'
              )}
              style={{
                left: segment.x * 20 + 1,
                top: segment.y * 20 + 1,
                width: 18,
                height: 18,
                opacity: 1 - (index * 0.02),
              }}
            />
          ))}

          {/* Game over overlay */}
          {gameOver && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded">
              <div className="text-center text-white">
                <p className="text-2xl font-bold mb-2">Game Over!</p>
                <p className="text-sm">Score: {score}</p>
                <p className="text-xs mt-2 text-gray-300">
                  {checkComplete ? 'Press Space to play again' : 'Restarting...'}
                </p>
              </div>
            </div>
          )}

          {/* Paused overlay */}
          {isPaused && !gameOver && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded">
              <div className="text-center text-white">
                <p className="text-2xl font-bold">Paused</p>
                <p className="text-xs mt-2 text-gray-300">Press Space to continue</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls hint */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>Arrow Keys: Move</span>
        <span>Space: {gameOver ? 'Restart' : 'Pause'}</span>
      </div>
    </div>
  );
}
