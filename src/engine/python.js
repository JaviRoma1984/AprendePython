'use strict';
/* Busca el Python instalado y ejecuta en él el código de la persona (con las pruebas del ejercicio). */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARCA = '@@AP@@';
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_POR_DEFECTO = 6000;

// Orden en el que se prueban los comandos (en Windows, «py» es el lanzador oficial).
const CANDIDATOS = [
  { cmd: 'py', args: ['-3'] },
  { cmd: 'python', args: [] },
  { cmd: 'python3', args: [] },
];

let cache = null;

function probar(c) {
  return new Promise((resolve) => {
    let out = '';
    let hecho = false;
    const fin = (v) => { if (!hecho) { hecho = true; resolve(v); } };
    let p;
    try {
      p = spawn(c.cmd, c.args.concat(['--version']), { windowsHide: true });
    } catch { fin(null); return; }
    const t = setTimeout(() => { try { p.kill(); } catch { /* ya terminó */ } fin(null); }, 6000);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', () => { clearTimeout(t); fin(null); });
    p.on('close', (code) => {
      clearTimeout(t);
      const m = /Python (\d+)\.(\d+)\.(\d+)/.exec(out);
      if (code === 0 && m && Number(m[1]) === 3 && Number(m[2]) >= 8) {
        fin({ cmd: c.cmd, args: c.args, version: m[1] + '.' + m[2] + '.' + m[3] });
      } else fin(null);
    });
  });
}

/** Devuelve { ok:true, cmd, args, version } o { ok:false }. */
async function detectar(forzar) {
  if (cache && cache.ok && !forzar) return cache;
  for (const c of CANDIDATOS) {
    const r = await probar(c);
    if (r) { cache = Object.assign({ ok: true }, r); return cache; }
  }
  cache = { ok: false };
  return cache;
}

function matarArbol(pid) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).unref();
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch { /* ya no existe */ }
}

/**
 * Ejecuta el código. opciones: { codigo, verificar, pruebas, exige, prohibe, runner, timeoutMs, cwd }
 * Devuelve el JSON del runner, o { fallo: 'sin_python' | 'timeout' | 'sin_resultado', ... }.
 */
async function ejecutar(opciones) {
  const py = await detectar(false);
  if (!py.ok) return { fallo: 'sin_python' };
  const cwd = opciones.cwd || path.join(os.tmpdir(), 'AprendePython-trabajo');
  try { fs.mkdirSync(cwd, { recursive: true }); } catch { /* se usará el cwd actual */ }
  const timeoutMs = opciones.timeoutMs || TIMEOUT_POR_DEFECTO;

  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let bytes = 0;
    let terminado = false;
    let expirado = false;
    const env = Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' });
    let p;
    try {
      p = spawn(py.cmd, py.args.concat(['-I', '-X', 'utf8', opciones.runner]), { cwd, env, windowsHide: true });
    } catch (e) {
      resolve({ fallo: 'sin_resultado', detalle: String(e && e.message || e) });
      return;
    }
    const fin = (v) => { if (!terminado) { terminado = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => { expirado = true; matarArbol(p.pid); }, timeoutMs);
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { bytes += d.length; if (bytes <= MAX_BYTES) out += d; else matarArbol(p.pid); });
    p.stderr.on('data', (d) => { if (err.length < 20000) err += d; });
    p.on('error', (e) => fin({ fallo: 'sin_resultado', detalle: String(e && e.message || e) }));
    p.on('close', () => {
      if (expirado) { fin({ fallo: 'timeout', segundos: Math.round(timeoutMs / 1000) }); return; }
      const i = out.lastIndexOf(MARCA);
      if (i < 0) { fin({ fallo: 'sin_resultado', detalle: err.slice(-1500) }); return; }
      try { fin(JSON.parse(out.slice(i + MARCA.length))); } catch (e) { fin({ fallo: 'sin_resultado', detalle: 'respuesta ilegible' }); }
    });
    const entrada = JSON.stringify({
      codigo: String(opciones.codigo || ''),
      verificar: !!opciones.verificar,
      pruebas: opciones.pruebas || [],
      exige: opciones.exige || [],
      prohibe: opciones.prohibe || [],
    });
    p.stdin.on('error', () => { /* el proceso terminó antes de leer */ });
    p.stdin.end(entrada, 'utf8');
  });
}

module.exports = { detectar, ejecutar, MARCA, CANDIDATOS };
