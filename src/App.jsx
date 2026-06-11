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
import SharedRobotView from './components/SharedRobotView.jsx';
import VerifyEmailModal from './components/VerifyEmailModal.jsx';
import PublicRobots from './components/PublicRobots.jsx';
import { isLoggedIn, isAdmin, saveSession } from './auth.js';
import { getRobotByToken } from './apiStorage.js';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [page, setPage]             = useState('robots');
  const [params, setParams]         = useState({});
  const [loggedIn, setLoggedIn]     = useState(isLoggedIn());
  const [resetToken, setResetToken] = useState(null);
  const [verifyToken, setVerifyToken] = useState(null);
  const [shareToken, setShareToken]   = useState(null);

  useEffect(() => {
    const hash = window.location.hash;
    const resetMatch  = hash.match(/[#&]reset=([^&]+)/);
    const verifyMatch = hash.match(/[#&]verify=([^&]+)/);
    const robotMatch  = hash.match(/[#&]robot=([^&]+)/);
    const shareMatch  = hash.match(/[#&]share=([^&]+)/);
    if (resetMatch) {
      setResetToken(resetMatch[1]);
      setShowSplash(false);
      window.history.replaceState({}, '', '/');
    } else if (verifyMatch) {
      setVerifyToken(verifyMatch[1]);
      setShowSplash(false);
      window.history.replaceState({}, '', '/');
    } else if (robotMatch) {
      setShowSplash(false);
      navigate('shared-robot', { robotId: robotMatch[1] });
      window.history.replaceState({}, '', '/');
    } else if (shareMatch) {
      setShowSplash(false);
      setShareToken(shareMatch[1]);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  function navigate(newPage, newParams = {}) {
    setPage(newPage);
    setParams(newParams);
  }

  function handleAuthChange() {
    setLoggedIn(isLoggedIn());
    navigate(isAdmin() ? 'admin' : 'robots');
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
    if (shareToken) {
      if (!loggedIn) {
        return (
          <AuthModal
            onSuccess={() => setLoggedIn(isLoggedIn())}
            onForgotPassword={() => navigate('forgot-password')}
            onNeedSetPassword={() => { setLoggedIn(true); navigate('set-password'); }}
          />
        );
      }
      return <SharedRobotView shareToken={shareToken} navigate={navigate} onClose={() => setShareToken(null)} />;
    }
    if (verifyToken) {
      return (
        <VerifyEmailModal
          token={verifyToken}
          onSuccess={() => { setVerifyToken(null); setLoggedIn(isLoggedIn()); navigate('robots'); }}
          onClose={() => { setVerifyToken(null); navigate('login'); }}
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
        return <AccountModal onClose={() => { setLoggedIn(isLoggedIn()); navigate(isAdmin() ? 'admin' : 'robots'); }} />;
      case 'admin':
        return isAdmin()
          ? <AdminPanel navigate={navigate} />
          : <MyRobots navigate={navigate} loggedIn={loggedIn} />;
      case 'robots':
        return <MyRobots navigate={navigate} loggedIn={loggedIn} />;
      case 'editor':
        return <RobotEditor robotId={params.robotId} navigate={navigate} loggedIn={loggedIn} />;
      case 'shared-robot':
        if (!loggedIn) {
          return (
            <AuthModal
              onSuccess={() => setLoggedIn(isLoggedIn())}
              onForgotPassword={() => navigate('forgot-password')}
              onNeedSetPassword={() => { setLoggedIn(true); navigate('set-password'); }}
            />
          );
        }
        return <SharedRobotView robotId={params.robotId} navigate={navigate} />;
      case 'battle-setup':
        return <BattleSetup preselected={params.preselected} extraRobots={params.extraRobots || []} navigate={navigate} />;
      case 'battle':
        return <BattleViewer config={params.config} navigate={navigate} />;
      case 'tournament':
        return <TournamentBrowser navigate={navigate} />;
      case 'leaderboard':
        return <Leaderboard navigate={navigate} />;
      case 'public-robots':
        return <PublicRobots navigate={navigate} />;
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
