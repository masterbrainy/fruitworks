import { Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const HIGH_SCORE_KEY = "fruitCutterHighScore";
const KNIFE_IMPACT_MS = 560;
const KNIFE_RESPAWN_MS = 260;
const KNIFE_COLLISION_WIDTH: Record<KnifeMode, number> = {
  normal: 40,
  wide: 66,
  skinny: 20,
};

type GameState = "idle" | "playing" | "gameOver";
type KnifeState = "ready" | "dropping" | "hidden" | "stuck";
type KnifeMode = "normal" | "wide" | "skinny";
type EffectPolarity = "positive" | "negative";

type FruitType =
  | "apple"
  | "orange"
  | "grapes"
  | "banana"
  | "watermelon"
  | "rambutan"
  | "lemon"
  | "lime"
  | "sugarcane"
  | "starfruit";

type ActiveEffects = {
  frozenFruitId: number | null;
  freezeNextFruit: boolean;
  freezeTargetFruitId: number | null;
  knifeMode: KnifeMode;
  knifeUntil: number;
  scoreMultiplier: 1 | 2;
  scoreUntil: number;
  tinyFruitUntil: number;
};

type EffectPopup = {
  id: number;
  message: string;
  polarity: EffectPolarity;
};

type SpecialEffect = {
  apply: (now: number, current: ActiveEffects) => ActiveEffects;
  message: string;
  polarity: EffectPolarity;
};

const EMPTY_EFFECTS: ActiveEffects = {
  frozenFruitId: null,
  freezeNextFruit: false,
  freezeTargetFruitId: null,
  knifeMode: "normal",
  knifeUntil: 0,
  scoreMultiplier: 1,
  scoreUntil: 0,
  tinyFruitUntil: 0,
};

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
  value: number;
  x: number;
  y: number;
};

type CutScrap = {
  id: number;
  type: FruitType;
  x: number;
  startX: number;
  size: number;
  rotation: number;
  settleY: number;
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
  "sugarcane",
];

const fruitSettings: Record<
  FruitType,
  { minSize: number; maxSize: number; hitScale: number; speedBias: number; visualWidthScale?: number; baseAnchorScale?: number }
> = {
  apple: { minSize: 66, maxSize: 78, hitScale: 0.72, speedBias: 0 },
  orange: { minSize: 70, maxSize: 82, hitScale: 0.74, speedBias: 0 },
  grapes: { minSize: 34, maxSize: 44, hitScale: 0.44, speedBias: -6 },
  banana: { minSize: 108, maxSize: 124, hitScale: 0.88, speedBias: -8 },
  watermelon: { minSize: 84, maxSize: 98, hitScale: 0.82, speedBias: -2 },
  rambutan: { minSize: 58, maxSize: 70, hitScale: 0.62, speedBias: 4 },
  lemon: { minSize: 58, maxSize: 72, hitScale: 0.66, speedBias: 2 },
  lime: { minSize: 52, maxSize: 64, hitScale: 0.58, speedBias: 5 },
  sugarcane: { minSize: 92, maxSize: 110, hitScale: 0.78, speedBias: 3, visualWidthScale: 0.54, baseAnchorScale: 0.92 },
  starfruit: { minSize: 72, maxSize: 84, hitScale: 0.78, speedBias: -2 },
};

const specialEffects: SpecialEffect[] = [
  {
    apply: (now, current) => ({ ...current, scoreMultiplier: 2, scoreUntil: now + 15000 }),
    message: "x2 score for 15 seconds",
    polarity: "positive",
  },
  {
    apply: (now, current) => ({ ...current, scoreMultiplier: 2, scoreUntil: now + 30000 }),
    message: "x2 score for 30 seconds",
    polarity: "positive",
  },
  {
    apply: (now, current) => ({ ...current, knifeMode: "wide", knifeUntil: now + 15000 }),
    message: "wide knife for 15 seconds",
    polarity: "positive",
  },
  {
    apply: (_now, current) => ({ ...current, freezeNextFruit: true }),
    message: "freeze one fruit until cut",
    polarity: "positive",
  },
  {
    apply: (now, current) => ({ ...current, knifeMode: "skinny", knifeUntil: now + 15000 }),
    message: "skinny knife for 15 seconds",
    polarity: "negative",
  },
  {
    apply: (now, current) => ({ ...current, tinyFruitUntil: now + 15000 }),
    message: "tiny fruit for 15 seconds",
    polarity: "negative",
  },
  {
    apply: (now, current) => ({ ...current, tinyFruitUntil: now + 30000 }),
    message: "tiny fruit for 30 seconds",
    polarity: "negative",
  },
];

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

