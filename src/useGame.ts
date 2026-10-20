import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameView } from '../shared/types';

interface Session {
  code: string;
  playerId: string;
  token: string;
}
export function useGame() {
  const [game, setGame] = useState<GameView | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [error, setError] = useState('');
  const socket = useRef<WebSocket | null>(null),
    session = useRef<Session | null>(null);
  const send = useCallback((message: Record<string, unknown>) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError('Sem conexão com o servidor. Aguarde a reconexão.');
      return;
    }
    socket.current.send(JSON.stringify(message));
  }, []);
  useEffect(() => {
    try {
      session.current = JSON.parse(sessionStorage.getItem('concordia-session') ?? 'null');
    } catch {
      sessionStorage.removeItem('concordia-session');
    }
    let stopped = false,
      retry: ReturnType<typeof setTimeout>;
    function connect() {
      setStatus('connecting');
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
      );
      socket.current = ws;
      ws.onopen = () => {
        setStatus('online');
        if (session.current) ws.send(JSON.stringify({ type: 'resume', ...session.current }));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'joined') {
          session.current = { code: data.code, playerId: data.playerId, token: data.token };
          sessionStorage.setItem('concordia-session', JSON.stringify(session.current));
          setPlayerId(data.playerId);
        }
        if (data.type === 'state') setGame(data.state);
        if (data.type === 'error') {
          setError(data.message);
          if (data.message.startsWith('Não foi possível recuperar')) {
            session.current = null;
            sessionStorage.removeItem('concordia-session');
            setGame(null);
          }
        }
        if (data.type === 'left') {
          setGame(null);
          setPlayerId('');
        }
      };
      ws.onclose = (event) => {
        if (stopped) return;
        setStatus('offline');
        if (event.code === 4001) {
          setError('Esta sessão foi aberta em outra conexão. Recarregue para recuperá-la.');
          return;
        }
        retry = setTimeout(connect, 2000);
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
    const timer = setTimeout(() => setError(''), 7000);
    return () => clearTimeout(timer);
  }, [error]);
  const leave = () => {
    session.current = null;
    sessionStorage.removeItem('concordia-session');
    send({ type: 'leave' });
    setGame(null);
    setPlayerId('');
  };
  return { game, playerId, status, error, setError, send, leave };
}
