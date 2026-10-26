import type { IncomingMessage, ServerResponse } from 'node:http';
import { RoomSaveDownloadError, type attachRooms } from './rooms';

type Rooms = ReturnType<typeof attachRooms>;
const BODY_LIMIT = 128 * 1024;
const IMPORT_BODY_LIMIT = 9 * 1024 * 1024;
class ApiInputError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function readBody(
  request: IncomingMessage,
  limit = BODY_LIMIT,
): Promise<Record<string, unknown>> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new ApiInputError(413, 'Comando excede o limite permitido.');
    chunks.push(Buffer.from(chunk));
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new ApiInputError(400, 'JSON inválido.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiInputError(400, 'Envie um objeto JSON.');
  return body as Record<string, unknown>;
}
/** HTTP is a transport adapter for the same authenticated rooms and commands as /ws. */
export async function handleHttpGameApi(
  request: IncomingMessage,
  response: ServerResponse,
  rooms: Rooms,
): Promise<boolean> {
  const pathname = request.url?.split('?')[0] ?? '';
  const create = pathname === '/api/rooms' && request.method === 'POST';
  const importRoom = pathname === '/api/rooms/import' && request.method === 'POST';
  const route = pathname.match(
    /^\/api\/rooms\/([A-Za-z0-9]{6})\/(join|resume|state|commands|ready|declare-war|leave|ping)$/,
  );
  if (!create && !importRoom && !route) return false;
  const reply = (status: number, value: unknown) => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(value));
  };
  try {
    if (create) {
      reply(201, rooms.http.create(await readBody(request)));
      return true;
    }
    if (importRoom) {
      const body = await readBody(request, IMPORT_BODY_LIMIT);
      reply(201, rooms.http.importCampaign(body.save));
      return true;
    }
    const [, code, action] = route!;
    const method = action === 'state' ? 'GET' : 'POST';
    if (request.method !== method) {
      response.setHeader('Allow', method);
      throw new ApiInputError(405, `Este endpoint exige ${method}.`);
    }
    const playerId =
      typeof request.headers['x-concordia-player'] === 'string'
        ? request.headers['x-concordia-player']
        : '';
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? '';
    if (action === 'state') {
      reply(200, rooms.http.state(code, playerId, token));
      return true;
    }
    const body = await readBody(request);
    if (action === 'join') reply(201, rooms.http.join(code, body));
    else if (action === 'resume') {
      const id = typeof body.playerId === 'string' ? body.playerId : playerId;
      const credential = typeof body.token === 'string' ? body.token : token;
      if (!id || !credential)
        throw new ApiInputError(401, 'Informe sua credencial privada para retomar.');
      reply(200, rooms.http.resume(code, id, credential));
    } else if (action === 'leave') reply(200, rooms.http.leave(code, playerId, token));
    else if (action === 'ping') {
      if (!playerId || !token)
        throw new ApiInputError(401, 'Envie Authorization Bearer e X-Concordia-Player.');
      reply(200, rooms.http.ping(code, playerId, token, body.provinceId, body.note));
    } else {
      if (!playerId || !token)
        throw new ApiInputError(401, 'Envie Authorization Bearer e X-Concordia-Player.');
      const command =
        action === 'ready'
          ? { type: 'READY', ready: body.ready }
          : action === 'declare-war'
            ? { ...body, type: 'DECLARE_WAR' }
            : body.command;
      reply(200, rooms.http.command(code, playerId, token, command));
    }
  } catch (error) {
    reply(
      error instanceof ApiInputError || error instanceof RoomSaveDownloadError ? error.status : 400,
      { error: error instanceof Error ? error.message : 'Não foi possível executar a ação.' },
    );
  }
  return true;
}
