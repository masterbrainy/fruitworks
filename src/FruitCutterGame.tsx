import { Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const HIGH_SCORE_KEY = "fruitCutterHighScore";

type GameState = "idle" | "playing" | "gameOver";

type FruitType =
  | "apple"
  | "orange"
  | "grapes"
  | "banana"
  | "watermelon"
  | "rambutan"
  | "lemon"
  | "lime";

type Fruit = {
  id: number;
  type: FruitType;
  x: number;
  y: number;
  size: number;
  speed: number;
  cut: boolean;
};

type FloatingPoint = {
  id: number;
  x: number;
  y: number;
};

const fruitTypes: FruitType[] = [
  "apple",
  "orange",
  "grapes",
  "banana",
  "watermelon",
  "rambutan",
  "lemon",
  "lime",
];

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

const pickFruitType = () => fruitTypes[Math.floor(Math.random() * fruitTypes.length)];

const createFruit = (beltHeight: number, elapsedSeconds: number): Fruit => {
  const type = pickFruitType();
  const size = randomBetween(58, 92);
  const maxY = Math.max(8, beltHeight - size - 10);
  const speed = Math.min(178, 72 + elapsedSeconds * 2.7 + randomBetween(-5, 14));

  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    type,
    x: -size - 18,
    y: randomBetween(8, maxY),
    size,
    speed,
    cut: false,
  };
};

const loadHighScore = () => {
  if (typeof window === "undefined") {
    return 0;
  }

  const stored = window.localStorage.getItem(HIGH_SCORE_KEY);
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : 0;
};

