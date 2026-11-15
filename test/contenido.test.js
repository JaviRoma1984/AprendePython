'use strict';
/* Comprueba el contenido: cada ejercicio debe estar bien formado, su solución debe pasar todas sus pruebas y el
 * código inicial NO debe pasarlas (si no, el ejercicio ya estaría «resuelto» sin hacer nada). Usa el Python real. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Catalogo = require('../src/shared/catalogo');
const Python = require('../src/engine/python');

const RUNNER = path.join(__dirname, '..', 'src', 'engine', 'runner.py');

function opciones(e, codigo) {
  return { codigo, verificar: true, pruebas: e.pruebas, exige: e.exige, prohibe: e.prohibe, runner: RUNNER, timeoutMs: 15000 };
}

function correcto(res) {
  return !res.fallo && !res.error && res.pruebas.length > 0 && res.pruebas.every((p) => p.ok);
}

test('el catálogo está bien formado', () => {
  assert.deepStrictEqual(Catalogo.validar(), []);
});

test('los niveles y temas son los pedidos', () => {
  const c = Catalogo.cargar();
  assert.deepStrictEqual(c.niveles.map((n) => n.titulo), ['Python básico', 'Python avanzado']);
  assert.deepStrictEqual(c.niveles[0].temas.map((t) => t.titulo),
    ['Tipos de datos', 'Funciones', 'Métodos de listas', 'Operaciones aritméticas', 'Tipos de conversiones', 'print y booleanos']);
  assert.deepStrictEqual(c.niveles[1].temas.map((t) => t.titulo),
    ['Argumentos variables', 'Argumentos clave:valor', 'Argumentos posicionales', 'Diccionarios', 'OOP - Atributos', 'OOP - Clases',
      'OOP - Constructores', 'OOP - Métodos', 'Sets', 'Tuplas']);
});

test('cada tema tiene al menos 5 ejercicios', () => {
  Catalogo.cargar().niveles.forEach((n) => n.temas.forEach((t) => assert.ok(t.ejercicios.length >= 5, t.id + ' tiene ' + t.ejercicios.length)));
});

test('la interfaz no recibe las pruebas', () => {
  const ui = JSON.stringify(Catalogo.paraInterfaz());
  assert.ok(!ui.includes('"pruebas"') && !ui.includes('"exige"'));
});

test('hay Python 3 disponible', async () => {
  const py = await Python.detectar(true);
  assert.ok(py.ok, 'No se encontró Python 3.8 o superior');
});

Catalogo.ejercicios().forEach(({ tema, ejercicio: e }) => {
  test(tema.id + ' · ' + e.id + ': la solución pasa todas las pruebas', async () => {
    const res = await Python.ejecutar(opciones(e, e.solucion));
    const fallos = (res.pruebas || []).filter((p) => !p.ok).map((p) => p.titulo + ' → ' + JSON.stringify(p.obtenido || p.error));
    assert.ok(correcto(res), 'La solución no pasa: ' + JSON.stringify(res.error || res.fallo || fallos));
  });
  test(tema.id + ' · ' + e.id + ': el código inicial NO lo resuelve', async () => {
    const res = await Python.ejecutar(opciones(e, e.inicial));
    assert.ok(!correcto(res), 'El código inicial ya pasa todas las pruebas');
  });
});
