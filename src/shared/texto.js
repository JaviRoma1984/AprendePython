'use strict';
/* Textos de la interfaz: markdown sencillo para los enunciados y explicaciones de errores de Python en español.
 * Funciona en el navegador (window.Texto) y en Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Texto = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Texto en línea: `código` y **negrita**. */
  function enLinea(s) {
    return String(s).split(/(`[^`]+`)/).map((t) => {
      if (/^`[^`]+`$/.test(t)) return '<code>' + esc(t.slice(1, -1)) + '</code>';
      return esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }).join('');
  }

  function celdas(linea) {
    // separa por «|» sin cortar los «\|» (barra escapada)
    const t = linea.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  }

  /**
   * Convierte el markdown de un enunciado en HTML. Admite: párrafos, listas (- y 1.), citas (> ),
   * bloques de código (```), tablas sencillas, `código` y **negrita**.
   * resaltar(codigo, lenguaje) puede devolver HTML con el código coloreado.
   */
  function markdown(src, resaltar) {
    const lineas = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let i = 0;
    while (i < lineas.length) {
      const ln = lineas[i];
      let m;
      if (ln.trim() === '') { i++; continue; }
      if ((m = /^```(\w*)\s*$/.exec(ln))) {
        const cuerpo = [];
        i++;
        while (i < lineas.length && !/^```\s*$/.test(lineas[i])) { cuerpo.push(lineas[i]); i++; }
        i++; // cierre
        const codigo = cuerpo.join('\n');
        const dentro = resaltar && m[1] ? resaltar(codigo, m[1]) : esc(codigo);
        html.push('<pre class="bloque-codigo"><code>' + dentro + '</code></pre>');
        continue;
      }
      if (/^\|.*\|\s*$/.test(ln) && i + 1 < lineas.length && /^\|?\s*:?-{3,}/.test(lineas[i + 1])) {
        const cab = celdas(ln);
        i += 2;
        const filas = [];
        while (i < lineas.length && /^\|.*\|\s*$/.test(lineas[i])) { filas.push(celdas(lineas[i])); i++; }
        html.push('<table><thead><tr>' + cab.map((c) => '<th>' + enLinea(c) + '</th>').join('') + '</tr></thead><tbody>'
          + filas.map((f) => '<tr>' + f.map((c) => '<td>' + enLinea(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
        continue;
      }
      if (/^- /.test(ln)) {
        const items = [];
        while (i < lineas.length && /^- /.test(lineas[i])) { items.push(lineas[i].slice(2)); i++; }
        html.push('<ul>' + items.map((t) => '<li>' + enLinea(t) + '</li>').join('') + '</ul>');
        continue;
      }
      if (/^\d+\. /.test(ln)) {
        const items = [];
        while (i < lineas.length && /^\d+\. /.test(lineas[i])) { items.push(lineas[i].replace(/^\d+\. /, '')); i++; }
        html.push('<ol>' + items.map((t) => '<li>' + enLinea(t) + '</li>').join('') + '</ol>');
        continue;
      }
      if (/^> ?/.test(ln)) {
        const cita = [];
        while (i < lineas.length && /^> ?/.test(lineas[i])) { cita.push(lineas[i].replace(/^> ?/, '')); i++; }
        html.push('<div class="nota">' + enLinea(cita.join(' ')) + '</div>');
        continue;
      }
      const parrafo = [];
      while (i < lineas.length && lineas[i].trim() !== '' && !/^(```|- |\d+\. |> )/.test(lineas[i]) && !/^\|.*\|\s*$/.test(lineas[i])) { parrafo.push(lineas[i]); i++; }
      html.push('<p>' + enLinea(parrafo.join(' ')) + '</p>');
    }
    return html.join('\n');
  }

  /** Explica en español, con palabras sencillas, un error de Python. */
  function explicarError(tipo, mensaje) {
    const msg = String(mensaje || '');
    let m;
    switch (tipo) {
      case 'SyntaxError':
        if (/expected ':'/.test(msg)) return 'Falta el signo «:» (dos puntos) al final de esa línea.';
        if (/unterminated string literal/.test(msg)) return 'Hay un texto sin cerrar: falta una comilla de cierre.';
        if (/was never closed/.test(msg)) return 'Hay un paréntesis, corchete o llave que se abre y nunca se cierra.';
        if (/unmatched/.test(msg)) return 'Sobra un paréntesis, corchete o llave de cierre.';
        if (/invalid syntax/.test(msg) && /perhaps you forgot a comma/i.test(msg)) return 'Puede que falte una coma entre dos valores.';
        if (/cannot assign to|cannot assign/.test(msg)) return 'A la izquierda del «=» debe ir el nombre de una variable.';
        if (/expected '='|invalid syntax. Maybe you meant '=='/.test(msg)) return 'Para comparar se usa «==»; un solo «=» sirve para guardar un valor.';
        return 'Python no entiende cómo está escrita esa línea (error de sintaxis). Revisa comillas, paréntesis y los dos puntos.';
      case 'IndentationError':
        if (/expected an indented block/.test(msg)) return 'Después de los dos puntos, la línea siguiente debe llevar sangría (4 espacios al principio).';
        if (/unexpected indent/.test(msg)) return 'Esa línea tiene espacios de más al principio.';
        return 'La sangría (los espacios al principio de la línea) no es correcta. Usa 4 espacios y mantén el mismo nivel dentro de un bloque.';
      case 'TabError':
        return 'Estás mezclando tabuladores y espacios. Usa solo espacios.';
      case 'NameError':
        if ((m = /name '([^']+)' is not defined/.exec(msg))) return 'Python no conoce «' + m[1] + '». ¿Está bien escrito (mayúsculas incluidas)? ¿Lo has creado antes de usarlo? Si es un texto, necesita comillas.';
        return 'Estás usando un nombre que no existe todavía.';
      case 'UnboundLocalError':
        return 'Estás usando una variable dentro de una función antes de darle un valor.';
      case 'TypeError':
        if ((m = /unsupported operand type\(s\) for ([^:]+): '([^']+)' and '([^']+)'/.exec(msg))) return 'No se puede hacer «' + m[1] + '» entre un «' + m[2] + '» y un «' + m[3] + '». Quizá necesites convertir uno con int(), float() o str().';
        if (/can only concatenate str/.test(msg)) return 'No se puede unir un texto con un número con «+». Convierte el número con str().';
        if (/can't multiply sequence/.test(msg)) return 'Un texto o una lista solo se puede multiplicar por un número entero.';
        if (/object is not callable/.test(msg)) return 'Estás usando paréntesis sobre algo que no es una función. ¿Has pisado el nombre de una función con una variable?';
        if (/takes \d+ positional arguments? but \d+ (was|were) given|missing \d+ required positional argument|takes from \d+ to \d+ positional arguments/.test(msg)) return 'Has llamado a la función con un número de argumentos distinto del que espera.';
        if (/unexpected keyword argument/.test(msg)) return 'Has usado un nombre de argumento que esa función no tiene.';
        if (/not subscriptable/.test(msg)) return 'Estás usando corchetes sobre algo que no es una lista, tupla o diccionario.';
        if (/does not support item assignment/.test(msg)) return 'Ese tipo de dato no se puede modificar por posición (las tuplas y los textos son inmutables).';
        if (/object is not iterable/.test(msg)) return 'Estás intentando recorrer algo que no se puede recorrer (por ejemplo, un número).';
        return 'Estás usando un valor de un tipo que no corresponde a esa operación.';
      case 'ValueError':
        if (/invalid literal for int\(\)/.test(msg)) return 'Ese texto no se puede convertir en un número entero con int().';
        if (/could not convert string to float/.test(msg)) return 'Ese texto no se puede convertir en número decimal con float().';
        if (/not enough values to unpack|too many values to unpack/.test(msg)) return 'Hay un número de variables distinto al de valores que intentas repartir.';
        if (/not in list/.test(msg)) return 'Ese valor no está en la lista.';
        return 'El valor tiene el tipo correcto pero no es válido para esa operación.';
      case 'ZeroDivisionError':
        return 'No se puede dividir entre cero.';
      case 'IndexError':
        return 'Te has pasado de la posición: la lista (o tupla o texto) no tiene tantos elementos. Recuerda que se empieza a contar en 0.';
      case 'KeyError':
        return 'Esa clave no existe en el diccionario. Con .get() no daría error.';
      case 'AttributeError':
        if ((m = /'([^']+)' object has no attribute '([^']+)'/.exec(msg))) return 'Un objeto «' + m[1] + '» no tiene el atributo o método «' + m[2] + '». ¿Está bien escrito?';
        if ((m = /type object '([^']+)' has no attribute '([^']+)'/.exec(msg))) return 'La clase «' + m[1] + '» no tiene el atributo «' + m[2] + '».';
        return 'Ese objeto no tiene ese atributo o método.';
      case 'ModuleNotFoundError':
      case 'ImportError':
        return 'No se encuentra ese módulo. Los ejercicios solo usan lo que Python trae de serie.';
      case 'RecursionError':
        return 'Una función se llama a sí misma sin parar. Falta un caso en el que termine.';
      case 'EOFError':
        return 'input() no está disponible aquí: usa variables con valores de ejemplo.';
      case 'StopIteration':
        return 'Se pidió un elemento más de un recorrido que ya había terminado.';
      case 'AssertionError':
        return 'Una comprobación con assert no se cumplió.';
      default:
        return 'Python ha detenido el programa por un error. Lee el mensaje de abajo: indica la línea donde ocurrió.';
    }
  }

  return { esc, enLinea, markdown, explicarError };
}));