const pickFruitType = () => fruitTypes[Math.floor(Math.random() * fruitTypes.length)];

const createFruit = (
  beltHeight: number,
  elapsedSeconds: number,
  fruitNumber: number,
  activeEffects: ActiveEffects,
  now: number,
): Fruit => {
  const type = fruitNumber === 3 || (fruitNumber > 3 && Math.random() < 0.1) ? "starfruit" : pickFruitType();
  const settings = fruitSettings[type];
  const tinyFruitScale = activeEffects.tinyFruitUntil > now && type !== "starfruit" ? 0.62 : 1;
  const layoutScale = Math.min(1, Math.max(0.62, beltHeight / 170));
  const size = randomBetween(settings.minSize, settings.maxSize) * tinyFruitScale * layoutScale;
  const laneCenter = beltHeight * 0.49;
  const y = settings.baseAnchorScale ? laneCenter - size * settings.baseAnchorScale : laneCenter - size / 2;
  const speed = Math.min(283.4, 135.2 + elapsedSeconds * 2.9 + settings.speedBias + randomBetween(-4, 9));

  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    type,
    x: -size,
    y,
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

const formatRemaining = (until: number, now: number) => `${Math.max(0, Math.ceil((until - now) / 1000))}s`;

const shouldUseMobileAppLayout = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(max-width: 960px)").matches ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
};

function StarfruitSvg() {
  return (
    <svg className="starfruit-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="starfruitCenter" cx="50%" cy="50%" r="64%">
          <stop offset="0%" stopColor="#fff4a9" />
          <stop offset="42%" stopColor="#ffd94a" />
          <stop offset="100%" stopColor="#efa414" />
        </radialGradient>
      </defs>
      <path
        className="starfruit-body"
        d="M50 4 C57 19 60 32 62 43 C73 37 87 32 98 31 C89 42 79 49 68 55 C76 67 83 81 87 96 C73 88 61 78 50 67 C39 78 27 88 13 96 C17 81 24 67 32 55 C21 49 11 42 2 31 C13 32 27 37 38 43 C40 32 43 19 50 4 Z"
      />
      <path className="starfruit-center" d="M50 35 C60 38 65 46 63 55 C60 65 51 70 42 66 C34 63 30 54 34 46 C37 38 42 35 50 35 Z" />
      <path className="starfruit-ridge" d="M50 55 C50 41 50 24 50 7" />
      <path className="starfruit-ridge" d="M50 55 C61 47 78 38 96 31" />
      <path className="starfruit-ridge" d="M50 55 C59 67 73 83 86 95" />
      <path className="starfruit-ridge" d="M50 55 C41 67 27 83 14 95" />
      <path className="starfruit-ridge" d="M50 55 C39 47 22 38 4 31" />
      <ellipse className="starfruit-seed" cx="44" cy="52" rx="2.5" ry="5.2" transform="rotate(78 44 52)" />
      <ellipse className="starfruit-seed" cx="55" cy="45" rx="2.2" ry="5" transform="rotate(8 55 45)" />
      <ellipse className="starfruit-seed" cx="56" cy="59" rx="2.2" ry="4.8" transform="rotate(-42 56 59)" />
      <path className="starfruit-shine" d="M22 37 C34 41 42 46 49 52" />
      <path className="starfruit-shine" d="M50 12 C52 27 52 40 50 52" />
    </svg>
  );
}

function FruitSprite({ fruit }: { fruit: Fruit }) {
  const cutPercent = Math.min(78, Math.max(22, fruit.cutPercent));

  return (
    <div
      data-fruit-id={fruit.id}
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
      ) : fruit.type === "starfruit" ? (
        <StarfruitSvg />
      ) : (
        <span className="fruit-shape fruit-whole" />
      )}
      <span className="slice-mark" aria-hidden="true" />
    </div>
  );
}

