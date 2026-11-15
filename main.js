'use strict';
/* AprendePython · proceso principal de Electron. */
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Catalogo = require('./src/shared/catalogo');
const Python = require('./src/engine/python');

const E2E = process.argv.includes('--e2e');
if (process.env.APRENDEPYTHON_USERDATA) app.setPath('userData', process.env.APRENDEPYTHON_USERDATA);

const MAX_CODIGO = 100000;
const AJUSTES_POR_DEFECTO = { fuente: 15, solucionFrac: 0.42, resultadoAlto: 200, enunciadoAlto: 0, ventana: { width: 1360, height: 860, maximizada: false } };

let win = null;
let ajustes = JSON.parse(JSON.stringify(AJUSTES_POR_DEFECTO));
let progreso = { version: 1, completados: {}, borradores: {}, ultimo: null };
let instantanea = ''; // lo que hay guardado en disco, en forma comparable (para saber si hay cambios sin guardar)
let cierreForzado = false;

// ---------- archivos de la persona (solo su progreso y sus ajustes; nada más) ----------
const archivoAjustes = () => path.join(app.getPath('userData'), 'ajustes.json');
const archivoProgreso = () => path.join(app.getPath('userData'), 'progreso.json');

function leerJson(archivo) {
  try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return null; }
}

function escribirJson(archivo, datos) {
  try {
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(datos, null, 2));
    return true;
  } catch { return false; }
}

const entre = (n, a, b, def) => (typeof n === 'number' && isFinite(n) ? Math.min(b, Math.max(a, n)) : def);

function cargarAjustes() {
  const g = leerJson(archivoAjustes()) || {};
  const v = g.ventana || {};
  ajustes = {
    fuente: Math.round(entre(g.fuente, 11, 28, AJUSTES_POR_DEFECTO.fuente)),
    solucionFrac: entre(g.solucionFrac, 0.2, 0.8, AJUSTES_POR_DEFECTO.solucionFrac),
    resultadoAlto: Math.round(entre(g.resultadoAlto, 80, 900, AJUSTES_POR_DEFECTO.resultadoAlto)),
    enunciadoAlto: Math.round(entre(g.enunciadoAlto, 0, 900, 0)),
    ventana: {
      width: Math.round(entre(v.width, 1000, 4000, AJUSTES_POR_DEFECTO.ventana.width)),
      height: Math.round(entre(v.height, 700, 3000, AJUSTES_POR_DEFECTO.ventana.height)),
      maximizada: v.maximizada === true,
    },
  };
}

function guardarAjustes() { escribirJson(archivoAjustes(), ajustes); }

function cargarProgreso() {
  const g = leerJson(archivoProgreso()) || {};
  const vacio = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  progreso = {
    version: 1,
    completados: vacio(g.completados),
    borradores: vacio(g.borradores),
    ultimo: typeof g.ultimo === 'string' ? g.ultimo : null,
  };
  Object.keys(progreso.borradores).forEach((k) => { if (typeof progreso.borradores[k] !== 'string') delete progreso.borradores[k]; });
  instantanea = comparable(progreso);
}

// El avance (ejercicios resueltos y borradores) solo se escribe en disco cuando la persona pulsa «Guardar cambios»
// (o elige guardar al cerrar). «ultimo» (el ejercicio en el que estás) no cuenta como cambio pendiente.
const ordenado = (o) => Object.keys(o).sort().map((k) => [k, o[k]]);
function comparable(p) { return JSON.stringify({ c: ordenado(p.completados), b: ordenado(p.borradores) }); }
const hayCambiosSinGuardar = () => comparable(progreso) !== instantanea;

function guardarProgreso() {
  if (!escribirJson(archivoProgreso(), progreso)) throw new Error('No se pudo guardar el avance en el disco.');
  instantanea = comparable(progreso);
}

// ---------- el ejecutor de Python ----------
// Python no puede leer dentro del paquete (asar): se copia el ejecutor a la carpeta de datos de la aplicación.
function rutaRunner() {
  const origen = path.join(__dirname, 'src', 'engine', 'runner.py');
  if (!app.isPackaged) return origen;
  const destino = path.join(app.getPath('userData'), 'runtime', 'runner.py');
  try {
    const nuevo = fs.readFileSync(origen);
    let viejo = null;
    try { viejo = fs.readFileSync(destino); } catch { viejo = null; }
    if (!viejo || !viejo.equals(nuevo)) {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, nuevo);
    }
    return destino;
  } catch { return origen; }
}

function carpetaTrabajo() { return path.join(app.getPath('temp'), 'AprendePython-trabajo'); }

