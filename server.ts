import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { 
  TRACK, 
  START_INDEX_GREEN, 
  START_INDEX_YELLOW, 
  isValidMove, 
  isSafeTrackCoordinate, 
  getTokenCoordinate, 
  getTrackIndex, 
  getUniformDiceRollServer 
} from "./src/lib/ludo_rules";

const DB_FILE = process.env.VERCEL
  ? path.join("/tmp", "ludoskill_db.json")
  : path.join(process.cwd(), "data", "ludoskill_db.json");

let dbCache: any = null;

// Helper to load DB with in-memory cache
function loadDB() {
  if (dbCache) {
    return dbCache;
  }
  try {
    if (!fs.existsSync(DB_FILE)) {
      // Ensure folder
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      // Write default
      const defaultState = {
        users: [
          {
            id: "admin-id-shahbaz",
            email: "shahbazad543@gmail.com",
            username: "AdminShahbaz",
            password: "Learn##123",
            walletBalance: 100000.0,
            status: "active",
            isAdmin: true,
            createdAt: new Date().toISOString()
          },
          {
            id: "system-bot-id",
            email: "bot@ludoskill.com",
            username: "LudoBot",
            password: "system-bot-password-non-login",
            walletBalance: 1000000.0,
            status: "active",
            isAdmin: false,
            createdAt: new Date().toISOString()
          }
        ],
        deposits: [],
        withdrawals: [],
        matches: [],
        transactions: []
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultState, null, 2));
      dbCache = defaultState;
      return dbCache;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.users) parsed.users = [];
    if (!parsed.deposits) parsed.deposits = [];
    if (!parsed.withdrawals) parsed.withdrawals = [];
    if (!parsed.matches) parsed.matches = [];
    if (!parsed.transactions) parsed.transactions = [];
    dbCache = parsed;
    return dbCache;
  } catch (err) {
    console.error("Failed to load database. Returning empty mockup.", err);
    dbCache = { users: [], deposits: [], withdrawals: [], matches: [], transactions: [] };
    return dbCache;
  }
}

// Helper to save DB with in-memory cache
function saveDB(data: any) {
  dbCache = data;
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to write to database file", err);
  }
}

// In-memory active game states. Stored as Cache while matches are running.
const activeGames: { [matchId: string]: any } = {};

// Active lobbies - notifications stream for instant announcements
const lobbyBroadcastNotifications: Array<{ id: string; message: string; timestamp: number }> = [];

// Track active player sockets/polls to check of online presence
const userLastOnline: { [userId: string]: number } = {};

const app = express();
const PORT = 3000;

