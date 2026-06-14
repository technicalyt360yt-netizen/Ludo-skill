import React, { useState, useEffect, useRef } from "react";
import { 
  PlusCircle, 
  ArrowUpRight, 
  ArrowDownLeft, 
  LogOut, 
  HelpCircle, 
  DollarSign, 
  User, 
  Play, 
  Sparkles, 
  Users, 
  Check, 
  Copy,
  ShieldAlert, 
  Upload, 
  FileText, 
  AlertCircle,
  X,
  CreditCard,
  Bell
} from "lucide-react";
import { UserProfile, MatchRecord } from "../types";

interface DashboardViewProps {
  currentUser: UserProfile;
  onLogout: () => void;
  onNavigateToMatch: (matchId: string) => void;
  onNavigateToAdmin: () => void;
}

export default function DashboardView({ 
  currentUser, 
  onLogout, 
  onNavigateToMatch, 
  onNavigateToAdmin 
}: DashboardViewProps) {
  
  const [profile, setProfile] = useState<UserProfile>(currentUser);
  const [activeTab, setActiveTab] = useState<"lobby" | "wallet">("lobby");
  
  // Create Challenge state
  const [stakeInput, setStakeInput] = useState("50");
  const [isCreating, setIsCreating] = useState(false);
  
  // Bots mode state
  const [practiceDifficulty, setPracticeDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // Wallet actions
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<"BEP20" | "TRC20" | "Binance ID">("BEP20");
  const [copiedText, setCopiedText] = useState(false);
  const [depositTxId, setDepositTxId] = useState("");
  const [depositScreenshot, setDepositScreenshot] = useState(""); // base64
  const [imageFileName, setImageFileName] = useState("");
  
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawType, setWithdrawType] = useState<"BEP20" | "TRC20" | "Binance ID">("BEP20");
  const [withdrawAddress, setWithdrawAddress] = useState("");

  // Server state data
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [depositsList, setDepositsList] = useState<any[]>([]);
  const [withdrawsList, setWithdrawsList] = useState<any[]>([]);
  
  // Float Notice Banners (such as Instant match broadcast triggers)
  const [shownNotifications, setShownNotifications] = useState<string[]>([]);
  const shownNoticesRef = useRef<string[]>([]);
  const [lobbyBanList, setLobbyBanList] = useState<string[]>([]);
  const [liveFloatingNotices, setLiveFloatingNotices] = useState<Array<{ id: string; message: string }>>([]);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);

  // Synchronize Player Profile & Match Lobby (Short Polling: every 2 seconds for high performance)
  const syncProfile = async () => {
    try {
      const res = await fetch(`/api/users/${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error("Dashboard failed to sync user profile", err);
    }
  };

  const syncLobby = async () => {
    try {
      const res = await fetch("/api/lobby/matches");
      if (res.ok) {
        const data = await res.json();
        setOnlineCount(data.onlineUsersCount || 1);
        
        // Filter out completed/cancelled matches from active board
        const activeMatches = (data.matches || []).filter(
          (m: MatchRecord) => m.status === "lobby" || m.status === "playing"
        );
        setMatches(activeMatches);

        // Check active live broadcast notification triggers
        if (data.notifications && data.notifications.length > 0) {
          const freshNotices = data.notifications.filter(
            (n: any) => !shownNoticesRef.current.includes(n.id) && (Date.now() - n.timestamp < 10000)
          );
          if (freshNotices.length > 0) {
            freshNotices.forEach((n: any) => {
              // Mark as shown immediately (sync write to ref prevents double processing)
              shownNoticesRef.current.push(n.id);
              
              // Add to floating alerts if not already present
              setLiveFloatingNotices(prev => {
                if (prev.some((item) => item.id === n.id)) return prev;
                return [...prev, { id: n.id, message: n.message }];
              });
            });

            // Automatically clip/expire individual alerts by ID after 6 seconds
            freshNotices.forEach((n: any) => {
              setTimeout(() => {
                setLiveFloatingNotices(prev => prev.filter(item => item.id !== n.id));
              }, 6000);
            });
          }
        }

        // Automatic router gateway: If the current user has been joined in a playing match, redirect them immediately to match!
        const autoJoinedMatch = (data.matches || []).find(
          (m: MatchRecord) => m.status === "playing" && (m.creatorId === currentUser.id || m.opponentId === currentUser.id)
        );
        if (autoJoinedMatch) {
          onNavigateToMatch(autoJoinedMatch.id);
        }
      }
    } catch (err) {
      console.error("Dashboard failed to sync active lobbies", err);
    }
  };

  const syncWalletHistory = async () => {
    try {
      const res = await fetch(`/api/wallet/history/${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setDepositsList(data.deposits || []);
        setWithdrawsList(data.withdraws || []);
      }
    } catch (err) {
      console.error("Failed to sync wallet history", err);
    }
  };

  useEffect(() => {
    syncProfile();
    syncLobby();
    syncWalletHistory();

    const intervalId = setInterval(() => {
      syncProfile();
      syncLobby();
    }, 2000);

    return () => clearInterval(intervalId);
  }, []);

  // Handle local File input snapshot upload (binary reader to base64)
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setDepositScreenshot(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Create real-money direct match challenge
  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    const stake = parseFloat(stakeInput);
    if (isNaN(stake) || stake <= 0) {
      setErrorMsg("Please enter a valid stake amount (PKR)");
      return;
    }

    if (profile.walletBalance < stake) {
      setErrorMsg("Insufficient wallet balance. Please make a deposit first.");
      setActiveTab("wallet");
      setDepositOpen(true);
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/lobby/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id, stakeAmount: stake })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to launch match challenge");
      }

      setSuccessMsg(`Match challenge of PKR ${stake} launched! Broadcasting to lobby...`);
      setStakeInput("");
      syncLobby();
      syncProfile();

    } catch (err: any) {
      setErrorMsg(err.message || "Network error launching challenge");
    } finally {
      setIsCreating(false);
    }
  };

  // Join match lobby challenge
  const handleJoinChallenge = async (matchId: string, stakeAmt: number) => {
    setErrorMsg("");
    setSuccessMsg("");

    if (profile.walletBalance < stakeAmt) {
      setErrorMsg("Insufficient wallet balance to join this match.");
      setActiveTab("wallet");
      setDepositOpen(true);
      return;
    }

    try {
      const res = await fetch("/api/lobby/matches/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id, matchId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not join match.");
      }

      onNavigateToMatch(matchId);
    } catch (err: any) {
      setErrorMsg(err.message || "Match entry failed.");
    }
  };

  // Cancel match waiting in lobby
  const handleCancelChallenge = async (matchId: string) => {
    try {
      const res = await fetch("/api/lobby/matches/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id, matchId })
      });
      if (res.ok) {
        setSuccessMsg("Challenge cancelled and stakes refunded.");
        syncLobby();
        syncProfile();
      }
    } catch {
      setErrorMsg("Error cancelling challenge.");
    }
  };

  // Instant Mode (forces hard mode bot immediately)
  const handleInstantModeLaunch = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    const defaultStake = 50; // default PKR entry for Instant Mode vs AI LudoBot

    if (profile.walletBalance < defaultStake) {
      setErrorMsg(`Instant Mode requires PKR ${defaultStake} stake. Please top up your wallet.`);
      setActiveTab("wallet");
      setDepositOpen(true);
      return;
    }

    try {
      // Step A: Create standard playing match with Bot
      const res = await fetch("/api/lobby/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id, stakeAmount: defaultStake })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error initiating match");

      // Step B: Set Bot Opponent and match instantly
      const joinRes = await fetch("/api/lobby/matches/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id, matchId: data.match.id, forceBotJoin: true })
      });
      const joinData = await joinRes.json();
      if (!joinRes.ok) throw new Error(joinData.error || "Bot match assembly error");

      onNavigateToMatch(data.match.id);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to start Instant session.");
    }
  };

  // Practice Mode (completely free practice versus AI with chooseable level)
  const handlePracticeModeLaunch = async () => {
    try {
      const res = await fetch("/api/lobby/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: profile.id, 
          stakeAmount: 0, 
          isPractice: true, 
          botDifficulty: practiceDifficulty 
        })
      });
      const data = await res.json();
      if (res.ok) {
        onNavigateToMatch(data.match.id);
      } else {
        setErrorMsg(data.error || "Could not begin practice match");
      }
    } catch {
      setErrorMsg("Network error starting practice.");
    }
  };

  // Deposit Submit handler
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt < 1) {
      setErrorMsg("Minimum deposit is 1 USDT/USD.");
      return;
    }

    if (!depositTxId) {
      setErrorMsg("Transaction reference ID / Hash is mandatory.");
      return;
    }

    setIsLoadingWallet(true);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile.id,
          amount: amt,
          method: depositMethod,
          transactionId: depositTxId,
          screenshotUrl: depositScreenshot
        })
      });

      const text = await res.json();
      if (!res.ok) throw new Error(text.error);

      setSuccessMsg("Success! Deposit review submitted to Shahbaz Admin. Check wallet logs.");
      setDepositAmount("");
      setDepositTxId("");
      setDepositScreenshot("");
      setImageFileName("");
      setDepositOpen(false);
      syncWalletHistory();
    } catch (err: any) {
      setErrorMsg(err.message || "Deposit transaction failed.");
    } finally {
      setIsLoadingWallet(false);
    }
  };

  // Withdraw Submit handler
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg("Invalid withdrawal amount.");
      return;
    }

    if (profile.walletBalance < amt) {
      setErrorMsg("Your wallet has insufficient funds.");
      return;
    }

    if (!withdrawAddress.trim()) {
      setErrorMsg(`Please provide a valid ${withdrawType} destination address or ID.`);
      return;
    }

    setIsLoadingWallet(true);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile.id,
          amount: amt,
          method: withdrawType,
          destinationAddress: withdrawAddress
        })
      });

      const dat = await res.json();
      if (!res.ok) throw new Error(dat.error);

      setSuccessMsg(`Withdrawal request of ${amt} PKR dispatched successfully to Admin! A 5% fee was locked.`);
      setWithdrawAmount("");
      setWithdrawAddress("");
      setWithdrawOpen(false);
      syncProfile();
      syncWalletHistory();
    } catch (err: any) {
      setErrorMsg(err.message || "Withdrawal failed.");
    } finally {
      setIsLoadingWallet(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative" id="dashboard-container">
      
      {/* Dynamic Lobby Broadcast Toasts */}
      <div className="fixed top-24 right-6 z-50 flex flex-col space-y-3 pointer-events-none" id="dashboard-live-broadcasts">
        {liveFloatingNotices.map((notice) => (
          <div 
            key={notice.id} 
            className="p-4 bg-indigo-900/90 border border-indigo-500 rounded-2xl shadow-2xl backdrop-blur-md text-white font-medium text-xs max-w-sm flex items-center space-x-3 animate-bounce leading-relaxed pointer-events-auto"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center animate-pulse">
              <Bell size={14} className="text-white" />
            </div>
            <div className="flex-1">
              {notice.message}
            </div>
          </div>
        ))}
      </div>

      {/* Lobby Top Navigation Board */}
      <header className="bg-slate-900 border-b border-slate-800/60 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0" id="lobby-header-nav">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-slate-950 font-bold tracking-wider shadow-lg shadow-emerald-500/20">
            <span>LS</span>
          </div>
          <div>
            <h1 className="text-lg font-black text-white font-sans tracking-tight">LudoSkill Lobby</h1>
            <p className="text-[10px] text-slate-400 font-mono">
              Welcome back, <span className="text-emerald-400 font-bold">{profile.username}</span> 
              {profile.isAdmin && <span className="text-indigo-400 ml-1 font-bold">[Admin Mode Enabled]</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5" id="lobby-nav-actions">
          {profile.isAdmin && (
            <button
              onClick={onNavigateToAdmin}
              id="goto-admin-btn"
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl text-xs font-bold tracking-wide transition cursor-pointer"
            >
              <span>GO TO ADMIN PORTAL</span>
            </button>
          )}

          <div className="flex bg-slate-950 rounded-xl border border-slate-800 p-1" id="lobby-tab-switch">
            <button
              onClick={() => setActiveTab("lobby")}
              id="tab-lobby-bt"
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "lobby" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Active Arena
            </button>
            <button
              onClick={() => setActiveTab("wallet")}
              id="tab-wallet-bt"
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                activeTab === "wallet" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Wallet (Rs. {profile.walletBalance})</span>
            </button>
          </div>

          <button
            onClick={onLogout}
            id="lobby-logout-btn"
            className="p-2 bg-slate-800 hover:bg-slate-700 hover:text-rose-400 rounded-xl text-slate-400 transition cursor-pointer"
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Container Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col lg:flex-row gap-6" id="dashboard-main-container">
        
        {/* Tab content error & achievements */}
        {errorMsg && (
          <div className="w-full bg-rose-500/15 border border-rose-500/30 text-rose-400 p-4 rounded-xl text-xs font-semibold mb-2 flex items-center space-x-2 lg:col-span-2">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="w-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-xs font-semibold mb-2 flex items-center space-x-2 lg:col-span-2">
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ACTIVE ARENA TAB VIEW */}
        {activeTab === "lobby" && (
          <>
            {/* Left Column: Create Match Challenge / Bot Arenas */}
            <div className="w-full lg:w-5/12 space-y-6" id="lobby-modes-left-col">
              
              {/* Wallet Card Balance quickview */}
              <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-3xl relative overflow-hidden" id="quick-wallet-card">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wide">Wallet Balance</div>
                <div className="text-4xl font-black font-sans text-yellow-400 mt-1">Rs. {profile.walletBalance}</div>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Deposit funds using transaction proof screenshots, or withdraw securely to UPI or bank.</p>
                <div className="flex gap-2.5 mt-5">
                  <button
                    onClick={() => { setActiveTab("wallet"); setDepositOpen(true); }}
                    id="quick-deposit-btn"
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-lg shadow-emerald-500/5 flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <PlusCircle size={14} />
                    <span>Instant Deposit</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab("wallet"); setWithdrawOpen(true); }}
                    id="quick-withdraw-btn"
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition border border-slate-750 flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <ArrowUpRight size={14} />
                    <span>Withdraw Money</span>
                  </button>
                </div>
              </div>

              {/* Bot Instant Arena: Default Hard, real-money */}
              <div className="p-6 bg-gradient-to-tr from-slate-900 to-indigo-950/70 border border-indigo-500/20 rounded-3xl relative overflow-hidden" id="instant-bot-portal">
                <div className="absolute top-2 right-2 px-2.5 py-0.5 bg-indigo-500 text-[9px] font-black text-white uppercase rounded-md tracking-wider">PKR 50 Stake</div>
                <h3 className="text-base font-black text-white flex items-center space-x-1.5">
                  <Sparkles size={16} className="text-indigo-400" />
                  <span>Instant Match Mode</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">No players available? Play immediately versus LudoBot on <span className="text-indigo-400 font-semibold font-mono">HARD</span> difficulty! Standard real-money game mechanics apply.</p>
                <button
                  onClick={handleInstantModeLaunch}
                  id="start-instant-match"
                  className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5 shadow-lg shadow-indigo-600/10 cursor-pointer"
                >
                  <Play size={13} fill="currentColor" />
                  <span>PLAY INSTANT GAME VS BOT</span>
                </button>
              </div>

              {/* Practice Mode (chooseable strategy, no stake) */}
              <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-3xl" id="practice-bot-portal">
                <h3 className="text-sm font-bold text-slate-200">Practice Mode (Free Practice)</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">Master board path blockades, capture tactics, and token defense with zero charges.</p>
                
                <div className="mt-4 flex flex-col space-y-3" id="practice-options">
                  <div className="grid grid-cols-3 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setPracticeDifficulty("easy")}
                      id="opt-easy"
                      className={`py-1.5 text-[10px] font-bold tracking-wider uppercase rounded-lg transition ${
                        practiceDifficulty === "easy" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      EASY BOT
                    </button>
                    <button
                      onClick={() => setPracticeDifficulty("medium")}
                      id="opt-med"
                      className={`py-1.5 text-[10px] font-bold tracking-wider uppercase rounded-lg transition ${
                        practiceDifficulty === "medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      MEDIUM BOT
                    </button>
                    <button
                      onClick={() => setPracticeDifficulty("hard")}
                      id="opt-hrd"
                      className={`py-1.5 text-[10px] font-bold tracking-wider uppercase rounded-lg transition ${
                        practiceDifficulty === "hard" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      HARD BOT
                    </button>
                  </div>

                  <button
                    onClick={handlePracticeModeLaunch}
                    id="start-practice-match"
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-lg border border-slate-750 transition cursor-pointer"
                  >
                    Start practice game
                  </button>
                </div>
              </div>

            </div>

            {/* Right Column: Dynamic Player Lobby & Challenges list */}
            <div className="w-full lg:w-7/12 space-y-6" id="lobby-challenges-right-col">
              
              {/* Broadcast Form Panel */}
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl" id="broadcast-form-card">
                <h3 className="text-base font-black text-white">Broadcast Real-Money Challenge</h3>
                <p className="text-xs text-slate-400 mt-1 leading-tight">Define custom entry fees. Other online players see an alert and can join instantly!</p>
                
                <form onSubmit={handleCreateChallenge} className="mt-4 flex flex-col sm:flex-row gap-3" id="lobby-challenge-form">
                  <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs ring-0">Rs.</span>
                    <input
                      type="number"
                      id="lobby-stake-input"
                      value={stakeInput}
                      onChange={(e) => setStakeInput(e.target.value)}
                      placeholder="Stake amount (e.g. 100)"
                      className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-sm placeholder-slate-600 outline-none transition"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    id="broadcast-challenge-submit"
                    disabled={isCreating}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wide rounded-xl shadow-lg shadow-emerald-500/5 disabled:opacity-50 transition cursor-pointer"
                  >
                    {isCreating ? "Broadcasting..." : "Broadcast Challenge"}
                  </button>
                </form>
              </div>

              {/* Lobby Status Header */}
              <div className="flex items-center justify-between" id="lobby-active-status">
                <div className="flex items-center space-x-2">
                  <div className="w-2 w-2 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                  <span className="text-xs text-slate-400 font-mono font-bold tracking-wider uppercase">Lobby Board ({onlineCount} Active Online)</span>
                </div>
              </div>

              {/* Multi-player active Challenges List */}
              <div className="space-y-3.5" id="lobby-challenges-list">
                {matches.filter(m => !m.isPractice && m.status === "lobby").length === 0 ? (
                  <div className="py-16 text-center border border-dashed border-slate-800/80 rounded-2xl bg-slate-900/20" id="lobby-empty-notices">
                    <p className="text-sm text-slate-500 font-medium">No live multiplayer challenges available.</p>
                    <p className="text-[11px] text-slate-600 mt-1">Deploy an entry amount above to notify contestants, or play Instant Mode!</p>
                  </div>
                ) : (
                  matches
                    .filter(m => !m.isPractice && m.status === "lobby")
                    .map((mtc) => {
                      const isMine = mtc.creatorId === profile.id;
                      return (
                        <div 
                          key={mtc.id} 
                          className="p-5 bg-slate-900 border border-slate-850 rounded-2xl flex items-center justify-between shadow-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-slate-950 border border-slate-800 rounded-full flex items-center justify-center text-emerald-400 font-bold font-sans">
                              {mtc.creatorUsername.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-white leading-tight">{mtc.creatorUsername}</div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">Created: {new Date(mtc.createdAt).toLocaleTimeString()}</div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <span className="text-xs text-slate-400 block tracking-tight">Entry Stake</span>
                              <span className="text-yellow-400 font-black font-sans text-base block">Rs. {mtc.stakeAmount}</span>
                            </div>

                            {isMine ? (
                              <button
                                onClick={() => handleCancelChallenge(mtc.id)}
                                className="px-4 py-2 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 text-xs font-semibold rounded-lg transition border border-slate-750 hover:border-rose-900 cursor-pointer"
                              >
                                Cancel
                              </button>
                            ) : (
                              <button
                                onClick={() => handleJoinChallenge(mtc.id, mtc.stakeAmount)}
                                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wide rounded-xl shadow-lg shadow-emerald-500/5 transition cursor-pointer"
                              >
                                Play Match
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

            </div>
          </>
        )}

        {/* WALLET & TRANSACTION HISTORY TAB */}
        {activeTab === "wallet" && (
          <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6" id="wallet-dashboard-layout">
            
            {/* Left Balance and quick widgets */}
            <div className="md:col-span-4 space-y-6" id="wallet-widgets-col">
              
              <div className="p-6 bg-slate-900 border border-slate-850 rounded-3xl relative overflow-hidden" id="wallet-balance-center">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wide">Wallet Credits</div>
                <div className="text-4xl font-black font-sans text-yellow-500 mt-1">Rs. {profile.walletBalance}</div>
                <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">All winnings are calculated natively and credited instantaneously upon match closures.</p>
                
                <div className="flex flex-col space-y-2 mt-6">
                  <button
                    onClick={() => { setDepositOpen(true); setWithdrawOpen(false); }}
                    className={`p-3 text-xs font-extrabold rounded-xl border flex items-center justify-between transition ${
                      depositOpen && !withdrawOpen ? "bg-emerald-500 border-emerald-400 text-slate-950" : "bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800"
                    }`}
                  >
                    <span>Add Deposit Cash</span>
                    <PlusCircle size={14} />
                  </button>
                  <button
                    onClick={() => { setWithdrawOpen(true); setDepositOpen(false); }}
                    className={`p-3 text-xs font-extrabold rounded-xl border flex items-center justify-between transition ${
                      withdrawOpen && !depositOpen ? "bg-emerald-500 border-emerald-400 text-slate-950" : "bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800"
                    }`}
                  >
                    <span>Request Withdrawal</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>

              {/* Support reference card */}
              <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl" id="wallet-support-info">
                <h4 className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                  <HelpCircle size={14} className="text-indigo-400" />
                  <span>Deposit Processing Rules</span>
                </h4>
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  Transfer amount and log UPI Transaction IDs alongside a screenshot capture tool. Admin monitors 24/7 to accept matching balances instantly. If withdrawals are rejected, funds automatically return inside your active balance.
                </p>
              </div>

            </div>

            {/* Right Action Forms & Ledger Records */}
            <div className="md:col-span-8 space-y-6" id="wallet-forms-col">
              
              {/* DEPOSIT ACTION DRAWER */}
              {depositOpen && (
                <div className="p-6 bg-slate-900 border border-slate-850 rounded-3xl" id="deposit-panel">
                  <h3 className="text-base font-black text-white flex items-center justify-between">
                    <span>Deposit Credits (USDT to PKR Conversion)</span>
                    <button onClick={() => setDepositOpen(false)} className="p-1 hover:bg-slate-800 text-slate-500 rounded"><X size={16}/></button>
                  </h3>
                  
                  {/* Crypto & USDT Options Selection Cards */}
                  <div className="grid grid-cols-3 gap-2 my-4" id="deposit-methods">
                    {(["BEP20", "TRC20", "Binance ID"] as const).map((method) => (
                      <button
                        key={`dep-${method}`}
                        type="button"
                        onClick={() => {
                          setDepositMethod(method);
                          setErrorMsg("");
                        }}
                        className={`p-3 text-center rounded-xl border transition cursor-pointer flex flex-col items-center justify-center ${
                          depositMethod === method
                            ? "bg-slate-850 border-emerald-500 text-white"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <span className="text-[10px] font-bold block uppercase tracking-wide">
                          {method === "Binance ID" ? "Binance ID" : method}
                        </span>
                        <span className="text-[9px] text-slate-500 block mt-0.5">
                          {method === "Binance ID" ? "Pay ID Account" : "USDT Network"}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Payment Details Container */}
                  <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 mb-4 space-y-3 relative" id="admin-usdt-address">
                    <div className="absolute top-0 right-0 p-3 bg-emerald-500/5 text-[9px] font-black uppercase text-emerald-400 rounded-bl-xl font-mono">
                      {depositMethod}
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">
                        {depositMethod === "Binance ID" ? "Binance Pay ID Recipient" : "USDT Transfer Wallet Address"}
                      </span>
                      {depositMethod === "BEP20" && (
                        <div className="mt-1">
                          <p id="bep20-address-val" className="text-white font-mono break-all text-xs font-bold leading-tight pr-16 select-all">
                            0x3886a3172bf4e74e3829a4786059df9fbef4e10e
                          </p>
                          <p className="text-[9px] text-indigo-400 mt-1 font-semibold">Network Type: Binance Smart Chain (BSC - BEP20)</p>
                        </div>
                      )}
                      {depositMethod === "TRC20" && (
                        <div className="mt-1">
                          <p id="trc25-address-val" className="text-white font-mono break-all text-xs font-bold leading-tight pr-16 select-all">
                            TMnABsrqdZ2jWPF6bwtCzPo5qUPxQXRrWJ
                          </p>
                          <p className="text-[9px] text-teal-400 mt-1 font-semibold">Network Type: TRON Mainnet (TRC20)</p>
                        </div>
                      )}
                      {depositMethod === "Binance ID" && (
                        <div className="mt-1 space-y-1">
                          <p id="binance-id-val" className="text-white font-mono text-sm font-bold leading-none select-all pr-16">
                            165103688
                          </p>
                          <p className="text-[11px] text-emerald-400 font-extrabold leading-none mt-1 shadow-sm">
                            Account Name: Ludo_skill_Official
                          </p>
                          <p className="text-[9px] text-slate-500 font-medium">Execute standard asset transfer using Binance application pay flow.</p>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      id="copy-address-btn"
                      onClick={() => {
                        const val = depositMethod === "BEP20" ? "0x3886a3172bf4e74e3829a4786059df9fbef4e10e" :
                                    depositMethod === "TRC20" ? "TMnABsrqdZ2jWPF6bwtCzPo5qUPxQXRrWJ" : "165103688";
                        navigator.clipboard.writeText(val);
                        setCopiedText(true);
                        setTimeout(() => setCopiedText(false), 2000);
                      }}
                      className="absolute bottom-4 right-4 p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl transition flex items-center space-x-1 cursor-pointer text-[10px] font-bold"
                    >
                      {copiedText ? (
                        <>
                          <Check size={12} className="text-emerald-400" />
                          <span className="text-emerald-400 text-[9px] font-black uppercase tracking-wider">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span className="text-[9px] font-bold uppercase tracking-wide">Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  <form onSubmit={handleDepositSubmit} className="space-y-4" id="deposit-form">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 uppercase block">Deposit Amount (USDT / $)</label>
                        <input
                          type="number"
                          id="deposit-amount-usd"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="Min 1 USDT"
                          min="1"
                          step="any"
                          className="w-full bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl text-sm placeholder-slate-700 outline-none text-white focus:border-emerald-500 focus:ring-1"
                          required
                        />
                        {depositAmount && parseFloat(depositAmount) > 0 && (
                          <div className="text-xs text-emerald-400 font-bold bg-emerald-500/5 border border-emerald-500/10 px-3 py-1.5 mt-2 rounded-xl flex items-center justify-between">
                            <span>Credits Received:</span>
                            <span className="font-mono font-black text-xs">{(parseFloat(depositAmount) * 280).toLocaleString()} PKR</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 uppercase block">Transaction Hash / TxID</label>
                        <input
                          type="text"
                          value={depositTxId}
                          onChange={(e) => setDepositTxId(e.target.value)}
                          placeholder="Your crypto transfer TxID or reference hash"
                          className="w-full bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl text-sm placeholder-slate-700 outline-none text-white focus:border-emerald-500 focus:ring-1 font-mono text-[11px]"
                          required
                        />
                        <div className="text-[10px] text-slate-500 mt-1">
                          Conversion Rate: 1 USD/USDT = 280 PKR
                        </div>
                      </div>
                    </div>

                    {/* Image screenshot upload */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 uppercase block font-sans">Upload payment screenshot (Proof Image)</label>
                      <div className="flex items-center space-x-3">
                        <label className="px-4 py-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer">
                          <Upload size={14} />
                          <span>Choose Receipt Screenshot</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleScreenshotChange} 
                            className="hidden" 
                          />
                        </label>
                        <span className="text-xs text-slate-400 truncate max-w-xs">{imageFileName || "No proof uploaded"}</span>
                      </div>
                    </div>

                    {depositScreenshot && (
                      <div className="border border-slate-800 p-2.5 rounded-xl bg-slate-950 inline-block" id="receipt-preview">
                        <img 
                          src={depositScreenshot} 
                          alt="USDT Proof" 
                          className="max-h-24 rounded border border-slate-700"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      id="submit-deposit"
                      className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm uppercase tracking-wide rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer"
                    >
                      {isLoadingWallet ? "Submitting USDT Proof..." : "Submit Deposit Request"}
                    </button>
                  </form>
                </div>
              )}

              {/* WITHDRAW ACTION DRAWER */}
              {withdrawOpen && (
                <div className="p-6 bg-slate-900 border border-slate-850 rounded-3xl" id="withdraw-panel">
                  <h3 className="text-base font-black text-white flex items-center justify-between">
                    <span>Withdraw Funds (BEP20 / TRC20 / Binance ID)</span>
                    <button onClick={() => setWithdrawOpen(false)} className="p-1 hover:bg-slate-800 text-slate-500 rounded"><X size={16}/></button>
                  </h3>

                  <form onSubmit={handleWithdrawSubmit} className="space-y-4" id="withdraw-form">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 uppercase block font-sans">Payout Amount (PKR)</label>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="Amount in PKR"
                        className="w-full bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl text-sm placeholder-slate-700 outline-none text-white focus:border-indigo-500 focus:ring-1"
                        required
                      />
                      {parseFloat(withdrawAmount) > 0 && (
                        <div className="mt-2 bg-indigo-950/20 border border-indigo-900/40 p-3 rounded-xl space-y-1 text-xs">
                          <div className="flex justify-between text-slate-300">
                            <span>Withdraw Requested:</span>
                            <span className="font-mono font-bold">{(parseFloat(withdrawAmount)).toFixed(2)} PKR</span>
                          </div>
                          <div className="flex justify-between text-rose-400">
                            <span>Processing Fee (5%):</span>
                            <span className="font-mono font-bold">- {(parseFloat(withdrawAmount) * 0.05).toFixed(2)} PKR</span>
                          </div>
                          <hr className="border-slate-800" />
                          <div className="flex justify-between text-emerald-400 font-bold">
                            <span>Expected Cash Payout (Net):</span>
                            <span className="font-mono font-extrabold text-sm">{(parseFloat(withdrawAmount) * 0.95).toFixed(2)} PKR</span>
                          </div>
                          <div className="text-[10px] text-slate-400 italic pt-1">
                            Equivalent payout: ~{((parseFloat(withdrawAmount) * 0.95) / 280).toFixed(2)} USDT / USD
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <label className="text-xs font-semibold text-slate-300 uppercase block font-sans">Payout Target Destination</label>
                      <div className="grid grid-cols-3 bg-slate-950 p-1 rounded-xl border border-slate-800">
                        {(["BEP20", "TRC20", "Binance ID"] as const).map((method) => (
                          <button
                            key={`wit-panel-${method}`}
                            type="button"
                            onClick={() => setWithdrawType(method)}
                            className={`py-2 text-[10px] font-black uppercase rounded-lg transition ${
                              withdrawType === method ? "bg-slate-800 text-white" : "text-slate-500"
                            }`}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 uppercase block font-sans">
                        {withdrawType === "Binance ID" ? "Your Binance Pay ID / Account ID" : `Your ${withdrawType} (USDT) Wallet Address`}
                      </label>
                      <input
                        type="text"
                        value={withdrawAddress}
                        onChange={(e) => setWithdrawAddress(e.target.value)}
                        placeholder={
                          withdrawType === "Binance ID" 
                            ? "e.g. 165103688" 
                            : withdrawType === "BEP20" 
                            ? "Starts with 0x..." 
                            : "Starts with T..."
                        }
                        className="w-full bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl text-sm placeholder-slate-700 outline-none text-white focus:border-indigo-500 font-mono text-xs"
                        required
                      />
                      <p className="text-[9px] text-slate-500">
                        {withdrawType === "Binance ID" 
                          ? "Make sure you input your numeric Binance Pay ID correctly." 
                          : `Transfer processed on the ${withdrawType === "BEP20" ? "BSC BEP20" : "Tron TRC20"} blockchain network.`}
                      </p>
                    </div>

                    <p className="text-[10px] text-slate-500 leading-tight">
                      Platform charges a fixed <strong>5% withdrawal fee</strong>. Locked withdrawals reduce screen balances instantly. Review duration is typically 1-4 hours.
                    </p>

                    <button
                      type="submit"
                      id="submit-withdraw"
                      className="w-full py-4.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm uppercase tracking-wide rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer"
                    >
                      {isLoadingWallet ? "Filing with server..." : "Submit Withdrawal request"}
                    </button>
                  </form>
                </div>
              )}

              {/* TRANSACTIONS HISTORIC LEDGER */}
              <div className="bg-slate-900/60 border border-slate-850 p-6 rounded-3xl" id="wallet-ledger">
                <h3 className="text-sm font-bold text-slate-200 mb-4">Account Ledger Log History</h3>
                
                <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1" id="transactions-log-list">
                  {transactions.length === 0 ? (
                    <div className="py-12 text-center text-slate-600 text-xs italic">No financial movements tracked yet.</div>
                  ) : (
                    transactions.map((tx) => (
                      <div 
                        key={tx.id} 
                        className="p-4 bg-slate-950 rounded-xl border border-slate-850 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3 text-xs">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            tx.amount > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                          }`}>
                            {tx.amount > 0 ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>}
                          </div>
                          <div>
                            <span className="font-bold text-white block capitalize">
                              {tx.type === "deposit" && "Deposit Request"}
                              {tx.type === "withdraw" && "Withdraw request"}
                              {tx.type === "match_entry" && "Match entry Fee (debited)"}
                              {tx.type === "match_refund" && "Match Cancel Refund (credited)"}
                              {tx.type === "match_win" && "Match Payout Winnings"}
                            </span>
                            <span className="text-[10px] text-slate-500 block leading-tight">{tx.reference || `Reference Tx: ${tx.id.slice(-6)}`}</span>
                            <span className="text-[10px] text-slate-500 block leading-tight font-mono">{new Date(tx.createdAt).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`text-sm font-bold font-mono ${tx.amount > 0 ? "text-emerald-400" : "text-slate-400"}`}>
                            {tx.amount > 0 ? "+" : ""}
                            {tx.amount} PKR
                          </span>
                          <span className={`text-[9px] font-black uppercase block tracking-wider mt-0.5 ${
                            tx.status === "completed" || tx.status === "approved" ? "text-emerald-500" :
                            tx.status === "pending" ? "text-amber-500 animate-pulse" :
                            "text-rose-500"
                          }`}>
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

    </div>
  );
}
