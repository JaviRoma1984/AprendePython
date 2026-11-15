'use strict';
/* Lanza TODAS las pruebas de extremo a extremo, una tras otra, con ajustes en carpetas temporales (no toca tus ajustes reales).
 *   node scripts/e2e-todo.js                                   prueba el código fuente (electron .)
 *   node scripts/e2e-todo.js --exe "C:\ruta\AprendePython.exe"  prueba el programa instalado
 *   node scripts/e2e-todo.js --out carpeta                     dónde dejar las capturas (por defecto, una carpeta temporal)
 * Los escenarios comparten ajustes y se lanzan en cadena: equivale a cerrar y volver a abrir el programa
 * (completo → reapertura → singuardar → reapertura2 → reapertura3).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const exe = opt('--exe') || require('electron');
const appArgs = opt('--exe') ? ['--e2e'] : ['.', '--e2e'];
const base = opt('--out') ? path.resolve(opt('--out')) : fs.mkdtempSync(path.join(os.tmpdir(), 'aprendepython-e2e-'));
fs.rmSync(base, { recursive: true, force: true });
fs.mkdirSync(base, { recursive: true });
const userdata = path.join(base, 'ajustes');
fs.mkdirSync(userdata, { recursive: true });

let totalChecks = 0;
let totalFails = 0;
let crashed = 0;

function launch(scenario) {
  const out = path.join(base, 'capturas', scenario);
  const env = Object.assign({}, process.env, {
    APRENDEPYTHON_E2E_SCENARIO: scenario,
    APRENDEPYTHON_USERDATA: userdata,
    APRENDEPYTHON_E2E_OUT: out,
  });
  delete env.ELECTRON_RUN_AS_NODE;
  process.stdout.write('\n=== Escenario: ' + scenario + ' ===\n');
  const r = spawnSync(exe, appArgs, { cwd: root, env, encoding: 'utf8', timeout: 480000, windowsHide: false });
  String(r.stdout || '').split('\n').filter((l) => /^FALLA/.test(l)).forEach((l) => process.stdout.write(l + '\n'));
  if (r.status === 3) { totalFails++; process.stdout.write('FALLA  el escenario ' + scenario + ': la ventana no se cerró al pedirlo\n'); }
  let res = null;
  try { res = JSON.parse(fs.readFileSync(path.join(out, 'resultado.json'), 'utf8')); } catch { res = null; }
  if (!res) {
    crashed++;
    process.stdout.write('FALLA  el escenario no terminó (sin informe). Salida:\n' + String(r.stdout || '').slice(-800) + String(r.stderr || '').slice(-800) + '\n');
    return;
  }
  totalChecks += res.total;
  totalFails += res.fallos;
  process.stdout.write(scenario + ': ' + (res.total - res.fallos) + '/' + res.total + ' correctas\n');
}

launch('completo');
launch('reapertura');
launch('singuardar');
launch('reapertura2');
launch('reapertura3');

process.stdout.write('\n==== TOTAL: ' + (totalChecks - totalFails) + '/' + totalChecks + ' comprobaciones correctas' + (crashed ? ', ' + crashed + ' escenario(s) sin terminar' : '') + ' ====\n');
process.stdout.write('Capturas: ' + path.join(base, 'capturas') + '\n');
process.exit(totalFails || crashed ? 1 : 0);
