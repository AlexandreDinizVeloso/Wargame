import { useEffect, useId, useState } from 'react';
import type { Command } from './ui';
export default function PlayerNameForm({ name, command }: { name: string; command: Command }) {
  const id = useId(),
    [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const normalized = draft.trim().replace(/\s+/g, ' ');
  return (
    <form
      className="player-name-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized && normalized !== name)
          command({ type: 'SET_PLAYER_NAME', name: normalized });
      }}
    >
      <label htmlFor={id}>Seu nome</label>
      <div>
        <input
          id={id}
          name="nickname"
          autoComplete="nickname"
          maxLength={30}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!normalized || normalized === name}>
          Salvar nome
        </button>
      </div>
      <small>Até 30 caracteres. Cada jogador edita seu próprio nome.</small>
    </form>
  );
}
