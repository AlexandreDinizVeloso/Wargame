import { useState } from 'react';
import type { ClientMessage } from '../shared/types';
interface RecoverySession {
  code: string;
  playerId: string;
  token: string;
}
function savedCredential(): RecoverySession | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem('concordia-session') ??
        sessionStorage.getItem('concordia-recovery-session') ??
        'null',
    );
    if (
      value &&
      typeof value === 'object' &&
      ['code', 'playerId', 'token'].every(
        (key) => typeof (value as Record<string, unknown>)[key] === 'string',
      )
    )
      return value as RecoverySession;
  } catch {}
  return null;
}
export default function ArchivedRoomControls({ send }: { send: (message: ClientMessage) => void }) {
  const [code, setCode] = useState(() => savedCredential()?.code ?? ''),
    [invite, setInvite] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const credential = (): RecoverySession => {
    const normalized = code.trim().toUpperCase();
    if (invite.trim()) {
      const url = new URL(invite, location.href);
      const room = url.searchParams.get('room')?.toUpperCase() ?? normalized;
      const playerId = url.searchParams.get('seat'),
        token = url.searchParams.get('claim');
      if (room && playerId && token && (!normalized || normalized === room))
        return { code: room, playerId, token };
      throw new Error('Confira o código e o convite privado de recuperação.');
    }
    const saved = savedCredential();
    if (saved && saved.code.toUpperCase() === normalized) return { ...saved, code: normalized };
    throw new Error(
      'Use a mesma aba da campanha ou informe seu convite privado para recuperar o lugar.',
    );
  };
  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const seat = credential();
      const response = await fetch(`/api/rooms/${encodeURIComponent(seat.code)}/DownloadSave`, {
        headers: { Authorization: `Bearer ${seat.token}`, 'X-Concordia-Player': seat.playerId },
        cache: 'no-store',
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? 'Não foi possível recuperar o save.');
      }
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement('a');
      link.href = url;
      link.download = `concordia-save-${seat.code}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível recuperar a sala.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="archived-room-controls">
      <summary>🗃️ Recuperar sala pelo código</summary>
      <div style={{ display: 'grid', gap: 6, maxWidth: 380, padding: 8 }}>
        <p>
          Salas sem atividade por 15 minutos ficam salvas e saem do lobby. Você pode reabrir seu
          lugar; o anfitrião também pode baixar o save completo.
        </p>
        <label>
          Código da sala arquivada
          <input
            aria-label="Código da sala arquivada"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Convite privado de recuperação (opcional)
          <input
            aria-label="Convite privado de recuperação"
            type="password"
            autoComplete="off"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
          />
        </label>
        <button disabled={busy} onClick={() => void download()}>
          💾 Baixar Save da Sala
        </button>
        <button
          disabled={busy}
          onClick={() => {
            try {
              const seat = credential();
              setError('');
              send({ type: 'resume', ...seat });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Confira sua credencial.');
            }
          }}
        >
          ▶ Reabrir Sala Arquivada
        </button>
        <small>
          Para criar uma nova mesa a partir do arquivo baixado, use Importar Cenário / Save JSON.
        </small>
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
