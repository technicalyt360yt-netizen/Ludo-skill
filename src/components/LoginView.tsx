import React, { useState, useEffect } from "react";
import { Lock, Mail, ArrowRight, Eye, EyeOff, CheckSquare, Square, Shield } from "lucide-react";

interface LoginViewProps {
  onLoginSuccess: (user: any) => void;
  onSwitchToRegister: () => void;
}

export default function LoginView({ onLoginSuccess, onSwitchToRegister }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Retrieve remembered credentials on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem("ludoskill_remember_email");
    const savedPassword = localStorage.getItem("ludoskill_remember_password");
    if (savedEmail && savedPassword) {
      setEmail(savedEmail);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!email || !password) {
      setErrorMsg("Please fill in all credentials.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      // Handle remember me logic
      if (rememberMe) {
        localStorage.setItem("ludoskill_remember_email", email);
        localStorage.setItem("ludoskill_remember_password", password);
      } else {
        localStorage.removeItem("ludoskill_remember_email");
        localStorage.removeItem("ludoskill_remember_password");
      }

      // Proceed on login success
      onLoginSuccess(data.user);
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong. Please check your network.");
    } finally {
      setIsLoading(false);
    }
  };

  const fillAdmin = () => {
    setEmail("shahbazad543@gmail.com");
    setPassword("Learn##123");
    setErrorMsg("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-12" id="login-container">
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden" id="login-card">
        
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/4 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 translate-y-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8 relative" id="login-header">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-emerald-500 to-indigo-600 rounded-2xl shadow-indigo-500/20 shadow-lg text-white mb-4 animate-pulse">
            <span className="text-2xl font-bold tracking-wider font-sans">LS</span>
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">LudoSkill</h2>
          <p className="text-sm text-slate-400 mt-2">Play legit 2-player matches, win cash instantly</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium" id="login-error">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5" id="login-form">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block">Email Address</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <Mail size={18} />
              </span>
              <input
                id="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition"
                placeholder="name@domain.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block">Password</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <Lock size={18} />
              </span>
              <input
                id="login-password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-11 py-3.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition"
                placeholder="••••••••••••"
                required
              />
              <button
                type="button"
                id="toggle-visible-pass"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Remember Me checkbox */}
          <div className="flex items-center justify-between pt-1" id="login-actions">
            <button
              type="button"
              id="remember-me-btn"
              onClick={() => setRememberMe(!rememberMe)}
              className="flex items-center space-x-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition focus:outline-none"
            >
              {rememberMe ? (
                <CheckSquare size={16} className="text-emerald-500" />
              ) : (
                <Square size={16} className="text-slate-600" />
              )}
              <span>Remember me</span>
            </button>
          </div>

          <button
            type="submit"
            id="login-submit-btn"
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-slate-950 font-bold tracking-wide rounded-xl shadow-lg shadow-emerald-500/10 transition mt-2 flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In Securely</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col items-center" id="login-footer">
          <p className="text-xs text-slate-400">
            Don't have an account?{" "}
            <button
              onClick={onSwitchToRegister}
              id="switch-to-register-link"
              className="text-emerald-400 hover:text-emerald-300 font-bold focus:outline-none underline transition ml-1"
            >
              Sign Up
            </button>
          </p>
        </div>

      </div>
    </div>
  );
}