function FruitSprite({ fruit }: { fruit: Fruit }) {
  return (
    <div
      className={`fruit-sprite fruit-${fruit.type}${fruit.cut ? " is-cut" : ""}`}
      style={{
        "--fruit-size": `${fruit.size}px`,
        left: `${fruit.x}px`,
        top: `${fruit.y}px`,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="fruit-shape" />
      <span className="slice-mark" aria-hidden="true" />
    </div>
  );
}

function GameOverModal({
  finalScore,
  highScore,
  onPlayAgain,
}: {
  finalScore: number;
  highScore: number;
  onPlayAgain: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="game-over-panel" aria-labelledby="game-over-title">
        <p className="mini-label">Nice try</p>
        <h2 id="game-over-title">Game Over</h2>
        <div className="result-grid">
          <div>
            <span>Final score</span>
            <strong>{finalScore}</strong>
          </div>
          <div>
            <span>High score</span>
            <strong>{highScore}</strong>
          </div>
        </div>
        <button className="primary-action" onClick={onPlayAgain} type="button">
          <RotateCcw size={26} aria-hidden="true" />
          Play Again
        </button>
      </section>
    </div>
  );
}

export function FruitCutterGame() {
  const beltRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const spawnTimerRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const startTimeRef = useRef(0);
  const fruitIdRef = useRef(1);
  const fruitsRef = useRef<Fruit[]>([]);
  const scoreRef = useRef(0);
  const gameStateRef = useRef<GameState>("idle");
  const beltSizeRef = useRef({ width: 900, height: 190 });
  const knifeDroppingRef = useRef(false);

  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(loadHighScore);
  const [fruits, setFruits] = useState<Fruit[]>([]);
  const [floatingPoints, setFloatingPoints] = useState<FloatingPoint[]>([]);
  const [beltSize, setBeltSize] = useState({ width: 900, height: 190 });
  const [knifeDropping, setKnifeDropping] = useState(false);

  useEffect(() => {
    fruitsRef.current = fruits;
  }, [fruits]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    beltSizeRef.current = beltSize;
  }, [beltSize]);

  useLayoutEffect(() => {
    const belt = beltRef.current;
    if (!belt) {
      return undefined;
    }

    const updateSize = () => {
      const rect = belt.getBoundingClientRect();
      setBeltSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(belt);

    return () => observer.disconnect();
  }, []);

  const endGame = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (spawnTimerRef.current) {
      window.clearTimeout(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }

    gameStateRef.current = "gameOver";
    setGameState("gameOver");
    setFruits([]);
    const finalScore = scoreRef.current;

    setHighScore((previousHighScore) => {
      const nextHighScore = Math.max(previousHighScore, finalScore);
      window.localStorage.setItem(HIGH_SCORE_KEY, String(nextHighScore));
      return nextHighScore;
    });
  }, []);

  const tickGame = useCallback(() => {
    if (gameStateRef.current !== "playing") {
      return;
    }

    const now = performance.now();
    const deltaSeconds = Math.min((now - lastFrameRef.current) / 1000, 0.05);
    const currentBeltSize = beltSizeRef.current;

    lastFrameRef.current = now;

    setFruits((currentFruits) => {
      let nextFruits = currentFruits
        .map((fruit) =>
          fruit.cut
            ? fruit
            : {
                ...fruit,
                x: fruit.x + fruit.speed * deltaSeconds,
              },
        )
        .filter((fruit) => fruit.cut || fruit.x < currentBeltSize.width + fruit.size + 8);

      const missedFruit = nextFruits.some(
        (fruit) => !fruit.cut && fruit.x > currentBeltSize.width - Math.max(16, fruit.size * 0.35),
      );

      if (missedFruit) {
        window.setTimeout(endGame, 0);
        return nextFruits;
      }

      return nextFruits;
    });
  }, [endGame]);

  const scheduleNextSpawn = useCallback(() => {
    if (gameStateRef.current !== "playing") {
      return;
    }

    const elapsedSeconds = (performance.now() - startTimeRef.current) / 1000;
    const spawnGap = Math.max(610, 1120 - Math.min(elapsedSeconds, 52) * 10);

    spawnTimerRef.current = window.setTimeout(() => {
      if (gameStateRef.current !== "playing") {
        return;
      }

      const freshFruit = createFruit(beltSizeRef.current.height, elapsedSeconds);
      freshFruit.id = fruitIdRef.current;
      fruitIdRef.current += 1;

      setFruits((currentFruits) => [...currentFruits, freshFruit]);
      scheduleNextSpawn();
    }, spawnGap + randomBetween(-120, 210));
  }, []);

  const startGame = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }

    if (spawnTimerRef.current) {
      window.clearTimeout(spawnTimerRef.current);
    }

    const starterFruit = createFruit(beltSizeRef.current.height, 0);
    starterFruit.id = fruitIdRef.current;
    starterFruit.x = 18;
    fruitIdRef.current += 1;

    setScore(0);
    setFloatingPoints([]);
    setKnifeDropping(false);
    knifeDroppingRef.current = false;
    setFruits([starterFruit]);
    setGameState("playing");
    gameStateRef.current = "playing";
    scoreRef.current = 0;
    fruitsRef.current = [starterFruit];
    startTimeRef.current = performance.now();
    lastFrameRef.current = performance.now();
    tickGame();
    timerRef.current = window.setInterval(tickGame, 16);
    scheduleNextSpawn();
  }, [scheduleNextSpawn, tickGame]);

  const cutFruit = useCallback((fruit: Fruit) => {
    if (gameStateRef.current !== "playing" || fruit.cut) {
      return;
    }

    setScore((currentScore) => currentScore + 1);
    setFloatingPoints((points) => [...points, { id: fruit.id, x: fruit.x + fruit.size / 2, y: fruit.y }]);
    window.setTimeout(() => {
      setFloatingPoints((points) => points.filter((point) => point.id !== fruit.id));
    }, 760);

    setFruits((currentFruits) =>
      currentFruits.map((currentFruit) =>
        currentFruit.id === fruit.id ? { ...currentFruit, cut: true } : currentFruit,
      ),
    );

    window.setTimeout(() => {
      setFruits((currentFruits) => currentFruits.filter((currentFruit) => currentFruit.id !== fruit.id));
    }, 190);
  }, []);

  const dropKnife = useCallback(() => {
    if (gameStateRef.current !== "playing" || knifeDroppingRef.current) {
      return;
    }

    knifeDroppingRef.current = true;
    setKnifeDropping(true);

    const knifeX = beltSizeRef.current.width / 2;
    const cutZonePadding = 24;
    const hittableFruit = fruitsRef.current
      .filter((fruit) => !fruit.cut)
      .map((fruit) => {
        const fruitCenter = fruit.x + fruit.size / 2;
        return {
          fruit,
          distance: Math.abs(fruitCenter - knifeX),
        };
      })
      .filter(({ fruit, distance }) => distance <= fruit.size * 0.62 + cutZonePadding)
      .sort((first, second) => first.distance - second.distance)[0]?.fruit;

    if (hittableFruit) {
      window.setTimeout(() => cutFruit(hittableFruit), 135);
    }

    window.setTimeout(() => {
      knifeDroppingRef.current = false;
      setKnifeDropping(false);
    }, 430);
  }, [cutFruit]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      if (spawnTimerRef.current) {
        window.clearTimeout(spawnTimerRef.current);
      }
    },
    [],
  );

  return (
    <main className="app-shell">
      <section className="game-frame" aria-label="Conveyor Fruit Cutter Game">
        <header className="scorebar">
          <div className="brand-block">
            <span className="brand-mark" aria-hidden="true">
              ✦
            </span>
            <div>
              <p>Fruitworks</p>
              <h1>Conveyor Fruit Cutter</h1>
            </div>
          </div>

          <div className="score-cluster" aria-live="polite">
            <div className="score-pill">
              <span>Score</span>
              <strong>{score}</strong>
            </div>
            <div className="score-pill high-score">
              <span>High</span>
              <strong>{highScore}</strong>
            </div>
          </div>
        </header>

        <div
          aria-disabled={gameState !== "playing"}
          aria-label="Drop the knife"
          className={`factory-scene${gameState === "playing" ? " is-playing" : ""}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              dropKnife();
            }
          }}
          onPointerDown={(event) => {
            if (gameState === "playing") {
              event.preventDefault();
              dropKnife();
            }
          }}
          role="button"
          tabIndex={gameState === "playing" ? 0 : -1}
        >
          <div className={`knife-rig${knifeDropping ? " is-dropping" : ""}`} aria-hidden="true">
            <span className="knife-handle" />
            <span className="knife-blade" />
          </div>

          <div className="machine-top" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="belt-wrap">
            <div className="belt-end belt-end-left" aria-hidden="true" />
            <div className="conveyor-belt" ref={beltRef}>
              <div className="belt-stripes" aria-hidden="true" />
              <div className="belt-rail belt-rail-top" aria-hidden="true" />
              <div className="belt-rail belt-rail-bottom" aria-hidden="true" />
              {fruits.map((fruit) => (
                <FruitSprite fruit={fruit} key={fruit.id} />
              ))}
              {floatingPoints.map((point) => (
                <span
                  className="floating-point"
                  key={point.id}
                  style={{ left: `${point.x}px`, top: `${point.y}px` }}
                >
                  +1
                </span>
              ))}
            </div>
            <div className="belt-end belt-end-right" aria-hidden="true" />
          </div>

          <div className="table-legs" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        {gameState === "idle" && (
          <div className="start-panel">
            <h2>Ready for the belt?</h2>
            <button className="primary-action" onClick={startGame} type="button">
              <Play size={28} fill="currentColor" aria-hidden="true" />
              Start Game
            </button>
          </div>
        )}

        {gameState === "gameOver" && (
          <GameOverModal finalScore={score} highScore={highScore} onPlayAgain={startGame} />
        )}
      </section>
    </main>
  );
}
