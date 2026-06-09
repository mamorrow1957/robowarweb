import React, { useState, useEffect } from 'react';
import Nav from './components/Nav.jsx';
import SplashPage from './components/SplashPage.jsx';
import MyRobots from './components/MyRobots.jsx';
import RobotEditor from './components/Editor/RobotEditor.jsx';
import BattleSetup from './components/Battle/BattleSetup.jsx';
import BattleViewer from './components/Battle/BattleViewer.jsx';
import TournamentBrowser from './components/Tournament/TournamentBrowser.jsx';
import Leaderboard from './components/Leaderboard/Leaderboard.jsx';
import AuthModal from './components/AuthModal.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import AccountModal from './components/AccountModal.jsx';
import ForgotPasswordModal from './components/ForgotPasswordModal.jsx';
import { isLoggedIn, isAdmin, saveSession } from './auth.js';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [page, setPage]             = useState('robots');
  const [params, setParams]         = useState({});
  const [loggedIn, setLoggedIn]     = useState(isLoggedIn());
  const [resetToken, setResetToken] = useState(null);

  useEffect(() => {
    // Parse reset token from hash fragment (never sent to server, not in logs)
    const hash = window.location.hash;
    const match = hash.match(/[#&]reset=([^&]+)/);
    if (match) {
      setResetToken(match[1]);
      setShowSplash(false);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  function navigate(newPage, newParams = {}) {
    setPage(newPage);
    setParams(newParams);
  }

  function handleAuthChange() {
    setLoggedIn(isLoggedIn());
    navigate('robots');
  }

  function renderPage() {
    if (resetToken) {
      return (
        <ForgotPasswordModal
          resetToken={resetToken}
          onClose={() => { setResetToken(null); navigate('login'); }}
        />
      );
    }

    switch (page) {
      case 'login':
        return (
          <AuthModal
            onSuccess={handleAuthChange}
            onForgotPassword={() => navigate('forgot-password')}
            onNeedSetPassword={() => { setLoggedIn(true); navigate('set-password'); }}
          />
        );
      case 'forgot-password':
        return <ForgotPasswordModal onClose={() => navigate('login')} />;
      case 'set-password':
        return (
          <AccountModal
            isFirstLogin
            onClose={() => { setLoggedIn(isLoggedIn()); navigate('robots'); }}
          />
        );
      case 'account':
        return <AccountModal onClose={() => navigate('robots')} />;
      case 'admin':
        return isAdmin()
          ? <AdminPanel navigate={navigate} />
          : <MyRobots navigate={navigate} loggedIn={loggedIn} />;
      case 'robots':
        return <MyRobots navigate={navigate} loggedIn={loggedIn} />;
      case 'editor':
        return <RobotEditor robotId={params.robotId} navigate={navigate} loggedIn={loggedIn} />;
      case 'battle-setup':
        return <BattleSetup preselected={params.preselected} navigate={navigate} />;
      case 'battle':
        return <BattleViewer config={params.config} navigate={navigate} />;
      case 'tournament':
        return <TournamentBrowser navigate={navigate} />;
      case 'leaderboard':
        return <Leaderboard navigate={navigate} />;
      default:
        return <MyRobots navigate={navigate} loggedIn={loggedIn} />;
    }
  }

  if (showSplash) {
    return <SplashPage onEnter={() => setShowSplash(false)} onLogin={() => { setShowSplash(false); navigate('login'); }} />;
  }

  return (
    <div className="app">
      <Nav page={page} navigate={navigate} onAuthChange={handleAuthChange} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
