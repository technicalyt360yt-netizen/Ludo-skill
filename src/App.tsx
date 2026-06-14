import React, { useState, useEffect } from "react";
import LoginView from "./components/LoginView";
import RegisterView from "./components/RegisterView";
import DashboardView from "./components/DashboardView";
import AdminPanel from "./components/AdminPanel";
import GameView from "./components/GameView";
import { UserProfile } from "./types";

export default function App() {
  const [screen, setScreen] = useState<"login" | "register" | "dashboard" | "admin" | "game">("login");
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);

  // Restore session from localStorage on mount (optional persistent login check)
  useEffect(() => {
    const cachedUser = localStorage.getItem("ludoskill_active_user");
    if (cachedUser) {
      try {
        const Parsed = JSON.parse(cachedUser);
        setCurrentUser(Parsed);
        setScreen("dashboard");
      } catch {
        localStorage.removeItem("ludoskill_active_user");
      }
    }
  }, []);

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem("ludoskill_active_user", JSON.stringify(user));
    setScreen("dashboard");
  };

  const handleRegisterSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem("ludoskill_active_user", JSON.stringify(user));
    setScreen("dashboard");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentMatchId(null);
    localStorage.removeItem("ludoskill_active_user");
    setScreen("login");
  };

  const handleNavigateToMatch = (matchId: string) => {
    setCurrentMatchId(matchId);
    setScreen("game");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950 font-sans" id="applet-viewport">
      
      {screen === "login" && (
        <LoginView 
          onLoginSuccess={handleLoginSuccess} 
          onSwitchToRegister={() => setScreen("register")} 
        />
      )}

      {screen === "register" && (
        <RegisterView 
          onRegisterSuccess={handleRegisterSuccess} 
          onSwitchToLogin={() => setScreen("login")} 
        />
      )}

      {screen === "dashboard" && currentUser && (
        <DashboardView 
          currentUser={currentUser} 
          onLogout={handleLogout}
          onNavigateToMatch={handleNavigateToMatch}
          onNavigateToAdmin={() => setScreen("admin")}
        />
      )}

      {screen === "admin" && currentUser && (
        <AdminPanel 
          currentUser={currentUser} 
          onExit={() => setScreen("dashboard")} 
        />
      )}

      {screen === "game" && currentUser && currentMatchId && (
        <GameView 
          currentUser={currentUser}
          matchId={currentMatchId}
          onExit={() => {
            setCurrentMatchId(null);
            setScreen("dashboard");
          }}
        />
      )}

    </div>
  );
}
