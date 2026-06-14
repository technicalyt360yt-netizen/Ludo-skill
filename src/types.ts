export interface UserProfile {
  id: string;
  email: string;
  username: string;
  password?: string;
  walletBalance: number;
  status: "active" | "banned";
  isAdmin: boolean;
  createdAt: string;
}

export interface DepositRequest {
  id: string;
  userId: string;
  username: string;
  amount: number;
  transactionId: string;
  screenshotUrl: string; // base64 representation
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface WithdrawRequest {
  id: string;
  userId: string;
  username: string;
  amount: number;
  method?: string;
  destinationAddress?: string;
  upiId?: string;
  bankAccount?: string;
  bankIfsc?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  creatorId: string;
  creatorUsername: string;
  opponentId?: string;
  opponentUsername?: string;
  stakeAmount: number;
  status: "lobby" | "playing" | "completed" | "cancelled";
  winnerId?: string;
  isPractice: boolean;
  botDifficulty?: "easy" | "medium" | "hard" | null;
  winReason?: "regular" | "forfeit" | "timeout" | null;
  createdAt: string;
}

export interface GamePlayerState {
  id: string;
  username: string;
  color: "green" | "yellow";
  tokens: number[]; // Index/steps of 4 tokens. -1 means in base. 0..51 are track indexes, 52..56 home col, 57 is finished.
}

export interface RealTimeGameState {
  matchId: string;
  player1: GamePlayerState;
  player2: GamePlayerState;
  turn: string; // User ID whose turn it is
  dice_roll: number | null;
  must_roll: boolean; // Must roll dice
  rolling: boolean; // Shaking animation active
  moving: boolean; // Token transition animation active
  finished: boolean;
  winnerId: string | null;
  consecutiveMisses: { [userId: string]: number };
  lastActionTime: number; // For timers
  history: string[]; // Log of actions
  isPractice: boolean;
  stakeAmount?: number;
  botDifficulty?: "easy" | "medium" | "hard";
  winReason?: "regular" | "forfeit" | "timeout";
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: "deposit" | "withdraw" | "match_entry" | "match_win" | "match_leave_penalty" | "match_refund";
  amount: number;
  status: "pending" | "approved" | "rejected" | "completed";
  reference?: string;
  createdAt: string;
}
