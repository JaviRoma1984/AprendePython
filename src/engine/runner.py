# -*- coding: utf-8 -*-
"""Ejecuta el código de la persona que aprende y, si se pide, las pruebas del ejercicio.

Lee un JSON por la entrada estándar:
    {"codigo": str, "verificar": bool, "pruebas": [...], "exige": [...], "prohibe": [...]}
y escribe un JSON (precedido de la marca @@AP@@) por la salida estándar real.
Todo lo que imprima el código de la persona se captura y se devuelve dentro del JSON.
"""
import builtins
import io
import json
import math
import re
import sys
import time
import traceback

LIMITE_SALIDA = 20000
ARCHIVO = '<tu_codigo>'
MARCA = '@@AP@@'


class Captura(io.TextIOBase):
    """Guarda lo que se escribe (con tope, por si hay un bucle que imprime sin parar)."""

    def __init__(self):
        super().__init__()
        self.partes = []
        self.total = 0
        self.cortada = False

    def write(self, s):
        if not isinstance(s, str):
            s = str(s)
        if self.total < LIMITE_SALIDA:
            self.partes.append(s[:LIMITE_SALIDA - self.total])
        if self.total + len(s) > LIMITE_SALIDA:
            self.cortada = True
        self.total += len(s)
        return len(s)

    def flush(self):
        pass

    def isatty(self):
        return False

    @property
    def encoding(self):
        return 'utf-8'

    def valor(self):
        return ''.join(self.partes)


def _sin_input(*args, **kwargs):
    raise EOFError('input() no está disponible en AprendePython: usa variables con valores de ejemplo.')


def describir_error(e, lineas):
    info = {'tipo': type(e).__name__, 'mensaje': str(e), 'linea': None, 'texto': '', 'marcos': []}
    if isinstance(e, SyntaxError):
        info['mensaje'] = e.msg or str(e)
        info['linea'] = e.lineno
        info['texto'] = (e.text or '').rstrip('\n')
        info['columna'] = e.offset
        return info
    try:
        for fr in traceback.extract_tb(e.__traceback__):
            if fr.filename == ARCHIVO:
                texto = lineas[fr.lineno - 1].strip() if 0 < fr.lineno <= len(lineas) else ''
                info['marcos'].append({'linea': fr.lineno, 'en': fr.name, 'texto': texto})
    except Exception:
        pass
    if info['marcos']:
        info['linea'] = info['marcos'][-1]['linea']
        info['texto'] = info['marcos'][-1]['texto']
    return info


def corto(v):
    try:
        r = repr(v)
    except Exception:
        r = '<objeto sin representación>'
    return r if len(r) <= 300 else r[:300] + '…'


def nombre_tipo(v):
    return type(v).__name__


def normalizar_salida(s):
    s = s.replace('\r\n', '\n').replace('\r', '\n')
    lineas = [ln.rstrip() for ln in s.split('\n')]
    while lineas and lineas[-1] == '':
        lineas.pop()
    return '\n'.join(lineas)


def iguales(a, b, laxo):
    es_num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
    if laxo and es_num(a) and es_num(b):
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    if type(a) is not type(b):
        return False
    if isinstance(a, float):
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    try:
        return bool(a == b)
    except Exception:
        return False


def texto_limpio(codigo):
    """El código sin comentarios ni textos entre comillas (para buscar palabras clave sin falsos positivos)."""
    try:
        import tokenize
        saltar = {tokenize.STRING, tokenize.COMMENT, tokenize.NEWLINE, tokenize.NL,
                  tokenize.INDENT, tokenize.DEDENT, tokenize.ENDMARKER}
        medio = getattr(tokenize, 'FSTRING_MIDDLE', None)
        if medio is not None:
            saltar.add(medio)
        partes = []
        for tok in tokenize.generate_tokens(io.StringIO(codigo).readline):
            if tok.type not in saltar:
                partes.append(tok.string)
        return ' '.join(partes)
    except Exception:
        return codigo


