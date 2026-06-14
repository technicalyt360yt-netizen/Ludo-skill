import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, 
  RotateCcw, 
  Smile, 
  Terminal, 
  Award, 
  TrendingUp, 
  AlertCircle,
  HelpCircle,
  Play,
  Volume2,
  Clock,
  ShieldAlert,
  Frown,
  CheckCircle,
  ChevronRight,
  UserX
} from "lucide-react";
import { 
  TRACK, 
  START_INDEX_GREEN, 
  START_INDEX_YELLOW, 
  isSafeTrackCoordinate, 
  getTokenCoordinate, 
  isValidMove 
} from "../lib/ludo_rules";
import { RealTimeGameState, UserProfile } from "../types";
import { useSoundManager } from "../hooks/useSoundManager";

interface GameViewProps {
  currentUser: UserProfile;
  matchId: string;
  onExit: () => void;
}

export default function GameView({ currentUser, matchId, onExit }: GameViewProps) {
  const [gameState, setGameState] = useState<RealTimeGameState | null>(null);
  
  // Local visual overrides for animations (eliminates network delay jitter)
  const [localTokensGreen, setLocalTokensGreen] = useState<number[]>([-1, -1, -1, -1]);
  const [localTokensYellow, setLocalTokensYellow] = useState<number[]>([-1, -1, -1, -1]);
  
  const [isRollingLocal, setIsRollingLocal] = useState(false);
  const [isMovingLocal, setIsMovingLocal] = useState(false);
  const [pinnedDiceValue, setPinnedDiceValue] = useState<number | null>(null);
  const [stableRoll, setStableRoll] = useState<number | null>(null);

  // Leave Game Warning Modal
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);

  // Timers countdown tracking
  const [timeLeft, setTimeLeft] = useState(5); // 5s to roll, 12s to move
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Audio state toggle, trackers, and managers
  const [isMuted, setIsMuted] = useState(false);
  const { playRoll, playMove, playCapture, playWin, playLoss } = useSoundManager(isMuted);

  const isFirstLoadRef = useRef(true);
  const hasPlayedEndSoundRef = useRef(false);
  const prevDiceRollRef = useRef<number | null>(null);
  const prevTurnRef = useRef<string | null>(null);
  const prevTokensGreenRef = useRef<number[]>([-1, -1, -1, -1]);
  const prevTokensYellowRef = useRef<number[]>([-1, -1, -1, -1]);

  // Floating rolled number overlay animation
  const [rollOverlayNum, setRollOverlayNum] = useState<number | null>(null);
  const [rollOverlayVisible, setRollOverlayVisible] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Safe side effects tracker to play audio and trigger animations on the fly
  useEffect(() => {
    if (!gameState) return;

    if (isFirstLoadRef.current) {
      prevDiceRollRef.current = gameState.dice_roll;
      prevTurnRef.current = gameState.turn;
      prevTokensGreenRef.current = [...localTokensGreen];
      prevTokensYellowRef.current = [...localTokensYellow];
      isFirstLoadRef.current = false;
      return;
    }

    // Trigger Win or Loss sound on game completion
    if (gameState.finished && !hasPlayedEndSoundRef.current) {
      if (gameState.winnerId === currentUser.id) {
        playWin();
      } else {
        playLoss();
      }
      hasPlayedEndSoundRef.current = true;
    } else if (!gameState.finished) {
      hasPlayedEndSoundRef.current = false;
    }

    const curDiceRoll = gameState.dice_roll;
    const prevDiceRoll = prevDiceRollRef.current;
    if (curDiceRoll !== null && curDiceRoll !== prevDiceRoll && !isRollingLocal) {
      playRoll();
      setRollOverlayNum(curDiceRoll);
      setRollOverlayVisible(true);
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = setTimeout(() => {
        setRollOverlayVisible(false);
      }, 1500);
    }
    prevDiceRollRef.current = curDiceRoll;
    prevTurnRef.current = gameState.turn;
  }, [gameState, playRoll, playWin, playLoss, currentUser.id]);

  useEffect(() => {
    if (isFirstLoadRef.current) return;
    const prevG = prevTokensGreenRef.current;
    
    // Check if a move happened
    const moved = localTokensGreen.some((step, idx) => prevG[idx] !== undefined && step !== prevG[idx]);
    if (moved) {
      // Check if it was a capture (step became -1 from a valid step >= 0)
      const wasCaptured = localTokensGreen.some((step, idx) => prevG[idx] !== undefined && prevG[idx] >= 0 && step === -1);
      if (wasCaptured) {
        playCapture();
      } else {
        playMove();
      }
    }
    prevTokensGreenRef.current = [...localTokensGreen];
  }, [localTokensGreen, playMove, playCapture]);

  useEffect(() => {
    if (isFirstLoadRef.current) return;
    const prevY = prevTokensYellowRef.current;
    
    // Check if a move happened
    const moved = localTokensYellow.some((step, idx) => prevY[idx] !== undefined && step !== prevY[idx]);
    if (moved) {
      // Check if it was a capture (step became -1 from a valid step >= 0)
      const wasCaptured = localTokensYellow.some((step, idx) => prevY[idx] !== undefined && prevY[idx] >= 0 && step === -1);
      if (wasCaptured) {
        playCapture();
      } else {
        playMove();
      }
    }
    prevTokensYellowRef.current = [...localTokensYellow];
  }, [localTokensYellow, playMove, playCapture]);

  // Sync state with server
  const fetchGameState = async () => {
    try {
      const res = await fetch(`/api/game/state/${matchId}`);
      if (!res.ok) return;
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        return;
      }
      const game: RealTimeGameState = await res.json();
      
      // Reconcile and update local state only if we aren't performing a visual hop animation on screen!
      if (!isMovingLocal) {
        setGameState(game);
        setLocalTokensGreen(game.player1.color === "green" ? game.player1.tokens : game.player2.tokens);
        setLocalTokensYellow(game.player1.color === "yellow" ? game.player1.tokens : game.player2.tokens);
      }

      // Sync stabilized dice roll
      if (!isRollingLocal && game.dice_roll !== null) {
        setStableRoll(game.dice_roll);
      } else if (game.dice_roll === null) {
        setStableRoll(null);
      }

      // Sync countdown clocks
      const elapsedSec = (Date.now() - game.lastActionTime) / 1000;
      if (game.must_roll) {
        const remaining = Math.max(0, Math.ceil(5 - elapsedSec));
        setTimeLeft(remaining);
      } else {
        const remaining = Math.max(0, Math.ceil(12 - elapsedSec));
        setTimeLeft(remaining);
      }

    } catch (err) {
      console.error("Error drawing game session frame", err);
    }
  };

  useEffect(() => {
    fetchGameState();
    const syncInterval = setInterval(fetchGameState, 1500);
    return () => clearInterval(syncInterval);
  }, [isMovingLocal, isRollingLocal]);

  // Dice roll command
  const handleRollDice = async () => {
    if (!gameState || isRollingLocal || isMovingLocal || !canRoll) return;

    setIsRollingLocal(true);
    setStableRoll(null);
    playRoll(); // Instant responsive roll play feedback

    try {
      const res = await fetch("/api/game/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, userId: currentUser.id })
      });
      
      if (res.ok) {
        // Shaking duration 800ms
        setTimeout(async () => {
          setIsRollingLocal(false);
          await fetchGameState();
        }, 900);
      } else {
        setIsRollingLocal(false);
      }
    } catch {
      setIsRollingLocal(false);
    }
  };

  // Hop visual animation: Moves token step-by-step with 140ms delay for high-immersion visual hopping!
  const animateOpponentOrSelfMove = (color: "green" | "yellow", tokenIdx: number, fromStep: number, targetStep: number, onFinish: () => void) => {
    setIsMovingLocal(true);
    let stepCount = fromStep;

    const interval = setInterval(() => {
      stepCount++;
      if (color === "green") {
        setLocalTokensGreen(prev => {
          const next = [...prev];
          next[tokenIdx] = stepCount;
          return next;
        });
      } else {
        setLocalTokensYellow(prev => {
          const next = [...prev];
          next[tokenIdx] = stepCount;
          return next;
        });
      }

      if (stepCount >= targetStep) {
        clearInterval(interval);
        setIsMovingLocal(false);
        onFinish();
      }
    }, 140);
  };

  // Move token command click
  const handleMoveToken = async (tokenIdx: number) => {
    if (!gameState || isRollingLocal || isMovingLocal || !canMove || stableRoll === null) return;

    // Determine current step
    const myGroup = gameState.player1.id === currentUser.id ? gameState.player1 : gameState.player2;
    const originalStep = myGroup.tokens[tokenIdx];
    
    if (!isValidMove(originalStep, stableRoll)) return;

    const finalStep = originalStep === -1 ? 0 : originalStep + stableRoll;

    // Optimistic hopping animation in client UI:
    animateOpponentOrSelfMove(myGroup.color, tokenIdx, originalStep, finalStep, async () => {
      try {
        const res = await fetch("/api/game/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, userId: currentUser.id, tokenIndex: tokenIdx })
        });
        
        if (res.ok) {
          const game = await res.json();
          setGameState(game);
          setLocalTokensGreen(game.player1.color === "green" ? game.player1.tokens : game.player2.tokens);
          setLocalTokensYellow(game.player1.color === "yellow" ? game.player1.tokens : game.player2.tokens);
          setStableRoll(null);
        }
      } catch (err) {
        console.error("Move sync failed", err);
      }
    });
  };

  // Forfeit / Leave Match Action
  const handleLeaveGameConfirm = async () => {
    try {
      await fetch("/api/game/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, userId: currentUser.id })
      });
      setLeaveModalOpen(false);
      onExit();
    } catch {
      setLeaveModalOpen(false);
    }
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <span className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <h3 className="text-sm font-mono text-slate-400">Loading game room coordinates...</h3>
      </div>
    );
  }

  // Identity variables
  const myPlayer = gameState.player1.id === currentUser.id ? gameState.player1 : gameState.player2;
  const oppPlayer = gameState.player1.id === currentUser.id ? gameState.player2 : gameState.player1;
  const isMyTurn = gameState.turn === currentUser.id;

  const canRoll = isMyTurn && gameState.must_roll && !gameState.rolling && !gameState.moving && !gameState.finished;
  const canMove = isMyTurn && !gameState.must_roll && stableRoll !== null && !gameState.rolling && !gameState.moving && !gameState.finished;

  // Render variables for safe zones markers or safe counts
  const cellPositionsMap: { [coordsStr: string]: Array<{ color: "green" | "yellow"; tokenIdx: number }> } = {};

  const populatePositions = () => {
    // Green
    localTokensGreen.forEach((step, idx) => {
      const crd = getTokenCoordinate("green", idx, step);
      const str = `${crd[0]},${crd[1]}`;
      if (!cellPositionsMap[str]) cellPositionsMap[str] = [];
      cellPositionsMap[str].push({ color: "green", tokenIdx: idx });
    });
    // Yellow
    localTokensYellow.forEach((step, idx) => {
      const crd = getTokenCoordinate("yellow", idx, step);
      const str = `${crd[0]},${crd[1]}`;
      if (!cellPositionsMap[str]) cellPositionsMap[str] = [];
      cellPositionsMap[str].push({ color: "yellow", tokenIdx: idx });
    });
  };

  populatePositions();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden" id="play-arena">
      
      {/* GLOWS */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* HEADER ROOM QUICK BAR */}
      <header className="bg-slate-900 border-b border-slate-800/80 px-6 py-4.5 flex items-center justify-between z-10" id="play-header">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setLeaveModalOpen(true)}
            id="leave-game-trigger"
            className="p-2 bg-slate-800 hover:bg-slate-700 hover:text-rose-400 text-slate-400 rounded-lg transition"
            title="Leave Match"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-base font-black text-white">LudoSkill Arena</span>
              <span className="px-2 py-0.5 bg-emerald-500 text-[9px] font-black text-slate-950 uppercase rounded-md">Legit roll</span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Match Stake: <span className="text-yellow-400 font-bold">{gameState.isPractice ? "Practice Match (No Prize)" : (gameState.consecutiveMisses && gameState.winnerId ? "Refunded" : `Rs. ${gameState.stakeAmount || 50}`)}</span>
            </p>
          </div>
        </div>

        {/* Turn Status overlay */}
        <div className="text-right flex items-center space-x-3" id="play-score-board">
          <button
            onClick={() => setIsMuted(prev => !prev)}
            className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg transition flex items-center space-x-1.5 text-xs border border-slate-750"
            title={isMuted ? "Unmute sounds" : "Mute sounds"}
          >
            <Volume2 size={15} className={isMuted ? "text-rose-400" : "text-emerald-400"} />
            <span className="hidden sm:inline font-mono font-bold text-[10px]">{isMuted ? "Muted" : "Sounds On"}</span>
          </button>

          {gameState.finished ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-black">
              MATCH COMPLETED
            </div>
          ) : (
            <div className={`px-4 py-2 border rounded-2xl flex items-center space-x-2 bg-slate-950 ${
              isMyTurn ? "border-emerald-500 animate-pulse text-emerald-400" : "border-slate-800 text-slate-400"
            }`}>
              <Clock size={14} />
              <div className="text-xs font-bold leading-none font-mono tracking-wide">
                {isMyTurn ? "Your Turn!" : "Opponent Turn..."} ({timeLeft}s)
              </div>
            </div>
          )}
        </div>
      </header>

      {/* WORKSPACE CONTENT AREA */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 lg:p-6 flex flex-col items-center justify-start lg:grid lg:grid-cols-12 gap-4 lg:gap-6 overflow-y-auto lg:overflow-visible" id="play-arena-layout">
        
        {/* LEFT COLUMN: VISUAL VECTOR LUDO BOARD GRID */}
        <div className="lg:col-span-7 flex justify-center w-full max-w-[420px] lg:max-w-none mx-auto" id="ludo-board-frame">
          <div className="w-full aspect-square bg-slate-900 border border-slate-800/80 shadow-2xl rounded-2xl p-2 lg:p-4.5 flex items-center justify-center relative max-h-[42vh] lg:max-h-none">
            
            {/* 15x15 SVG vector board canvas */}
            <svg 
              viewBox="0 0 600 600" 
              className="w-full h-full bg-slate-950 border border-slate-900 rounded-xl"
            >
              <defs>
                <radialGradient id="greenBaseGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#047857" />
                </radialGradient>
                <radialGradient id="yellowBaseGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#b45309" />
                </radialGradient>
                <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
                  <rect width="40" height="40" fill="transparent" stroke="#1e293b" strokeWidth="1" />
                </pattern>
              </defs>

              {/* Grid backdrop */}
              <rect width="600" height="600" fill="url(#gridPattern)" />

              {/* 1. GREEN HOME BASE (BOTTOM-LEFT, rows 9..14, cols 0..5) */}
              {/* x: 0, y: 360, w: 240, h: 240 */}
              <rect x="0" y="360" width="240" height="240" fill="#047857" opacity="0.15" rx="8" />
              <rect x="15" y="375" width="210" height="210" fill="url(#greenBaseGrad)" opacity="0.3" rx="16" stroke="#10b981" strokeWidth="2" />
              <rect x="40" y="400" width="160" height="160" fill="#022c22" rx="12" stroke="#10b981" strokeWidth="1" />
              {/* Yard Token circular slots */}
              <circle cx="80" cy="440" r="16" fill="#10b981" />
              <circle cx="160" cy="440" r="16" fill="#10b981" />
              <circle cx="80" cy="520" r="16" fill="#10b981" />
              <circle cx="160" cy="520" r="16" fill="#10b981" />

              {/* 2. YELLOW HOME BASE (TOP-RIGHT, rows 0..5, cols 9..14) */}
              {/* x: 360, y: 0, w: 240, h: 240 */}
              <rect x="360" y="0" width="240" height="240" fill="#b45309" opacity="0.15" rx="8" />
              <rect x="375" y="15" width="210" height="210" fill="url(#yellowBaseGrad)" opacity="0.3" rx="16" stroke="#f59e0b" strokeWidth="2" />
              <rect x="400" y="40" width="160" height="160" fill="#451a03" rx="12" stroke="#f59e0b" strokeWidth="1" />
              {/* Yard Token circular slots */}
              <circle cx="440" cy="80" r="16" fill="#f59e0b" />
              <circle cx="520" cy="80" r="16" fill="#f59e0b" />
              <circle cx="440" cy="160" r="16" fill="#f59e0b" />
              <circle cx="520" cy="160" r="16" fill="#f59e0b" />

              {/* Dummy other quadrants for Ludo layout completeness */}
              {/* Red (Top-Left): rows 0..5, cols 0..5 (x: 0, y:0, w: 240, h:240) */}
              <rect x="0" y="0" width="240" height="240" fill="#be123c" opacity="0.15" rx="8" />
              <rect x="15" y="15" width="210" height="210" fill="#e11d48" opacity="0.1" rx="16" stroke="#f43f5e" strokeWidth="1" />
              {/* Blue (Bottom-Right): rows 9..14, cols 9..14 (x:360, y:360) */}
              <rect x="360" y="360" width="240" height="240" fill="#1d4ed8" opacity="0.15" rx="8" />
              <rect x="375" y="375" width="210" height="210" fill="#2563eb" opacity="0.1" rx="16" stroke="#3b82f6" strokeWidth="1" />

              {/* 3. HOME COLUMNS AND TRIANGLE MEETING CENTERS */}
              {/* Bottom arm home column (Green Center path, rises from bottom): col 7, rows 9..13. Green step 52 to 56 */}
              {/* Cell coordinates: [13, 7], [12, 7], [11, 7], [10, 7], [9, 7]. */}
              <rect x="280" y="360" width="40" height="200" fill="#047857" opacity="0.4" stroke="#10b981" strokeWidth="1" />
              {/* Top arm home column (Yellow Center path, descends from top): col 7, rows 1..5. Yellow step 52 to 56 */}
              {/* Cell coordinates: [1, 7], [2, 7], [3, 7], [4, 7], [5, 7]. */}
              <rect x="280" y="40" width="40" height="200" fill="#b45309" opacity="0.4" stroke="#f59e0b" strokeWidth="1" />

              {/* 4. HOME TRIANGLEmeeting points (Meeting at center, rows 6..8, cols 6..8) */}
              {/* x: 240..360, y: 240..360. Meeting center: (300, 300) */}
              {/* Green (Bottom triangle): (240,360) to (360,360) to (300,300) */}
              <polygon points="240,360 360,360 300,300" fill="#10b981" opacity="0.6" stroke="#10b981" strokeWidth="2" />
              {/* Yellow (Top triangle): (240,240) to (360,240) to (300,300) */}
              <polygon points="240,240 360,240 300,300" fill="#f59e0b" opacity="0.6" stroke="#f59e0b" strokeWidth="2" />
              {/* Red (Left triangle): (240,240) to (240,360) to (300,300) */}
              <polygon points="240,240 240,360 300,300" fill="#f43f5e" opacity="0.25" stroke="#f43f5e" strokeWidth="1" />
              {/* Blue (Right triangle): (360,240) to (360,360) to (300,300) */}
              <polygon points="360,240 360,360 300,300" fill="#3b82f6" opacity="0.25" stroke="#3b82f6" strokeWidth="1" />

              {/* 5. INDIVIDUAL PLAYER START CELL BACKGROUNDS AND SAFE CELLS */}
              {/* P1 Green start: [13, 6] = x = 6*40 = 240, y = 13*40 = 520 */}
              <rect x="240" y="520" width="40" height="40" fill="#10b981" opacity="0.5" stroke="#10b981" strokeWidth="1.5" />
              
              {/* P2 Yellow start: [1, 8] = x = 8*40 = 320, y = 1*40 = 40 */}
              <rect x="320" y="40" width="40" height="40" fill="#f59e0b" opacity="0.5" stroke="#f59e0b" strokeWidth="1.5" />

              {/* Safe Star Squares Symbols */}
              {/* Star shape function */}
              {TRACK.map((crd, idx) => {
                if (isSafeTrackCoordinate(crd[0], crd[1])) {
                  const cx = crd[1] * 40 + 20;
                  const cy = crd[0] * 40 + 20;
                  return (
                    <g key={`star-${idx}`}>
                      {/* Draws a nice golden safe icon */}
                      <polygon 
                        points={`${cx},${cy - 12} ${cx + 3},${cy - 3} ${cx + 12},${cy - 3} ${cx + 5},${cy + 3} ${cx + 8},${cy + 12} ${cx},${cy + 6} ${cx - 8},${cy + 12} ${cx - 5},${cy + 3} ${cx - 12},${cy - 3} ${cx - 3},${cy - 3}`}
                        fill="#fbbf24"
                        stroke="#b45309"
                        strokeWidth="1"
                      />
                    </g>
                  );
                }
                return null;
              })}

              {/* 6. TOKENS DRAW LAYER OVER SVG GRID CELLS */}
              {Object.keys(cellPositionsMap).map((coordsStr) => {
                const parts = coordsStr.split(",");
                const row = parseInt(parts[0]);
                const col = parseInt(parts[1]);
                
                // Get absolute center coordinate
                const cx = col * 40 + 20;
                const cy = row * 40 + 20;

                const tokensAtCell = cellPositionsMap[coordsStr];
                
                return tokensAtCell.map((token, j) => {
                  const isMine = myPlayer.color === token.color;
                  // Handle slight offset overlay if multiple tokens share the exact same cell coordinate
                  const offsetScale = 6;
                  const shiftX = tokensAtCell.length > 1 ? (j - (tokensAtCell.length - 1) / 2) * offsetScale : 0;
                  const shiftY = tokensAtCell.length > 1 ? (j - (tokensAtCell.length - 1) / 2) * -offsetScale : 0;
                  
                  const isMovableLocal = isMine && canMove && isValidMove(
                    myPlayer.tokens[token.tokenIdx], 
                    stableRoll || 0
                  );

                  return (
                    <g 
                      key={`token-${token.color}-${token.tokenIdx}`} 
                      className={`${isMovableLocal ? "cursor-pointer" : "pointer-events-none"}`}
                      onClick={() => isMovableLocal && handleMoveToken(token.tokenIdx)}
                    >
                      {/* Movable Ring Glow effect */}
                      {isMovableLocal && (
                        <circle 
                          cx={cx + shiftX} 
                          cy={cy + shiftY} 
                          r="19" 
                          fill="none" 
                          stroke="#10b981" 
                          strokeWidth="2" 
                          strokeDasharray="4,4"
                          className="animate-spin"
                          style={{ transformOrigin: `${cx + shiftX}px ${cy + shiftY}px`, animationDuration: "5s" }}
                        />
                      )}

                      {/* Token Cylinder Base */}
                      <circle 
                        cx={cx + shiftX} 
                        cy={cy + shiftY + 2} 
                        r="14" 
                        fill={token.color === "green" ? "#064e3b" : "#78350f"} 
                        opacity="0.9"
                      />

                      {/* Token Primary Body Cylinder */}
                      <circle 
                        cx={cx + shiftX} 
                        cy={cy + shiftY} 
                        r="12" 
                        fill={token.color === "green" ? "#10b981" : "#f59e0b"} 
                        stroke="#fff" 
                        strokeWidth="1.5"
                        className={isMovableLocal ? "animate-pulse" : ""}
                      />

                      {/* Nested Inside Sphere */}
                      <circle 
                        cx={cx + shiftX} 
                        cy={cy + shiftY} 
                        r="6" 
                        fill="#fff" 
                        opacity="0.8" 
                      />

                      {/* Token Identifier Num label */}
                      <text
                        x={cx + shiftX}
                        y={cy + shiftY + 3.5}
                        fill={token.color === "green" ? "#064e3b" : "#78350f"}
                        fontSize="10"
                        fontWeight="black"
                        textAnchor="middle"
                        className="font-mono pointer-events-none select-none"
                      >
                        {token.tokenIdx + 1}
                      </text>
                    </g>
                  );
                });
              })}

              {/* Centered Floating Roll Result animation badge */}
              {rollOverlayVisible && rollOverlayNum !== null && (
                <g className="animate-bounce select-none pointer-events-none" style={{ transformOrigin: "300px 300px" }}>
                  <circle cx="300" cy="300" r="54" fill="#030712" opacity="0.96" stroke="#f59e0b" strokeWidth="4.5" />
                  <circle cx="300" cy="300" r="48" fill="#1e1b4b" stroke="#10b981" strokeWidth="1" className="animate-pulse" />
                  <text
                    x="300"
                    y="288"
                    fill="#10b981"
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="black"
                    textAnchor="middle"
                    className="uppercase tracking-widest pointer-events-none select-none"
                  >
                    ROLLED
                  </text>
                  <text
                    x="300"
                    y="322"
                    fill="#ffffff"
                    fontSize="32"
                    fontFamily="system-ui, sans-serif"
                    fontWeight="black"
                    textAnchor="middle"
                    className="pointer-events-none select-none"
                  >
                    🎲 {rollOverlayNum}
                  </text>
                </g>
              )}

            </svg>

          </div>
        </div>

        {/* RIGHT COLUMN: 3D DICE & INTERACTIVE CONTROLS */}
        <div className="lg:col-span-5 space-y-3 lg:space-y-6 w-full max-w-[420px] lg:max-w-none mx-auto" id="play-controls-col">
          
          {/* Active Opponent Info Card at bottom */}
          <div className={`p-3 lg:p-4 rounded-2xl border transition text-xs lg:text-sm ${
            !isMyTurn && !gameState.finished ? "bg-indigo-950/20 border-indigo-500/50 scale-102 shadow-lg" : "bg-slate-900/60 border-slate-800"
          }`} id="opp-profile-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-slate-950 ${
                  oppPlayer.color === "green" ? "bg-emerald-400" : "bg-yellow-400"
                }`}>
                  {oppPlayer.color.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center space-x-1">
                    <span>{oppPlayer.id === "system-bot-id" ? "LudoBot (AI Master)" : oppPlayer.username}</span>
                    <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 text-slate-400 rounded">OPPONENT</span>
                  </div>
                  <div className="text-[10px] text-slate-500 leading-none mt-1">
                    Misses: {gameState.consecutiveMisses?.[oppPlayer.id] || 0}/3
                  </div>
                </div>
              </div>

              {!isMyTurn && !gameState.finished && (
                <div className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-500/15 text-indigo-400 text-[10px] uppercase font-bold tracking-wider rounded-lg border border-indigo-500/20">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" />
                  <span>MOVING...</span>
                </div>
              )}
            </div>
          </div>

          {/* DYNAMIC DICE ROLLER STATION */}
          <div className="p-4 lg:p-6 bg-slate-900 border border-slate-800 rounded-2xl lg:rounded-3xl text-center relative" id="dice-station-card">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2.5 lg:mb-4">Board Interaction Station</h3>

            <div className="flex flex-col items-center justify-center space-y-3.5 lg:space-y-6" id="dice-container-board">
              
              {/* CSS 3D Cube Dice */}
              <div 
                onClick={canRoll ? handleRollDice : undefined}
                className={`w-16 h-16 lg:w-20 lg:h-20 bg-slate-950 border-2 rounded-2xl flex items-center justify-center relative shadow-2xl transition duration-150 ${
                  canRoll ? "cursor-pointer border-emerald-400 shadow-emerald-400/30 hover:scale-105 hover:bg-slate-900 border-dashed animate-pulse ring-4 ring-emerald-500/20" : "border-slate-800"
                } ${isRollingLocal ? "animate-spin" : ""}`}
                title={canRoll ? "Click to Roll Dice!" : "Dice Locked"}
              >
                {/* Visual Glow */}
                <span className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-emerald-500/5 rounded-2xl pointer-events-none" />

                {isRollingLocal ? (
                  /* Shaking rolling animation pips mockup */
                  <div className="grid grid-cols-2 gap-2">
                    <span className="w-2.5 h-2.5 bg-slate-700 rounded-full animate-bounce" />
                    <span className="w-2.5 h-2.5 bg-slate-700 rounded-full animate-ping" />
                    <span className="w-2.5 h-2.5 bg-slate-700 rounded-full animate-ping" />
                    <span className="w-2.5 h-2.5 bg-slate-700 rounded-full animate-bounce" />
                  </div>
                ) : (
                  /* Authoritative Roll Stops Pips renderer */
                  <div className="text-4xl font-black text-white font-sans tracking-wide">
                    {stableRoll !== null ? (
                      <div className="flex flex-col items-center justify-center">
                        {/* Custom Pip grids for high aesthetic polish */}
                        <div className="grid grid-cols-3 gap-1.5 p-2">
                          {stableRoll === 1 && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                            </>
                          )}
                          {stableRoll === 2 && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            </>
                          )}
                          {stableRoll === 3 && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            </>
                          )}
                          {stableRoll === 4 && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-emerald-400 gap-1" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            </>
                          )}
                          {stableRoll === 5 && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            </>
                          )}
                          {stableRoll === 6 && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                              <div className="w-2 h-2 rounded-full bg-slate-950" />
                              <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            </>
                          )}
                        </div>
                        <span className="text-[10px] font-black uppercase text-emerald-400 mt-0.5 tracking-wider font-mono">
                          {stableRoll}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-700 text-sm font-bold font-mono uppercase tracking-wide">ROLL</span>
                    )}
                  </div>
                )}
              </div>

              {/* Prominent Golden-Emerald Dice Roll Button CTA */}
              {canRoll && (
                <button
                  onClick={handleRollDice}
                  id="primary-dice-roll-cta"
                  className="w-full max-w-[280px] py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 active:scale-95 text-slate-950 font-black text-xs uppercase rounded-xl tracking-wider shadow-lg shadow-emerald-500/30 transition-all border-2 border-emerald-300 animate-bounce cursor-pointer flex items-center justify-center space-x-2"
                >
                  <span>🎲</span>
                  <span className="font-extrabold tracking-widest">TAP TO ROLL DICE</span>
                  <span>🎲</span>
                </button>
              )}

              {/* Instructions prompting action */}
              <div className="text-xs font-medium text-slate-300 min-h-6" id="play-directive-label">
                {isMyTurn ? (
                  gameState.must_roll ? (
                    <span className="text-emerald-400 font-bold block animate-bounce">
                      👆 Click the dice to roll now! ({timeLeft} seconds left)
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-bold block">
                      👈 Click a marked glowing active Token to move! ({timeLeft} seconds left)
                    </span>
                  )
                ) : (
                  <span className="text-slate-500 block">
                    Opponent is thinking... Auto-timeout is active.
                  </span>
                )}
              </div>

              {/* Interactive buttons backup if SVG clicking fails */}
              {canMove && (
                <div className="w-full flex flex-col space-y-2 pt-2 border-t border-slate-800/60" id="token-backup-buttons">
                  <p className="text-[10px] text-slate-500">Or move using quick buttons:</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((idx) => {
                      const isValid = isValidMove(myPlayer.tokens[idx], stableRoll || 0);
                      return (
                        <button
                          key={idx}
                          disabled={!isValid}
                          onClick={() => handleMoveToken(idx)}
                          className={`py-2 text-xs font-extrabold rounded-xl transition ${
                            isValid 
                              ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black cursor-pointer shadow-md" 
                              : "bg-slate-950 text-slate-700"
                          }`}
                        >
                          T{idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ACTIVE SOVEREIGN USER INFO CARD at bottom bottom */}
          <div className={`p-3 lg:p-4 rounded-2xl border transition text-xs lg:text-sm ${
            isMyTurn && !gameState.finished ? "bg-emerald-950/20 border-emerald-500/50 scale-102 shadow-lg animate-pulse" : "bg-slate-900/60 border-slate-800"
          }`} id="my-profile-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-slate-950 ${
                  myPlayer.color === "green" ? "bg-emerald-400" : "bg-yellow-400"
                }`}>
                  {myPlayer.color.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center space-x-1">
                    <span>{myPlayer.username} (You)</span>
                    <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 text-slate-400 rounded">GREEN PLAYER</span>
                  </div>
                  <div className="text-[10px] text-slate-500 leading-none mt-1">
                    Timeout count: {gameState.consecutiveMisses?.[myPlayer.id] || 0}/3
                    {gameState.consecutiveMisses?.[myPlayer.id] === 2 && (
                      <span className="text-rose-400 ml-1 font-bold animate-pulse">
                        [Warning: 1 turn left or lose!]
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isMyTurn && !gameState.finished && (
                <div className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-500/15 text-emerald-400 text-[10px] uppercase font-bold tracking-wider rounded-lg border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                  <span>YOUR TURN</span>
                </div>
              )}
            </div>
          </div>

          {/* PLAY ROOM LOGS TELEMETRY */}
          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl" id="play-logs-console">
            <h4 className="text-xs font-bold text-slate-300 flex items-center space-x-1.5 mb-2.5">
              <Terminal size={12} className="text-indigo-400" />
              <span>Ludo game log tracker:</span>
            </h4>
            
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1" id="logs-feed-active">
              {(gameState.history || []).map((log, lIdx) => (
                <div key={lIdx} className="text-[11px] font-mono text-slate-400 leading-tight">
                  <span className="text-slate-600 font-mono mr-1">&gt;</span>
                  {log}
                </div>
              ))}
            </div>
          </div>

        </div>

      </main>

      {/* GAME WORKSPACE FINISHED / TERMINATION GRAPHICS END CARD OVERLAYS */}
      {gameState.finished && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4" id="termination-overlay">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-white space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            
            {/* Victory cup vs Setback Shield graphics */}
            {gameState.winnerId === currentUser.id ? (
              <div className="space-y-4">
                <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500 text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto shadow-lg shadow-emerald-500/20 animate-bounce">
                  🏆
                </div>
                <h2 className="text-3xl font-black text-white tracking-wide">VICTORY PREVAILED!</h2>
                <p className="text-sm text-slate-400 leading-snug">
                  Fantastic Ludo techniques and board maneuvers! You completed the race.
                </p>

                {gameState.isPractice ? (
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-500 italic">
                    Practice mode completed safely. Credits unchanged.
                  </div>
                ) : (
                  <div className="p-5 bg-emerald-950/30 rounded-2xl border border-emerald-500/30 text-xs space-y-2">
                    <p className="text-emerald-400 font-bold text-sm">PKR Winnings Deposited!</p>
                    <p className="text-slate-400 leading-snug">
                      {gameState.winReason === "forfeit" || gameState.winReason === "timeout" ? (
                        "Your opponent forfeited or disconnected! The platform applied a 20% penalty fee, and awarded you 80% of the total match pot."
                      ) : (
                        "Legit Match Payout: 95% of pot credited to your wallet balance. Platform keeps 5% system fee."
                      )}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-20 h-20 bg-rose-500/10 border border-rose-500 text-rose-400 rounded-full flex items-center justify-center text-3xl mx-auto shadow-lg shadow-rose-500/20 animate-pulse">
                  🛡️
                </div>
                <h2 className="text-2xl font-black text-rose-500 tracking-wide">MATCH COMPLETED</h2>
                <p className="text-sm text-slate-400 leading-snug">
                  Setback in the play room! LudoBot or opponent claimed victory this turn. Keep practicing to secure wagers.
                </p>
                {gameState.winReason === "timeout" && (
                  <div className="p-4.5 bg-rose-950/20 border border-rose-500/20 rounded-2xl text-xs text-rose-400 leading-snug">
                    Match lost due to exceeding 3 consecutive turn actions (5s roll or 12s move times). Maintain gameplay presence.
                  </div>
                )}
              </div>
            )}

            <button
              onClick={onExit}
              id="exit-game-room"
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm uppercase rounded-xl transition cursor-pointer"
            >
              Exit Match Arena
            </button>
          </div>
        </div>
      )}

      {/* LEAVE WARNING MODAL DIALOG */}
      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" id="leave-game-warning-card">
          <div className="w-full max-w-md bg-slate-900 border border-slate-850 rounded-2xl p-6 space-y-4 text-white">
            <h3 className="text-base font-bold text-rose-400 flex items-center space-x-1.5">
              <ShieldAlert size={18} />
              <span>Forfeit WARNING</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to exit the play room? Exiting now will result in an automatic forfeit. Your stake will be forfeited, the platform will collect a 20% penalty fee, and the remainder awarded to your opponent.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setLeaveModalOpen(false)}
                className="py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-lg transition"
              >
                Keep Playing
              </button>
              <button
                onClick={handleLeaveGameConfirm}
                id="modal-confirm-abandon"
                className="py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-lg transition"
              >
                Leave & Forfeit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
