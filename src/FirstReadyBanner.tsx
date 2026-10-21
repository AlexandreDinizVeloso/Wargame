import { useEffect, useState } from 'react';
import type { GameView } from '../shared/types';
export default function FirstReadyBanner({ game }: { game: GameView }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (game.phase !== 'planning') return null;
  return (
    <div className={`first-ready-banner ${game.turnDeadlineAt ? 'counting' : ''}`} role="status">
      {game.paused
        ? '⏸️ Campanha pausada'
        : game.turnDeadlineAt
          ? `⏳ ${game.firstReadyPlayerName} finalizou a rodada! Restam ${Math.max(0, Math.ceil((game.turnDeadlineAt - now) / 1000))}s para o turno virar automaticamente!`
          : `⏸️ Aguardando o 1º jogador finalizar para iniciar o relógio (${game.turnSeconds}s)`}
    </div>
  );
}
