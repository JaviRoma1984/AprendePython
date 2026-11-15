'use strict';
/* Lee los ejercicios de src/contenido/*.txt y los organiza por nivel y tema.
 *
 * Formato de cada archivo de tema (las líneas «=== palabra» separan secciones):
 *   === tema         id / nivel / titulo / resumen          (una sola vez, al principio)
 *   === ejercicio    id / titulo                            (empieza un ejercicio nuevo)
 *   === enunciado    texto (markdown sencillo)
 *   === inicial      código con el que empieza el editor
 *   === solucion     código de la solución
 *   === pista        texto de ayuda (opcional)
 *   === prueba       una comprobación:  expr + igual | tipo   o   cierto   o   expr + lanza    (+ antes, desc, laxo)
 *   === salida       texto exacto que debe imprimir el programa
 *   === exige        patron + mensaje: el código debe contener ese patrón (expresión regular)
 *   === prohibe      patron + mensaje: el código NO debe contener ese patrón
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'contenido');

const NIVELES = [
  {
    id: 'basico',
    titulo: 'Python básico',
    temas: ['tipos-datos', 'funciones', 'metodos-listas', 'operaciones-aritmeticas', 'conversiones-tipos', 'print-booleanos'],
  },
  {
    id: 'avanzado',
    titulo: 'Python avanzado',
    temas: ['args-variables', 'args-clave-valor', 'args-posicionales', 'diccionarios', 'oop-atributos', 'oop-clases',
      'oop-constructores', 'oop-metodos', 'sets', 'tuplas'],
  },
];

const CLAVES_PRUEBA = ['expr', 'igual', 'tipo', 'cierto', 'lanza', 'antes', 'desc', 'laxo'];

function error(archivo, linea, texto) {
  return new Error(archivo + (linea ? ':' + linea : '') + ' — ' + texto);
}

function recortarBloque(lineas) {
  let a = 0;
  let b = lineas.length;
  while (a < b && lineas[a].trim() === '') a++;
  while (b > a && lineas[b - 1].trim() === '') b--;
  return lineas.slice(a, b).join('\n');
}

function parsearClaves(seccion, archivo) {
  const kv = {};
  seccion.cuerpo.forEach((ln, i) => {
    if (ln.trim() === '') return;
    const m = /^([a-z_]+):[ \t]?(.*)$/.exec(ln);
    if (!m) throw error(archivo, seccion.desde + i, 'se esperaba «clave: valor» y hay «' + ln + '»');
    kv[m[1]] = m[2].trim();
  });
  return kv;
}

/** Convierte el texto de un archivo de tema en { id, nivel, titulo, resumen, ejercicios }. */
function parsearTema(texto, archivo) {
  const lineas = String(texto).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const secciones = [];
  let actual = null;
  lineas.forEach((ln, i) => {
    const m = /^=== ([a-z]+)\s*$/.exec(ln);
    if (m) {
      actual = { tipo: m[1], desde: i + 2, cuerpo: [] };
      secciones.push(actual);
    } else if (actual) actual.cuerpo.push(ln);
    else if (ln.trim() !== '') throw error(archivo, i + 1, 'hay texto antes de la primera sección «=== tema»');
  });

  let tema = null;
  let ej = null;
  const cerrar = () => {
    if (ej) {
      if (!ej.pruebas.length) throw error(archivo, 0, 'el ejercicio «' + ej.id + '» no tiene pruebas');
      tema.ejercicios.push(ej);
      ej = null;
    }
  };
  const enEjercicio = (s) => { if (!ej) throw error(archivo, s.desde - 1, '«=== ' + s.tipo + '» debe ir dentro de un ejercicio'); };

  for (const s of secciones) {
    switch (s.tipo) {
      case 'tema': {
        const kv = parsearClaves(s, archivo);
        tema = { id: kv.id, nivel: kv.nivel, titulo: kv.titulo, resumen: kv.resumen || '', ejercicios: [] };
        break;
      }
      case 'ejercicio': {
        if (!tema) throw error(archivo, s.desde - 1, 'falta «=== tema» al principio');
        cerrar();
        const kv = parsearClaves(s, archivo);
        ej = { id: kv.id, titulo: kv.titulo, enunciado: '', inicial: '', solucion: '', pista: '', pruebas: [], exige: [], prohibe: [] };
        break;
      }
      case 'enunciado': enEjercicio(s); ej.enunciado = recortarBloque(s.cuerpo); break;
      case 'pista': enEjercicio(s); ej.pista = recortarBloque(s.cuerpo); break;
      case 'inicial': { enEjercicio(s); const t = recortarBloque(s.cuerpo); ej.inicial = t ? t + '\n' : ''; break; }
      case 'solucion': { enEjercicio(s); const t = recortarBloque(s.cuerpo); ej.solucion = t ? t + '\n' : ''; break; }
      case 'salida': enEjercicio(s); ej.pruebas.push({ salida: recortarBloque(s.cuerpo) }); break;
      case 'prueba': {
        enEjercicio(s);
        const kv = parsearClaves(s, archivo);
        Object.keys(kv).forEach((k) => { if (!CLAVES_PRUEBA.includes(k)) throw error(archivo, s.desde - 1, 'clave desconocida «' + k + '» en la prueba'); });
        if (kv.laxo !== undefined) kv.laxo = /^(si|sí|true|1)$/i.test(kv.laxo);
        ej.pruebas.push(kv);
        break;
      }
      case 'exige':
      case 'prohibe': {
        enEjercicio(s);
        const kv = parsearClaves(s, archivo);
        if (!kv.patron) throw error(archivo, s.desde - 1, 'falta «patron:»');
        const item = { patron: kv.patron, mensaje: kv.mensaje || kv.patron };
        if (kv.bruto && /^(si|sí|true|1)$/i.test(kv.bruto)) item.bruto = true;
        ej[s.tipo].push(item);
        break;
      }
      default: throw error(archivo, s.desde - 1, 'sección desconocida «=== ' + s.tipo + '»');
    }
  }
  if (!tema) throw error(archivo, 0, 'no tiene «=== tema»');
  cerrar();
  return tema;
}