// ---------- ventana ----------
function createWindow() {
  win = new BrowserWindow({
    width: ajustes.ventana.width,
    height: ajustes.ventana.height,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0d1117',
    title: 'AprendePython',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: !E2E,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: !E2E, // en las pruebas la ventana no se muestra: que siga pintando para poder sacar capturas
    },
  });
  Menu.setApplicationMenu(null);
  if (ajustes.ventana.maximizada && !E2E) win.maximize();
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!E2E) win.show(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'))) {
      win.webContents.toggleDevTools();
    }
  });
  const guardarVentana = () => {
    if (!win || E2E) return;
    ajustes.ventana.maximizada = win.isMaximized();
    if (!win.isMaximized() && !win.isMinimized()) {
      const [w, h] = win.getSize();
      ajustes.ventana.width = w;
      ajustes.ventana.height = h;
    }
    guardarAjustes();
  };
  win.on('close', (e) => {
    if (!cierreForzado && hayCambiosSinGuardar()) {
      e.preventDefault();
      const respuesta = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['Guardar y salir', 'Salir sin guardar', 'Cancelar'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: 'AprendePython',
        message: 'Tienes cambios sin guardar',
        detail: 'Si sales sin guardar, perderás el avance de esta sesión (ejercicios resueltos y borradores).',
      });
      if (respuesta === 2) return;
      if (respuesta === 0) { try { guardarProgreso(); } catch { return; } }
      cierreForzado = true;
      win.close();
      return;
    }
    guardarVentana();
  });
  win.on('closed', () => { win = null; });
}

// ---------- IPC ----------
function handle(nombre, fn) {
  ipcMain.handle(nombre, async (event, arg) => {
    try { return await fn(arg || {}, event); } catch (e) { return { error: String((e && e.message) || e) }; }
  });
}

const textoValido = (s) => typeof s === 'string' && s.length <= MAX_CODIGO;

handle('app:init', async () => ({
  version: app.getVersion(),
  python: await Python.detectar(false),
  catalogo: Catalogo.paraInterfaz(),
  progreso,
  sucio: false,
  ajustes,
  e2e: E2E,
}));

handle('python:detectar', () => Python.detectar(true));

handle('ejercicio:ejecutar', ({ codigo }) => {
  if (!textoValido(codigo)) throw new Error('El código es demasiado largo.');
  return Python.ejecutar({ codigo, verificar: false, runner: rutaRunner(), cwd: carpetaTrabajo() });
});

handle('ejercicio:verificar', ({ id, codigo }) => {
  if (!textoValido(codigo)) throw new Error('El código es demasiado largo.');
  const hallado = Catalogo.buscar(id);
  if (!hallado) throw new Error('Ese ejercicio no existe.');
  const e = hallado.ejercicio;
  return Python.ejecutar({ codigo, verificar: true, pruebas: e.pruebas, exige: e.exige, prohibe: e.prohibe, runner: rutaRunner(), cwd: carpetaTrabajo() });
});

handle('progreso:cambiar', (cambio) => {
  const conocido = (id) => typeof id === 'string' && !!Catalogo.buscar(id);
  if (cambio.completado !== undefined && conocido(cambio.completado)) progreso.completados[cambio.completado] = true;
  if (cambio.borrador && conocido(cambio.borrador.id)) {
    if (typeof cambio.borrador.codigo === 'string' && cambio.borrador.codigo.length <= MAX_CODIGO) progreso.borradores[cambio.borrador.id] = cambio.borrador.codigo;
    else delete progreso.borradores[cambio.borrador.id];
  }
  if (cambio.quitarBorrador !== undefined && conocido(cambio.quitarBorrador)) delete progreso.borradores[cambio.quitarBorrador];
  if (cambio.ultimo !== undefined && conocido(cambio.ultimo)) progreso.ultimo = cambio.ultimo;
  return { sucio: hayCambiosSinGuardar() };
});

// «Guardar cambios»: escribe el avance en disco.
handle('progreso:guardar', () => {
  guardarProgreso();
  return { sucio: false };
});

// «Empezar de cero»: borra todo el avance, también lo que había guardado en disco.
handle('progreso:reiniciar', () => {
  progreso = { version: 1, completados: {}, borradores: {}, ultimo: null };
  guardarProgreso();
  return { sucio: false };
});

handle('ajustes:cambiar', (cambio) => {
  if (cambio.fuente !== undefined) ajustes.fuente = Math.round(entre(cambio.fuente, 11, 28, ajustes.fuente));
  if (cambio.solucionFrac !== undefined) ajustes.solucionFrac = entre(cambio.solucionFrac, 0.2, 0.8, ajustes.solucionFrac);
  if (cambio.resultadoAlto !== undefined) ajustes.resultadoAlto = Math.round(entre(cambio.resultadoAlto, 80, 900, ajustes.resultadoAlto));
  if (cambio.enunciadoAlto !== undefined) ajustes.enunciadoAlto = Math.round(entre(cambio.enunciadoAlto, 0, 900, ajustes.enunciadoAlto));
  guardarAjustes();
  return ajustes;
});

// ---------- arranque ----------
if (!E2E && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    cargarAjustes();
    cargarProgreso();
    createWindow();
    if (E2E) require('./scripts/e2e').run({ win, app, archivoAjustes, archivoProgreso });
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