def evaluar(p, ns, salida_texto, lineas):
    """Devuelve el resultado de una prueba: {ok, titulo, esperado, obtenido, error}."""
    local = dict(ns)
    r = {'ok': False, 'titulo': p.get('desc') or ''}
    try:
        if p.get('salida') is not None:
            esperada = normalizar_salida(p['salida'])
            obtenida = normalizar_salida(salida_texto)
            r['titulo'] = r['titulo'] or 'Lo que imprime tu programa'
            r['ok'] = esperada == obtenida
            r['esperado'] = esperada
            r['obtenido'] = obtenida
            r['tipo'] = 'salida'
            return r
        if p.get('antes'):
            exec(compile(p['antes'], '<prueba>', 'exec'), local)
        expr = p.get('expr')
        if 'igual' in p:
            r['titulo'] = r['titulo'] or '{} es {}'.format(expr, p['igual'])
            esperado = eval(compile(p['igual'], '<prueba>', 'eval'), local)
            obtenido = eval(compile(expr, '<prueba>', 'eval'), local)
            r['ok'] = iguales(obtenido, esperado, bool(p.get('laxo')))
            r['esperado'] = corto(esperado) + ' (' + nombre_tipo(esperado) + ')'
            r['obtenido'] = corto(obtenido) + ' (' + nombre_tipo(obtenido) + ')'
        elif 'tipo' in p:
            r['titulo'] = r['titulo'] or '{} es de tipo {}'.format(expr, p['tipo'])
            obtenido = eval(compile(expr, '<prueba>', 'eval'), local)
            r['ok'] = nombre_tipo(obtenido) == p['tipo']
            r['esperado'] = p['tipo']
            r['obtenido'] = nombre_tipo(obtenido)
        elif 'cierto' in p:
            r['titulo'] = r['titulo'] or p['cierto']
            obtenido = eval(compile(p['cierto'], '<prueba>', 'eval'), local)
            r['ok'] = bool(obtenido)
            if not r['ok']:
                r['obtenido'] = 'la condición dio ' + corto(obtenido)
        elif 'lanza' in p:
            r['titulo'] = r['titulo'] or '{} provoca un {}'.format(expr, p['lanza'])
            try:
                eval(compile(expr, '<prueba>', 'eval'), local)
                r['obtenido'] = 'no dio ningún error'
            except BaseException as e:
                clase = getattr(builtins, p['lanza'], Exception)
                r['ok'] = isinstance(e, clase)
                r['obtenido'] = 'dio un ' + type(e).__name__
            r['esperado'] = 'un ' + p['lanza']
        else:
            r['titulo'] = r['titulo'] or '(prueba sin comprobación)'
    except BaseException as e:  # el código de la persona falló al usarlo en la prueba
        r['ok'] = False
        r['error'] = describir_error(e, lineas)
    return r


def comprobar_requisitos(lista, codigo, limpio, debe_aparecer):
    res = []
    for item in lista or []:
        fuente = codigo if item.get('bruto') else limpio
        try:
            aparece = re.search(item['patron'], fuente, re.MULTILINE) is not None
        except re.error:
            aparece = False
        res.append({'ok': aparece if debe_aparecer else not aparece,
                    'titulo': item.get('mensaje') or item['patron'], 'tipo': 'requisito'})
    return res


def main():
    datos = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    codigo = datos.get('codigo', '')
    lineas = codigo.split('\n')
    res = {'error': None, 'pruebas': [], 'salida': '', 'errores': '', 'cortada': False, 'ms': 0}

    builtins.input = _sin_input
    salida, err = Captura(), Captura()
    ns = {'__name__': '__main__', '__builtins__': builtins}
    real_out, real_err = sys.stdout, sys.stderr
    t0 = time.perf_counter()
    sys.stdout, sys.stderr = salida, err
    try:
        exec(compile(codigo, ARCHIVO, 'exec'), ns)
    except SystemExit:
        pass
    except BaseException as e:
        res['error'] = describir_error(e, lineas)
    finally:
        sys.stdout, sys.stderr = real_out, real_err
    res['ms'] = int((time.perf_counter() - t0) * 1000)
    res['salida'] = salida.valor()
    res['errores'] = err.valor()
    res['cortada'] = salida.cortada or err.cortada

    if datos.get('verificar') and res['error'] is None:
        basura_out, basura_err = Captura(), Captura()
        sys.stdout, sys.stderr = basura_out, basura_err
        try:
            for p in datos.get('pruebas', []):
                res['pruebas'].append(evaluar(p, ns, res['salida'], lineas))
            limpio = texto_limpio(codigo)
            res['pruebas'] += comprobar_requisitos(datos.get('exige'), codigo, limpio, True)
            res['pruebas'] += comprobar_requisitos(datos.get('prohibe'), codigo, limpio, False)
        finally:
            sys.stdout, sys.stderr = real_out, real_err

    real_out.write('\n' + MARCA + json.dumps(res, ensure_ascii=True))
    real_out.flush()


if __name__ == '__main__':
    main()
