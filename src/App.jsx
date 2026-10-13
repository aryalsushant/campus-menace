import { useState } from 'react';
import Game from './game/Game.jsx';
import { startWorld } from './game/core/runtime';

export default function App() {
  useState(() => startWorld('attract'));
  return (
    <div className="cm-root">
      <Game />
    </div>
  );
}
