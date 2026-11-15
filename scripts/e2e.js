'use strict';
/* Prueba de extremo a extremo: abre la aplicación de verdad, la maneja como una persona y saca capturas.
 * Uso:  electron . --e2e   con variables de entorno que apunten a carpetas TEMPORALES (nunca a tus ajustes reales):
 *   APRENDEPYTHON_USERDATA      ajustes y progreso de la aplicación
 *   APRENDEPYTHON_E2E_OUT       capturas e informe (resultado.json)
 *   APRENDEPYTHON_E2E_SCENARIO  completo | reapertura | singuardar | reapertura2 | reapertura3
 * Se lanzan uno tras otro con los mismos ajustes: equivale a cerrar y volver a abrir el programa
 * (completo → reapertura → singuardar [sale SIN guardar] → reapertura2 [comprueba que no se guardó; sale guardando] → reapertura3).
 */
const fs = require('fs');
const path = require('path');

exports.run = async function run({ win, app, archivoAjustes, archivoProgreso }) {
  const outDir = process.env.APRENDEPYTHON_E2E_OUT || path.join(__dirname, '..', '.e2e-tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const escenario = process.env.APRENDEPYTHON_E2E_SCENARIO || 'completo';
  const wc = win.webContents;
  const Catalogo = require('../src/shared/catalogo');
  const todos = Catalogo.ejercicios();
  const results = [];
  const consoleErrors = [];
  wc.on('console-message', (event) => {
    const e = event && event.level !== undefined ? event : { level: 0, message: '' };
    if (e.level === 'error' || e.level >= 3) consoleErrors.push(String(e.message));
  });

  // Datos de quien ejecuta la prueba: NUNCA deben aparecer en la interfaz. Se calculan al momento (no hay nombres en el código).
  const palabrasPersonales = () => {
    const words = new Set();
    try { words.add(require('os').userInfo().username); } catch { /* sin usuario */ }
    ['user.name', 'user.email'].forEach((k) => {
      try {
        const v = require('child_process').execFileSync('git', ['config', '--global', k], { encoding: 'utf8' }).trim();
        if (v) words.add(k === 'user.email' ? v.split('@')[0] : v);
      } catch { /* sin configuración global */ }
    });
    return Array.from(words).filter((w) => w && w.length >= 4);
  };
  const PERSONAL = new RegExp(palabrasPersonales().map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^', 'i');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const exec = (code) => wc.executeJavaScript(code, true);
  const check = (name, cond, detail) => {
    results.push({ name, ok: !!cond, detail: cond ? undefined : String(detail === undefined ? '' : detail) });
    process.stdout.write((cond ? 'OK   ' : 'FALLA') + '  ' + name + (cond ? '' : '  -> ' + detail) + '\n');
  };
  const shot = async (name) => {
    await sleep(350);
    wc.invalidate();
    await sleep(150);
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
  };
  const waitFor = async (expr, ms) => {
    const fin = Date.now() + (ms || 10000);
    while (Date.now() < fin) {
      try { if (await exec(expr)) return true; } catch { /* aún no */ }
      await sleep(80);
    }
    return false;
  };
  const text = (sel) => exec('(document.querySelector(' + JSON.stringify(sel) + ') || {innerText: "##no existe##"}).innerText');
  const count = (sel) => exec('document.querySelectorAll(' + JSON.stringify(sel) + ').length');
  const click = (sel) => exec('document.querySelector(' + JSON.stringify(sel) + ').click()');
  const rect = (sel) => exec('(() => { const r = document.querySelector(' + JSON.stringify(sel) + ').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; })()');
  const hidden = (sel) => exec('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); return e.hidden || getComputedStyle(e).display === "none"; })()');
  const setCode = (c) => exec('window.__ap.setCodigo(' + JSON.stringify(c) + ')');
  const getCode = () => exec('window.__ap.getCodigo()');
  const cargar = (id) => exec('window.__ap.cargarEjercicio(' + JSON.stringify(id) + ')');
  const titulo = () => text('#titulo-ejercicio');
  const leerJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const dump = () => exec(`(() => { const parts = [document.body.innerText, document.title];
    document.querySelectorAll('[title]').forEach((e) => parts.push(e.getAttribute('title')));
    parts.push(window.__ap.getCodigo());
    return parts.join('\\n'); })()`);
  const verificar = async () => {
    await exec('document.getElementById("res-cuerpo").textContent = ""');
    await click('#btn-verificar');
    await waitFor('!window.__ap.S.ocupado && !!document.querySelector("#res-cuerpo .banner")', 20000);
  };
  const ejecutar = async () => {
    await exec('document.getElementById("res-cuerpo").textContent = ""');
    await click('#btn-ejecutar');
    await waitFor('!window.__ap.S.ocupado && !!document.querySelector("#res-cuerpo .banner")', 20000);
  };
  const resultado = () => text('#res-cuerpo');
  const raton = (type, x, y) => wc.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, modifiers: type === 'mouseUp' ? [] : ['leftButtonDown'] });

  // El diálogo «¿guardar al salir?» es nativo y no se puede pulsar desde aquí: se sustituye por una respuesta fija (y se anota que se mostró).
  const electron = require('electron');
  const llamadasDialogo = [];
  const responder = (n) => { electron.dialog.showMessageBoxSync = (a, b) => { llamadasDialogo.push(b || a); return n; }; };
  const pendiente = () => exec('document.getElementById("btn-guardar").classList.contains("pendiente")');
  const enDisco = () => (fs.existsSync(archivoProgreso()) ? leerJson(archivoProgreso()) : { completados: {}, borradores: {}, ultimo: null });
  const teclaCtrlS = () => exec('document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }))');
  let cierreFinal = null; // null: salir sin más | 0: «Guardar y salir» | 1: «Salir sin guardar» | 2: cerrar sin cambios pendientes (no debe preguntar)

  win.setPosition(-4000, 40); // fuera de la pantalla: pinta con normalidad (las capturas salen frescas) sin molestar
  win.showInactive();

  const arrancar = async () => {
    check('la aplicación termina de cargar', await waitFor('document.body.dataset.listo === "1"', 15000), 'no llegó a cargar');
  };

  // ===================================================================================
  async function scenarioCompleto() {
    await arrancar();
    const total = todos.length;

    // ---- Python y arranque ----
    check('encuentra Python 3', /Python 3\.\d+/.test(await text('#python-estado')) && (await exec('document.getElementById("python-estado").classList.contains("ok")')), await text('#python-estado'));
    check('el primer ejercicio es «Tu primera variable»', (await titulo()) === 'Tu primera variable', await titulo());
    check('ruta y posición: Python básico › Tipos de datos · Ejercicio 1 de 5', (await text('#ruta')).includes('Python básico') && (await text('#ruta')).includes('Tipos de datos') && (await text('#pos-ejercicio')) === 'Ejercicio 1 de 5', await text('#ruta') + ' / ' + await text('#pos-ejercicio'));
    check('progreso inicial: 0 resueltos', (await text('#texto-prog')) === '0 de ' + total + ' resueltos', await text('#texto-prog'));
    check('arriba hay una barra de progreso y un porcentaje (0 %)', (await text('#pct-prog')) === '0 %' && (await rect('.barra')).w > 80, (await text('#pct-prog')) + ' ' + JSON.stringify(await rect('.barra')));
    check('arriba hay botones «Guardar cambios» y «Empezar de cero»', (await text('#btn-guardar')).includes('Guardar cambios') && (await text('#btn-cero')).includes('Empezar de cero'), (await text('#btn-guardar')) + ' / ' + (await text('#btn-cero')));
    check('al empezar, «Todo guardado» y nada pendiente', (await text('#estado-guardado')).includes('Todo guardado') && !(await pendiente()), await text('#estado-guardado'));
    check('la cabecera cabe sin desbordarse', (await exec('(() => { const c = document.getElementById("cabecera"); return c.scrollWidth <= c.clientWidth + 1; })()')) === true, '');

    // ---- el menú: los dos desplegables y los 16 temas con los nombres pedidos ----
    const grupos = await exec('Array.from(document.querySelectorAll(".grupo > .grupo-cab .nombre")).map((e) => e.textContent)');
    check('el menú tiene «Python básico» y «Python avanzado»', JSON.stringify(grupos) === JSON.stringify(['Python básico', 'Python avanzado']), JSON.stringify(grupos));
    const temas = await exec('Array.from(document.querySelectorAll(".grupo")).map((g) => Array.from(g.querySelectorAll(".tema > .tema-cab .nombre")).map((e) => e.textContent))');
    check('«Python básico» tiene los 6 temas pedidos', JSON.stringify(temas[0]) === JSON.stringify(['Tipos de datos', 'Funciones', 'Métodos de listas', 'Operaciones aritméticas', 'Tipos de conversiones', 'print y booleanos']), JSON.stringify(temas[0]));
    check('«Python avanzado» tiene los 10 temas pedidos', JSON.stringify(temas[1]) === JSON.stringify(['Argumentos variables', 'Argumentos clave:valor', 'Argumentos posicionales', 'Diccionarios', 'OOP - Atributos', 'OOP - Clases', 'OOP - Constructores', 'OOP - Métodos', 'Sets', 'Tuplas']), JSON.stringify(temas[1]));
    check('el grupo y el tema del ejercicio actual están desplegados', (await exec('document.querySelector(".grupo[data-id=basico]").classList.contains("abierto") && document.querySelector(".tema[data-id=tipos-datos]").classList.contains("abierto")')) === true, '');

    // ---- reparto de la pantalla: enunciado arriba, editor a la izquierda, solución a la derecha, menú a la derecha de todo ----
    const re = await rect('#enunciado');
    const rc = await rect('#panel-codigo');
    const rs = await rect('#panel-solucion');
    const rm = await rect('#menu');
    const rr = await rect('#resultado');
    check('el enunciado está encima del editor y de la solución', re.b <= rc.y + 2 && re.b <= rs.y + 2, JSON.stringify({ re, rc, rs }));
    check('el editor está a la izquierda y la solución a su derecha', rc.r <= rs.x + 12 && Math.abs(rc.y - rs.y) < 3, JSON.stringify({ rc, rs }));
    check('el menú de desplegables está a la derecha de editor y solución', rm.x >= rs.r - 2 && rm.x >= rc.r, JSON.stringify({ rm, rs }));
    check('el resultado está debajo de los paneles', rr.y >= rc.b - 2, JSON.stringify({ rr, rc }));
    check('sin barra de desplazamiento horizontal', (await exec('document.documentElement.scrollWidth <= window.innerWidth + 1')) === true, '');
    check('el editor es de verdad un editor con números de línea', (await count('#editor-cont .CodeMirror-linenumber')) >= 1, '');
    check('hay botones «Ejecutar», «Verificar código» y «Empezar de nuevo»', (await text('#btn-ejecutar')).includes('Ejecutar') && (await text('#btn-verificar')).includes('Verificar código') && (await text('#btn-reiniciar')).includes('Empezar de nuevo'), '');
    check('el enunciado resalta el código de ejemplo', (await count('#texto-enunciado .bloque-codigo .cm-string')) >= 1, '');

    // ---- la solución empieza oculta ----
    check('la solución empieza oculta', (await hidden('#sol-cont')) === true && (await hidden('#sol-oculta')) === false && (await text('#btn-solucion')).includes('Ver solución'), '');
    await shot('01-arranque');

    // ---- verificar: código incorrecto ----
    await setCode('nombre = "Ana"\nedad = "30"\n');
    await verificar();
    let r = await resultado();
    check('un código incorrecto: «Todavía no es correcto» y sin marcar como resuelto', r.includes('Todavía no es correcto') && (await text('#texto-prog')) === '0 de ' + total + ' resueltos', r.slice(0, 200));
    check('indica qué prueba falló, con lo esperado y lo obtenido', r.includes('Esperaba') && r.includes('(int)') && r.includes('(str)'), r);
    check('marca con ✔ lo correcto y con ✘ lo incorrecto', (await count('#res-cuerpo .prueba.ok')) === 1 && (await count('#res-cuerpo .prueba.fallo')) === 1, '');
    await shot('02-incorrecto');

    // ---- ver / ocultar la solución ----
    await click('#btn-solucion');
    check('«Ver solución» muestra la solución', (await hidden('#sol-cont')) === false && (await hidden('#sol-oculta')) === true && (await text('#btn-solucion')).includes('Ocultar'), '');
    check('la solución mostrada es la del ejercicio', (await exec('window.__ap.S.solEditor.getValue()')) === todos[0].ejercicio.solucion.replace(/\n$/, ''), '');
    check('la solución no se puede editar', (await exec('window.__ap.S.solEditor.getOption("readOnly")')) !== false, '');
    check('la solución tiene tamaño visible', (await rect('#sol-cont')).h > 100, JSON.stringify(await rect('#sol-cont')));
    await shot('03-solucion-visible');
    await click('#btn-solucion');
    check('«Ocultar solución» vuelve a ocultarla', (await hidden('#sol-cont')) === true && (await text('#btn-solucion')).includes('Ver solución'), '');
    await click('#btn-solucion');
    await cargar(todos[1].ejercicio.id);
    check('al cambiar de ejercicio la solución vuelve a estar oculta', (await hidden('#sol-cont')) === true, '');
    await cargar(todos[0].ejercicio.id);
    check('al volver, se recupera el código escrito (borrador)', (await getCode()) === 'nombre = "Ana"\nedad = "30"\n', await getCode());

    // ---- verificar: código correcto ----
    await setCode(todos[0].ejercicio.solucion);
    await verificar();
    r = await resultado();
    check('el código correcto da «¡Correcto!»', r.includes('¡Correcto!') && !r.includes('Todavía'), r.slice(0, 200));
    check('aparece el botón «Siguiente ejercicio»', (await text('#res-cuerpo .banner button')).includes('Siguiente'), '');
    check('el ejercicio queda marcado como resuelto (✓) y el progreso sube', (await count('.ej.hecho')) === 1 && (await text('#texto-prog')) === '1 de ' + total + ' resueltos', await text('#texto-prog'));
    check('el avance sube al 1 % y la barra se llena un poco', (await text('#pct-prog')) === '1 %' && (await exec('parseFloat(document.getElementById("barra-prog").style.width) > 0')) === true, await text('#pct-prog'));
    check('tras resolver: «Cambios sin guardar» y todavía NO está escrito en disco', (await pendiente()) === true && (await text('#estado-guardado')).includes('sin guardar') && !enDisco().completados[todos[0].ejercicio.id], JSON.stringify(enDisco()).slice(0, 200));
    await teclaCtrlS();
    await sleep(500);
    check('Ctrl+S guarda el avance en disco', enDisco().completados[todos[0].ejercicio.id] === true && !(await pendiente()) && (await text('#estado-guardado')).includes('Guardado'), JSON.stringify(enDisco()).slice(0, 200));
    await shot('04-correcto');
    await click('#res-cuerpo .banner button');
    check('«Siguiente ejercicio» pasa al 2.º', (await titulo()) === todos[1].ejercicio.titulo && (await text('#pos-ejercicio')) === 'Ejercicio 2 de 5', await titulo());
    await cargar(todos[0].ejercicio.id);

    // ---- ejecutar, errores y avisos ----
    await setCode('print("¡Hola, Python! 🐍")\nprint(2 + 3)\n');
    await ejecutar();
    r = await resultado();
    check('«Ejecutar» muestra lo que imprime el programa', r.includes('¡Hola, Python! 🐍') && r.includes('5') && r.includes('sin errores'), r);
    await shot('05-ejecutar');
    await setCode('x = 1\nif x == 1\n    print(x)\n');
    await ejecutar();
    r = await resultado();
    check('un error de sintaxis se explica en español, con su línea', r.includes('SyntaxError') && r.includes('línea 2') && r.includes('dos puntos'), r);
    check('la línea del error se marca en el editor', (await count('#editor-cont .linea-error')) === 1, '');
    await shot('06-error-sintaxis');
    await setCode('print("a")\nprint(variable_que_no_existe)\n');
    await ejecutar();
    r = await resultado();
    check('un NameError se explica y conserva lo impreso antes', r.includes('NameError') && r.includes('«variable_que_no_existe»') && r.includes('línea 2') && r.includes('a'), r);
    await setCode('nombre = input("¿Cómo te llamas? ")\n');
    await ejecutar();
    check('input() avisa en vez de quedarse esperando', (await resultado()).includes('input()'), await resultado());
    await setCode('edad = 30\n');
    await click('#btn-verificar');
    await waitFor('!window.__ap.S.ocupado', 15000);
    check('verificar código sin la variable pedida da un fallo claro', (await resultado()).includes('NameError') && (await resultado()).includes('nombre'), await resultado());
    await setCode('while True:\n    pass\n');
    await ejecutar();
    r = await resultado();
    check('un bucle infinito se corta con un aviso', r.includes('tardó más de') && r.includes('bucle'), r);
    await shot('07-bucle-infinito');

    // ---- la pista ----
    check('el botón de la pista está siempre visible, arriba junto a la navegación', (await rect('#btn-pista')).y >= (await rect('#enunciado')).y && (await rect('#btn-pista')).b <= (await rect('#enunciado')).y + 60, JSON.stringify(await rect('#btn-pista')));
    check('la pista empieza oculta', (await hidden('#pista')) === true, '');
    await click('#btn-pista');
    check('«Ver pista» la muestra', (await hidden('#pista')) === false && (await text('#pista')).length > 5, '');

    // ---- navegación por el menú de desplegables ----
    await cargar(todos[0].ejercicio.id);
    await click('.tema[data-id=funciones] > .tema-cab');
    check('pulsar un tema abre sus ejercicios y carga el primero', (await titulo()) === 'Tu primera función' && (await exec('document.querySelector(".tema[data-id=funciones]").classList.contains("abierto")')) === true && (await exec('document.querySelector(".tema[data-id=tipos-datos]").classList.contains("abierto")')) === false, await titulo());
    check('el tema abierto lista sus ejercicios numerados', (await count('.tema[data-id=funciones] .ej')) === 5 && (await text('.tema[data-id=funciones] .ej')).includes('1. Tu primera función'), '');
    await click('.grupo[data-id=avanzado] > .grupo-cab');
    check('el desplegable «Python avanzado» se abre', (await exec('document.querySelector(".grupo[data-id=avanzado]").classList.contains("abierto")')) === true, '');
    await click('.tema[data-id=diccionarios] > .tema-cab');
    check('se puede trabajar un tema de «Python avanzado»', (await titulo()) === 'Crear un diccionario' && (await text('#ruta')).includes('Python avanzado'), await titulo());
    await click('.tema[data-id=diccionarios] .ej[data-id=dic-eliminar]');
    check('pulsar un ejercicio concreto lo abre', (await titulo()) === 'Eliminar claves', await titulo());
    await click('#btn-anterior');
    check('◀ lleva al ejercicio anterior', (await titulo()) === 'Modificar y añadir', await titulo());
    await click('#btn-siguiente');
    await click('#btn-siguiente');
    check('▶ lleva al siguiente', (await titulo()) === 'Recorrer con items()', await titulo());
    await cargar(todos[0].ejercicio.id);
    check('◀ está desactivado en el primer ejercicio', (await exec('document.getElementById("btn-anterior").disabled')) === true, '');
    await shot('08-menu-avanzado');

    // ---- cada ejercicio: se carga bien y su solución se verifica desde la interfaz ----
    const mal = [];
    const marcaRota = [];
    await exec('window.__ap.S.progreso.completados = {}');
    for (const { ejercicio: e } of todos) {
      await cargar(e.id);
      // las marcas de markdown sin interpretar se buscan solo FUERA del código (dentro puede haber ** o `)
      const t = JSON.parse(await exec('(() => { const c = document.getElementById("texto-enunciado").cloneNode(true); const largo = c.innerText.length; c.querySelectorAll("code, pre").forEach((x) => x.remove()); return JSON.stringify({ largo, fuera: c.innerText }); })()'));
      if (t.largo < 40 || /`|\*\*|\\\|/.test(t.fuera)) marcaRota.push(e.id + ' (enunciado con marcas sin interpretar o vacío)');
      if ((await titulo()) !== e.titulo) marcaRota.push(e.id + ' (título)');
      await setCode(e.solucion);
      await verificar();
      const res = await resultado();
      if (!res.includes('¡Correcto!')) mal.push(e.id + ': ' + res.replace(/\s+/g, ' ').slice(0, 160));
    }
    check('los ' + total + ' enunciados se muestran bien (sin marcas de markdown sin interpretar)', marcaRota.length === 0, marcaRota.join(' | '));
    check('la solución de los ' + total + ' ejercicios se verifica como correcta desde la interfaz', mal.length === 0, mal.join(' | '));
    check('al terminar, el progreso es ' + total + ' de ' + total, (await text('#texto-prog')) === total + ' de ' + total + ' resueltos', await text('#texto-prog'));
    check('con los ' + total + ' resueltos el porcentaje es 100 % y la barra está llena', (await text('#pct-prog')) === '100 %' && (await exec('parseFloat(document.getElementById("barra-prog").style.width) === 100')) === true, await text('#pct-prog'));
    check('todos los temas se marcan como completos', (await count('.tema > .tema-cab .cuenta.completo')) === 16 && (await count('.grupo > .grupo-cab .cuenta.completo')) === 2, await count('.tema > .tema-cab .cuenta.completo'));
    check('el último ejercicio felicita y no ofrece «Siguiente»', (await resultado()).includes('completado todos') && (await count('#res-cuerpo .banner button')) === 0, await resultado());
    await shot('09-todo-resuelto');

    // ---- empezar de nuevo y borrar el progreso (con doble pulsación) ----
    await cargar(todos[1].ejercicio.id);
    await setCode('basura = 1\n');
    await click('#btn-reiniciar');
    check('«Empezar de nuevo» pide confirmar con otra pulsación', (await getCode()) === 'basura = 1\n' && (await text('#btn-reiniciar')).includes('Seguro'), await text('#btn-reiniciar'));
    await click('#btn-reiniciar');
    check('con la 2.ª pulsación vuelve al código inicial', (await getCode()) === todos[1].ejercicio.inicial, await getCode());
    check('tras resolverlos todos hay cambios sin guardar', (await pendiente()) === true, '');
    await click('#btn-guardar');
    await sleep(500);
    check('el botón «Guardar cambios» escribe los ' + total + ' ejercicios en disco', Object.keys(enDisco().completados).length === total && !(await pendiente()) && (await text('#estado-guardado')).includes('Guardado'), Object.keys(enDisco().completados).length + ' en disco');
    await shot('09b-guardado');
    await click('#btn-cero');
    check('«Empezar de cero» pide confirmar con otra pulsación (y aún no borra nada)', (await text('#btn-cero')).includes('Seguro') && (await count('.ej.hecho')) === total && Object.keys(enDisco().completados).length === total, await text('#btn-cero'));
    await click('#btn-cero');
    await sleep(700);
    check('con la 2.ª pulsación se borra TODO: pantalla y disco', (await text('#texto-prog')) === '0 de ' + total + ' resueltos' && (await text('#pct-prog')) === '0 %' && (await count('.ej.hecho')) === 0 && Object.keys(enDisco().completados).length === 0 && Object.keys(enDisco().borradores).length === 0, (await text('#texto-prog')) + ' / disco ' + JSON.stringify(enDisco()).slice(0, 120));
    check('y vuelve al primer ejercicio, sin cambios pendientes', (await titulo()) === todos[0].ejercicio.titulo && !(await pendiente()) && (await text('#btn-cero')).includes('Empezar de cero'), await titulo());
    await shot('09c-de-cero');

    // ---- ajustes: tamaño de letra y separadores arrastrables ----
    const antes = await exec('parseInt(getComputedStyle(document.documentElement).getPropertyValue("--fs-codigo"))');
    await click('#btn-letra-mas');
    await sleep(300);
    check('«A+» agranda la letra del código y se guarda', (await exec('parseInt(getComputedStyle(document.documentElement).getPropertyValue("--fs-codigo"))')) === antes + 1 && leerJson(archivoAjustes()).fuente === antes + 1, '');
    const sep = await rect('#sep-v');
    const w0 = (await rect('#panel-solucion')).w;
    raton('mouseDown', sep.x + sep.w / 2, sep.y + sep.h / 2);
    for (let i = 1; i <= 8; i++) { raton('mouseMove', sep.x + sep.w / 2 - i * 25, sep.y + sep.h / 2); await sleep(25); }
    raton('mouseUp', sep.x + sep.w / 2 - 200, sep.y + sep.h / 2);
    await sleep(400);
    const w1 = (await rect('#panel-solucion')).w;
    check('arrastrar el separador vertical ensancha la solución', w1 > w0 + 100, w0 + ' -> ' + w1);
    check('y el ancho se guarda', Math.abs(leerJson(archivoAjustes()).solucionFrac - w1 / (await rect('#paneles')).w) < 0.03, JSON.stringify(leerJson(archivoAjustes())));
    const sh = await rect('#sep-h');
    const h0 = (await rect('#resultado')).h;
    raton('mouseDown', sh.x + sh.w / 2, sh.y + sh.h / 2);
    for (let i = 1; i <= 6; i++) { raton('mouseMove', sh.x + sh.w / 2, sh.y + sh.h / 2 - i * 20); await sleep(25); }
    raton('mouseUp', sh.x + sh.w / 2, sh.y + sh.h / 2 - 120);
    await sleep(400);
    check('arrastrar el separador horizontal agranda el resultado', (await rect('#resultado')).h > h0 + 60, h0 + ' -> ' + (await rect('#resultado')).h);

    const se = await rect('#sep-e');
    const e0 = (await rect('#enunciado')).h;
    raton('mouseDown', se.x + se.w / 2, se.y + se.h / 2);
    for (let i = 1; i <= 5; i++) { raton('mouseMove', se.x + se.w / 2, se.y + se.h / 2 + i * 14); await sleep(25); }
    raton('mouseUp', se.x + se.w / 2, se.y + se.h / 2 + 70);
    await sleep(400);
    const e1 = (await rect('#enunciado')).h;
    check('arrastrar el separador del enunciado cambia su altura y se guarda', Math.abs(e1 - e0) > 30 && leerJson(archivoAjustes()).enunciadoAlto > 0, e0 + ' -> ' + e1 + ' ' + JSON.stringify(leerJson(archivoAjustes())));
    await exec('document.getElementById("sep-e").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))');
    await sleep(400);
    check('doble clic en ese separador vuelve a la altura automática', Math.abs((await rect('#enunciado')).h - e0) < 3 && leerJson(archivoAjustes()).enunciadoAlto === 0, (await rect('#enunciado')).h + ' vs ' + e0);

    // ---- ventana pequeña ----
    win.setSize(1000, 700);
    await sleep(600);
    await cargar(todos[2].ejercicio.id);
    check('con la ventana al mínimo no hay desplazamiento horizontal', (await exec('document.documentElement.scrollWidth <= window.innerWidth + 1')) === true, '');
    check('con la ventana al mínimo la cabecera cabe y los botones de guardar y de cero se ven', (await exec('(() => { const c = document.getElementById("cabecera"); return c.scrollWidth <= c.clientWidth + 1; })()')) === true && (await rect('#btn-cero')).r <= 1000 && (await rect('#btn-guardar')).x >= 0, JSON.stringify({ g: await rect('#btn-guardar'), c: await rect('#btn-cero') }));
    check('con la ventana al mínimo el editor sigue siendo usable', (await rect('#panel-codigo')).w >= 250 && (await rect('#panel-codigo')).h >= 150, JSON.stringify(await rect('#panel-codigo')));
    await shot('10-ventana-minima');
    win.setSize(1360, 860);
    await sleep(500);

    // ---- privacidad ----
    const d = await dump();
    check('la interfaz no muestra datos personales', !PERSONAL.test(d), (d.match(PERSONAL) || [''])[0]);
    const guardado = fs.readFileSync(archivoAjustes(), 'utf8') + fs.readFileSync(archivoProgreso(), 'utf8');
    check('lo que se guarda en disco no tiene datos personales ni rutas', !PERSONAL.test(guardado) && !guardado.includes('\\Users\\') && !guardado.includes('/Users/'), guardado.slice(0, 200));

    // ---- se deja un estado para el escenario «reapertura» ----
    await cargar(todos[0].ejercicio.id);
    await setCode(todos[0].ejercicio.solucion);
    await verificar();
    await cargar('fn-cuadrado');
    await setCode('def cuadrado(n):\n    return n * n   # borrador a medias\n');
    await sleep(600); // el borrador llega al programa 0,15 s después de escribir
    check('un borrador nuevo cuenta como cambio sin guardar y aún no está en disco', (await pendiente()) === true && !(enDisco().borradores['fn-cuadrado']), JSON.stringify(enDisco()).slice(0, 200));
    await click('#btn-guardar');
    await sleep(500);
    check('«Guardar cambios» guarda el borrador, el avance y el ejercicio actual', (enDisco().borradores['fn-cuadrado'] || '').includes('borrador a medias') && enDisco().completados[todos[0].ejercicio.id] === true && enDisco().ultimo === 'fn-cuadrado' && !(await pendiente()), JSON.stringify(enDisco()).slice(0, 300));
  }

  // ===================================================================================
  async function scenarioReapertura() {
    await arrancar();
    const total = todos.length;
    check('al reabrir, vuelve al último ejercicio que se estaba haciendo', (await titulo()) === 'Parámetros y return', await titulo());
    check('al reabrir, se recupera el borrador del código', (await getCode()).includes('borrador a medias'), await getCode());
    check('al reabrir, se recuerda el progreso (1 resuelto)', (await text('#texto-prog')) === '1 de ' + total + ' resueltos' && (await count('.ej.hecho')) === 1, await text('#texto-prog'));
    check('al reabrir, «Todo guardado» y nada pendiente', (await text('#estado-guardado')).includes('Todo guardado') && !(await pendiente()), await text('#estado-guardado'));
    check('al reabrir, el porcentaje es el guardado (1 %)', (await text('#pct-prog')) === '1 %', await text('#pct-prog'));
    check('al reabrir, se recuerda el tamaño de letra', (await exec('parseInt(getComputedStyle(document.documentElement).getPropertyValue("--fs-codigo"))')) === leerJson(archivoAjustes()).fuente && leerJson(archivoAjustes()).fuente !== 15, '');
    check('al reabrir, la solución sigue oculta', (await hidden('#sol-cont')) === true, '');
    check('al reabrir, el tema del ejercicio está desplegado', (await exec('document.querySelector(".tema[data-id=funciones]").classList.contains("abierto")')) === true, '');
    await verificar();
    check('el borrador recuperado se puede verificar', (await resultado()).includes('¡Correcto!'), await resultado());
    await shot('11-reapertura');
    check('resolver el borrador deja cambios sin guardar (no se guarda solo)', (await pendiente()) === true, '');
    // se sale con app.exit (sin pasar por el aviso): lo no guardado se pierde y el disco sigue como estaba
  }

  // ===================================================================================
  async function scenarioSinGuardar() {
    await arrancar();
    const total = todos.length;
    check('se parte del avance guardado (1 resuelto)', (await text('#texto-prog')) === '1 de ' + total + ' resueltos' && !(await pendiente()), await text('#texto-prog'));
    await cargar('fn-saludar');
    await setCode(todos.find((x) => x.ejercicio.id === 'fn-saludar').ejercicio.solucion);
    await verificar();
    check('resolver otro ejercicio deja «Cambios sin guardar» (2 resueltos)', (await pendiente()) === true && (await text('#texto-prog')) === '2 de ' + total + ' resueltos', await text('#texto-prog'));
    await shot('12-cambios-sin-guardar');
    llamadasDialogo.length = 0;
    responder(2); // «Cancelar»
    win.close();
    await sleep(900);
    check('al cerrar con cambios sin guardar, el programa pregunta qué hacer', llamadasDialogo.length === 1 && JSON.stringify(llamadasDialogo[0].buttons) === JSON.stringify(['Guardar y salir', 'Salir sin guardar', 'Cancelar']) && /sin guardar/.test(llamadasDialogo[0].message), JSON.stringify(llamadasDialogo));
    check('«Cancelar» deja la ventana abierta con el avance intacto', !win.isDestroyed() && (await text('#texto-prog')) === '2 de ' + total + ' resueltos' && (await pendiente()) === true, '');
    check('y nada se ha escrito en disco', !enDisco().completados['fn-saludar'], JSON.stringify(enDisco()).slice(0, 200));
    cierreFinal = 1; // «Salir sin guardar»
  }

  // ===================================================================================
  async function scenarioReapertura2() {
    await arrancar();
    const total = todos.length;
    check('tras «Salir sin guardar», lo no guardado se ha perdido (sigue 1 resuelto)', (await text('#texto-prog')) === '1 de ' + total + ' resueltos' && (await count('.ej.hecho')) === 1, await text('#texto-prog'));
    check('pero lo guardado antes sigue ahí (el borrador de «Parámetros y return»)', (await getCode()).includes('borrador a medias'), await getCode());
    await cargar('fn-saludar');
    await setCode(todos.find((x) => x.ejercicio.id === 'fn-saludar').ejercicio.solucion);
    await verificar();
    check('se vuelve a resolver «Tu primera función» (sin guardar)', (await pendiente()) === true && (await text('#texto-prog')) === '2 de ' + total + ' resueltos', await text('#texto-prog'));
    cierreFinal = 0; // «Guardar y salir»
  }

  // ===================================================================================
  async function scenarioReapertura3() {
    await arrancar();
    const total = todos.length;
    check('tras «Guardar y salir», al reabrir está el avance nuevo (2 resueltos, 2 %)', (await text('#texto-prog')) === '2 de ' + total + ' resueltos' && (await text('#pct-prog')) === '2 %' && (await count('.ej.hecho')) === 2, (await text('#texto-prog')) + ' ' + (await text('#pct-prog')));
    check('y se vuelve al último ejercicio (Tu primera función), sin nada pendiente', (await titulo()) === 'Tu primera función' && !(await pendiente()), await titulo());
    await cargar('fn-cuadrado');
    check('y el borrador guardado de «Parámetros y return» sigue ahí', (await getCode()).includes('borrador a medias'), await getCode());
    cierreFinal = 2; // al cerrar sin cambios pendientes NO debe preguntar
  }

  // ===================================================================================
  try {
    wc.on('did-fail-load', (_e, code, desc) => check('la página carga', false, code + ' ' + desc));
    await sleep(500);
    if (escenario === 'depurar') { // escenario de ayuda para el desarrollo: arrastres de los separadores
      await arrancar();
      const sep = await rect('#sep-v');
      process.stdout.write('sep-v ' + JSON.stringify(sep) + ' frac antes ' + (await exec('window.__ap.S.ajustes.solucionFrac')) + '\n');
      await exec('window.__ev = []; for (const t of ["pointerdown","pointermove","pointerup","pointercancel","lostpointercapture"]) document.getElementById("sep-v").addEventListener(t, (e) => window.__ev.push(t + ":" + e.clientX), true)');
      raton('mouseDown', sep.x + sep.w / 2, sep.y + sep.h / 2);
      for (let i = 1; i <= 8; i++) { raton('mouseMove', sep.x + sep.w / 2 - i * 25, sep.y + sep.h / 2); await sleep(25); }
      raton('mouseUp', sep.x + sep.w / 2 - 200, sep.y + sep.h / 2);
      await sleep(500);
      process.stdout.write('eventos ' + JSON.stringify(await exec('window.__ev')) + '\nfrac despues ' + (await exec('window.__ap.S.ajustes.solucionFrac')) + '\narchivo ' + (fs.existsSync(archivoAjustes()) ? fs.readFileSync(archivoAjustes(), 'utf8') : '(no existe)') + '\n');
    } else if (escenario === 'completo') await scenarioCompleto();
    else if (escenario === 'reapertura') await scenarioReapertura();
    else if (escenario === 'singuardar') await scenarioSinGuardar();
    else if (escenario === 'reapertura2') await scenarioReapertura2();
    else if (escenario === 'reapertura3') await scenarioReapertura3();
    check('sin errores en la consola de la interfaz', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 400));
  } catch (e) {
    check('el escenario ' + escenario + ' no se interrumpe por una excepción', false, e && e.stack ? e.stack : e);
  }
  const fallos = results.filter((x) => !x.ok).length;
  fs.writeFileSync(path.join(outDir, 'resultado.json'), JSON.stringify({ escenario, total: results.length, fallos, resultados: results }, null, 2));
  process.stdout.write('\n' + escenario + ': ' + (results.length - fallos) + '/' + results.length + ' comprobaciones correctas\n');
  if (cierreFinal === null) app.exit(fallos ? 1 : 0);
  else {
    // Se cierra la ventana como lo haría una persona (pasando por el aviso de «cambios sin guardar» si procede).
    llamadasDialogo.length = 0;
    responder(cierreFinal === 2 ? 2 : cierreFinal);
    win.close();
    setTimeout(() => { process.stdout.write('FALLA  la ventana no se cerró al pedirlo (¿preguntó sin haber cambios?)\n'); app.exit(3); }, 6000);
  }
};