// Custom CORS middleware for seamless iframe sandboxing and preview domain communication
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "20mb" })); // allow screenshot uploads

  // Real-time Match Sync background loop: check timers every 1 second
  setInterval(() => {
    const db = loadDB();
    const now = Date.now();

    for (const matchId in activeGames) {
      const game = activeGames[matchId];
      if (game.finished) continue;

      // Filter offline status check for human players (e.g. if offline for 10 seconds, and match isn't practice, can auto forfeit)
      // We keep it timer driven for strictness.
      const elapsed = (now - game.lastActionTime) / 1000;

      // Handle Bot's Turn in Practice or Instant Modes
      if (game.turn === "system-bot-id" && !game.finished) {
        // If bot must roll and we are not currently simulating rolling...
        if (game.must_roll && !game.rolling) {
          game.rolling = true;
          game.lastActionTime = now;
          
          setTimeout(() => {
            const roll = getUniformDiceRollServer();
            game.dice_roll = roll;
            game.must_roll = false;
            game.rolling = false;
            game.moving = false;
            game.lastActionTime = Date.now();
            game.history.unshift(`LudoBot rolled a ${roll}!`);

            // Compute bot's valid moves
            const botColor = game.player1.id === "system-bot-id" ? game.player1.color : game.player2.color;
            const botState = game.player1.id === "system-bot-id" ? game.player1 : game.player2;
            const humanState = game.player1.id === "system-bot-id" ? game.player2 : game.player1;

            const validTokenIndices: number[] = [];
            for (let i = 0; i < 4; i++) {
              if (isValidMove(botState.tokens[i], roll)) {
                validTokenIndices.push(i);
              }
            }

            if (validTokenIndices.length === 0) {
              game.history.unshift(`LudoBot rolled ${roll} but has no valid moves! Turn passes.`);
              // Change turn
              game.turn = humanState.id;
              game.must_roll = true;
              game.dice_roll = null;
              game.lastActionTime = Date.now();
            } else {
              // Bot smart move heuristics
              let selectedTokenIdx = validTokenIndices[0];

              // Hard bot strategy (legit numbers, smart ludo techniques)
              // 1. Can capture opponent? Let's check
              let captured = false;
              for (const idx of validTokenIndices) {
                const targetStep = botState.tokens[idx] === -1 ? 0 : botState.tokens[idx] + roll;
                const targetCoords = getTokenCoordinate(botState.color, idx, targetStep);
                
                // Search for human token on that coordinate
                for (let k = 0; k < 4; k++) {
                  const humanCoords = getTokenCoordinate(humanState.color, k, humanState.tokens[k]);
                  if (humanCoords[0] === targetCoords[0] && humanCoords[1] === targetCoords[1] && targetStep < 52) {
                    // Check safe zone
                    if (!isSafeTrackCoordinate(targetCoords[0], targetCoords[1])) {
                      selectedTokenIdx = idx;
                      captured = true;
                      break;
                    }
                  }
                }
                if (captured) break;
              }

              // 2. Can finish?
              if (!captured) {
                for (const idx of validTokenIndices) {
                  if (botState.tokens[idx] + roll === 57) {
                    selectedTokenIdx = idx;
                    captured = true; // finish priority
                    break;
                  }
                }
              }

              // 3. Enter safe column
              if (!captured) {
                for (const idx of validTokenIndices) {
                  const startStep = botState.tokens[idx];
                  if (startStep < 52 && (startStep + roll) >= 52) {
                    selectedTokenIdx = idx;
                    captured = true;
                    break;
                  }
                }
              }

              // 4. Activate token (Yard to Path on 6)
              if (!captured && roll === 6) {
                for (const idx of validTokenIndices) {
                  if (botState.tokens[idx] === -1) {
                    selectedTokenIdx = idx;
                    captured = true;
                    break;
                  }
                }
              }

              // 5. Furthest token escape/advance
              if (!captured) {
                let maxStep = -1;
                for (const idx of validTokenIndices) {
                  if (botState.tokens[idx] > maxStep) {
                    maxStep = botState.tokens[idx];
                    selectedTokenIdx = idx;
                  }
                }
              }

              // Execute move after 1.5 seconds delay for visual realism
              setTimeout(() => {
                const originalStep = botState.tokens[selectedTokenIdx];
                const finalStep = originalStep === -1 ? 0 : originalStep + roll;
                botState.tokens[selectedTokenIdx] = finalStep;

                game.history.unshift(`LudoBot moved Token ${selectedTokenIdx + 1} to step ${finalStep}.`);
                game.moving = true;

                // Check capture
                let hasCaptured = false;
                if (finalStep < 52) {
                  const cellCoords = getTokenCoordinate(botState.color, selectedTokenIdx, finalStep);
                  if (!isSafeTrackCoordinate(cellCoords[0], cellCoords[1])) {
                    // check human collision
                    for (let h = 0; h < 4; h++) {
                      const humanColStep = humanState.tokens[h];
                      if (humanColStep >= 0 && humanColStep < 52) {
                        const humanCoords = getTokenCoordinate(humanState.color, h, humanColStep);
                        if (humanCoords[0] === cellCoords[0] && humanCoords[1] === cellCoords[1]) {
                          humanState.tokens[h] = -1; // reset to base
                          hasCaptured = true;
                          game.history.unshift(`Capture! LudoBot sent player's Token ${h + 1} back to base!`);
                          break;
                        }
                      }
                    }
                  }
                }

                // Check game finish
                const allDone = botState.tokens.every(st => st === 57);
                if (allDone) {
                  game.finished = true;
                  game.winnerId = "system-bot-id";
                  game.winReason = "regular";
                  game.history.unshift(`LudoBot wins the match!`);
                  
                  // Update match database
                  const matchIdx = db.matches.findIndex((m: any) => m.id === matchId);
                  if (matchIdx !== -1) {
                    db.matches[matchIdx].status = "completed";
                    db.matches[matchIdx].winnerId = "system-bot-id";
                    db.matches[matchIdx].winReason = "regular";
                    saveDB(db);
                  }
                } else {
                  // If rolled a 6, or gets a capture, bot rolls again!
                  if (roll === 6 || hasCaptured) {
                    game.must_roll = true;
                    game.dice_roll = null;
                    game.rolling = false;
                    game.moving = false;
                    game.history.unshift(`LudoBot earns a bonus roll!`);
                  } else {
                    // Turn to human
                    game.turn = humanState.id;
                    game.must_roll = true;
                    game.dice_roll = null;
                    game.rolling = false;
                    game.moving = false;
                  }
                }
                game.lastActionTime = Date.now();
              }, 1200);

            }
          }, 1500);
        }
        continue;
      }

      // Check timers for Human players
      if (!game.finished) {
        const actingUserId = game.turn;

        // 1. DICE ROLL TIMER: 5 seconds
        if (game.must_roll && !game.rolling) {
          if (elapsed >= 5.0) {
            // Auto-roll dice on behalf of the player
            const rollVal = getUniformDiceRollServer();
            game.dice_roll = rollVal;
            game.must_roll = false;
            game.lastActionTime = now;
            
            // Record consecutive miss penalty
            game.consecutiveMisses[actingUserId] = (game.consecutiveMisses[actingUserId] || 0) + 1;
            const misses = game.consecutiveMisses[actingUserId];
            game.history.unshift(`[Auto-Roll] Player missed the roll limit. Auto-rolled ${rollVal}! Miss: ${misses}/3`);

            if (misses >= 3) {
              // 3 Misses = FORFEIT DIRECT FOR LUDO
              executeForfeit(matchId, actingUserId, "timeout", db);
              continue;
            }

            // Determine if they have moves
            const actingPlayer = game.player1.id === actingUserId ? game.player1 : game.player2;
            const opponentPlayer = game.player1.id === actingUserId ? game.player2 : game.player1;
            
            const validTokenIndices: number[] = [];
            for (let i = 0; i < 4; i++) {
              if (isValidMove(actingPlayer.tokens[i], rollVal)) {
                validTokenIndices.push(i);
              }
            }

            if (validTokenIndices.length === 0) {
              game.history.unshift(`[Auto-Roll] No valid moves for ${rollVal}. Turn automatically passed.`);
              // Turn wraps immediately since no moves
              game.turn = opponentPlayer.id;
              game.must_roll = true;
              game.dice_roll = null;
              game.consecutiveMisses[actingUserId] = 0; // reset on turn swap if they had no option anyway? Keep track.
              game.lastActionTime = Date.now();
            }
          }
        }
        // 2. MOVE TOKEN TIMER: 12 seconds
        else if (!game.must_roll && !game.rolling && !game.moving) {
          if (elapsed >= 12.0) {
            // Player rolled but didn't make a move in 12s. Pass turn to opponent.
            const opponentUserId = game.player1.id === actingUserId ? game.player2.id : game.player1.id;
            
            game.consecutiveMisses[actingUserId] = (game.consecutiveMisses[actingUserId] || 0) + 1;
            const misses = game.consecutiveMisses[actingUserId];
            game.history.unshift(`[Auto-Pass] Time up for move! Passed to opponent. Miss: ${misses}/3`);

            if (misses >= 3) {
              executeForfeit(matchId, actingUserId, "timeout", db);
              continue;
            }

            // Normal pass to opponent
            game.turn = opponentUserId;
            game.must_roll = true;
            game.dice_roll = null;
            game.lastActionTime = now;
          }
        }
      }
    }
  }, 1000);

  // Helper executing forfeiture / forfeit penalty (platform 20%, 80% to winner)
  function executeForfeit(matchId: string, loserId: string, reason: "forfeit" | "timeout", db: any) {
    const game = activeGames[matchId];
    if (!game || game.finished) return;

    game.finished = true;
    game.winnerId = game.player1.id === loserId ? game.player2.id : game.player1.id;
    game.winReason = reason;
    
    const winnerId = game.winnerId;
    game.history.unshift(`Match ended. Player ${loserId === "system-bot-id" ? "LudoBot" : db.users.find((u: any) => u.id === loserId)?.username || "Player"} forfeited/timed out!`);

    // Record complete in DB
    const mIdx = db.matches.findIndex((m: any) => m.id === matchId);
    if (mIdx !== -1) {
      const match = db.matches[mIdx];
      match.status = "completed";
      match.winnerId = winnerId;
      match.winReason = reason;

      if (!match.isPractice && winnerId !== "system-bot-id") {
        const winUser = db.users.find((u: any) => u.id === winnerId);
        if (winUser) {
          // Money flow: platform keeps 20%, 80% goes to winner
          const originalPot = match.stakeAmount * 2;
          const platformFee = originalPot * 0.20; // 20%
          const winnerProfit = originalPot - platformFee; // 80% of pot = 1.6 * stake

          winUser.walletBalance = parseFloat((winUser.walletBalance + winnerProfit).toFixed(2));
          
          db.transactions.push({
            id: crypto.randomUUID(),
            userId: winnerId,
            type: "match_win",
            amount: winnerProfit,
            status: "completed",
            reference: `Pot: ${originalPot}. Winner got 80% due to opponent forfeit/disconnection. Admin took 20% fee (${platformFee}).`,
            createdAt: new Date().toISOString()
          });
        }
      }
      saveDB(db);
    }
  }

  // API - Auth Register
  app.post("/api/auth/register", (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: "Please fill in all details." });
    }

    const db = loadDB();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    // Check if email already used
    const emailExists = db.users.some((u: any) => u.email.toLowerCase() === cleanEmail);
    if (emailExists) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }

    // Check if username already used (registration constraint)
    const usernameExists = db.users.some((u: any) => u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (usernameExists) {
      return res.status(400).json({ error: "Username is already taken." });
    }

    const newUser = {
      id: crypto.randomUUID(),
      email: cleanEmail,
      username: cleanUsername,
      password: password,
      walletBalance: 30.0, // Sign-up welcome code bonus! Let's offer 30 PKR so they can try real matches!
      status: "active",
      isAdmin: false,
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    saveDB(db);

    res.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        walletBalance: newUser.walletBalance,
        isAdmin: newUser.isAdmin,
        status: newUser.status
      }
    });
  });

  // API - Auth Login
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Please provide credentials." });
    }

    const db = loadDB();
    const user = db.users.find(
      (u: any) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
    );

    if (!user) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    if (user.status === "banned") {
      return res.status(403).json({ error: "Your account is banned. Contact administration." });
    }

    userLastOnline[user.id] = Date.now();

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        walletBalance: user.walletBalance,
        isAdmin: user.isAdmin,
        status: user.status
      }
    });
  });

  // API - Get User Profile & Wallet Details
  app.get("/api/users/:userId", (req, res) => {
    const { userId } = req.params;
    const db = loadDB();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    userLastOnline[user.id] = Date.now();

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      walletBalance: user.walletBalance,
      isAdmin: user.isAdmin,
      status: user.status
    });
  });

  // API - Deposit Request (with USD to PKR conversion, minimum 1 USDT/USD)
  app.post("/api/wallet/deposit", (req, res) => {
    const { userId, amount, transactionId, screenshotUrl, method } = req.body;
    if (!userId || !amount || !transactionId) {
      return res.status(400).json({ error: "Missing required deposit fields." });
    }

    const numericAmountUSD = parseFloat(amount);
    if (isNaN(numericAmountUSD) || numericAmountUSD < 1) {
      return res.status(400).json({ error: "Minimum deposit is 1 USDT/USD." });
    }

    // Convert to PKR using 1 USD = 280 PKR
    const numericAmountPKR = parseFloat((numericAmountUSD * 280).toFixed(2));

    const db = loadDB();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const newDeposit = {
      id: crypto.randomUUID(),
      userId,
      username: user.username,
      amountUSD: numericAmountUSD,
      amount: numericAmountPKR, // all operations logged in PKR
      method: method || "Binance ID",
      transactionId,
      screenshotUrl: screenshotUrl || "",
      status: "pending",
      createdAt: new Date().toISOString()
    };

    db.deposits.push(newDeposit);
    
    // Create transaction in history
    db.transactions.push({
      id: crypto.randomUUID(),
      userId,
      type: "deposit",
      amountUSD: numericAmountUSD,
      amount: numericAmountPKR,
      status: "pending",
      reference: `Method: ${method || "Binance ID"}, TxID: ${transactionId} ($${numericAmountUSD} USD)`,
      createdAt: new Date().toISOString()
    });

    saveDB(db);

    res.json({ 
      success: true, 
      message: `Deposit request of $${numericAmountUSD} USDT (${numericAmountPKR} PKR) submitted successfully! Awaiting Admin Approval.` 
    });
  });

  // API - Withdraw Request (immediate wallet reduction, wait for admin, with 5% fee)
  app.post("/api/wallet/withdraw", (req, res) => {
    const { userId, amount, method, destinationAddress, upiId, bankAccount } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid withdrawal amount." });
    }

    const db = loadDB();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.walletBalance < numericAmount) {
      return res.status(400).json({ error: "Insufficient wallet balance." });
    }

    // Deduct full amount from wallet immediately to lock balance
    user.walletBalance = parseFloat((user.walletBalance - numericAmount).toFixed(2));

    // Calculate 5% withdrawal fee and net payout
    const fee = parseFloat((numericAmount * 0.05).toFixed(2));
    const netAmount = parseFloat((numericAmount - fee).toFixed(2));

    const selectedMethod = method || "Binance ID";
    const selectedAddress = destinationAddress || upiId || bankAccount || "No destination specified";

    const newWithdraw = {
      id: crypto.randomUUID(),
      userId,
      username: user.username,
      amount: numericAmount, // full amount requesting
      fee,
      netAmount, // final payout amount
      method: selectedMethod,
      destinationAddress: selectedAddress,
      upiId: selectedMethod === "UPI" ? selectedAddress : "",
      bankAccount: selectedMethod === "Bank" ? selectedAddress : "",
      status: "pending",
      createdAt: new Date().toISOString()
    };

    db.withdrawals.push(newWithdraw);

    db.transactions.push({
      id: crypto.randomUUID(),
      userId,
      type: "withdraw",
      amount: numericAmount,
      fee,
      netAmount,
      status: "pending",
      reference: `Method: ${selectedMethod}, Dest: ${selectedAddress} (5% Fee Charged: PKR ${fee})`,
      createdAt: new Date().toISOString()
    });

    saveDB(db);

    res.json({ 
      success: true, 
      balance: user.walletBalance, 
      message: `Withdrawal request for PKR ${numericAmount} (PKR ${netAmount} net payout after 5% fee) submitted!` 
    });
  });

  // API - Get Transaction & Request Histories
  app.get("/api/wallet/history/:userId", (req, res) => {
    const { userId } = req.params;
    const db = loadDB();
    const txs = db.transactions.filter((t: any) => t.userId === userId);
    const deposits = db.deposits.filter((d: any) => d.userId === userId);
    const withdraws = db.withdrawals.filter((w: any) => w.userId === userId);

    res.json({
      transactions: txs.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)),
      deposits: deposits.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)),
      withdraws: withdraws.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
    });
  });

  // API - Lobby matches feed
  app.get("/api/lobby/matches", (req, res) => {
    const db = loadDB();
    res.json({
      matches: db.matches,
      onlineUsersCount: Object.values(userLastOnline).filter(ts => Date.now() - ts < 15000).length + 1, // +1 for Bot
      notifications: lobbyBroadcastNotifications
    });
  });

  // API - Broadcast / Create Match Challenge
  app.post("/api/lobby/matches/create", (req, res) => {
    const { userId, stakeAmount, isPractice, botDifficulty } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Unauthorized" });
    }

    const numericStake = parseFloat(stakeAmount || 0);
    const practice = !!isPractice;

    const db = loadDB();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!practice && user.walletBalance < numericStake) {
      return res.status(400).json({ error: "Insufficient wallet balance to join match." });
    }

    const newMatch = {
      id: crypto.randomUUID(),
      creatorId: userId,
      creatorUsername: user.username,
      opponentId: practice ? "system-bot-id" : undefined,
      opponentUsername: practice ? "LudoBot" : undefined,
      stakeAmount: practice ? 0 : numericStake,
      status: practice ? "playing" : "lobby",
      isPractice: practice,
      botDifficulty: practice ? (botDifficulty || "hard") : null,
      winnerId: null,
      winReason: null,
      createdAt: new Date().toISOString()
    };

    // Deduct stake up-front for play
    if (!practice) {
      user.walletBalance = parseFloat((user.walletBalance - numericStake).toFixed(2));
      db.transactions.push({
        id: crypto.randomUUID(),
        userId,
        type: "match_entry",
        amount: -numericStake,
        status: "completed",
        reference: `Match Entry fee inside challenge: ${newMatch.id}`,
        createdAt: new Date().toISOString()
      });
    }

    db.matches.push(newMatch);

    // Live lobby broadcast notification!
    if (!practice) {
      lobbyBroadcastNotifications.unshift({
        id: crypto.randomUUID(),
        message: `📢 LOBBY: ${user.username} created a Ludo match of amount Rs. ${numericStake}! Join immediately!`,
        timestamp: Date.now()
      });
      // Limit broadcast queue to last 15 elements
      if (lobbyBroadcastNotifications.length > 15) {
        lobbyBroadcastNotifications.pop();
      }
    }

    saveDB(db);

    // Initialize Game Room state if starting instantly vs bot
    if (practice) {
      activeGames[newMatch.id] = {
        matchId: newMatch.id,
        player1: { id: userId, username: user.username, color: "green", tokens: [-1, -1, -1, -1] },
        player2: { id: "system-bot-id", username: "LudoBot", color: "yellow", tokens: [-1, -1, -1, -1] },
        turn: userId,
        dice_roll: null,
        must_roll: true,
        rolling: false,
        moving: false,
        finished: false,
        winnerId: null,
        consecutiveMisses: { [userId]: 0, "system-bot-id": 0 },
        lastActionTime: Date.now(),
        history: ["Practice mode match started. Green (you) vs Yellow (LudoBot)"],
        isPractice: true,
        stakeAmount: 0,
        botDifficulty: botDifficulty || "hard"
      };
    }

    res.json({ success: true, match: newMatch });
  });

  // API - Join Match (for multiplayer lobby & instant bots)
  app.post("/api/lobby/matches/join", (req, res) => {
    const { userId, matchId, forceBotJoin } = req.body;
    if (!userId) return res.status(400).json({ error: "Unauthorized" });

    const db = loadDB();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const matchIdx = db.matches.findIndex((m: any) => m.id === matchId);
    if (matchIdx === -1) return res.status(404).json({ error: "Match not found" });

    const match = db.matches[matchIdx];
    if (match.status !== "lobby" && !forceBotJoin) {
      return res.status(400).json({ error: "Match already filled or unavailable" });
    }

    if (match.creatorId === userId && !forceBotJoin) {
      return res.status(400).json({ error: "You cannot join your own match!" });
    }

    // Determine opponent details
    let opponentId = userId;
    let opponentUsername = user.username;

    if (forceBotJoin) {
      opponentId = "system-bot-id";
      opponentUsername = "LudoBot";
    }

    // Deduct stake up-front from opponent if not practice & not bot
    if (!match.isPractice && opponentId !== "system-bot-id") {
      if (user.walletBalance < match.stakeAmount) {
        return res.status(400).json({ error: "You possess insufficient wallet balance to play." });
      }
      user.walletBalance = parseFloat((user.walletBalance - match.stakeAmount).toFixed(2));
      db.transactions.push({
        id: crypto.randomUUID(),
        userId: opponentId,
        type: "match_entry",
        amount: -match.stakeAmount,
        status: "completed",
        reference: `Match Entry fee: ${match.id}`,
        createdAt: new Date().toISOString()
      });
    }

    match.opponentId = opponentId;
    match.opponentUsername = opponentUsername;
    match.status = "playing";

    saveDB(db);

    // Randomize player assignments for color allocation:
    // P1: Green (stands Bottom-Left), starts first usually.
    // P2: Yellow (stands Top-Right).
    const randomGreen = Math.random() < 0.5;
    const player1Info = randomGreen 
      ? { id: match.creatorId, username: match.creatorUsername, color: "green" as const }
      : { id: opponentId, username: opponentUsername, color: "green" as const };

    const player2Info = randomGreen
      ? { id: opponentId, username: opponentUsername, color: "yellow" as const }
      : { id: match.creatorId, username: match.creatorUsername, color: "yellow" as const };

    // Initialize Active Game Engine
    activeGames[matchId] = {
      matchId: match.id,
      player1: { ...player1Info, tokens: [-1, -1, -1, -1] },
      player2: { ...player2Info, tokens: [-1, -1, -1, -1] },
      turn: player1Info.id, // Green player goes first
      dice_roll: null,
      must_roll: true,
      rolling: false,
      moving: false,
      finished: false,
      winnerId: null,
      consecutiveMisses: { [player1Info.id]: 0, [player2Info.id]: 0 },
      lastActionTime: Date.now(),
      history: [`Match started! Green (${player1Info.username}) vs Yellow (${player2Info.username}).`],
      isPractice: match.isPractice,
      stakeAmount: match.stakeAmount,
      botDifficulty: forceBotJoin ? "hard" : undefined
    };

    res.json({ success: true, match });
  });

  // API - Cancel Match (if waiting in lobby)
  app.post("/api/lobby/matches/cancel", (req, res) => {
    const { userId, matchId } = req.body;
    const db = loadDB();
    const matchIdx = db.matches.findIndex((m: any) => m.id === matchId);
    if (matchIdx === -1) return res.status(404).json({ error: "Match not found" });

    const match = db.matches[matchIdx];
    if (match.creatorId !== userId) {
      return res.status(403).json({ error: "Unauthorized cancel request" });
    }

    if (match.status !== "lobby") {
      return res.status(400).json({ error: "Match has already begun." });
    }

    match.status = "cancelled";

    // Refund stake immediately
    if (!match.isPractice) {
      const user = db.users.find((u: any) => u.id === userId);
      if (user) {
        user.walletBalance = parseFloat((user.walletBalance + match.stakeAmount).toFixed(2));
        db.transactions.push({
          id: crypto.randomUUID(),
          userId,
          type: "match_refund",
          amount: match.stakeAmount,
          status: "completed",
          reference: `Match cancelled refund for ${matchId}`,
          createdAt: new Date().toISOString()
        });
      }
    }

    saveDB(db);

    res.json({ success: true, message: "Match cancelled and refunded!" });
  });

  // API - Game Rooms Core Status
  app.get("/api/game/state/:matchId", (req, res) => {
    const { matchId } = req.params;
    let game = activeGames[matchId];
    if (!game) {
      const db = loadDB();
      const match = db.matches.find((m: any) => m.id === matchId);
      if (match) {
        if (match.status === "completed") {
          return res.json({
            matchId,
            finished: true,
            winnerId: match.winnerId,
            winReason: match.winReason,
            isPractice: match.isPractice
          });
        } else if (match.status === "playing") {
          const randomGreen = Math.random() < 0.5;
          const player1Info = randomGreen 
            ? { id: match.creatorId, username: match.creatorUsername, color: "green" as const }
            : { id: match.opponentId || "system-bot-id", username: match.opponentUsername || "LudoBot", color: "green" as const };

          const player2Info = randomGreen
            ? { id: match.opponentId || "system-bot-id", username: match.opponentUsername || "LudoBot", color: "yellow" as const }
            : { id: match.creatorId, username: match.creatorUsername, color: "yellow" as const };

          activeGames[matchId] = {
            matchId: match.id,
            player1: { ...player1Info, tokens: [-1, -1, -1, -1] },
            player2: { ...player2Info, tokens: [-1, -1, -1, -1] },
            turn: player1Info.id,
            dice_roll: null,
            must_roll: true,
            rolling: false,
            moving: false,
            finished: false,
            winnerId: null,
            consecutiveMisses: { [player1Info.id]: 0, [player2Info.id]: 0 },
            lastActionTime: Date.now(),
            history: [`Match recovered seamlessly! Green (${player1Info.username}) vs Yellow (${player2Info.username}).`],
            isPractice: match.isPractice,
            stakeAmount: match.stakeAmount,
            botDifficulty: match.opponentId === "system-bot-id" ? "hard" : undefined
          };
          game = activeGames[matchId];
        } else {
          return res.status(404).json({ error: "Game session state not found" });
        }
      } else {
        return res.status(404).json({ error: "Game session state not found" });
      }
    }

    res.json(game);
  });

  // API - Roll Dice command
  app.post("/api/game/roll", (req, res) => {
    const { matchId, userId } = req.body;
    const game = activeGames[matchId];
    if (!game) return res.status(404).json({ error: "Game session not found" });

    if (game.turn !== userId) {
      return res.status(400).json({ error: "Not your turn!" });
    }

    if (!game.must_roll) {
      return res.status(400).json({ error: "Already rolled!" });
    }

    // Set rolling animation active
    game.rolling = true;
    game.lastActionTime = Date.now();

    setTimeout(() => {
      // Uniform random 1-6
      const roll = getUniformDiceRollServer();
      game.dice_roll = roll;
      game.must_roll = false;
      game.rolling = false;
      game.moving = false;
      game.lastActionTime = Date.now();
      game.consecutiveMisses[userId] = 0; // reset misses since they rolled!

      const activePlayer = game.player1.id === userId ? game.player1 : game.player2;
      const opponentPlayer = game.player1.id === userId ? game.player2 : game.player1;
      
      game.history.unshift(`${activePlayer.username} rolled a ${roll}!`);

      // Determine valid moves 
      const validTokenIndices: number[] = [];
      for (let i = 0; i < 4; i++) {
        if (isValidMove(activePlayer.tokens[i], roll)) {
          validTokenIndices.push(i);
        }
      }

      // If no valid moves exist, progress turn directly
      if (validTokenIndices.length === 0) {
        game.history.unshift(`${activePlayer.username} has no valid moves for ${roll}. Turn passed.`);
        
        // Pass if not a 6, wait, standard: if you roll a 6 or any number but have no moves, do you pass?
        // YES. If you roll a 6 but can't move, you STILL pass the turn!
        game.turn = opponentPlayer.id;
        game.must_roll = true;
        game.dice_roll = null;
        game.lastActionTime = Date.now();
      }

    }, 800); // short simulated shaking animation time

    res.json({ success: true });
  });

  // API - Move Token command
  app.post("/api/game/move", (req, res) => {
    const { matchId, userId, tokenIndex } = req.body;
    const game = activeGames[matchId];
    if (!game) return res.status(404).json({ error: "Game session not found" });

    if (game.turn !== userId) {
      return res.status(400).json({ error: "Not your turn!" });
    }

    if (game.must_roll || game.dice_roll === null) {
      return res.status(400).json({ error: "You must roll first!" });
    }

    const tIdx = parseInt(tokenIndex);
    if (isNaN(tIdx) || tIdx < 0 || tIdx > 3) {
      return res.status(400).json({ error: "Invalid token index" });
    }

    const roll = game.dice_roll;
    const activePlayer = game.player1.id === userId ? game.player1 : game.player2;
    const opponentPlayer = game.player1.id === userId ? game.player2 : game.player1;

    // Validate
    const currentStep = activePlayer.tokens[tIdx];
    if (!isValidMove(currentStep, roll)) {
      return res.status(400).json({ error: "Invalid move for this token" });
    }

    // Apply move 
    const finalStep = currentStep === -1 ? 0 : currentStep + roll;
    activePlayer.tokens[tIdx] = finalStep;
    game.moving = true;
    game.consecutiveMisses[userId] = 0; // Reset misses and timers

    game.history.unshift(`${activePlayer.username} moved Token ${tIdx + 1} to step ${finalStep}.`);

    let hasCaptured = false;
    // Check capture
    if (finalStep < 52) {
      const finalCoords = getTokenCoordinate(activePlayer.color, tIdx, finalStep);
      
      // If NOT a safe zone, check opponent collision
      if (!isSafeTrackCoordinate(finalCoords[0], finalCoords[1])) {
        for (let i = 0; i < 4; i++) {
          const opponentStep = opponentPlayer.tokens[i];
          if (opponentStep >= 0 && opponentStep < 52) {
            const opCoords = getTokenCoordinate(opponentPlayer.color, i, opponentStep);
            if (opCoords[0] === finalCoords[0] && opCoords[1] === finalCoords[1]) {
              // Kill collision! Sent back to base
              opponentPlayer.tokens[i] = -1;
              hasCaptured = true;
              game.history.unshift(`💥 CAPTURE! ${activePlayer.username} captured ${opponentPlayer.username}'s Token ${i + 1}!`);
              break;
            }
          }
        }
      }
    }

    // Check Win condition
    const win = activePlayer.tokens.every(st => st === 57);
    if (win) {
      game.finished = true;
      game.winnerId = userId;
      game.winReason = "regular";
      game.history.unshift(`👑 VICTORY! ${activePlayer.username} completed all tokens and won the match!`);

      // Wallet processing
      const db = loadDB();
      const matchIdx = db.matches.findIndex((m: any) => m.id === matchId);
      if (matchIdx !== -1) {
        const match = db.matches[matchIdx];
        match.status = "completed";
        match.winnerId = userId;
        match.winReason = "regular";

        if (!match.isPractice && userId !== "system-bot-id") {
          const winnerUser = db.users.find((u: any) => u.id === userId);
          if (winnerUser) {
            // Normal Winner takes 95% of pot, platform pockets 5%
            const originalPot = match.stakeAmount * 2;
            const fee = originalPot * 0.05; // 5% fee limit
            const payout = originalPot - fee; // 95% = 1.9 * stake
            winnerUser.walletBalance = parseFloat((winnerUser.walletBalance + payout).toFixed(2));

            db.transactions.push({
              id: crypto.randomUUID(),
              userId: userId,
              type: "match_win",
              amount: payout,
              status: "completed",
              reference: `Ludo match win ${matchId}. Pot: ${originalPot}. Winner got 95% (Rs. ${payout}), Platform fee: 5% (Rs. ${fee}).`,
              createdAt: new Date().toISOString()
            });
          }
        }
        saveDB(db);
      }
    } else {
      // Determine if they rolled a 6 or captured, which rewards extra roll!
      if (roll === 6 || hasCaptured) {
        game.must_roll = true;
        game.dice_roll = null;
        game.history.unshift(`🎉 ${activePlayer.username} rolled a 6 or got a capture! Bonus roll awarded.`);
      } else {
        // Pass Turn to opponent
        game.turn = opponentPlayer.id;
        game.must_roll = true;
        game.dice_roll = null;
      }
    }

    game.moving = false;
    game.lastActionTime = Date.now();

    res.json(game);
  });

  // API - Leave Game manual request
  app.post("/api/game/leave", (req, res) => {
    const { matchId, userId } = req.body;
    const db = loadDB();
    executeForfeit(matchId, userId, "forfeit", db);
    res.json({ success: true, message: "Forfeited successfully." });
  });

  // ADMIN CONTROL ENDPOINTS
  app.get("/api/admin/deposits", (req, res) => {
    const db = loadDB();
    res.json(db.deposits);
  });

  app.get("/api/admin/withdrawals", (req, res) => {
    const db = loadDB();
    res.json(db.withdrawals);
  });

  app.post("/api/admin/deposits/approve", (req, res) => {
    const { depositId } = req.body;
    const db = loadDB();
    const dep = db.deposits.find((d: any) => d.id === depositId);
    if (!dep) return res.status(404).json({ error: "Deposit not found." });

    if (dep.status !== "pending") return res.status(400).json({ error: "Deposit already approved or rejected." });

    dep.status = "approved";

    // Add balance to user
    const user = db.users.find((u: any) => u.id === dep.userId);
    if (user) {
      user.walletBalance = parseFloat((user.walletBalance + dep.amount).toFixed(2));
      
      // Update transaction log
      const tx = db.transactions.find((t: any) => t.userId === dep.userId && t.type === "deposit" && t.status === "pending" && t.amount === dep.amount);
      if (tx) tx.status = "completed";

      db.transactions.push({
        id: crypto.randomUUID(),
        userId: dep.userId,
        type: "deposit",
        amount: dep.amount,
        status: "completed",
        reference: `Admin Approved Deposit ID: ${dep.id}`,
        createdAt: new Date().toISOString()
      });
    }

    saveDB(db);
    res.json({ success: true, message: "Deposit approved and wallet credited!" });
  });

  app.post("/api/admin/deposits/reject", (req, res) => {
    const { depositId } = req.body;
    const db = loadDB();
    const dep = db.deposits.find((d: any) => d.id === depositId);
    if (!dep) return res.status(404).json({ error: "Deposit not found." });

    if (dep.status !== "pending") return res.status(400).json({ error: "Deposit already resolved." });

    dep.status = "rejected";

    const tx = db.transactions.find((t: any) => t.userId === dep.userId && t.type === "deposit" && t.status === "pending" && t.amount === dep.amount);
    if (tx) tx.status = "rejected";

    saveDB(db);
    res.json({ success: true, message: "Deposit request rejected." });
  });

  app.post("/api/admin/withdrawals/approve", (req, res) => {
    const { withdrawId } = req.body;
    const db = loadDB();
    const wit = db.withdrawals.find((w: any) => w.id === withdrawId);
    if (!wit) return res.status(404).json({ error: "Withdrawal request not found." });

    if (wit.status !== "pending") return res.status(400).json({ error: "Already resolved." });

    wit.status = "approved";

    // Deducted initially, so static on user side. We just confirm the transaction history.
    const tx = db.transactions.find((t: any) => t.userId === wit.userId && t.type === "withdraw" && t.status === "pending" && t.amount === wit.amount);
    if (tx) tx.status = "completed";

    saveDB(db);
    res.json({ success: true, message: "Withdrawal approved!" });
  });

  app.post("/api/admin/withdrawals/reject", (req, res) => {
    const { withdrawId } = req.body;
    const db = loadDB();
    const wit = db.withdrawals.find((w: any) => w.id === withdrawId);
    if (!wit) return res.status(404).json({ error: "Withdrawal request not found." });

    if (wit.status !== "pending") return res.status(400).json({ error: "Already resolved." });

    wit.status = "rejected";

    // REFUND the user immediately upon reject
    const user = db.users.find((u: any) => u.id === wit.userId);
    if (user) {
      user.walletBalance = parseFloat((user.walletBalance + wit.amount).toFixed(2));
    }

    const tx = db.transactions.find((t: any) => t.userId === wit.userId && t.type === "withdraw" && t.status === "pending" && t.amount === wit.amount);
    if (tx) tx.status = "rejected";

    db.transactions.push({
      id: crypto.randomUUID(),
      userId: wit.userId,
      type: "match_refund",
      amount: wit.amount,
      status: "completed",
      reference: `Refund for rejected withdrawal request: ${withdrawId}`,
      createdAt: new Date().toISOString()
    });

    saveDB(db);
    res.json({ success: true, message: "Withdrawal request rejected and refunded to player!" });
  });

  app.get("/api/admin/players", (req, res) => {
    const db = loadDB();
    res.json(db.users.filter((u: any) => !u.isAdmin));
  });

  app.post("/api/admin/players/balance", (req, res) => {
    const { userId, newBalance } = req.body;
    const db = loadDB();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const balance = parseFloat(newBalance);
    if (isNaN(balance)) return res.status(400).json({ error: "Invalid numeric balance" });

    user.walletBalance = balance;
    
    db.transactions.push({
      id: crypto.randomUUID(),
      userId,
      type: "match_refund", // general credit adjusting
      amount: balance,
      status: "completed",
      reference: `Admin Force set wallet balance to ${balance}`,
      createdAt: new Date().toISOString()
    });

    saveDB(db);
    res.json({ success: true, message: "Player wallet modified." });
  });

  app.post("/api/admin/players/status", (req, res) => {
    const { userId, status } = req.body;
    const db = loadDB();
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (status !== "active" && status !== "banned") {
      return res.status(400).json({ error: "Invalid status profile" });
    }

    user.status = status;
    saveDB(db);
    res.json({ success: true, message: `Player set to ${status}` });
  });

  app.get("/api/admin/matches", (req, res) => {
    const db = loadDB();
    res.json(db.matches);
  });


// Mounting Vite Middlewares / Listening
async function startServer() {
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`LudoSkill container server running on port ${PORT}`);
    });
  }
}

startServer();

export default app;
