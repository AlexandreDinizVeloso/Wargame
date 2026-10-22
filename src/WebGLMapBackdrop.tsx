import { useEffect, useMemo, useRef, useState } from 'react';
import type { Province, Season } from '../shared/types';
const vertex = `attribute vec2 a_position; varying vec2 uv; void main(){uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv; uniform vec2 resolution; uniform vec2 camera; uniform float scale; uniform float time; uniform float winter; uniform float summer; uniform sampler2D land; uniform vec4 extent;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float coast(vec2 p){return texture2D(land,clamp((p-extent.xy)/extent.zw,0.,1.)).r;}
void main(){vec2 p=camera+(vec2(uv.x,1.-uv.y)-.5)*resolution/scale;
float nearLand=0.;for(int x=-2;x<=2;x++){for(int y=-2;y<=2;y++){nearLand+=coast(p+vec2(float(x),float(y))*3.5);}}nearLand/=25.;
float depth=1.-nearLand;float wave=sin(p.x*.08+p.y*.035+time*.36)+sin(p.y*.11-time*.24);float swell=noise(p*.025+time*.008);
vec3 color=mix(vec3(.12,.30,.32),vec3(.025,.09,.14),depth*.86);color+=wave*.005+swell*.016;
float foam=nearLand*(1.-coast(p))*smoothstep(-.7,.9,sin(p.x*.13+p.y*.09+time*.7));color+=vec3(.37,.52,.46)*foam*.6;
float sun=pow(max(0.,sin(p.x*.018+p.y*.026+time*.13)),22.)*.035;color+=vec3(1.,.80,.38)*sun;
color+=vec3(.10,.07,.015)*summer*.17;float latitude=1.-smoothstep(extent.y,extent.y+extent.w*.65,p.y);color=mix(color,vec3(.30,.43,.48),winter*latitude*.22);
color+=(hash(gl_FragCoord.xy+floor(time*7.))-.5)*.012;float vignette=1.-.25*pow(length((uv-.5)*1.3),2.);gl_FragColor=vec4(color*vignette,1.);}`;
export default function WebGLMapBackdrop({
  provinces,
  camera,
  width,
  height,
  scale,
  season,
}: {
  provinces: Province[];
  camera: { x: number; y: number };
  width: number;
  height: number;
  scale: number;
  season?: Season;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    values = useRef({ camera, width, height, scale, season });
  values.current = { camera, width, height, scale, season };
  const [fallback, setFallback] = useState(false),
    [backend, setBackend] = useState('initializing');
  const lands = useMemo(() => provinces.filter((p) => p.kind === 'LAND'), [provinces]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let gl: WebGLRenderingContext | null = null;
    let forceWebGL = false;
    try {
      forceWebGL = localStorage.getItem('concordia-renderer') === 'webgl';
    } catch {}
    if (!fallback && !forceWebGL && navigator.webdriver) {
      setFallback(true);
      return;
    }
    try {
      if (!fallback)
        gl = canvas.getContext('webgl', {
          alpha: false,
          antialias: false,
          powerPreference: 'low-power',
          failIfMajorPerformanceCaveat: !forceWebGL,
        });
    } catch {
      gl = null;
    }
    if (gl) {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
      if (!forceWebGL && /swiftshader|llvmpipe|software/i.test(renderer)) {
        setFallback(true);
        return;
      }
    }
    if (!gl && !fallback) {
      setFallback(true);
      return;
    }
    const ctx = !gl ? canvas.getContext('2d') : null;
    if (!gl && !ctx) return;
    let program: WebGLProgram | null = null,
      buffer: WebGLBuffer | null = null,
      texture: WebGLTexture | null = null;
    const shaders: WebGLShader[] = [];
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    if (gl) {
      try {
        const gpu = gl;
        for (const [kind, source] of [
          [gpu.VERTEX_SHADER, vertex],
          [gpu.FRAGMENT_SHADER, fragment],
        ] as const) {
          const shader = gpu.createShader(kind)!;
          shaders.push(shader);
          gpu.shaderSource(shader, source);
          gpu.compileShader(shader);
          if (!gpu.getShaderParameter(shader, gpu.COMPILE_STATUS))
            throw new Error('Shader indisponível');
        }
        program = gpu.createProgram()!;
        shaders.forEach((s) => gpu.attachShader(program!, s));
        gpu.linkProgram(program);
        if (!gpu.getProgramParameter(program, gpu.LINK_STATUS))
          throw new Error('WebGL indisponível');
        gpu.useProgram(program);
        buffer = gpu.createBuffer();
        gpu.bindBuffer(gpu.ARRAY_BUFFER, buffer);
        gpu.bufferData(
          gpu.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gpu.STATIC_DRAW,
        );
        const position = gpu.getAttribLocation(program, 'a_position');
        gpu.enableVertexAttribArray(position);
        gpu.vertexAttribPointer(position, 2, gpu.FLOAT, false, 0, 0);
        for (const name of [
          'resolution',
          'camera',
          'scale',
          'time',
          'winter',
          'summer',
          'extent',
          'land',
        ])
          uniforms.set(name, gpu.getUniformLocation(program, name));
        const points = lands.flatMap((p) => p.rings.flat()),
          xs = points.map((p) => p[0]),
          ys = points.map((p) => p[1]);
        const x = Math.min(...xs) - 30,
          y = Math.min(...ys) - 30,
          w = Math.max(...xs) - x + 30,
          h = Math.max(...ys) - y + 30;
        const mask = document.createElement('canvas');
        mask.width = 1024;
        mask.height = 768;
        const c = mask.getContext('2d')!;
        c.fillStyle = 'black';
        c.fillRect(0, 0, 1024, 768);
        c.setTransform(1024 / w, 0, 0, 768 / h, (-x * 1024) / w, (-y * 768) / h);
        c.fillStyle = 'white';
        for (const p of lands) c.fill(new Path2D(p.path));
        texture = gpu.createTexture();
        gpu.bindTexture(gpu.TEXTURE_2D, texture);
        gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_MIN_FILTER, gpu.LINEAR);
        gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_WRAP_S, gpu.CLAMP_TO_EDGE);
        gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_WRAP_T, gpu.CLAMP_TO_EDGE);
        gpu.texImage2D(gpu.TEXTURE_2D, 0, gpu.RGBA, gpu.RGBA, gpu.UNSIGNED_BYTE, mask);
        gpu.uniform4f(uniforms.get('extent')!, x, y, w, h);
        gpu.uniform1i(uniforms.get('land')!, 0);
        setBackend('webgl');
      } catch {
        if (program) gl.deleteProgram(program);
        if (buffer) gl.deleteBuffer(buffer);
        if (texture) gl.deleteTexture(texture);
        shaders.forEach((s) => gl!.deleteShader(s));
        setFallback(true);
        return;
      }
    } else setBackend('canvas2d');
    let frame = 0,
      last = -1000,
      disposed = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let signature = '';
    const draw = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(draw);
      if (document.hidden || now - last < 50) return;
      last = now;
      const v = values.current,
        dpr = Math.min(devicePixelRatio || 1, 1.5),
        w = Math.max(1, Math.round(v.width * dpr)),
        h = Math.max(1, Math.round(v.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const stateKey = `${v.camera.x}:${v.camera.y}:${v.scale}:${w}:${h}:${v.season}`;
      if (reduced && stateKey === signature) return;
      signature = stateKey;
      const t = reduced ? 0 : now / 1000;
      if (gl) {
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uniforms.get('resolution')!, v.width, v.height);
        gl.uniform2f(uniforms.get('camera')!, v.camera.x, v.camera.y);
        gl.uniform1f(uniforms.get('scale')!, Math.max(0.01, v.scale));
        gl.uniform1f(uniforms.get('time')!, t);
        gl.uniform1f(uniforms.get('winter')!, v.season === 'WINTER' ? 1 : 0);
        gl.uniform1f(uniforms.get('summer')!, v.season === 'SUMMER' ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const gradient = ctx.createRadialGradient(
          v.width * 0.35,
          v.height * 0.25,
          10,
          v.width * 0.5,
          v.height * 0.5,
          v.width * 0.8,
        );
        gradient.addColorStop(
          0,
          v.season === 'WINTER' ? '#21414b' : v.season === 'SUMMER' ? '#244246' : '#1a3c44',
        );
        gradient.addColorStop(1, '#081923');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, v.width, v.height);
        ctx.save();
        ctx.translate(v.width / 2 - v.camera.x * v.scale, v.height / 2 - v.camera.y * v.scale);
        ctx.scale(v.scale, v.scale);
        ctx.strokeStyle = '#8baca117';
        ctx.lineWidth = 0.6 / Math.max(0.1, v.scale);
        const startX = v.camera.x - v.width / v.scale / 2,
          startY = v.camera.y - v.height / v.scale / 2;
        for (let y = Math.floor(startY / 24) * 24; y < startY + v.height / v.scale; y += 24) {
          ctx.beginPath();
          for (let x = startX; x < startX + v.width / v.scale + 8; x += 8) {
            const sy = y + Math.sin(x * 0.025 + t * 0.3) * 2.5;
            if (x === startX) ctx.moveTo(x, sy);
            else ctx.lineTo(x, sy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    };
    const lost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    canvas.addEventListener('webglcontextlost', lost);
    frame = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', lost);
      if (gl) {
        if (program) gl.deleteProgram(program);
        if (buffer) gl.deleteBuffer(buffer);
        if (texture) gl.deleteTexture(texture);
        shaders.forEach((s) => gl!.deleteShader(s));
      }
    };
  }, [lands, fallback]);
  return (
    <canvas
      key={String(fallback)}
      ref={ref}
      className="webgl-map-backdrop"
      data-renderer={backend}
      aria-hidden="true"
    />
  );
}
