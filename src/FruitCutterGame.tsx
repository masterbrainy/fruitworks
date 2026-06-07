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
  cutPercent: number;
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

const fruitSettings: Record<FruitType, { minSize: number; maxSize: number; hitScale: number; speedBias: number }> = {
  apple: { minSize: 66, maxSize: 78, hitScale: 0.72, speedBias: 0 },
  orange: { minSize: 70, maxSize: 82, hitScale: 0.74, speedBias: 0 },
  grapes: { minSize: 34, maxSize: 44, hitScale: 0.44, speedBias: -6 },
  banana: { minSize: 108, maxSize: 124, hitScale: 0.88, speedBias: -8 },
  watermelon: { minSize: 84, maxSize: 98, hitScale: 0.82, speedBias: -2 },
  rambutan: { minSize: 58, maxSize: 70, hitScale: 0.62, speedBias: 4 },
  lemon: { minSize: 58, maxSize: 72, hitScale: 0.66, speedBias: 2 },
  lime: { minSize: 52, maxSize: 64, hitScale: 0.58, speedBias: 5 },
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

const pickFruitType = () => fruitTypes[Math.floor(Math.random() * fruitTypes.length)];

const createFruit = (beltHeight: number, elapsedSeconds: number): Fruit => {
  const type = pickFruitType();
  const settings = fruitSettings[type];
  const size = randomBetween(settings.minSize, settings.maxSize);
  const laneCenter = beltHeight * 0.58;
  const speed = Math.min(188, 76 + elapsedSeconds * 2.9 + settings.speedBias + randomBetween(-4, 9));

  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    type,
    x: -size - 18,
    y: laneCenter - size / 2,
    size,
    speed,
    cut: false,
    cutPercent: 50,
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
  const cutPercent = Math.min(78, Math.max(22, fruit.cutPercent));

  return (
    <div
      className={`fruit-sprite fruit-${fruit.type}${fruit.cut ? " is-cut" : ""}`}
      style={{
        "--fruit-size": `${fruit.size}px`,
        "--cut-x": `${cutPercent}%`,
        left: `${fruit.x}px`,
        top: `${fruit.y}px`,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      {fruit.cut ? (
        <>
          <span className="fruit-shape fruit-half fruit-half-left" />
          <span className="fruit-shape fruit-half fruit-half-right" />
          <span className="cut-face" />
        </>
      ) : (
        <span className="fruit-shape fruit-whole" />
      )}
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
  const lastFrameRef = useRef(0);
  const startTimeRef = useRef(0);
  const fruitIdRef = useRef(1);
  const fruitsRef = useRef<Fruit[]>([]);
  const scoreRef = useRef(0);
  const gameStateRef = useRef<GameState>("idle");
  const beltSizeRef = useRef({ width: 900, height: 190 });
  const knifeDroppingRef = useRef(false);
  const knifeMissRef = useRef(false);
  const pendingTimerRefs = useRef<number[]>([]);

  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(loadHighScore);
  const [fruits, setFruits] = useState<Fruit[]>([]);
  const [floatingPoints, setFloatingPoints] = useState<FloatingPoint[]>([]);
  const [beltSize, setBeltSize] = useState({ width: 900, height: 190 });
  const [knifeState, setKnifeState] = useState<"ready" | "dropping" | "stuck">("ready");

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
      const nextBeltSize = { width: belt.clientWidth, height: belt.clientHeight };
      beltSizeRef.current = nextBeltSize;
      setBeltSize(nextBeltSize);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(belt);

    return () => observer.disconnect();
  }, []);

  const clearPendingTimers = useCallback(() => {
    pendingTimerRefs.current.forEach((timer) => window.clearTimeout(timer));
    pendingTimerRefs.current = [];
  }, []);

  const setPendingTimer = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      pendingTimerRefs.current = pendingTimerRefs.current.filter((pendingTimer) => pendingTimer !== timer);
      callback();
    }, delay);

    pendingTimerRefs.current = [...pendingTimerRefs.current, timer];
    return timer;
  }, []);

  const makeNextFruit = useCallback((startX?: number) => {
    if (beltRef.current) {
      beltSizeRef.current = { width: beltRef.current.clientWidth, height: beltRef.current.clientHeight };
    }

    const elapsedSeconds = (performance.now() - startTimeRef.current) / 1000;
    const nextFruit = createFruit(beltSizeRef.current.height, elapsedSeconds);
    nextFruit.id = fruitIdRef.current;
    nextFruit.x = startX ?? -nextFruit.size - 18;
    fruitIdRef.current += 1;
    return nextFruit;
  }, []);

  const endGame = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    clearPendingTimers();
    gameStateRef.current = "gameOver";
    setGameState("gameOver");
    setFruits([]);
    const finalScore = scoreRef.current;

    setHighScore((previousHighScore) => {
      const nextHighScore = Math.max(previousHighScore, finalScore);
      window.localStorage.setItem(HIGH_SCORE_KEY, String(nextHighScore));
      return nextHighScore;
    });
  }, [clearPendingTimers]);

  const tickGame = useCallback(() => {
    if (gameStateRef.current !== "playing") {
      return;
    }

    const now = performance.now();
    const deltaSeconds = Math.min((now - lastFrameRef.current) / 1000, 0.05);
    const currentBeltSize = beltSizeRef.current;

    lastFrameRef.current = now;

    setFruits((currentFruits) => {
      const nextFruits = currentFruits
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
        (fruit) => !fruit.cut && fruit.x > currentBeltSize.width + fruit.size * 0.45,
      );

      if (missedFruit) {
        window.setTimeout(endGame, 0);
        return nextFruits;
      }

      return nextFruits;
    });
  }, [endGame]);

  const startGame = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }

    clearPendingTimers();

    if (beltRef.current) {
      beltSizeRef.current = { width: beltRef.current.clientWidth, height: beltRef.current.clientHeight };
    }

    const starterFruit = createFruit(beltSizeRef.current.height, 0);
    starterFruit.id = fruitIdRef.current;
    starterFruit.x = -starterFruit.size - 18;
    fruitIdRef.current += 1;

    setScore(0);
    setFloatingPoints([]);
    setKnifeState("ready");
    knifeDroppingRef.current = false;
    knifeMissRef.current = false;
    setFruits([starterFruit]);
    setGameState("playing");
    gameStateRef.current = "playing";
    scoreRef.current = 0;
    fruitsRef.current = [starterFruit];
    startTimeRef.current = performance.now();
    lastFrameRef.current = performance.now();
    tickGame();
    timerRef.current = window.setInterval(tickGame, 16);
  }, [clearPendingTimers, tickGame]);

  const cutFruit = useCallback((fruit: Fruit, cutX: number) => {
    if (gameStateRef.current !== "playing" || fruit.cut) {
      return;
    }

    const cutPercent = Math.min(78, Math.max(22, (cutX / fruit.size) * 100));

    setScore((currentScore) => currentScore + 1);
    setFloatingPoints((points) => [...points, { id: fruit.id, x: fruit.x + cutX, y: fruit.y }]);
    setPendingTimer(() => {
      setFloatingPoints((points) => points.filter((point) => point.id !== fruit.id));
    }, 760);

    setFruits((currentFruits) =>
      currentFruits.map((currentFruit) =>
        currentFruit.id === fruit.id ? { ...currentFruit, cut: true, cutPercent } : currentFruit,
      ),
    );

    setPendingTimer(() => {
      setFruits((currentFruits) => currentFruits.filter((currentFruit) => currentFruit.id !== fruit.id));
    }, 520);

    setPendingTimer(() => {
      if (gameStateRef.current !== "playing") {
        return;
      }

      const nextFruit = makeNextFruit();
      setFruits([nextFruit]);
    }, 380);
  }, [makeNextFruit, setPendingTimer]);

  const dropKnife = useCallback(() => {
    if (gameStateRef.current !== "playing" || knifeDroppingRef.current) {
      return;
    }

    if (beltRef.current) {
      beltSizeRef.current = { width: beltRef.current.clientWidth, height: beltRef.current.clientHeight };
    }

    knifeDroppingRef.current = true;
    knifeMissRef.current = false;
    setKnifeState("dropping");

    setPendingTimer(() => {
      const knifeX = beltSizeRef.current.width / 2;
      const hittableFruit = fruitsRef.current
        .filter((fruit) => !fruit.cut)
        .map((fruit) => {
          const fruitCenter = fruit.x + fruit.size / 2;
          const cutX = knifeX - fruit.x;
          const hitHalfWidth = fruit.size * fruitSettings[fruit.type].hitScale * 0.5;
          return {
            fruit,
            cutX,
            distance: Math.abs(fruitCenter - knifeX),
            hitHalfWidth,
          };
        })
        .filter(({ cutX, distance, fruit, hitHalfWidth }) => cutX >= 0 && cutX <= fruit.size && distance <= hitHalfWidth)
        .sort((first, second) => first.distance - second.distance)[0];

      if (hittableFruit) {
        cutFruit(hittableFruit.fruit, hittableFruit.cutX);
        return;
      }

      setKnifeState("stuck");
      knifeMissRef.current = true;
      setPendingTimer(() => {
        knifeDroppingRef.current = false;
        endGame();
      }, 650);
    }, 190);

    setPendingTimer(() => {
      if (gameStateRef.current !== "playing" || knifeMissRef.current) {
        return;
      }

      knifeDroppingRef.current = false;
      setKnifeState("ready");
    }, 430);
  }, [cutFruit, endGame, setPendingTimer]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      clearPendingTimers();
    },
    [clearPendingTimers],
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
          <div className={`knife-rig is-${knifeState}`} aria-hidden="true">
            <span className="knife-handle" />
            <span className="knife-blade" />
            <span className="knife-belt-slit" />
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