function CutScrapPiece({ scrap }: { scrap: CutScrap }) {
  return (
    <span
      aria-hidden="true"
      className={`cut-scrap scrap-${scrap.type}`}
      style={{
        "--scrap-size": `${scrap.size}px`,
        "--scrap-rotation": `${scrap.rotation}deg`,
        "--scrap-settle-y": `${scrap.settleY}px`,
        "--scrap-start-x": `${scrap.startX - scrap.x}px`,
        left: `${scrap.x}px`,
      } as React.CSSProperties}
    >
      <span className="scrap-shape" />
    </span>
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
  const factorySceneRef = useRef<HTMLDivElement | null>(null);
  const beltRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const startTimeRef = useRef(0);
  const fruitIdRef = useRef(1);
  const fruitNumberRef = useRef(0);
  const fruitsRef = useRef<Fruit[]>([]);
  const activeEffectsRef = useRef<ActiveEffects>(EMPTY_EFFECTS);
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
  const [cutScraps, setCutScraps] = useState<CutScrap[]>([]);
  const [activeEffects, setActiveEffects] = useState<ActiveEffects>(EMPTY_EFFECTS);
  const [effectNow, setEffectNow] = useState(0);
  const [effectPopup, setEffectPopup] = useState<EffectPopup | null>(null);
  const [beltSize, setBeltSize] = useState({ width: 900, height: 190 });
  const [knifeState, setKnifeState] = useState<KnifeState>("ready");
  const [isImmersiveMode, setIsImmersiveMode] = useState(shouldUseMobileAppLayout);
  const [knifeLineX, setKnifeLineX] = useState<number | null>(null);

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
    const scene = factorySceneRef.current;
    if (!belt || !scene) {
      return undefined;
    }

    const updateMetrics = () => {
      const nextBeltSize = { width: belt.clientWidth, height: belt.clientHeight };
      beltSizeRef.current = nextBeltSize;
      setBeltSize(nextBeltSize);

      const beltRect = belt.getBoundingClientRect();
      const sceneRect = scene.getBoundingClientRect();
      setKnifeLineX(beltRect.left + beltRect.width / 2 - sceneRect.left);
    };

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(belt);
    observer.observe(scene);
    window.addEventListener("resize", updateMetrics);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
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

  const updateEffects = useCallback((updater: (current: ActiveEffects) => ActiveEffects) => {
    setActiveEffects((currentEffects) => {
      const nextEffects = updater(currentEffects);
      activeEffectsRef.current = nextEffects;
      return nextEffects;
    });
  }, []);

  const triggerSpecialEffect = useCallback(
    (now: number) => {
      const effect = specialEffects[Math.floor(Math.random() * specialEffects.length)];
      updateEffects((currentEffects) => effect.apply(now, currentEffects));
      setEffectNow(now);
      setEffectPopup({ id: now, message: effect.message, polarity: effect.polarity });
      setPendingTimer(() => {
        setEffectPopup((currentPopup) => (currentPopup?.id === now ? null : currentPopup));
      }, 2600);
    },
    [setPendingTimer, updateEffects],
  );

  const getAudioContext = useCallback(() => {
    const audioWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextConstructor = audioWindow.AudioContext || audioWindow.webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextConstructor();
    }

    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const playSliceSound = useCallback(() => {
    const context = getAudioContext();
    if (!context) {
      return;
    }

    const start = context.currentTime;
    const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.18), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      const fade = 1 - index / samples.length;
      samples[index] = (Math.random() * 2 - 1) * fade * fade;
    }

    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const pop = context.createOscillator();
    const popGain = context.createGain();

    noise.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(720, start);
    filter.frequency.exponentialRampToValueAtTime(210, start + 0.16);
    filter.Q.setValueAtTime(0.7, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

    pop.type = "triangle";
    pop.frequency.setValueAtTime(190, start);
    pop.frequency.exponentialRampToValueAtTime(72, start + 0.11);
    popGain.gain.setValueAtTime(0.0001, start);
    popGain.gain.exponentialRampToValueAtTime(0.12, start + 0.012);
    popGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);

    noise.connect(filter).connect(gain).connect(context.destination);
    pop.connect(popGain).connect(context.destination);
    noise.start(start);
    noise.stop(start + 0.2);
    pop.start(start);
    pop.stop(start + 0.14);
  }, [getAudioContext]);

  const playFailureSound = useCallback(() => {
    const context = getAudioContext();
    if (!context) {
      return;
    }

    const start = context.currentTime;
    const output = context.createGain();
    output.gain.setValueAtTime(0.0001, start);
    output.gain.exponentialRampToValueAtTime(0.23, start + 0.02);
    output.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
    output.connect(context.destination);

    [82, 58].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const offset = index * 0.055;
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, start + offset + 0.16);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18);
      oscillator.connect(gain).connect(output);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.2);
    });
  }, [getAudioContext]);

  const makeNextFruit = useCallback((startX?: number) => {
    if (beltRef.current) {
      beltSizeRef.current = { width: beltRef.current.clientWidth, height: beltRef.current.clientHeight };
    }

    const now = performance.now();
    const elapsedSeconds = (now - startTimeRef.current) / 1000;
    fruitNumberRef.current += 1;
    const nextFruit = createFruit(beltSizeRef.current.height, elapsedSeconds, fruitNumberRef.current, activeEffectsRef.current, now);
    nextFruit.id = fruitIdRef.current;
    nextFruit.x = startX ?? -nextFruit.size - 18;
    fruitIdRef.current += 1;

    if (activeEffectsRef.current.freezeNextFruit) {
      const nextEffects = {
        ...activeEffectsRef.current,
        freezeNextFruit: false,
        freezeTargetFruitId: nextFruit.id,
      };
      activeEffectsRef.current = nextEffects;
      setActiveEffects(nextEffects);
    }

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
    setEffectNow(now);

    setFruits((currentFruits) => {
      const currentEffects = activeEffectsRef.current;
      const freezeTargetX = currentBeltSize.width * 0.5;
      let activatedFreezeEffects: ActiveEffects | null = null;
      const nextFruits = currentFruits
        .map((fruit) => {
          if (fruit.cut || currentEffects.frozenFruitId === fruit.id) {
            return fruit;
          }

          let nextX = fruit.x + fruit.speed * deltaSeconds;
          if (
            currentEffects.freezeTargetFruitId === fruit.id &&
            nextX + fruit.size / 2 >= freezeTargetX
          ) {
            nextX = freezeTargetX - fruit.size / 2;
            activatedFreezeEffects = {
              ...currentEffects,
              frozenFruitId: fruit.id,
              freezeTargetFruitId: null,
            };
          }

          return {
            ...fruit,
            x: nextX,
          };
        })
        .filter((fruit) => fruit.cut || fruit.x < currentBeltSize.width + fruit.size + 8);

      if (activatedFreezeEffects) {
        activeEffectsRef.current = activatedFreezeEffects;
        window.setTimeout(() => setActiveEffects(activatedFreezeEffects as ActiveEffects), 0);
      }

      const missedFruit = nextFruits.some(
        (fruit) => !fruit.cut && fruit.x > currentBeltSize.width + fruit.size * 0.45,
      );

      if (missedFruit) {
        window.setTimeout(endGame, 0);
        fruitsRef.current = nextFruits;
        return nextFruits;
      }

      fruitsRef.current = nextFruits;
      return nextFruits;
    });
  }, [endGame]);

  const startGame = useCallback(() => {
    getAudioContext();

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }

    clearPendingTimers();

    if (beltRef.current) {
      beltSizeRef.current = { width: beltRef.current.clientWidth, height: beltRef.current.clientHeight };
    }

    fruitNumberRef.current = 0;
    activeEffectsRef.current = EMPTY_EFFECTS;
    setScore(0);
    setFloatingPoints([]);
    setCutScraps([]);
    setActiveEffects(EMPTY_EFFECTS);
    setEffectNow(performance.now());
    setEffectPopup(null);
    setKnifeState("ready");
    knifeDroppingRef.current = false;
    knifeMissRef.current = false;
    startTimeRef.current = performance.now();
    lastFrameRef.current = performance.now();
    const starterFruit = makeNextFruit();
    setFruits([starterFruit]);
    setGameState("playing");
    gameStateRef.current = "playing";
    scoreRef.current = 0;
    fruitsRef.current = [starterFruit];
    tickGame();
    timerRef.current = window.setInterval(tickGame, 16);
  }, [clearPendingTimers, getAudioContext, makeNextFruit, tickGame]);

  const cutFruit = useCallback((fruit: Fruit, cutX: number, impactX = fruit.x + cutX) => {
    if (gameStateRef.current !== "playing" || fruit.cut) {
      return;
    }

    const cutPercent = Math.min(78, Math.max(22, (cutX / fruit.size) * 100));

    const now = performance.now();
    const scoreDelta = activeEffectsRef.current.scoreUntil > now && activeEffectsRef.current.scoreMultiplier === 2 ? 2 : 1;
    if (
      activeEffectsRef.current.frozenFruitId === fruit.id ||
      activeEffectsRef.current.freezeTargetFruitId === fruit.id
    ) {
      const nextEffects = {
        ...activeEffectsRef.current,
        frozenFruitId: null,
        freezeTargetFruitId: null,
      };
      activeEffectsRef.current = nextEffects;
      setActiveEffects(nextEffects);
    }

    setScore((currentScore) => currentScore + scoreDelta);
    setCutScraps((scraps) => {
      const scrapSize = Math.max(18, Math.min(42, fruit.size * 0.38));
      const startX = 34 + impactX;
      const beltWidth = beltSizeRef.current.width;
      const minimumX = 44;
      const maximumX = beltWidth + 24;
      const spread = Math.min(180, Math.max(70, fruit.size * 1.2));
      const nextScraps: CutScrap[] = [-1, 1].map((direction, index) => {
        const drift = direction * randomBetween(spread * 0.45, spread);
        return {
          id: fruit.id * 10 + index,
          type: fruit.type,
          x: Math.min(maximumX, Math.max(minimumX, startX + drift + randomBetween(-28, 28))),
          startX,
          size: scrapSize * randomBetween(0.82, 1.08),
          rotation: randomBetween(18, 46) * direction,
          settleY: randomBetween(10, 48),
        };
      });
      return [...scraps.slice(-62), ...nextScraps];
    });
    setFloatingPoints((points) => [...points, { id: fruit.id, x: impactX, y: fruit.y, value: scoreDelta }]);
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
    }, 560);

    setPendingTimer(() => {
      if (gameStateRef.current !== "playing") {
        return;
      }

      const nextFruit = makeNextFruit();
      setFruits([nextFruit]);
    }, 380);

    if (fruit.type === "starfruit") {
      triggerSpecialEffect(now);
    }
  }, [makeNextFruit, setPendingTimer, triggerSpecialEffect]);

  const dropKnife = useCallback(() => {
    if (gameStateRef.current !== "playing" || knifeDroppingRef.current) {
      return;
    }

    getAudioContext();

    if (beltRef.current) {
      beltSizeRef.current = { width: beltRef.current.clientWidth, height: beltRef.current.clientHeight };
    }

    knifeDroppingRef.current = true;
    knifeMissRef.current = false;
    setKnifeState("dropping");

    setPendingTimer(() => {
      const now = performance.now();
      const currentEffects = activeEffectsRef.current;
      const currentKnifeMode =
        currentEffects.knifeUntil > now && currentEffects.knifeMode !== "normal" ? currentEffects.knifeMode : "normal";
      const knifeX = beltSizeRef.current.width * 0.5;
      const hitAllowance = KNIFE_COLLISION_WIDTH[currentKnifeMode] * 0.18 + 4;
      const hittableFruit = fruitsRef.current
        .filter((fruit) => !fruit.cut)
        .map((fruit) => {
          const settings = fruitSettings[fruit.type];
          const visualWidth = fruit.size * (settings.visualWidthScale ?? 1);
          const visualLeft = fruit.x;
          const visualRight = visualLeft + visualWidth;
          const fruitCenter = visualLeft + visualWidth / 2;
          const cutX = ((knifeX - visualLeft) / visualWidth) * fruit.size;
          const visualHitHalfWidth = visualWidth * settings.hitScale * 0.5 + hitAllowance;
          return {
            fruit,
            cutX,
            distance: Math.abs(fruitCenter - knifeX),
            hitHalfWidth: visualHitHalfWidth,
            impactX: knifeX,
            edgeAllowance: hitAllowance,
            visualLeft,
            visualRight,
          };
        })
        .filter(
          ({ cutX, distance, edgeAllowance, fruit, hitHalfWidth, visualLeft, visualRight }) =>
            cutX >= 0 &&
            cutX <= fruit.size &&
            distance <= hitHalfWidth &&
            knifeX >= visualLeft - edgeAllowance &&
            knifeX <= visualRight + edgeAllowance,
        )
        .sort((first, second) => first.distance - second.distance)[0];

      if (hittableFruit) {
        playSliceSound();
        cutFruit(hittableFruit.fruit, hittableFruit.cutX, hittableFruit.impactX);
        setKnifeState("hidden");
        setPendingTimer(() => {
          knifeDroppingRef.current = false;
          setKnifeState("ready");
        }, KNIFE_RESPAWN_MS);
        return;
      }

      playFailureSound();
      setKnifeState("stuck");
      knifeMissRef.current = true;
      setPendingTimer(() => {
        knifeDroppingRef.current = false;
        endGame();
      }, 650);
    }, KNIFE_IMPACT_MS);
  }, [cutFruit, endGame, getAudioContext, playFailureSound, playSliceSound, setPendingTimer]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      clearPendingTimers();
    },
    [clearPendingTimers],
  );

  useEffect(() => {
    const queries = [
      window.matchMedia("(max-width: 960px)"),
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(display-mode: fullscreen)"),
      window.matchMedia("(display-mode: standalone)"),
    ];
    const updateMobileAppLayout = () => {
      const useMobileLayout = shouldUseMobileAppLayout();
      setIsImmersiveMode(useMobileLayout);

      if (useMobileLayout) {
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (orientation: OrientationLockType) => Promise<void>;
        };
        void orientation.lock?.("landscape").catch(() => undefined);
      }
    };

    updateMobileAppLayout();
    queries.forEach((query) => query.addEventListener("change", updateMobileAppLayout));
    return () => queries.forEach((query) => query.removeEventListener("change", updateMobileAppLayout));
  }, []);

  const isDoubleScoreActive = activeEffects.scoreUntil > effectNow && activeEffects.scoreMultiplier === 2;
  const isFreezeActive =
    activeEffects.freezeNextFruit || activeEffects.freezeTargetFruitId !== null || activeEffects.frozenFruitId !== null;
  const isTinyFruitActive = activeEffects.tinyFruitUntil > effectNow;
  const currentKnifeMode = activeEffects.knifeUntil > effectNow ? activeEffects.knifeMode : "normal";
  const activeEffectBadges = [
    isDoubleScoreActive ? { label: "x2 Score", time: formatRemaining(activeEffects.scoreUntil, effectNow) } : null,
    currentKnifeMode !== "normal"
      ? { label: currentKnifeMode === "wide" ? "Wide Knife" : "Skinny Knife", time: formatRemaining(activeEffects.knifeUntil, effectNow) }
      : null,
    isFreezeActive
      ? {
          label: "Time Freeze",
          time: activeEffects.frozenFruitId !== null ? "until cut" : "arming",
        }
      : null,
    isTinyFruitActive ? { label: "Tiny Fruit", time: formatRemaining(activeEffects.tinyFruitUntil, effectNow) } : null,
  ].filter(Boolean) as Array<{ label: string; time: string }>;

  return (
    <main className={`app-shell${isImmersiveMode ? " is-immersive" : ""}`}>
      <aside className="rotate-phone-screen" aria-live="polite">
        <div className="rotate-phone-mark" aria-hidden="true">
          <span />
        </div>
        <p>Fruitworks</p>
        <h2>Rotate your phone</h2>
      </aside>

      <section
        className={`game-frame${isFreezeActive ? " is-frozen" : ""}${isDoubleScoreActive ? " has-double-score" : ""}${
          isImmersiveMode ? " is-immersive" : ""
        }`}
        aria-label="Conveyor Fruit Cutter Game"
      >
        {isDoubleScoreActive && (
          <div className="spark-field" aria-hidden="true">
            {Array.from({ length: 14 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        )}

        {effectPopup && (
          <div className={`special-popup is-${effectPopup.polarity}`} aria-live="polite">
            <strong>Special Starfruit Effect:</strong>
            <span>{effectPopup.message}</span>
          </div>
        )}

        {activeEffectBadges.length > 0 && (
          <div className="effect-status-panel" aria-live="polite">
            {activeEffectBadges.map((badge) => (
              <div className="effect-badge" key={badge.label}>
                <span>{badge.label}</span>
                <strong>{badge.time}</strong>
              </div>
            ))}
          </div>
        )}

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
          ref={factorySceneRef}
          role="button"
          tabIndex={gameState === "playing" ? 0 : -1}
        >
          <div
            className={`knife-rig is-${knifeState} knife-${currentKnifeMode}`}
            style={knifeLineX === null ? undefined : ({ left: `${knifeLineX}px` } as React.CSSProperties)}
            aria-hidden="true"
          >
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
            </div>
            <div className="fruit-layer" aria-hidden="true">
              {fruits.map((fruit) => (
                <FruitSprite fruit={fruit} key={fruit.id} />
              ))}
              {floatingPoints.map((point) => (
                <span
                  className="floating-point"
                  key={point.id}
                  style={{ left: `${point.x}px`, top: `${point.y}px` }}
                >
                  +{point.value}
                </span>
              ))}
            </div>
            <div className="belt-end belt-end-right" aria-hidden="true" />
            <div className="cut-scrap-layer" aria-hidden="true">
              {cutScraps.map((scrap) => (
                <CutScrapPiece key={scrap.id} scrap={scrap} />
              ))}
            </div>
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
