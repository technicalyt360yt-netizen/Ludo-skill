import React, { useState, useEffect } from "react";
import { Users, CreditCard, Award, Check, X, Shield, ArrowLeft, RefreshCw, AlertTriangle, UserMinus, UserCheck, Edit2 } from "lucide-react";
import { DepositRequest, WithdrawRequest, UserProfile, MatchRecord } from "../types";

interface AdminPanelProps {
  currentUser: any;
  onExit: () => void;
}

export default function AdminPanel({ currentUser, onExit }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"deposits" | "withdrawals" | "players" | "matches">("deposits");
  
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawRequest[]>([]);
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingBalance, setEditingBalance] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      if (activeTab === "deposits") {
        const r = await fetch("/api/admin/deposits");
        const data = await r.json();
        setDeposits(data);
      } else if (activeTab === "withdrawals") {
        const r = await fetch("/api/admin/withdrawals");
        const data = await r.json();
        setWithdrawals(data);
      } else if (activeTab === "players") {
        const r = await fetch("/api/admin/players");
        const data = await r.json();
        setPlayers(data);
      } else if (activeTab === "matches") {
        const r = await fetch("/api/admin/matches");
        const data = await r.json();
        setMatches(data);
      }
    } catch (err) {
      setErrorMsg("Failed to synchronize admin data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleApproveDeposit = async (depId: string) => {
    try {
      const res = await fetch("/api/admin/deposits/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId: depId })
      });
      if (res.ok) {
        setSuccessMsg("Deposit approved. Funds credited to user wallet!");
        fetchData();
      } else {
        const text = await res.json();
        setErrorMsg(text.error || "Failed to approve deposit.");
      }
    } catch {
      setErrorMsg("Failed to process approval.");
    }
  };

  const handleRejectDeposit = async (depId: string) => {
    try {
      const res = await fetch("/api/admin/deposits/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId: depId })
      });
      if (res.ok) {
        setSuccessMsg("Deposit request rejected.");
        fetchData();
      } else {
        setErrorMsg("Failed to reject deposit.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
  };

  const handleApproveWithdrawal = async (witId: string) => {
    try {
      const res = await fetch("/api/admin/withdrawals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawId: witId })
      });
      if (res.ok) {
        setSuccessMsg("Withdrawal confirmed and processed!");
        fetchData();
      } else {
        setErrorMsg("Failed to approve withdrawal.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
  };

  const handleRejectWithdrawal = async (witId: string) => {
    try {
      const res = await fetch("/api/admin/withdrawals/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawId: witId })
      });
      if (res.ok) {
        setSuccessMsg("Withdrawal request rejected. Funds fully refunded to user wallet!");
        fetchData();
      } else {
        setErrorMsg("Failed to reject withdrawal.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
  };

  const handleSaveBalance = async (pId: string) => {
    try {
      const res = await fetch("/api/admin/players/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pId, newBalance: editingBalance })
      });
      if (res.ok) {
        setSuccessMsg("Player wallet adjusted successfully!");
        setEditingUserId(null);
        fetchData();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to balance adjust.");
      }
    } catch {
      setErrorMsg("Network error adjustments.");
    }
  };

  const handleToggleBanned = async (pId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "banned" : "active";
    try {
      const res = await fetch("/api/admin/players/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pId, status: nextStatus })
      });
      if (res.ok) {
        setSuccessMsg(`Player has been marked as ${nextStatus}!`);
        fetchData();
      } else {
        setErrorMsg("Failed to adjust account status.");
      }
    } catch {
      setErrorMsg("Network error status toggle.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="admin-panel-container">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between" id="admin-header">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans">LudoSkill Admin Dashboard</h1>
            <p className="text-[11px] text-indigo-400">Guarded Control Mode ({currentUser?.username})</p>
          </div>
        </div>

        <button
          onClick={onExit}
          id="admin-exit-btn"
          className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-sm transition font-medium cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Exit to Dashboard</span>
        </button>
      </header>

      {/* Stats Quickbar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6" id="admin-stats-bar">
        <button
          onClick={() => setActiveTab("deposits")}
          className={`p-5 rounded-2xl border text-left transition ${
            activeTab === "deposits" ? "bg-indigo-950/40 border-indigo-500/50" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-indigo-400 mb-2">
            <CreditCard size={20} />
            <span className="text-[10px] font-bold tracking-wide uppercase">Deposits</span>
          </div>
          <div className="text-2xl font-black font-sans">Wallet Sync</div>
          <p className="text-[10px] text-slate-400 mt-1">Review receipts & credit users</p>
        </button>

        <button
          onClick={() => setActiveTab("withdrawals")}
          className={`p-5 rounded-2xl border text-left transition ${
            activeTab === "withdrawals" ? "bg-indigo-950/40 border-indigo-500/50" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <CreditCard size={20} />
            <span className="text-[10px] font-bold tracking-wide uppercase">Withdrawing</span>
          </div>
          <div className="text-2xl font-black font-sans">Payouts Queue</div>
          <p className="text-[10px] text-slate-400 mt-1">UPI & bank fund release</p>
        </button>

        <button
          onClick={() => setActiveTab("players")}
          className={`p-5 rounded-2xl border text-left transition ${
            activeTab === "players" ? "bg-indigo-950/40 border-indigo-500/50" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-teal-400 mb-2">
            <Users size={20} />
            <span className="text-[10px] font-bold tracking-wide uppercase">Players</span>
          </div>
          <div className="text-2xl font-black font-sans font-sans">User Records</div>
          <p className="text-[10px] text-slate-400 mt-1">Edit bal, status, or ban</p>
        </button>

        <button
          onClick={() => setActiveTab("matches")}
          className={`p-5 rounded-2xl border text-left transition ${
            activeTab === "matches" ? "bg-indigo-950/40 border-indigo-500/50" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-amber-500 mb-2">
            <Award size={20} />
            <span className="text-[10px] font-bold tracking-wide uppercase">Lobbies</span>
          </div>
          <div className="text-2xl font-black font-sans">Match Logs</div>
          <p className="text-[10px] text-slate-400 mt-1">Track payouts & penalties</p>
        </button>
      </div>

      {/* Main Panel Content */}
      <main className="flex-1 px-6 pb-12" id="admin-main-section">
        
        {/* Sync Controls */}
        <div className="flex items-center justify-between mb-4" id="admin-filters-bar">
          <h2 className="text-lg font-bold text-white capitalize">{activeTab} Management Queue</h2>
          <button
            onClick={fetchData}
            id="admin-refresh-btn"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            <span>Force Synchronize</span>
          </button>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="mb-4 p-4 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center space-x-2" id="admin-error">
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center space-x-2" id="admin-success">
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TABLE WRAPPER */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl" id="admin-table-area">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center space-y-4">
              <span className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400 font-mono">Loading records...</p>
            </div>
          ) : (
            <>
              {/* DEPOSITS LIST TAB */}
              {activeTab === "deposits" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left" id="admin-deposits-table">
                    <thead className="bg-slate-950 font-sans text-xs uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4">Player & Date</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">UPI/TxID Reference</th>
                        <th className="px-6 py-4">Screenshot Proof</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-sm">
                      {deposits.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-16 text-slate-500 font-medium">No deposit requests logged.</td>
                        </tr>
                      ) : (
                        deposits.map((dep) => (
                          <tr key={dep.id} className="hover:bg-slate-800/20">
                            <td className="px-6 py-4">
                              <span className="font-bold text-white block">{dep.username}</span>
                              <span className="text-[10px] text-slate-500 font-mono block">{new Date(dep.createdAt).toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-yellow-400 font-black font-mono block text-base">Rs. {dep.amount}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs bg-slate-950 px-2.5 py-1.5 border border-slate-800 text-indigo-300 rounded font-mono block w-max">{dep.transactionId}</span>
                            </td>
                            <td className="px-6 py-4">
                              {dep.screenshotUrl ? (
                                <div className="relative group">
                                  <img 
                                    src={dep.screenshotUrl} 
                                    alt="Transaction Proof" 
                                    className="w-16 h-10 object-cover rounded border border-slate-800"
                                  />
                                  <div className="absolute left-0 top-0 hidden group-hover:block z-50 bg-slate-950 p-2 border border-slate-700 rounded shadow-2xl">
                                    <img 
                                      src={dep.screenshotUrl} 
                                      alt="Transaction Proof Enlarged" 
                                      className="max-w-xs max-h-48 rounded"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 italic block">No image provided</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase rounded-full ${
                                dep.status === "pending" ? "bg-amber-500/15 text-amber-500 border border-amber-500/25" :
                                dep.status === "approved" ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/25" :
                                "bg-rose-500/15 text-rose-500 border border-rose-500/25"
                              }`}>
                                {dep.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {dep.status === "pending" && (
                                <div className="flex items-center justify-end space-x-2">
                                  <button
                                    onClick={() => handleApproveDeposit(dep.id)}
                                    className="p-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition cursor-pointer"
                                    title="Approve & Credit Balance"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleRejectDeposit(dep.id)}
                                    className="p-1.5 bg-rose-500 hover:bg-rose-400 text-slate-950 rounded-lg transition cursor-pointer"
                                    title="Reject Request"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* WITHDRAWALS LIST TAB */}
              {activeTab === "withdrawals" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left" id="admin-withdraws-table">
                    <thead className="bg-slate-950 font-sans text-xs uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4">Player & Date</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">UPI/Bank Formats</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-sm">
                      {withdrawals.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-16 text-slate-500 font-medium">No withdrawal operations logged.</td>
                        </tr>
                      ) : (
                        withdrawals.map((wit) => (
                          <tr key={wit.id} className="hover:bg-slate-800/20">
                            <td className="px-6 py-4">
                              <span className="font-bold text-white block">{wit.username}</span>
                              <span className="text-[10px] text-slate-500 font-mono block">{new Date(wit.createdAt).toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-emerald-400 font-black font-mono text-base">Rs. {wit.amount}</span>
                            </td>
                            <td className="px-6 py-4">
                              {wit.method ? (
                                <div className="space-y-1">
                                  <span className="px-1.5 py-0.5 bg-indigo-950 border border-indigo-800 text-indigo-300 text-[9px] font-black uppercase rounded font-mono">
                                    {wit.method}
                                  </span>
                                  <span className="text-xs text-slate-300 font-mono block break-all select-all">
                                    {wit.destinationAddress}
                                  </span>
                                </div>
                              ) : wit.upiId ? (
                                <span className="text-xs text-indigo-300 font-mono block">UPI ID: {wit.upiId}</span>
                              ) : (
                                <div className="space-y-0.5 text-xs text-slate-300 font-mono">
                                  <p>Acc: {wit.bankAccount}</p>
                                  <p>IFSC: {wit.bankIfsc}</p>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase rounded-full ${
                                wit.status === "pending" ? "bg-amber-500/15 text-amber-500 border border-amber-500/25" :
                                wit.status === "approved" ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/25" :
                                "bg-rose-500/15 text-rose-500 border border-rose-500/25"
                              }`}>
                                {wit.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {wit.status === "pending" && (
                                <div className="flex items-center justify-end space-x-2">
                                  <button
                                    onClick={() => handleApproveWithdrawal(wit.id)}
                                    className="p-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition"
                                    title="Mark Approved"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleRejectWithdrawal(wit.id)}
                                    className="p-1.5 bg-rose-500 hover:bg-rose-400 text-slate-950 rounded-lg transition"
                                    title="Reject & Direct Refund"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PLAYERS LIST TAB */}
              {activeTab === "players" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left" id="admin-players-table">
                    <thead className="bg-slate-950 font-sans text-xs uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4">Username & Email</th>
                        <th className="px-6 py-4">Wallet Balance</th>
                        <th className="px-6 py-4">Joined Date</th>
                        <th className="px-6 py-4">Account Status</th>
                        <th className="px-6 py-4 text-right">Admin Controls</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-sm">
                      {players.map((plr) => (
                        <tr key={plr.id} className="hover:bg-slate-800/20">
                          <td className="px-6 py-4">
                            <span className="font-bold text-white block">{plr.username}</span>
                            <span className="text-xs text-slate-400 font-mono block">{plr.email}</span>
                          </td>
                          <td className="px-6 py-4">
                            {editingUserId === plr.id ? (
                              <div className="flex items-center space-x-2">
                                <input
                                  type="number"
                                  value={editingBalance}
                                  onChange={(e) => setEditingBalance(e.target.value)}
                                  className="w-24 bg-slate-950 border border-slate-700 px-2 py-1 text-sm rounded font-mono text-white outline-none"
                                />
                                <button
                                  onClick={() => handleSaveBalance(plr.id)}
                                  className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded transition"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingUserId(null)}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1.5">
                                <span className="text-yellow-400 font-black font-mono text-base">Rs. {plr.walletBalance}</span>
                                <button
                                  onClick={() => {
                                    setEditingUserId(plr.id);
                                    setEditingBalance(plr.walletBalance.toString());
                                  }}
                                  className="text-slate-500 hover:text-white transition p-1"
                                  title="Force Adjust Balance"
                                >
                                  <Edit2 size={13} />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs text-slate-400 font-mono block">{new Date(plr.createdAt).toLocaleDateString()}</span>
                          </td>
                          <td className="px-6 py-4 font-sans text-xs">
                            <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border ${
                              plr.status === "active" 
                                ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" 
                                : "bg-rose-500/15 text-rose-500 border-rose-500/30"
                            }`}>
                              {plr.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleToggleBanned(plr.id, plr.status)}
                              className={`px-3 py-1.5 rounded-xl font-bold tracking-wider text-xs flex items-center space-x-1 ml-auto transition ${
                                plr.status === "active"
                                  ? "bg-rose-500 hover:bg-rose-400 text-slate-950"
                                  : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                              }`}
                            >
                              {plr.status === "active" ? (
                                <>
                                  <UserMinus size={13} />
                                  <span>BAN PLAYER</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck size={13} />
                                  <span>UNBAN PLAYER</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* MATCHES LIST TAB */}
              {activeTab === "matches" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left" id="admin-matches-table">
                    <thead className="bg-slate-950 font-sans text-xs uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4">Match ID & Stake</th>
                        <th className="px-6 py-4">Player 1 (Green)</th>
                        <th className="px-6 py-4">Player 2 (Yellow)</th>
                        <th className="px-6 py-4">Game Mode</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Winner Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-sm">
                      {matches.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-16 text-slate-500 font-medium">No matches played/created yet.</td>
                        </tr>
                      ) : (
                        matches.map((mtc) => {
                          const originalPot = mtc.stakeAmount * 2;
                          return (
                            <tr key={mtc.id} className="hover:bg-slate-800/20 font-sans">
                              <td className="px-6 py-4">
                                <span className="text-[10px] text-indigo-400 font-mono block mb-1">ID: ...{mtc.id.slice(-8)}</span>
                                <span className="text-yellow-400 font-black font-mono">Rs. {mtc.stakeAmount} stake</span>
                                <span className="text-slate-400 block text-xs">Pot: Rs. {originalPot}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-white font-bold block">{mtc.creatorUsername}</span>
                                <span className="text-[10px] text-slate-500 font-mono">Creator</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-white font-bold block">{mtc.opponentUsername || <span className="text-slate-600 font-normal italic">Waiting...</span>}</span>
                                <span className="text-[10px] text-slate-500 font-mono">Opponent</span>
                              </td>
                              <td className="px-6 py-4">
                                {mtc.isPractice ? (
                                  <span className="bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded text-[10px]">PRACTICE BOT</span>
                                ) : mtc.opponentId === "system-bot-id" ? (
                                  <span className="bg-indigo-900 text-indigo-100 font-bold px-2 py-0.5 rounded text-[10px]">INSTANT BOT (HARD)</span>
                                ) : (
                                  <span className="bg-teal-900 text-teal-100 font-bold px-2 py-0.5 rounded text-[10px]">REAL MULTIPLAYER</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`text-xs uppercase font-extrabold tracking-wide ${
                                  mtc.status === "playing" ? "text-amber-500" :
                                  mtc.status === "completed" ? "text-emerald-500" :
                                  mtc.status === "cancelled" ? "text-slate-500" : "text-sky-400"
                                }`}>
                                  {mtc.status}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {mtc.status === "completed" ? (
                                  <div>
                                    <span className="text-emerald-400 font-black block">
                                      {mtc.winnerId === mtc.creatorId ? mtc.creatorUsername : mtc.opponentUsername} Won
                                    </span>
                                    <span className="text-[10px] text-slate-400 italic block leading-tight">
                                      Reason: {mtc.winReason || "finished"} 
                                      {mtc.winReason === "forfeit" && " (Opponent Left - 20% platform fee applied)"}
                                      {mtc.winReason === "timeout" && " (3-miss automated timeout)"}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-500 italic block">None</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

      </main>

    </div>
  );
}
