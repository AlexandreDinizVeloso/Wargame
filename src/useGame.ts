import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  GameCommand,
  GameView,
  ServerMessage,
  MapPing,
  SeatInvite,
} from '../shared/types';

interface Session {
  code: string;
  playerId: string;
  token: string;
}
function readSession(): Session | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem('concordia-session') ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      ['code', 'playerId', 'token'].every(
        (key) => typeof (value as Record<string, unknown>)[key] === 'string',
      )
    )
      return value as Session;
  } catch {
    return null;
  }
  return null;
}
export function useGame() {
  const [seatInvites, setSeatInvites] = useState<SeatInvite[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('concordia-seat-invites') ?? '[]');
    } catch {
      return [];
    }
  });
  const [snapshotEpoch, setSnapshotEpoch] = useState(0);
  const awaitingJoinedSnapshot = useRef(false);
  const [pings, setPings] = useState<MapPing[]>([]);
  const [game, setGame] = useState<GameView | null>(null),
    [playerId, setPlayerId] = useState(''),
    [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting'),
    [error, setError] = useState('');
  const socket = useRef<WebSocket | null>(null),
    session = useRef<Session | null>(null);
  const saveSession = (value: Session | null) => {
    try {
      if (value) {
        sessionStorage.setItem('concordia-session', JSON.stringify(value));
        sessionStorage.setItem('concordia-recovery-session', JSON.stringify(value));
      } else sessionStorage.removeItem('concordia-session');
    } catch {
      setError('O navegador não permitiu guardar a sessão. Mantenha esta aba aberta.');
    }
  };
  const applyHttpSession = useCallback(
    (payload: {
      code: string;
      playerId: string;
      token: string;
      state: GameView;
      invites?: SeatInvite[];
    }) => {
      if (new URLSearchParams(location.search).has('claim')) {
        const url = new URL(location.href);
        url.searchParams.delete('claim');
        url.searchParams.delete('seat');
        history.replaceState(null, '', url);
      }
      setPings([]);
      session.current = {
        code: payload.code,
        playerId: payload.playerId,
        token: payload.token,
      };
      saveSession(session.current);
      setPlayerId(payload.playerId);
      if (payload.invites) {
        setSeatInvites(payload.invites);
        try {
          sessionStorage.setItem('concordia-seat-invites', JSON.stringify(payload.invites));
        } catch {}
      }
      setGame(payload.state);
      setSnapshotEpoch((epoch) => epoch + 1);
      setStatus('online');
    },
    [],
  );

  const sendHttp = useCallback(
    async (message: ClientMessage) => {
      try {
        if (message.type === 'create') {
          const res = await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Não foi possível criar a sala.');
          applyHttpSession(data);
          return;
        }
        if (message.type === 'join') {
          const code = message.code.trim().toUpperCase();
          const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Não foi possível entrar na sala.');
          applyHttpSession(data);
          return;
        }
        if (message.type === 'resume') {
          const code = message.code.trim().toUpperCase();
          const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/resume`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${message.token}`,
              'X-Concordia-Player': message.playerId,
            },
            body: JSON.stringify({ playerId: message.playerId, token: message.token }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Não foi possível recuperar a sessão.');
          applyHttpSession(data);
          return;
        }
        if (message.type === 'import_campaign') {
          const res = await fetch('/api/rooms/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ save: message.save }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Não foi possível importar o save.');
          applyHttpSession(data);
          return;
        }
        const current = session.current;
        if (!current) {
          setError('Entre em uma sala primeiro.');
          return;
        }
        const authHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${current.token}`,
          'X-Concordia-Player': current.playerId,
        };
        if (message.type === 'export_campaign') {
          const res = await fetch(`/api/rooms/${encodeURIComponent(current.code)}/DownloadSave`, {
            headers: {
              Authorization: `Bearer ${current.token}`,
              'X-Concordia-Player': current.playerId,
            },
            cache: 'no-store',
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? 'Não foi possível exportar o save.');
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `concordia-save-${current.code}.json`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          return;
        }
        if (message.type === 'map_ping') {
          const res = await fetch(`/api/rooms/${encodeURIComponent(current.code)}/ping`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ provinceId: message.provinceId, note: message.note }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Não foi possível sinalizar no mapa.');
          if (data.ping) {
            setPings((p) => [...p.filter((x) => x.expiresAt > Date.now()), data.ping].slice(-12));
          }
          return;
        }
        if (message.type === 'leave') {
          await fetch(`/api/rooms/${encodeURIComponent(current.code)}/leave`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({}),
          }).catch(() => {});
          return;
        }
        if (message.type === 'command') {
          const res = await fetch(`/api/rooms/${encodeURIComponent(current.code)}/commands`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ command: message.command }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Não foi possível executar o comando.');
          if (data.state) setGame(data.state);
          setStatus('online');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sem conexão com o servidor.';
        setError(msg);
        if (msg.startsWith('Não foi possível recuperar') || msg.startsWith('Sala indisponível')) {
          session.current = null;
          saveSession(null);
          setGame(null);
          setPlayerId('');
          setStatus('online');
        }
      }
    },
    [applyHttpSession],
  );

  const send = useCallback(
    (message: ClientMessage) => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify(message));
        return;
      }
      void sendHttp(message);
    },
    [sendHttp],
  );
  const command = useCallback(
    (value: GameCommand) => send({ type: 'command', command: value }),
    [send],
  );
  useEffect(() => {
    const url = new URLSearchParams(location.search),
      saved = readSession();
    session.current =
      url.has('claim') || (url.has('room') && saved?.code !== url.get('room')?.toUpperCase())
        ? null
        : saved;
    let stopped = false,
      retry: ReturnType<typeof setTimeout>;

    async function checkHttpHealthAndPoll() {
      if (stopped) return;
      if (socket.current?.readyState === WebSocket.OPEN) return;
      try {
        if (session.current) {
          const current = session.current;
          const res = await fetch(`/api/rooms/${encodeURIComponent(current.code)}/state`, {
            headers: {
              Authorization: `Bearer ${current.token}`,
              'X-Concordia-Player': current.playerId,
            },
            cache: 'no-store',
          });
          if (res.ok) {
            const data = await res.json();
            if (data.state && !stopped) {
              setPlayerId(current.playerId);
              setGame(data.state);
              setStatus('online');
            }
            return;
          }
          if (res.status === 410 || res.status === 401 || res.status === 404) {
            const resumeRes = await fetch(
              `/api/rooms/${encodeURIComponent(current.code)}/resume`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${current.token}`,
                  'X-Concordia-Player': current.playerId,
                },
                body: JSON.stringify({ playerId: current.playerId, token: current.token }),
              },
            );
            if (resumeRes.ok) {
              const resumed = await resumeRes.json();
              if (!stopped) applyHttpSession(resumed);
              return;
            }
            session.current = null;
            saveSession(null);
            setGame(null);
            setPlayerId('');
          }
        }
        const health = await fetch('/api/health', { cache: 'no-store' });
        if (health.ok && !stopped) setStatus('online');
      } catch {
        if (!stopped && socket.current?.readyState !== WebSocket.OPEN) setStatus('offline');
      }
    }

    function connect() {
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
      );
      socket.current = ws;
      ws.onopen = () => {
        if (session.current) ws.send(JSON.stringify({ type: 'resume', ...session.current }));
        else setStatus('online');
      };
      ws.onmessage = (event) => {
        let data: ServerMessage;
        try {
          data = JSON.parse(event.data) as ServerMessage;
        } catch {
          setError('O servidor enviou uma mensagem inválida.');
          return;
        }
        switch (data.type) {
          case 'campaign_export': {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data.save, null, 2)], { type: 'application/json' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = `concordia-save-${data.save.game.code}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            break;
          }
          case 'seat_invites':
            setSeatInvites(data.invites);
            try {
              sessionStorage.setItem('concordia-seat-invites', JSON.stringify(data.invites));
            } catch {}
            break;
          case 'map_ping':
            if (data.ping.code === session.current?.code)
              setPings((p) => [...p.filter((x) => x.expiresAt > Date.now()), data.ping].slice(-12));
            break;
          case 'joined':
            awaitingJoinedSnapshot.current = true;
            if (new URLSearchParams(location.search).has('claim')) {
              const url = new URL(location.href);
              url.searchParams.delete('claim');
              url.searchParams.delete('seat');
              history.replaceState(null, '', url);
            }
            setPings([]);
            session.current = { code: data.code, playerId: data.playerId, token: data.token };
            saveSession(session.current);
            setPlayerId(data.playerId);
            setStatus('online');
            break;
          case 'state':
            if (data.state.version !== 7) {
              setError('Versão de protocolo incompatível. Atualize a página.');
              return;
            }
            setGame(data.state);
            if (awaitingJoinedSnapshot.current) {
              awaitingJoinedSnapshot.current = false;
              setSnapshotEpoch((epoch) => epoch + 1);
            }
            break;
          case 'error':
            setError(data.message);
            if (
              data.message.startsWith('Não foi possível recuperar') ||
              data.message.startsWith('Sala arquivada')
            ) {
              session.current = null;
              saveSession(null);
              setGame(null);
              setPlayerId('');
              setStatus('online');
            }
            break;
          case 'left':
            setPings([]);
            setGame(null);
            setPlayerId('');
            break;
        }
      };
      ws.onclose = (event) => {
        if (stopped) return;
        if (event.code === 4004) {
          session.current = null;
          saveSession(null);
          setGame(null);
          setPlayerId('');
          setError(
            'Sala arquivada com progresso salvo. Use Recuperar sala pelo código para retomar.',
          );
        }
        if (event.code === 4001) {
          setError('Esta sessão está ativa em outra conexão. Recarregue para recuperá-la.');
          return;
        }
        void checkHttpHealthAndPoll();
        retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => {};
    }

    void checkHttpHealthAndPoll();
    connect();
    const pollTimer = setInterval(() => {
      void checkHttpHealthAndPoll();
    }, 1000);

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(pollTimer);
      socket.current?.close();
    };
  }, [applyHttpSession]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 8000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    if (!pings.length) return;
    const timer = setTimeout(
      () => setPings((p) => p.filter((x) => x.expiresAt > Date.now())),
      Math.max(0, Math.min(...pings.map((p) => p.expiresAt)) - Date.now()) + 20,
    );
    return () => clearTimeout(timer);
  }, [pings]);
  const leave = () => {
    setPings([]);
    setSeatInvites([]);
    try {
      sessionStorage.removeItem('concordia-seat-invites');
    } catch {}
    const previous = session.current;
    session.current = null;
    saveSession(null);
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: 'leave' }));
    } else if (previous) {
      void fetch(`/api/rooms/${encodeURIComponent(previous.code)}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${previous.token}`,
          'X-Concordia-Player': previous.playerId,
        },
        body: JSON.stringify({}),
      }).catch(() => {});
    }
    setGame(null);
    setPlayerId('');
  };
  return {
    game,
    playerId,
    status,
    error,
    setError,
    send,
    command,
    leave,
    pings,
    seatInvites,
    snapshotEpoch,
  };
}
