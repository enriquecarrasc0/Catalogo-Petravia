"""
1_extraer_microsip_a_json.py

PASO 1 de 2. Se conecta SOLO a Firebird (Microsip) -- no necesita internet ni
acceso a Odoo -- y guarda todo lo necesario en un archivo JSON local.

Corre este script desde cualquier maquina que tenga acceso de red al puerto
3050 del servidor de Microsip (tu propia laptop en la misma red/VPN sirve,
no hace falta correrlo en el servidor mismo).

Requisitos:
    pip install firebird-driver

Salida:
    microsip_contabilidad_datos.json
"""

import json
import sys
from datetime import date, datetime
from decimal import Decimal

from firebird.driver import connect as fb_connect, DatabaseError

# --------------------------------------------------------------------------
# CONFIGURACION
# --------------------------------------------------------------------------

FB_HOST = "192.168.11.250"
FB_PORT = 3050
FB_PATH = r"C:\Microsip datos\TERRAMAR CONTABILIDAD.fdb"
FB_USER = "SYSDBA"
FB_PASSWORD = "masterkey"
FB_CHARSET = "WIN1252"

FECHA_CORTE = None                 
INCLUIR_POLIZAS_CANCELADAS = False

SALIDA_JSON = "microsip_contabilidad_datos.json"


def limpiar(valor):
    """Convierte tipos no serializables (fecha, Decimal) a tipos basicos."""
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return float(valor)
    return valor


def filas_a_dicts(cur):
    columnas = [d[0] for d in cur.description]
    return [
        {col: limpiar(val) for col, val in zip(columnas, fila)}
        for fila in cur.fetchall()
    ]


def conectar_firebird():
    dsn = f"{FB_HOST}/{FB_PORT}:{FB_PATH}"
    try:
        con = fb_connect(dsn, user=FB_USER, password=FB_PASSWORD, charset=FB_CHARSET)
        print(f"[OK] Firebird conectado: {dsn}")
        return con
    except DatabaseError as e:
        print(f"[ERROR] No se pudo conectar a Firebird: {e}")
        sys.exit(1)


def main():
    fb = conectar_firebird()
    cur = fb.cursor()
    datos = {}

    print("Extrayendo GRUPOS_CUENTAS...")
    cur.execute("SELECT GRUPO_CUENTAS_ID, NOMBRE FROM GRUPOS_CUENTAS ORDER BY NOMBRE")
    datos["grupos_cuentas"] = filas_a_dicts(cur)

    print("Extrayendo CUENTAS_CO...")
    cur.execute("""
        SELECT CUENTA_ID, CUENTA_PADRE_ID, CUENTA_PT, NOMBRE, OCULTA
        FROM CUENTAS_CO ORDER BY CUENTA_PT
    """)
    datos["cuentas_co"] = filas_a_dicts(cur)

    print("Extrayendo CENTROS_COSTO...")
    cur.execute("SELECT CENTRO_COSTO_ID, NOMBRE FROM CENTROS_COSTO ORDER BY NOMBRE")
    datos["centros_costo"] = filas_a_dicts(cur)

    print("Extrayendo DEPTOS_CO...")
    cur.execute("SELECT DEPTO_CO_ID, NOMBRE FROM DEPTOS_CO ORDER BY NOMBRE")
    datos["deptos_co"] = filas_a_dicts(cur)

    print("Extrayendo TIPOS_POLIZAS...")
    cur.execute("SELECT TIPO_POLIZA_ID, NOMBRE, PREFIJO FROM TIPOS_POLIZAS ORDER BY NOMBRE")
    datos["tipos_polizas"] = filas_a_dicts(cur)

    print("Extrayendo BANCOS...")
    cur.execute("SELECT BANCO_ID, NOMBRE, RFC FROM BANCOS ORDER BY NOMBRE")
    datos["bancos"] = filas_a_dicts(cur)

    print("Extrayendo CUENTAS_BANCARIAS...")
    cur.execute("""
        SELECT CUENTA_BAN_ID, NOMBRE, BANCO_ID, NUM_CUENTA, CLABE
        FROM CUENTAS_BANCARIAS ORDER BY NOMBRE
    """)
    datos["cuentas_bancarias"] = filas_a_dicts(cur)

    print("Extrayendo DOCTOS_CO (encabezados de poliza)...")
    sql = """
        SELECT DOCTO_CO_ID, TIPO_POLIZA_ID, POLIZA, FECHA, CANCELADO,
               APLICADO, DESCRIPCION
        FROM DOCTOS_CO
    """
    condiciones = []
    if not INCLUIR_POLIZAS_CANCELADAS:
        condiciones.append("CANCELADO = 'N'")
    if FECHA_CORTE:
        condiciones.append(f"FECHA < '{FECHA_CORTE}'")
    if condiciones:
        sql += " WHERE " + " AND ".join(condiciones)
    sql += " ORDER BY FECHA, DOCTO_CO_ID"
    cur.execute(sql)
    doctos_co = filas_a_dicts(cur)
    datos["doctos_co"] = doctos_co
    print(f"  {len(doctos_co)} polizas encontradas")

    print("Extrayendo DOCTOS_CO_DET (lineas de poliza)...")
    ids_doctos = [d["DOCTO_CO_ID"] for d in doctos_co]
    detalles = []

    LOTE = 1000
    for i in range(0, len(ids_doctos), LOTE):
        lote_ids = ids_doctos[i:i + LOTE]
        placeholders = ",".join(str(x) for x in lote_ids)
        cur.execute(f"""
            SELECT DOCTO_CO_ID, CUENTA_ID, DEPTO_CO_ID, TIPO_ASIENTO, IMPORTE,
                   REFER, DESCRIPCION, POSICION
            FROM DOCTOS_CO_DET
            WHERE DOCTO_CO_ID IN ({placeholders})
            ORDER BY DOCTO_CO_ID, POSICION
        """)
        detalles.extend(filas_a_dicts(cur))
    datos["doctos_co_det"] = detalles
    print(f"  {len(detalles)} lineas encontradas")

    fb.close()

    with open(SALIDA_JSON, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)

    print(f"\n[OK] Datos guardados en '{SALIDA_JSON}'")
    print("Copia ese archivo a la maquina con internet y corre "
          "2_enviar_json_a_odoo.py desde ahi.")


if __name__ == "__main__":
    main()