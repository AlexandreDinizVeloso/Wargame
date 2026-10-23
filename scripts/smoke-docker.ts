import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const image = process.env.CONCORDIA_IMAGE ?? 'concordia:1.2.0';
const suffix = `${Date.now()}-${process.pid}`,
  name = `concordia-rc-check-${suffix}`,
  volume = `concordia-rc-data-${suffix}`;
const docker = (...args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let created = false,
  started = false;
const client = String.raw`
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const phase=process.argv[1],filename='/app/.local/rc-test-session.json';
const health=await fetch('http://127.0.0.1:3000/api/health').then(r=>r.json());
assert.equal(health.version,'1.2.0');assert.equal(health.protocolVersion,7);
assert.match(await fetch('http://127.0.0.1:3000').then(r=>r.text()),/Concórdia|Concordia|concordia/);
const socket=new WebSocket('ws://127.0.0.1:3000/ws');await once(socket,'open');
function wait(type,predicate=()=>true){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off('message',listen);reject(new Error('Mensagem ausente: '+type));},10000);const listen=raw=>{const m=JSON.parse(raw.toString());if(m.type==='error'){clearTimeout(timer);socket.off('message',listen);reject(new Error(m.message));}else if(m.type===type&&predicate(m)){clearTimeout(timer);socket.off('message',listen);resolve(m);}};socket.on('message',listen);});}
if(phase==='create'){
 const joined=wait('joined'),state=wait('state',m=>m.state.phase==='planning');socket.send(JSON.stringify({type:'create',name:'Mesa Docker',demo:true,isPublic:false,enableSecretObjectives:false}));
 const auth=await joined,game=(await state).state,actor=game.players.find(p=>p.id===auth.playerId),army=game.battalions.find(a=>a.ownerId===actor.id&&!a.isFleet);
 const planned=wait('state',m=>m.state.plannedOrders.some(o=>o.type==='TRAIN_BATTALION'));socket.send(JSON.stringify({type:'command',command:{type:'SUBMIT_ORDER',order:{type:'TRAIN_BATTALION',battalionId:army.id}}}));
 const before=(await planned).state;writeFileSync(filename,JSON.stringify({auth,turn:before.turn,gold:actor.gold,orders:before.plannedOrders,armyId:army.id,provinceId:army.provinceId}),{mode:0o600});
}else{
 const before=JSON.parse(readFileSync(filename,'utf8')),restored=wait('state',m=>m.state.code===before.auth.code);socket.send(JSON.stringify({type:'resume',code:before.auth.code,playerId:before.auth.playerId,token:before.auth.token}));
 const game=(await restored).state;assert.equal(game.turn,before.turn);assert.equal(game.players.find(p=>p.id===before.auth.playerId).gold,before.gold);assert.deepEqual(game.plannedOrders,before.orders);assert.equal(game.battalions.find(a=>a.id===before.armyId).provinceId,before.provinceId);unlinkSync(filename);
}
socket.close();await once(socket,'close');console.log('ok');
`;
async function health() {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try {
      assert.equal(
        docker(
          'exec',
          name,
          'node',
          '-e',
          "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
        ),
        '',
      );
      return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Health do contêiner não respondeu.');
}
try {
  docker('volume', 'create', volume);
  created = true;
  docker('run', '--detach', '--name', name, '--volume', `${volume}:/app/.local`, image);
  started = true;
  assert.equal(docker('inspect', '--format', '{{.Config.User}}', name), 'node');
  assert.match(docker('exec', name, 'node', '-p', 'process.versions.node'), /^20\./);
  await health();
  assert.equal(docker('exec', name, 'node', '--input-type=module', '-e', client, 'create'), 'ok');
  docker('stop', '--time', '10', name);
  docker('start', name);
  await health();
  assert.equal(docker('exec', name, 'node', '--input-type=module', '-e', client, 'resume'), 'ok');
  console.log(
    'Docker RC passou: Node 20 Alpine, usuário node, frontend, health, WebSocket, volume persistente e recuperação autenticada de sala/ordens após reinício.',
  );
} finally {
  if (started) docker('rm', '--force', name);
  if (created) docker('volume', 'rm', volume);
}
