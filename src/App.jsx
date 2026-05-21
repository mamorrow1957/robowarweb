import React, { useState } from 'react';
import Nav from './components/Nav.jsx';
import MyRobots from './components/MyRobots.jsx';
import RobotEditor from './components/Editor/RobotEditor.jsx';
import BattleSetup from './components/Battle/BattleSetup.jsx';
import BattleViewer from './components/Battle/BattleViewer.jsx';
import TournamentBrowser from './components/Tournament/TournamentBrowser.jsx';
import Leaderboard from './components/Leaderboard/Leaderboard.jsx';

export default function App() {
  const [page, setPage] = useState('robots');
  const [params, setParams] = useState({});

  function navigate(newPage, newParams = {}) {
    setPage(newPage);
    setParams(newParams);
  }

  function renderPage() {
    switch (page) {
      case 'robots':
        return <MyRobots navigate={navigate} />;
      case 'editor':
        return <RobotEditor robotId={params.robotId} navigate={navigate} />;
      case 'battle-setup':
        return <BattleSetup preselected={params.preselected} navigate={navigate} />;
      case 'battle':
        return <BattleViewer config={params.config} navigate={navigate} />;
      case 'tournament':
        return <TournamentBrowser navigate={navigate} />;
      case 'leaderboard':
        return <Leaderboard navigate={navigate} />;
      default:
        return <MyRobots navigate={navigate} />;
    }
  }

  return (
    <div className="app">
      <Nav page={page} navigate={navigate} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