let memo = null;

/** Todo el catálogo (con soluciones y pruebas). */
function cargar() {
  if (memo) return memo;
  const niveles = NIVELES.map((n) => ({
    id: n.id,
    titulo: n.titulo,
    temas: n.temas.map((idTema) => {
      const archivo = path.join(DIR, idTema + '.txt');
      const t = parsearTema(fs.readFileSync(archivo, 'utf8'), idTema + '.txt');
      return t;
    }),
  }));
  memo = { niveles };
  return memo;
}

/** Lista plana de ejercicios, cada uno con su tema y nivel. */
function ejercicios() {
  const lista = [];
  cargar().niveles.forEach((n) => n.temas.forEach((t) => t.ejercicios.forEach((e) => lista.push({ nivel: n, tema: t, ejercicio: e }))));
  return lista;
}

function buscar(id) {
  return ejercicios().find((x) => x.ejercicio.id === id) || null;
}

/** Lo que ve la interfaz: sin las pruebas ni los patrones de comprobación. */
function paraInterfaz() {
  return {
    niveles: cargar().niveles.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      temas: n.temas.map((t) => ({
        id: t.id,
        titulo: t.titulo,
        resumen: t.resumen,
        ejercicios: t.ejercicios.map((e) => ({ id: e.id, titulo: e.titulo, enunciado: e.enunciado, inicial: e.inicial, solucion: e.solucion, pista: e.pista })),
      })),
    })),
  };
}

/** Revisa el catálogo y devuelve la lista de problemas encontrados (vacía si todo está bien). */
function validar() {
  const problemas = [];
  const ids = new Set();
  cargar().niveles.forEach((n) => n.temas.forEach((t) => {
    if (!/^[a-z0-9-]+$/.test(t.id || '')) problemas.push('tema con id no válido: ' + t.id);
    if (t.nivel !== n.id) problemas.push('el tema ' + t.id + ' dice nivel «' + t.nivel + '» pero está en «' + n.id + '»');
    if (!t.titulo) problemas.push('el tema ' + t.id + ' no tiene título');
    if (!t.ejercicios.length) problemas.push('el tema ' + t.id + ' no tiene ejercicios');
    t.ejercicios.forEach((e) => {
      const d = t.id + '/' + e.id;
      if (!/^[a-z0-9-]+$/.test(e.id || '')) problemas.push('ejercicio con id no válido: ' + d);
      if (ids.has(e.id)) problemas.push('id repetido: ' + e.id);
      ids.add(e.id);
      if (!e.titulo) problemas.push(d + ': sin título');
      if (!e.enunciado) problemas.push(d + ': sin enunciado');
      if (!e.solucion) problemas.push(d + ': sin solución');
      if ((e.enunciado.match(/```/g) || []).length % 2) problemas.push(d + ': bloque ``` sin cerrar en el enunciado');
      if ((e.enunciado.replace(/```[\s\S]*?```/g, '').match(/`/g) || []).length % 2) problemas.push(d + ': comilla invertida (`) sin cerrar en el enunciado');
      e.pruebas.forEach((p, i) => {
        const tipos = ['salida', 'igual', 'cierto', 'lanza', 'tipo'].filter((k) => p[k] !== undefined);
        if (tipos.length !== 1) problemas.push(d + ': la prueba ' + (i + 1) + ' debe tener exactamente una comprobación (tiene ' + tipos.length + ')');
        if ((p.igual !== undefined || p.lanza !== undefined || p.tipo !== undefined) && !p.expr) problemas.push(d + ': la prueba ' + (i + 1) + ' necesita «expr:»');
      });
      [].concat(e.exige, e.prohibe).forEach((x) => { try { new RegExp(x.patron); } catch { problemas.push(d + ': patrón no válido ' + x.patron); } });
    });
  }));
  return problemas;
}

module.exports = { NIVELES, parsearTema, cargar, ejercicios, buscar, paraInterfaz, validar, DIR };
