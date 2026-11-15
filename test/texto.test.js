'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/shared/texto');

test('markdown: párrafos, código en línea y negrita, con el HTML escapado', () => {
  const h = T.markdown('Hola **mundo** con `a < b` y <script>.');
  assert.match(h, /<p>Hola <strong>mundo<\/strong> con <code>a &lt; b<\/code> y &lt;script&gt;\.<\/p>/);
});

test('markdown: bloques de código con el lenguaje y resaltado opcional', () => {
  const md = 'Antes\n\n```python\nx = 1\n```\n\nDespués';
  assert.match(T.markdown(md), /<pre class="bloque-codigo"><code>x = 1<\/code><\/pre>/);
  assert.match(T.markdown(md, (c) => '[' + c + ']'), /<code>\[x = 1\]<\/code>/);
  assert.match(T.markdown('```\nsalida\n```', () => 'NO'), /<code>salida<\/code>/, 'sin lenguaje no se resalta');
});

test('markdown: listas, citas y tablas (con barra escapada)', () => {
  assert.match(T.markdown('- uno\n- dos'), /<ul><li>uno<\/li><li>dos<\/li><\/ul>/);
  assert.match(T.markdown('1. a\n2. b'), /<ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(T.markdown('> ojo'), /<div class="nota">ojo<\/div>/);
  const t = T.markdown('| op | uso |\n| --- | --- |\n| unión | `a \\| b` |');
  assert.match(t, /<th>op<\/th><th>uso<\/th>/);
  assert.match(t, /<td><code>a \| b<\/code><\/td>/);
});

test('explicarError: errores frecuentes en español', () => {
  assert.match(T.explicarError('NameError', "name 'x' is not defined"), /«x»/);
  assert.match(T.explicarError('ZeroDivisionError', 'division by zero'), /cero/);
  assert.match(T.explicarError('SyntaxError', "expected ':'"), /dos puntos/);
  assert.match(T.explicarError('IndentationError', "expected an indented block after 'if' statement on line 1"), /sangría/);
  assert.match(T.explicarError('TypeError', "can only concatenate str (not \"int\") to str"), /str\(\)/);
  assert.ok(T.explicarError('CosaRara', '').length > 10);
});
