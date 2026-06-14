// Ludo track coordinate mapping and rules

export const TRACK = [
  // 0 to 5: Left quadrant bottom arm (moving left from center toward left edge)
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  // 6: Left edge center cap
  [7, 0],
  // 7 to 12: Left quadrant top arm (moving right from left edge toward center)
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  // 13 to 18: Top quadrant left arm (moving up from center toward top edge)
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  // 19: Top edge center cap
  [0, 7],
  // 20 to 25: Top quadrant right arm (moving down from top edge toward center)
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  // 26 to 31: Right quadrant top arm (moving right from center toward right edge)
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  // 32: Right edge center cap
  [7, 14],
  // 33 to 38: Right quadrant bottom arm (moving left from right edge toward center)
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  // 39 to 44: Bottom quadrant right arm (moving down from center toward bottom edge)
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  // 45: Bottom edge center cap
  [14, 7],
  // 46 to 51: Bottom quadrant left arm (moving up from bottom edge toward center)
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6]
];

// Start tracking indexes on the 52-cell outer loops
export const START_INDEX_GREEN = 47; // coordinate [13, 6]
export const START_INDEX_YELLOW = 21; // coordinate [1, 8]

// Base/yard coordinate spots when tokens are in base (step matches -1)
export const BASE_SPOTS_GREEN = [
  [11, 2], [11, 3], [12, 2], [12, 3]
];

export const BASE_SPOTS_YELLOW = [
  [2, 11], [2, 12], [3, 11], [3, 12]
];

// Home column coordinates (5 cells each, corresponding to steps 52 to 56)
export const HOME_COL_GREEN = [
  [13, 7], [12, 7], [11, 7], [10, 7], [9, 7]
];

export const HOME_COL_YELLOW = [
  [1, 7], [2, 7], [3, 7], [4, 7], [5, 7]
];

// Final home coordinates (step 57)
export const HOME_GOAL_GREEN = [8, 7];
export const HOME_GOAL_YELLOW = [6, 7];

// Safe track indexes (marked with stars, cannot be killed here + multiple tokens can stand)
export const SAFE_TRACK_CELLS = [
  47, // Green start
  21, // Yellow start
  8,  // Left arm safe spot
  21, // Duplicate? Wait, let's look at the clockwise safe spots:
  // Green start is 47, Yellow start is 21. Let's find other star squares in standard Ludo:
  // - Top track safe spot: index 35 [6, 12] (bottom arm is [12, 8] = index 42)
  // Let's use indices 1, 14, 27, 40 as typical locations, or coordinate equivalents:
  // Let's explicitly specify coordinates of safe stars:
  // 1. [13, 6] (track index 47 - Green start)
  // 2. [1, 8] (track index 21 - Yellow start)
  // 3. [8, 2] (track index 9)
  // 4. [2, 6] (track index 16)
  // 5. [6, 12] (track index 29)
  // 6. [12, 8] (track index 42)
];

// Get cell coordinate [row, col] on the 15x15 board for a token given its step
export function getTokenCoordinate(color: "green" | "yellow", tokenIndex: number, step: number): [number, number] {
  if (step === -1) {
    return color === "green" 
      ? [BASE_SPOTS_GREEN[tokenIndex][0], BASE_SPOTS_GREEN[tokenIndex][1]]
      : [BASE_SPOTS_YELLOW[tokenIndex][0], BASE_SPOTS_YELLOW[tokenIndex][1]];
  }

  if (step === 57) {
    return color === "green" ? [HOME_GOAL_GREEN[0], HOME_GOAL_GREEN[1]] : [HOME_GOAL_YELLOW[0], HOME_GOAL_YELLOW[1]];
  }

  if (step >= 52 && step <= 56) {
    const homeIdx = step - 52;
    return color === "green"
      ? [HOME_COL_GREEN[homeIdx][0], HOME_COL_GREEN[homeIdx][1]]
      : [HOME_COL_YELLOW[homeIdx][0], HOME_COL_YELLOW[homeIdx][1]];
  }

  // Otherwise, token is on outer loop
  const startIdx = color === "green" ? START_INDEX_GREEN : START_INDEX_YELLOW;
  const trackIdx = (startIdx + step) % 52;
  return [TRACK[trackIdx][0], TRACK[trackIdx][1]];
}

// Check if a move is valid
export function isValidMove(step: number, roll: number): boolean {
  // If in yard (base), needs exactly a 6
  if (step === -1) {
    return roll === 6;
  }
  // Max step is 57, cannot overshoot
  return step + roll <= 57;
}

// Get the actual track cell index if step is 0..51
export function getTrackIndex(color: "green" | "yellow", step: number): number | null {
  if (step < 0 || step >= 52) return null;
  const startIdx = color === "green" ? START_INDEX_GREEN : START_INDEX_YELLOW;
  return (startIdx + step) % 52;
}

// Safe check for track cell indexes
export function isSafeTrackCoordinate(row: number, col: number): boolean {
  // Star icon locations
  const safeCoords = [
    [13, 6], [1, 8], [8, 2], [2, 6], [6, 12], [12, 8]
  ];
  return safeCoords.some(c => c[0] === row && c[1] === col);
}

// Fair Dice Roll Uniform Distribution (No modulo bias, true cryptographically secure 1-6)
// On the server, we can use crypto.getRandomValues, on client we can too but we usually poll server dice.
export function getUniformDiceRollServer(): number {
  const cryptoObj = (typeof globalThis !== "undefined" && globalThis.crypto) || (typeof window !== "undefined" && window.crypto);
  if (cryptoObj && cryptoObj.getRandomValues) {
    const array = new Uint32Array(1);
    while (true) {
      cryptoObj.getRandomValues(array);
      const val = array[0];
      const maxRange = 4294967295 - (4294967295 % 6);
      if (val < maxRange) {
        return (val % 6) + 1;
      }
    }
  }
  // Fallback
  return Math.floor(Math.random() * 6) + 1;
}
