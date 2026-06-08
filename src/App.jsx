import React, { useState } from 'react';
import Nav from './components/Nav.jsx';
import SplashPage from './components/SplashPage.jsx';
import MyRobots from './components/MyRobots.jsx';
import RobotEditor from './components/Editor/RobotEditor.jsx';
import BattleSetup from './components/Battle/BattleSetup.jsx';
import BattleViewer from './components/Battle/BattleViewer.jsx';
import TournamentBrowser from './components/Tournament/TournamentBrowser.jsx';
import Leaderboard from './components/Leaderboard/Leaderboard.jsx';
import AuthModal from './components/AuthModal.jsx';
import { isLoggedIn } from './auth.js';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [page, setPage]   = useState('robots');
  const [params, setParams] = useState({});
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

  function navigate(newPage, newParams = {}) {
    setPage(newPage);
    setParams(newParams);
  }

  function handleAuthChange() {
    setLoggedIn(isLoggedIn());
    navigate('robots');
  }

  function renderPage() {
    if (page === 'login') {
      return <AuthModal onSuccess={handleAuthChange} />;
    }
    switch (page) {
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
    return <SplashPage onEnter={() => setShowSplash(false)} />;
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
