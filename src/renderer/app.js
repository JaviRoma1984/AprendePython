'use strict';
/* AprendePython · interfaz. */
(() => {
  const api = window.api;
  const $ = (id) => document.getElementById(id);
  const el = (tag, clase, texto) => {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };
  const esc = (s) => window.Texto.esc(s);

  const S = {
    catalogo: null,
    lista: [], // todos los ejercicios en orden, con su tema y nivel
    porId: new Map(),
    progreso: { completados: {}, borradores: {}, ultimo: null },
    ajustes: { fuente: 15, solucionFrac: 0.42, resultadoAlto: 200, enunciadoAlto: 0 },
    python: { ok: false },
    actual: null,
    editor: null,
    solEditor: null,
    solucionVisible: false,
    pistaVisible: false,
    ocupado: false,
    cargando: false,
    temaAbierto: null,
    gruposAbiertos: new Set(),
    lineaError: null,
    temporizadorBorrador: null,
    sucio: false, // hay avance sin guardar en el disco
    guardando: false,
    temporizadorAviso: null,
  };

  // ---------------------------------------------------------------- datos
  function construirLista() {
    S.lista = [];
    S.porId.clear();
    S.catalogo.niveles.forEach((nivel) => nivel.temas.forEach((tema) => tema.ejercicios.forEach((ej, i) => {
      const item = { id: ej.id, ej, tema, nivel, indice: S.lista.length, indiceEnTema: i };
      S.lista.push(item);
      S.porId.set(ej.id, item);
    })));
  }

  const resuelto = (id) => S.progreso.completados[id] === true;

  // ---------------------------------------------------------------- editores
  function crearEditores() {
    const tab = (cm) => {
      if (cm.somethingSelected()) { cm.indentSelection('add'); return; }
      const c = cm.getCursor();
      cm.replaceSelection(' '.repeat(4 - (c.ch % 4)), 'end');
    };
    const retroceso = (cm) => {
      if (!cm.somethingSelected()) {
        const c = cm.getCursor();
        const antes = cm.getLine(c.line).slice(0, c.ch);
        if (antes.length > 0 && /^ +$/.test(antes)) {
          const n = antes.length % 4 || 4;
          cm.replaceRange('', { line: c.line, ch: c.ch - n }, c);
          return;
        }
      }
      cm.execCommand('delCharBefore');
    };
    S.editor = window.CodeMirror($('editor-cont'), {
      value: '',
      mode: 'python',
      theme: 'ap',
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      smartIndent: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      extraKeys: { Tab: tab, 'Shift-Tab': (cm) => cm.indentSelection('subtract'), Backspace: retroceso, 'Ctrl-/': 'toggleComment' },
    });
    S.editor.on('change', () => {
      if (S.cargando) return;
      limpiarLineaError();
      clearTimeout(S.temporizadorBorrador);
      S.temporizadorBorrador = setTimeout(guardarBorrador, 150);
    });
    S.solEditor = window.CodeMirror($('sol-cont'), {
      value: '', mode: 'python', theme: 'ap', lineNumbers: true, readOnly: true, indentUnit: 4, tabSize: 4,
    });
    const obs = new ResizeObserver(() => { S.editor.refresh(); S.solEditor.refresh(); });
    obs.observe($('editor-cont'));
  }

  function guardarBorrador() {
    clearTimeout(S.temporizadorBorrador);
    if (!S.actual) return;
    const id = S.actual.id;
    const codigo = S.editor.getValue();
    if (codigo === S.actual.ej.inicial) {
      if (S.progreso.borradores[id] !== undefined) { delete S.progreso.borradores[id]; enviar({ quitarBorrador: id }); }
    } else if (S.progreso.borradores[id] !== codigo) {
      S.progreso.borradores[id] = codigo;
      enviar({ borrador: { id, codigo } });
    }
  }

  // ---------------------------------------------------------------- guardar / empezar de cero
  /** Avisa al programa de un cambio en el avance (en memoria) y se entera de si hay cambios sin guardar. */
  function enviar(cambio) {
    return api.progreso(cambio).then((r) => {
      if (r && typeof r.sucio === 'boolean') { S.sucio = r.sucio; pintarGuardado(); }
    });
  }

  function pintarGuardado(mensaje, clase) {
    const b = $('btn-guardar');
    b.classList.toggle('pendiente', S.sucio);
    b.title = S.sucio ? 'Hay cambios sin guardar. Guarda tu avance en el disco (Ctrl+S)' : 'Todo tu avance está guardado (Ctrl+S)';
    const e = $('estado-guardado');
    e.textContent = mensaje || (S.sucio ? '● Cambios sin guardar' : '✔ Todo guardado');
    e.className = 'estado-guardado ' + (clase || (S.sucio ? 'pendiente' : 'ok'));
  }

  async function guardar() {
    if (S.guardando) return;
    S.guardando = true;
    guardarBorrador(); // el borrador sale antes que la orden de guardar (los mensajes llegan en orden)
    let r;
    try { r = await api.guardar(); } catch (e) { r = { error: String(e) }; }
    S.guardando = false;
    clearTimeout(S.temporizadorAviso);
    if (r && r.error) { pintarGuardado('⚠ No se pudo guardar', 'mal'); return; }
    S.sucio = false;
    pintarGuardado('✔ Guardado', 'guardado');
    S.temporizadorAviso = setTimeout(() => pintarGuardado(), 3000);
  }

  async function empezarDeCero() {
    clearTimeout(S.temporizadorBorrador);
    if (S.actual) { // que el código que había escrito no se guarde como borrador al cambiar de ejercicio
      S.cargando = true;
      S.editor.setValue(S.actual.ej.inicial);
      S.editor.clearHistory();
      S.cargando = false;
    }
    S.progreso = { completados: {}, borradores: {}, ultimo: null };
    let r;
    try { r = await api.reiniciar(); } catch (e) { r = { error: String(e) }; }
    if (r && r.error) { pintarGuardado('⚠ No se pudo borrar lo guardado', 'mal'); return; }
    S.sucio = false;
    S.solucionVisible = false;
    cargarEjercicio(S.lista[0].id);
    actualizarMenu();
    actualizarProgreso();
    pintarGuardado('✔ Empezaste de cero', 'guardado');
    clearTimeout(S.temporizadorAviso);
    S.temporizadorAviso = setTimeout(() => pintarGuardado(), 3000);
  }

  function marcarLineaError(n) {
    limpiarLineaError();
    if (!n || n < 1 || n > S.editor.lineCount()) return;
    S.editor.addLineClass(n - 1, 'background', 'linea-error');
    S.lineaError = n - 1;
  }

  function limpiarLineaError() {
    if (S.lineaError !== null && S.lineaError < S.editor.lineCount()) S.editor.removeLineClass(S.lineaError, 'background', 'linea-error');
    S.lineaError = null;
  }

  // ---------------------------------------------------------------- menú
  function pintarMenu() {
    const raiz = $('menu-arbol');
    raiz.textContent = '';
    S.catalogo.niveles.forEach((nivel) => {
      const grupo = el('div', 'grupo');
      grupo.dataset.id = nivel.id;
      const cab = el('button', 'grupo-cab');
      cab.type = 'button';
      cab.append(el('span', 'flecha', '▶'), el('span', 'nombre', nivel.titulo), el('span', 'cuenta'));
      cab.addEventListener('click', () => {
        if (S.gruposAbiertos.has(nivel.id)) S.gruposAbiertos.delete(nivel.id); else S.gruposAbiertos.add(nivel.id);
        actualizarMenu();
      });
      const hijos = el('div', 'hijos');
      nivel.temas.forEach((tema) => {
        const t = el('div', 'tema');
        t.dataset.id = tema.id;
        const tcab = el('button', 'tema-cab');
        tcab.type = 'button';
        tcab.title = tema.resumen;
        tcab.append(el('span', 'flecha', '▶'), el('span', 'nombre', tema.titulo), el('span', 'cuenta'));
        tcab.addEventListener('click', () => {
          if (S.temaAbierto === tema.id) { S.temaAbierto = null; actualizarMenu(); return; }
          // se abre el tema y se pasa a su primer ejercicio sin resolver (o al primero)
          const items = S.lista.filter((x) => x.tema.id === tema.id);
          const destino = items.find((x) => !resuelto(x.id)) || items[0];
          if (S.actual && S.actual.tema.id === tema.id) { S.temaAbierto = tema.id; actualizarMenu(); } else cargarEjercicio(destino.id);
        });
        const ul = el('ul', 'ejercicios');
        tema.ejercicios.forEach((ej, i) => {
          const li = document.createElement('li');
          const b = el('button', 'ej');
          b.type = 'button';
          b.dataset.id = ej.id;
          b.append(el('span', 'punto', '○'), el('span', 't', (i + 1) + '. ' + ej.titulo));
          b.addEventListener('click', () => cargarEjercicio(ej.id));
          li.append(b);
          ul.append(li);
        });
        const h = el('div', 'hijos');
        h.append(ul);
        t.append(tcab, h);
        hijos.append(t);
      });
      grupo.append(cab, hijos);
      raiz.append(grupo);
    });
  }

  function actualizarMenu() {
    S.catalogo.niveles.forEach((nivel) => {
      const g = document.querySelector('.grupo[data-id="' + nivel.id + '"]');
      let hechosNivel = 0;
      let totalNivel = 0;
      nivel.temas.forEach((tema) => {
        const t = g.querySelector('.tema[data-id="' + tema.id + '"]');
        const hechos = tema.ejercicios.filter((e) => resuelto(e.id)).length;
        hechosNivel += hechos;
        totalNivel += tema.ejercicios.length;
        t.classList.toggle('abierto', S.temaAbierto === tema.id);
        t.classList.toggle('actual', !!S.actual && S.actual.tema.id === tema.id);
        const c = t.querySelector('.tema-cab .cuenta');
        c.textContent = hechos + '/' + tema.ejercicios.length;
        c.classList.toggle('completo', hechos === tema.ejercicios.length);
        tema.ejercicios.forEach((e) => {
          const b = t.querySelector('.ej[data-id="' + e.id + '"]');
          b.classList.toggle('hecho', resuelto(e.id));
          b.classList.toggle('actual', !!S.actual && S.actual.id === e.id);
          b.querySelector('.punto').textContent = resuelto(e.id) ? '✓' : (S.actual && S.actual.id === e.id ? '●' : '○');
        });
      });
      g.classList.toggle('abierto', S.gruposAbiertos.has(nivel.id));
      const c = g.querySelector('.grupo-cab .cuenta');
      c.textContent = hechosNivel + '/' + totalNivel;
      c.classList.toggle('completo', hechosNivel === totalNivel);
    });
    const activo = document.querySelector('.ej.actual');
    if (activo && S.temaAbierto) activo.scrollIntoView({ block: 'nearest' });
  }

  function actualizarProgreso() {
    const total = S.lista.length;
    const hechos = S.lista.filter((x) => resuelto(x.id)).length;
    const pct = total ? Math.round((hechos / total) * 100) : 0;
    $('texto-prog').textContent = hechos + ' de ' + total + ' resueltos';
    $('pct-prog').textContent = pct + ' %';
    $('barra-prog').style.width = (total ? (hechos / total) * 100 : 0) + '%';
    $('barra-prog').parentElement.setAttribute('aria-label', 'Avance: ' + pct + ' %');
  }

  // ---------------------------------------------------------------- enunciado y solución
  function resaltar(codigo, lenguaje) {
    if (lenguaje !== 'python') return esc(codigo);
    let html = '';
    window.CodeMirror.runMode(codigo, 'python', (texto, estilo) => {
      const e = esc(texto);
      html += estilo ? '<span class="' + estilo.split(' ').map((c) => 'cm-' + c).join(' ') + '">' + e + '</span>' : e;
    });
    return html;
  }

  function pintarEnunciado() {
    const { ej, tema, nivel, indice, indiceEnTema } = S.actual;
    $('ruta').innerHTML = '<b>' + esc(nivel.titulo) + '</b> › ' + esc(tema.titulo);
    $('pos-ejercicio').textContent = 'Ejercicio ' + (indiceEnTema + 1) + ' de ' + tema.ejercicios.length;
    $('titulo-ejercicio').textContent = ej.titulo;
    $('texto-enunciado').innerHTML = window.Texto.markdown(ej.enunciado, resaltar);
    $('enunciado').scrollTop = 0;
    $('btn-anterior').disabled = indice === 0;
    $('btn-siguiente').disabled = indice === S.lista.length - 1;
    const hayPista = !!ej.pista;
    $('btn-pista').hidden = !hayPista;
    $('pista').hidden = true;
    $('btn-pista').textContent = '💡 Ver pista';
    if (hayPista) $('pista').innerHTML = window.Texto.enLinea(ej.pista);
    S.pistaVisible = false;
  }

  function alternarPista() {
    S.pistaVisible = !S.pistaVisible;
    $('pista').hidden = !S.pistaVisible;
    $('btn-pista').textContent = S.pistaVisible ? '🙈 Ocultar pista' : '💡 Ver pista';
  }

  function pintarSolucion() {
    $('sol-oculta').hidden = S.solucionVisible;
    $('sol-cont').hidden = !S.solucionVisible;
    $('btn-solucion').textContent = S.solucionVisible ? '🙈 Ocultar solución' : '👁 Ver solución';
    $('btn-solucion').setAttribute('aria-expanded', String(S.solucionVisible));
    if (S.solucionVisible) { S.solEditor.refresh(); S.solEditor.scrollTo(0, 0); }
  }

  function alternarSolucion() {
    S.solucionVisible = !S.solucionVisible;
    pintarSolucion();
  }

  // ---------------------------------------------------------------- ejercicio actual
  function cargarEjercicio(id) {
    const item = S.porId.get(id);
    if (!item) return;
    guardarBorrador();
    S.actual = item;
    S.solucionVisible = false;
    const borrador = S.progreso.borradores[id];
    S.cargando = true;
    limpiarLineaError();
    S.editor.setValue(typeof borrador === 'string' ? borrador : item.ej.inicial);
    S.editor.clearHistory();
    S.editor.setCursor(S.editor.lineCount(), 0);
    S.solEditor.setValue(item.ej.solucion.replace(/\n$/, ''));
    S.cargando = false;
    S.temaAbierto = item.tema.id;
    S.gruposAbiertos.add(item.nivel.id);
    pintarEnunciado();
    pintarSolucion();
    mostrarVacio();
    actualizarMenu();
    S.progreso.ultimo = id;
    enviar({ ultimo: id });
    S.editor.focus();
  }

  function siguiente() { if (S.actual && S.actual.indice < S.lista.length - 1) cargarEjercicio(S.lista[S.actual.indice + 1].id); }
  function anterior() { if (S.actual && S.actual.indice > 0) cargarEjercicio(S.lista[S.actual.indice - 1].id); }

  // botones con doble pulsación para confirmar (sin ventanas emergentes)
  function confirmar(boton, textoConfirmar, accion) {
    if (boton.dataset.confirmando === '1') {
      clearTimeout(boton._t);
      boton.dataset.confirmando = '';
      boton.innerHTML = boton._original;
      boton.classList.remove('confirmar');
      accion();
      return;
    }
    boton.dataset.confirmando = '1';
    boton._original = boton.innerHTML;
    boton.textContent = textoConfirmar;
    boton.classList.add('confirmar');
    boton._t = setTimeout(() => {
      boton.dataset.confirmando = '';
      boton.innerHTML = boton._original;
      boton.classList.remove('confirmar');
    }, 3500);
  }

  function reiniciarCodigo() {
    S.cargando = true;
    S.editor.setValue(S.actual.ej.inicial);
    S.editor.clearHistory();
    S.cargando = false;
    limpiarLineaError();
    guardarBorrador();
    mostrarVacio();
    S.editor.focus();
  }

  // ---------------------------------------------------------------- resultado
  function cuerpo() {
    const c = $('res-cuerpo');
    c.textContent = '';
    c.scrollTop = 0;
    return c;
  }

  function mostrarVacio() {
    const c = cuerpo();
    c.append(el('div', 'res-vacio', 'Pulsa «▶ Ejecutar» para ver lo que hace tu código, o «✔ Verificar código» para comprobar si es la solución correcta.'));
    $('res-estado').textContent = '';
  }

  function banner(c, clase, texto, boton) {
    const b = el('div', 'banner ' + clase);
    b.append(el('span', 'grande', texto));
    if (boton) {
      const bt = el('button', null, boton.texto);
      bt.type = 'button';
      bt.addEventListener('click', boton.accion);
      b.append(bt);
    }
    c.append(b);
    return b;
  }

  function pintarFallo(r) {
    const c = cuerpo();
    $('res-estado').textContent = '';
    if (r.fallo === 'sin_python') {
      banner(c, 'mal', '⚠ No encuentro Python en este ordenador.');
      c.append(el('p', null, 'AprendePython usa el Python que tengas instalado. Instala Python 3 desde python.org (marca la casilla «Add python.exe to PATH» durante la instalación), cierra y vuelve a abrir AprendePython.'));
    } else if (r.fallo === 'timeout') {
      banner(c, 'aviso', '⏱ Tu programa tardó más de ' + r.segundos + ' segundos y se detuvo.');
      c.append(el('p', null, '¿Hay un bucle que no termina (por ejemplo un «while True» sin salida)? Revisa la condición del bucle.'));
    } else {
      banner(c, 'mal', '⚠ El programa terminó de forma inesperada.');
      if (r.detalle) c.append(el('pre', 'salida err', r.detalle));
      c.append(el('p', null, 'Si usaste exit(), quit() o algo parecido, quítalo y vuelve a probar.'));
    }
  }

  function añadirError(c, err) {
    c.append(el('div', 'err-titulo', '✘ ' + err.tipo + (err.linea ? ' en la línea ' + err.linea : '')));
    c.append(el('div', 'explica', window.Texto.explicarError(err.tipo, err.mensaje)));
    const traza = el('div', 'traza');
    if (err.marcos && err.marcos.length) {
      err.marcos.forEach((m) => traza.append(el('div', null, 'línea ' + m.linea + (m.en && m.en !== '<module>' ? ' (en ' + m.en + ')' : '') + ':  ' + m.texto)));
    } else if (err.texto) {
      traza.append(el('div', null, 'línea ' + err.linea + ':  ' + err.texto.trim()));
    }
    if (traza.childNodes.length) c.append(traza);
    c.append(el('pre', 'salida err', err.tipo + ': ' + err.mensaje));
  }

  function añadirSalida(c, r, conAviso) {
    if (r.salida) {
      c.append(el('div', 'sub', 'Lo que imprime tu programa'));
      c.append(el('pre', 'salida', r.salida + (r.cortada ? '\n… (salida recortada)' : '')));
    } else if (conAviso && !r.error) {
      c.append(el('div', 'sin-salida', 'Tu código se ejecutó sin errores, pero no imprimió nada. (Con print() puedes ver valores en pantalla.)'));
    }
    if (r.errores) {
      c.append(el('div', 'sub', 'Mensajes de Python (stderr)'));
      c.append(el('pre', 'salida err', r.errores));
    }
  }

  function pintarEjecucion(r) {
    if (r.fallo) { pintarFallo(r); return; }
    const c = cuerpo();
    $('res-estado').textContent = 'Ejecutado en ' + r.ms + ' ms';
    if (r.error) {
      banner(c, 'mal', 'Tu código tiene un error');
      añadirError(c, r.error);
      marcarLineaError(r.error.linea);
      añadirSalida(c, r, false);
      return;
    }
    banner(c, 'bien', '✔ Tu código se ejecutó sin errores');
    añadirSalida(c, r, true);
  }

  function detallePrueba(p) {
    const d = el('div', 'detalle');
    if (p.error) {
      d.append(el('div', null, 'Al comprobarlo, tu código dio un error (' + p.error.tipo + (p.error.linea ? ' en la línea ' + p.error.linea : '') + '). ' + window.Texto.explicarError(p.error.tipo, p.error.mensaje)));
      d.append(el('pre', null, p.error.tipo + ': ' + p.error.mensaje));
      return d;
    }
    if (p.tipo === 'salida') {
      d.append(el('div', null, 'Debería imprimir:'));
      d.append(el('pre', null, p.esperado || '(nada)'));
      d.append(el('div', null, 'Tu programa imprime:'));
      d.append(el('pre', null, p.obtenido || '(nada)'));
      return d;
    }
    if (p.tipo === 'requisito') return null;
    if (p.esperado !== undefined && p.obtenido !== undefined) {
      d.append(el('div', null, 'Esperaba ' + p.esperado + ', pero tu código dio ' + p.obtenido + '.'));
      return d;
    }
    if (p.obtenido !== undefined) { d.append(el('div', null, 'Tu código: ' + p.obtenido + '.')); return d; }
    return null;
  }

  function pintarVerificacion(r, correcto) {
    if (r.fallo) { pintarFallo(r); return; }
    const c = cuerpo();
    $('res-estado').textContent = 'Verificado en ' + r.ms + ' ms';
    if (r.error) {
      banner(c, 'mal', 'Tu código tiene un error y todavía no se puede verificar');
      añadirError(c, r.error);
      marcarLineaError(r.error.linea);
      añadirSalida(c, r, false);
      return;
    }
    const total = r.pruebas.length;
    const ok = r.pruebas.filter((p) => p.ok).length;
    if (correcto) {
      const ultimo = S.actual.indice === S.lista.length - 1;
      banner(c, 'bien', ultimo ? '🎉 ¡Correcto! Has completado todos los ejercicios.' : '🎉 ¡Correcto! Has superado ' + total + (total === 1 ? ' prueba.' : ' pruebas.'),
        ultimo ? null : { texto: 'Siguiente ejercicio →', accion: siguiente });
    } else {
      banner(c, 'mal', 'Todavía no es correcto: ' + ok + ' de ' + total + (total === 1 ? ' prueba superada' : ' pruebas superadas'));
    }
    const ul = el('ul', 'pruebas');
    r.pruebas.forEach((p) => {
      const li = el('li', 'prueba ' + (p.ok ? 'ok' : 'fallo'));
      li.append(el('span', 'marca-p', p.ok ? '✔' : '✘'));
      const cont = el('div');
      cont.append(el('div', 'titulo-p', p.titulo));
      if (!p.ok) { const d = detallePrueba(p); if (d) cont.append(d); }
      li.append(cont);
      ul.append(li);
    });
    c.append(ul);
    añadirSalida(c, r, false);
  }

  function ocupado(si, texto) {
    S.ocupado = si;
    ['btn-ejecutar', 'btn-verificar'].forEach((id) => { $(id).disabled = si; });
    if (si) $('res-estado').textContent = texto;
  }

  async function ejecutar() {
    if (S.ocupado || !S.actual) return;
    guardarBorrador();
    ocupado(true, 'Ejecutando…');
    limpiarLineaError();
    let r;
    try { r = await api.ejecutar(S.editor.getValue()); } catch (e) { r = { fallo: 'sin_resultado', detalle: String(e) }; }
    ocupado(false);
    if (typeof r.error === 'string') r = { fallo: 'sin_resultado', detalle: r.error };
    S.ultimoResultado = r;
    pintarEjecucion(r);
  }

  async function verificar() {
    if (S.ocupado || !S.actual) return;
    guardarBorrador();
    const id = S.actual.id;
    ocupado(true, 'Verificando…');
    limpiarLineaError();
    let r;
    try { r = await api.verificar(id, S.editor.getValue()); } catch (e) { r = { fallo: 'sin_resultado', detalle: String(e) }; }
    ocupado(false);
    if (typeof r.error === 'string') r = { fallo: 'sin_resultado', detalle: r.error };
    S.ultimoResultado = r;
    const correcto = !r.fallo && !r.error && Array.isArray(r.pruebas) && r.pruebas.length > 0 && r.pruebas.every((p) => p.ok);
    if (S.actual && S.actual.id === id) pintarVerificacion(r, correcto);
    if (correcto && !resuelto(id)) {
      S.progreso.completados[id] = true;
      enviar({ completado: id });
      actualizarMenu();
      actualizarProgreso();
    }
  }

  // ---------------------------------------------------------------- Python y ajustes
  function pintarPython() {
    const b = $('python-estado');
    if (S.python.ok) {
      b.textContent = '🐍 Python ' + S.python.version;
      b.className = 'chip ok';
    } else {
      b.textContent = '⚠ Python no encontrado (pulsa para buscar de nuevo)';
      b.className = 'chip mal';
    }
    $('btn-ejecutar').title = S.python.ok ? $('btn-ejecutar').title : 'Necesitas tener Python instalado';
  }

  function aplicarAjustes() {
    document.documentElement.style.setProperty('--fs-codigo', S.ajustes.fuente + 'px');
    $('panel-solucion').style.flex = '0 0 ' + (S.ajustes.solucionFrac * 100) + '%';
    $('resultado').style.flex = '0 1 ' + S.ajustes.resultadoAlto + 'px';
    aplicarAltoEnunciado();
    if (S.editor) { S.editor.refresh(); S.solEditor.refresh(); }
  }

  function aplicarAltoEnunciado() {
    const e = $('enunciado');
    e.style.flex = S.ajustes.enunciadoAlto ? '0 0 ' + S.ajustes.enunciadoAlto + 'px' : '';
    e.style.maxHeight = S.ajustes.enunciadoAlto ? 'none' : '';
  }

  function cambiarLetra(delta) {
    S.ajustes.fuente = Math.max(11, Math.min(28, S.ajustes.fuente + delta));
    aplicarAjustes();
    api.ajustes({ fuente: S.ajustes.fuente });
  }

  // ---------------------------------------------------------------- separadores arrastrables
  function arrastrable(sep, alMover, alSoltar) {
    sep.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sep.setPointerCapture(e.pointerId);
      sep.classList.add('arrastrando');
      document.body.style.userSelect = 'none';
      const mover = (ev) => alMover(ev);
      const soltar = () => {
        sep.classList.remove('arrastrando');
        document.body.style.userSelect = '';
        sep.removeEventListener('pointermove', mover);
        sep.removeEventListener('pointerup', soltar);
        sep.removeEventListener('pointercancel', soltar);
        alSoltar();
      };
      sep.addEventListener('pointermove', mover);
      sep.addEventListener('pointerup', soltar);
      sep.addEventListener('pointercancel', soltar);
    });
  }

  function conectarSeparadores() {
    arrastrable($('sep-e'), (ev) => {
      const r = $('principal').getBoundingClientRect();
      const arriba = $('enunciado').getBoundingClientRect().top;
      S.ajustes.enunciadoAlto = Math.round(Math.max(70, Math.min(r.height * 0.7, ev.clientY - arriba - 5)));
      aplicarAltoEnunciado();
    }, () => api.ajustes({ enunciadoAlto: S.ajustes.enunciadoAlto }));
    $('sep-e').addEventListener('dblclick', () => {
      S.ajustes.enunciadoAlto = 0;
      aplicarAltoEnunciado();
      api.ajustes({ enunciadoAlto: 0 });
    });
    arrastrable($('sep-v'), (ev) => {
      const r = $('paneles').getBoundingClientRect();
      const frac = (r.right - ev.clientX - 5) / (r.width - 10);
      S.ajustes.solucionFrac = Math.max(0.2, Math.min(0.8, frac));
      $('panel-solucion').style.flex = '0 0 ' + (S.ajustes.solucionFrac * 100) + '%';
    }, () => api.ajustes({ solucionFrac: S.ajustes.solucionFrac }));
    arrastrable($('sep-h'), (ev) => {
      const r = $('principal').getBoundingClientRect();
      const alto = Math.max(80, Math.min(r.height * 0.7, r.bottom - 10 - ev.clientY - 5));
      S.ajustes.resultadoAlto = Math.round(alto);
      $('resultado').style.flex = '0 1 ' + S.ajustes.resultadoAlto + 'px';
    }, () => api.ajustes({ resultadoAlto: S.ajustes.resultadoAlto }));
  }

  // ---------------------------------------------------------------- eventos
  function conectarEventos() {
    $('btn-ejecutar').addEventListener('click', ejecutar);
    $('btn-verificar').addEventListener('click', verificar);
    $('btn-reiniciar').addEventListener('click', (e) => confirmar(e.currentTarget, '¿Seguro? Pulsa otra vez', reiniciarCodigo));
    $('btn-solucion').addEventListener('click', alternarSolucion);
    $('btn-pista').addEventListener('click', alternarPista);
    $('btn-anterior').addEventListener('click', anterior);
    $('btn-siguiente').addEventListener('click', siguiente);
    $('btn-letra-menos').addEventListener('click', () => cambiarLetra(-1));
    $('btn-letra-mas').addEventListener('click', () => cambiarLetra(1));
    $('btn-guardar').addEventListener('click', guardar);
    $('btn-cero').addEventListener('click', (e) => confirmar(e.currentTarget, '¿Seguro? Borra todo: pulsa otra vez', empezarDeCero));
    $('python-estado').addEventListener('click', async () => {
      $('python-estado').textContent = 'Buscando Python…';
      S.python = await api.detectarPython();
      pintarPython();
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) verificar(); else ejecutar();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        guardar();
      }
    }, true);
    window.addEventListener('beforeunload', guardarBorrador);
    conectarSeparadores();
  }

  // ---------------------------------------------------------------- arranque
  async function init() {
    const datos = await api.init();
    S.catalogo = datos.catalogo;
    S.progreso = datos.progreso;
    S.sucio = !!datos.sucio;
    S.ajustes = datos.ajustes;
    S.python = datos.python;
    construirLista();
    crearEditores();
    aplicarAjustes();
    pintarPython();
    pintarMenu();
    conectarEventos();
    actualizarProgreso();
    pintarGuardado();
    const primero = S.lista.find((x) => !resuelto(x.id)) || S.lista[0];
    const inicial = S.porId.get(S.progreso.ultimo) || primero;
    cargarEjercicio(inicial.id);
    actualizarProgreso();
    document.body.dataset.listo = '1';
  }

  window.__ap = {
    S, cargarEjercicio, ejecutar, verificar, siguiente, anterior, alternarSolucion, alternarPista, cambiarLetra, guardar, empezarDeCero,
    setCodigo: (t) => S.editor.setValue(t),
    getCodigo: () => S.editor.getValue(),
  };

  init().catch((e) => {
    document.body.textContent = 'Error al arrancar AprendePython: ' + (e && e.message ? e.message : e);
  });
})();
