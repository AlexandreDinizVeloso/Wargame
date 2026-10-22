import { useState } from 'react';
import type { ClientMessage, SeatInvite } from '../shared/types';
export function inviteUrl(code: string, seat?: SeatInvite) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  if (seat) {
    url.searchParams.set('seat', seat.playerId);
    url.searchParams.set('claim', seat.token);
  }
  return url.href;
}
export default function CampaignSaveControls({
  send,
  canExport = false,
  invites = [],
}: {
  send: (m: ClientMessage) => void;
  canExport?: boolean;
  invites?: SeatInvite[];
}) {
  const [error, setError] = useState(''),
    [copied, setCopied] = useState('');
  return (
    <section className="campaign-save-controls" aria-label="Saves de campanha">
      <label className="file-button">
        📂 Importar Cenário / Save JSON
        <input
          aria-label="Importar Cenário / Save JSON"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              if (file.size > 8 * 1024 * 1024) throw new Error('O arquivo deve ter até 8 MiB.');
              const save: unknown = JSON.parse(await file.text());
              send({ type: 'import_campaign', save });
              setError('');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Save inválido.');
            }
          }}
        />
      </label>
      {canExport && (
        <button onClick={() => send({ type: 'export_campaign' })}>💾 Exportar Save JSON</button>
      )}
      <small>
        Importar cria uma nova sala privada. Relatórios antigos geram um cenário visível com ordens
        e objetivos reiniciados. Saves completos incluem objetivos e ordens: guarde o arquivo de
        forma privada.
      </small>
      {error && <p role="alert">{error}</p>}
      {!!invites.length && (
        <div>
          <h4>Retomar lugares dos amigos</h4>
          {invites.map((seat) => (
            <button
              key={seat.playerId}
              onClick={() =>
                void navigator.clipboard
                  .writeText(inviteUrl(seat.code, seat))
                  .then(() => setCopied(seat.playerId))
                  .catch(() =>
                    setError(
                      'Não foi possível copiar; confira a permissão da área de transferência.',
                    ),
                  )
              }
            >
              {copied === seat.playerId ? '✓ Link copiado' : `🔗 Convite privado de ${seat.name}`}
            </button>
          ))}
          <small>Envie cada convite somente ao dono daquele lugar.</small>
        </div>
      )}
    </section>
  );
}
