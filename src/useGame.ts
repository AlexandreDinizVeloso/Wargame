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
  const send = useCallback((message: ClientMessage) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError('Sem conexão com o servidor. Aguarde a reconexão.');
      return;
    }
    socket.current.send(JSON.stringify(message));
  }, []);
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
    function connect() {
      setStatus('connecting');
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
        setStatus('offline');
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
        retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => {};
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket.current?.close();
    };
  }, []);
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
    session.current = null;
    saveSession(null);
    if (socket.current?.readyState === WebSocket.OPEN) send({ type: 'leave' });
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
