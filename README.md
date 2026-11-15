# AprendePython

Programa de escritorio (Windows) para **aprender a programar en Python practicando**: lees el ejercicio, escribes tu código, lo ejecutas con el Python real de tu ordenador y el programa te dice si es la solución correcta.

## Cómo es la pantalla

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AprendePython · 🐍 Python 3.x   ▓▓▓░░░ 14 %   💾 Guardar cambios  🔄 De cero │
├────────────────────────────────────────────────────┬──────────────────┤
│  ENUNCIADO: explicación del ejercicio (arriba)      │  TEMARIO         │
├─────────────────────────┬──────────────────────────┤  ▾ Python básico │
│  ✏️ TU CÓDIGO            │  🔑 SOLUCIÓN              │     · tema…      │
│  (escribes Python)      │  (se puede ocultar / ver) │  ▾ Python avanz. │
│  ▶ Ejecutar             │  👁 Ver solución          │     · tema…      │
│  ✔ Verificar código     │                          │                  │
├─────────────────────────┴──────────────────────────┤                  │
│  📟 RESULTADO: lo que imprime tu código, errores,    │                  │
│  y qué pruebas pasan (✔) o fallan (✘)               │                  │
└────────────────────────────────────────────────────┴──────────────────┘
```

- **Tu código** (izquierda): editor con colores, números de línea, sangría automática (4 espacios), `Tab` / `Mayús+Tab`, cierre automático de paréntesis y comillas, `Ctrl+/` para comentar.
- **Solución** (derecha): empieza **oculta**; pulsa «👁 Ver solución» para verla y «🙈 Ocultar solución» para volver a esconderla. Al cambiar de ejercicio vuelve a ocultarse.
- **▶ Ejecutar** (`Ctrl+Intro`): ejecuta tu código y enseña lo que imprime. Si hay un error, lo explica en español y marca la línea.
- **✔ Verificar código** (`Ctrl+Mayús+Intro`): comprueba tu código contra las pruebas del ejercicio y te dice si es la solución correcta, qué pruebas fallan y qué esperaba cada una. Si es correcta, el ejercicio se marca como resuelto (✓).
- **💡 Pista**, **↺ Empezar de nuevo**, **◀ ▶** para moverte entre ejercicios y **A− / A+** para el tamaño de la letra.
- Los separadores se arrastran (ancho de la solución, altura del resultado y del enunciado) y se recuerdan.

### Progreso, guardar y empezar de cero

- **Barra y porcentaje de progreso** (arriba): «14 %» y «12 de 88 resueltos». Cada tema y cada nivel del temario también muestran cuántos llevas (`3/6`).
- **💾 Guardar cambios** (`Ctrl+S`): guarda tu avance (ejercicios resueltos y el código que tienes escrito en cada ejercicio) en `%APPDATA%\AprendePython`. Al cerrar y volver a abrir el programa, te lo recuerda y vuelves al ejercicio en el que estabas.
  - Mientras haya algo sin guardar, el botón se pone **amarillo** y aparece «● Cambios sin guardar».
  - Si cierras el programa con cambios sin guardar, te pregunta: **Guardar y salir**, **Salir sin guardar** o **Cancelar**.
- **🔄 Empezar de cero**: borra **todo** tu avance (también lo guardado) y vuelve al primer ejercicio. Pide una segunda pulsación para confirmar.
- El tamaño de letra y de los paneles se guardan solos (no cuentan como «cambios»).

## Temario (88 ejercicios)

| Nivel | Tema | Ejercicios |
| --- | --- | --- |
| Python básico | Tipos de datos | 5 |
| | Funciones | 5 |
| | Métodos de listas | 6 |
| | Operaciones aritméticas | 6 |
| | Tipos de conversiones | 6 |
| | print y booleanos | 6 |
| Python avanzado | Argumentos variables (`*args`) | 5 |
| | Argumentos clave:valor (`**kwargs`) | 5 |
| | Argumentos posicionales | 5 |
| | Diccionarios | 6 |
| | OOP - Atributos | 5 |
| | OOP - Clases | 5 |
| | OOP - Constructores | 5 |
| | OOP - Métodos | 6 |
| | Sets | 6 |
| | Tuplas | 6 |

## Requisitos

- Windows 10/11.
- **Python 3.8 o superior** instalado (desde [python.org](https://www.python.org/downloads/); marca «Add python.exe to PATH»). AprendePython ejecuta tu código con ese Python; la versión que usa aparece arriba, junto al título.
- Para desarrollar: Node.js.

## Cómo se verifica un ejercicio

Cada ejercicio tiene pruebas. Tu código se ejecuta y después se comprueba:

- **Salida:** lo que imprime tu programa debe ser exactamente lo pedido (se ignoran los espacios al final de cada línea).
- **Valores:** variables, resultados de funciones, atributos de objetos… con **tipos estrictos** (`30` no es lo mismo que `"30"`, ni `True` que `1`), y tolerancia en los decimales.
- **Requisitos del enunciado:** por ejemplo «usa `append()`» o «sin usar `max()`», buscados en tu código sin contar comentarios ni textos.

El código se ejecuta con `python -I` (modo aislado), con un tiempo máximo de 6 s (un bucle infinito se corta con un aviso) y sin `input()`.

## Desarrollo

```bash
npm install
node node_modules/electron/install.js   # Electron no descarga su binario en npm install
npm start                                # abre el programa
npm test                                 # pruebas: contenido, ejecutor de Python y textos
npm run e2e                              # prueba completa con la ventana real + capturas
npm run empaquetar                       # dist\AprendePython-win32-x64\AprendePython.exe
npm run instalar                         # instala en %LOCALAPPDATA%\Programs\AprendePython + accesos directos
```

`node scripts/e2e-todo.js --exe "<ruta>\AprendePython.exe" --out <carpeta>` lanza la misma prueba sobre el programa instalado. Las pruebas usan carpetas temporales: no tocan tu progreso real.

Para desinstalar: «Aplicaciones instaladas» de Windows o `scripts\desinstalar.ps1` (con `-BorrarAjustes` también borra el progreso).

### Añadir o cambiar ejercicios

Cada tema es un archivo de texto en `src/contenido/` (los nombres de los temas y el orden están en `src/shared/catalogo.js`). Formato:

```
=== ejercicio
id: td-variables
titulo: Tu primera variable
=== enunciado
Texto con `código`, **negrita**, listas, tablas y bloques ```python … ```.
=== inicial
# código con el que empieza el editor
=== solucion
nombre = "Ana"
=== pista
Texto de ayuda (opcional).
=== prueba
expr: nombre
igual: "Ana"
=== exige
patron: \bprint\s*\(
mensaje: Usa la función print()
```

Tipos de prueba: `expr` + `igual` (con `laxo: si` para aceptar `5` por `5.0`), `expr` + `tipo`, `cierto: <expresión>`, `expr` + `lanza: TypeError`, un bloque `=== salida` (texto exacto que debe imprimir) y `antes: <código>` para preparar objetos. `npm test` comprueba que cada solución pasa todas sus pruebas y que el código inicial **no** las pasa.

## Privacidad

El programa no trae ni pide datos personales: no hay cuentas, ni conexión a internet, ni usuarios. Solo guarda tu progreso, tus borradores y el tamaño de la ventana en tu propio ordenador (`%APPDATA%\AprendePython`), y solo escribe el avance cuando pulsas «Guardar cambios».

## Fases

**Norma de trabajo:** ✅ solo cuando lo has comprobado tú mismo; 🟡 = hecho y probado por mí (pruebas automáticas), pendiente de tu OK; ⬜ = pendiente.

| Fase | Qué incluye | Estado |
| --- | --- | --- |
| F1 | Ventana: enunciado arriba, editor a la izquierda, solución (ver/ocultar) a la derecha, resultado abajo | 🟡 |
| F2 | Menú de desplegables a la derecha: Python básico / Python avanzado y sus 16 temas | 🟡 |
| F3 | Ejecutar con el Python real, errores explicados en español, aviso de bucle infinito | 🟡 |
| F4 | Botón «Verificar código» con pruebas por ejercicio (salida, valores con tipo, requisitos) | 🟡 |
| F5 | Contenido de Python básico: 6 temas, 34 ejercicios | 🟡 |
| F6 | Contenido de Python avanzado: 10 temas, 54 ejercicios | 🟡 |
| F7 | Ajustes (letra, tamaños de paneles) que se guardan solos y se recuperan al reabrir | 🟡 |
| F8 | Barra y porcentaje de progreso arriba, y recuento por tema y nivel | 🟡 |
| F9 | Botón «Guardar cambios» (y `Ctrl+S`): el avance y los borradores se recuperan al reabrir; aviso al cerrar con cambios sin guardar | 🟡 |
| F10 | Botón «Empezar de cero» (con confirmación) que borra todo el avance | 🟡 |
| F11 | Pruebas automáticas: 197 de contenido/ejecutor/textos + 113 de extremo a extremo en 5 escenarios (incluye cerrar y reabrir; también sobre el programa instalado) | 🟡 |
| F12 | Instalado en este ordenador (acceso directo en el Escritorio y en el menú Inicio) | 🟡 |
| F13 | Subido a GitHub | 🟡 |
