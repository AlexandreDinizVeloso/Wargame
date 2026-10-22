import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, GameCommand, GameView, ServerMessage } from '../shared/types';

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
  const [game, setGame] = useState<GameView | null>(null),
    [playerId, setPlayerId] = useState(''),
    [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting'),
    [error, setError] = useState('');
  const socket = useRef<WebSocket | null>(null),
    session = useRef<Session | null>(null);
  const saveSession = (value: Session | null) => {
    try {
      if (value) sessionStorage.setItem('concordia-session', JSON.stringify(value));
      else sessionStorage.removeItem('concordia-session');
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
    session.current = readSession();
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
          case 'joined':
            session.current = { code: data.code, playerId: data.playerId, token: data.token };
            saveSession(session.current);
            setPlayerId(data.playerId);
            setStatus('online');
            break;
          case 'state':
            if (data.state.version !== 6) {
              setError('Versão de protocolo incompatível. Atualize a página.');
              return;
            }
            setGame(data.state);
            break;
          case 'error':
            setError(data.message);
            if (data.message.startsWith('Não foi possível recuperar')) {
              session.current = null;
              saveSession(null);
              setGame(null);
              setPlayerId('');
              setStatus('online');
            }
            break;
          case 'left':
            setGame(null);
            setPlayerId('');
            break;
        }
      };
      ws.onclose = (event) => {
        if (stopped) return;
        setStatus('offline');
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
  const leave = () => {
    session.current = null;
    saveSession(null);
    if (socket.current?.readyState === WebSocket.OPEN) send({ type: 'leave' });
    setGame(null);
    setPlayerId('');
  };
  return { game, playerId, status, error, setError, send, command, leave };
}
