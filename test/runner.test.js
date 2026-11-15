'use strict';
/* Pruebas del ejecutor de Python: errores, tiempo máximo, salida, input() y tipos estrictos. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Python = require('../src/engine/python');

const RUNNER = path.join(__dirname, '..', 'src', 'engine', 'runner.py');
const ejecutar = (codigo, extra) => Python.ejecutar(Object.assign({ codigo, runner: RUNNER, timeoutMs: 8000 }, extra));

test('ejecuta y captura la salida (con tildes y emojis)', async () => {
  const r = await ejecutar('print("¡Hola, ñandú! 🐍")');
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.salida, '¡Hola, ñandú! 🐍\n');
});

test('error de sintaxis: línea y mensaje', async () => {
  const r = await ejecutar('x = 1\nif x == 1\n    print(x)\n');
  assert.strictEqual(r.error.tipo, 'SyntaxError');
  assert.strictEqual(r.error.linea, 2);
  assert.match(r.error.mensaje, /expected ':'/);
});

test('error de ejecución: tipo, línea y traza solo de tu código', async () => {
  const r = await ejecutar('def f(a):\n    return 10 / a\n\nprint("antes")\nf(0)\n');
  assert.strictEqual(r.error.tipo, 'ZeroDivisionError');
  assert.strictEqual(r.error.linea, 2);
  assert.deepStrictEqual(r.error.marcos.map((m) => m.linea), [5, 2]);
  assert.strictEqual(r.salida, 'antes\n');
});

test('input() no se queda esperando', async () => {
  const r = await ejecutar('nombre = input("¿Cómo te llamas? ")');
  assert.strictEqual(r.error.tipo, 'EOFError');
});

test('un bucle infinito se corta con aviso de tiempo', async () => {
  const t0 = Date.now();
  const r = await ejecutar('while True:\n    pass\n', { timeoutMs: 1500 });
  assert.strictEqual(r.fallo, 'timeout');
  assert.ok(Date.now() - t0 < 6000);
});

test('una salida enorme se recorta', async () => {
  const r = await ejecutar('for i in range(100000):\n    print("x" * 50)\n');
  assert.strictEqual(r.cortada, true);
  assert.ok(r.salida.length <= 20000);
});

test('sys.exit() no es un error', async () => {
  const r = await ejecutar('print("a")\nimport sys\nsys.exit(0)\nprint("b")');
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.salida, 'a\n');
});

test('verificar: tipos estrictos (30 no es "30"), tolerancia con decimales y modo laxo', async () => {
  const pruebas = [
    { expr: 'a', igual: '30' },
    { expr: 'b', igual: '0.3' },
    { expr: 'c', igual: '5.0', laxo: true },
    { expr: 'c', igual: '5.0' },
  ];
  const r = await ejecutar('a = "30"\nb = 0.1 + 0.2\nc = 5\n', { verificar: true, pruebas });
  assert.deepStrictEqual(r.pruebas.map((p) => p.ok), [false, true, true, false]);
  assert.match(r.pruebas[0].esperado, /30.*int/);
  assert.match(r.pruebas[0].obtenido, /'30'.*str/);
});

test('verificar: la salida se compara sin fijarse en espacios finales', async () => {
  const r = await ejecutar('print("a  ")\nprint("b")\nprint()\n', { verificar: true, pruebas: [{ salida: 'a\nb' }] });
  assert.strictEqual(r.pruebas[0].ok, true);
});

test('verificar: lanza, tipo, cierto y errores del código dentro de una prueba', async () => {
  const pruebas = [
    { expr: 'f(1)', lanza: 'TypeError' },
    { expr: 'f()', lanza: 'ValueError' },
    { expr: 'x', tipo: 'list' },
    { cierto: 'len(x) == 2' },
    { expr: 'g()', igual: '1' },
    { expr: 'noexiste', igual: '1' },
  ];
  const r = await ejecutar('def f(a, /):\n    return a\ndef g():\n    return 1 / 0\nx = [1, 2]\n', { verificar: true, pruebas });
  assert.deepStrictEqual(r.pruebas.map((p) => p.ok), [false, false, true, true, false, false]);
  assert.strictEqual(r.pruebas[4].error.tipo, 'ZeroDivisionError');
  assert.strictEqual(r.pruebas[5].error.tipo, 'NameError');
});

test('verificar: exige y prohibe miran el código sin comentarios ni textos', async () => {
  const codigo = 'x = [1]\n# x.append(2)\ntexto = "x.append(3)"\n';
  const r = await ejecutar(codigo, {
    verificar: true, pruebas: [{ cierto: 'True' }],
    exige: [{ patron: '\\.\\s*append\\s*\\(', mensaje: 'usa append' }],
    prohibe: [{ patron: '\\bmax\\s*\\(', mensaje: 'sin max' }],
  });
  const req = r.pruebas.filter((p) => p.tipo === 'requisito');
  assert.deepStrictEqual(req.map((p) => p.ok), [false, true], 'append solo aparece en un comentario y un texto');
});

test('verificar no ejecuta las pruebas si el código tiene un error', async () => {
  const r = await ejecutar('x = (', { verificar: true, pruebas: [{ cierto: 'True' }] });
  assert.ok(r.error);
  assert.deepStrictEqual(r.pruebas, []);
});
