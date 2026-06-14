import React, { useState } from "react";
import { Lock, Mail, User, ArrowLeft, ArrowRight } from "lucide-react";

interface RegisterViewProps {
  onRegisterSuccess: (user: any) => void;
  onSwitchToLogin: () => void;
}

export default function RegisterView({ onRegisterSuccess, onSwitchToLogin }: RegisterViewProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!email || !username || !password) {
      setErrorMsg("Please fill in all details.");
      return;
    }

    if (username.length < 3) {
      setErrorMsg("Username must be at least 3 characters long.");
      return;
    }

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }

      setSuccessMsg("Account successfully created! Redirecting to dashboard...");
      setTimeout(() => {
        onRegisterSuccess(data.user);
      }, 1500);

    } catch (err: any) {
      setErrorMsg(err.message || "Registration encountered an error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-12" id="register-container">
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden" id="register-card">
        
        {/* Ambient Glows */}
        <div className="absolute top-0 right-1/4 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 translate-y-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8 relative" id="register-header">
          <button
            onClick={onSwitchToLogin}
            id="back-to-login"
            className="absolute left-0 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition focus:outline-none"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-emerald-500 to-indigo-600 rounded-2xl shadow-indigo-500/20 shadow-lg text-white mb-2">
            <span className="text-2xl font-bold tracking-wider">LS</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Create Account</h2>
          <p className="text-xs text-slate-400 mt-1">Get 30 PKR welcome bonus upon signing up!</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium" id="register-error">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-medium animate-pulse" id="register-success">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4" id="register-form">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block">Username (Unique)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <User size={18} />
              </span>
              <input
                id="register-username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition"
                placeholder="LudoKing99"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block">Email Address (Unique)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <Mail size={18} />
              </span>
              <input
                id="register-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition"
                placeholder="name@domain.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block">Password</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <Lock size={18} />
              </span>
              <input
                id="register-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition"
                placeholder="Must be 6+ characters"
                required
              />
            </div>
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
            By creating an account you certify that you are 18+ and adhere to the fair-play platform policies. 
          </p>

          <button
            type="submit"
            id="register-submit-btn"
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-slate-950 font-bold tracking-wide rounded-xl shadow-lg shadow-emerald-500/10 transition mt-2 flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign Up and Collect 30 PKR Bonus</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800/80 text-center" id="register-footer">
          <p className="text-xs text-slate-400">
            Already have an account?{" "}
            <button
              onClick={onSwitchToLogin}
              id="switch-to-login-link"
              className="text-emerald-400 hover:text-emerald-300 font-bold focus:outline-none underline transition ml-1"
            >
              Sign In
            </button>
          </p>
        </div>

      </div>
    </div>
  );
}
