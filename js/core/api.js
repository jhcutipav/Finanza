/* ==========================================================================
   api.js — Capa de conexión con Google Apps Script (backend).
   --------------------------------------------------------------------------
   🟡 CONFIGURACIÓN: cambia API_URL y API_TOKEN por tus valores reales.
   🔴 El TOKEN debe coincidir EXACTAMENTE con el de tu Apps Script.
   --------------------------------------------------------------------------
   🧠 CACHÉ: guarda la última lectura en memoria durante CACHE_TTL_MS ms.
   Si navegas entre vistas antes de que expire, no vuelve a llamar al Sheet.
   Cuando creas/editas/eliminas algo, el caché se invalida automáticamente.
   ========================================================================== */

/* URL de tu App Web de Apps Script (termina en /exec) */
const API_URL = 'https://script.google.com/macros/s/AKfycbwYPAgKx27uChwqgjuT8kF3FuOpvdh8yJcvFfYFUsBptDroaf3ao3RcmrdK3KqwDOXV-g/exec';

/* Token secreto — debe ser el MISMO que pusiste en el Apps Script */
const API_TOKEN = 'app-finanzas-neyo-2026-xk98m4p2';

/* ==========================================================================
   CACHÉ DE LECTURA
   ==========================================================================
   TTL: cuánto tiempo se considera válido el caché (en ms).
   - 0         → sin caché (cada lectura llama al Sheet)
   - 120000    → 2 minutos (recomendado)
   - 300000    → 5 minutos
   ========================================================================== */
const CACHE_TTL_MS = 120000;

let _cacheUltimaLectura = null;
let _cacheTimestamp = 0;

/**
 * Invalida el caché manualmente. Se llama al crear/editar/eliminar.
 */
function invalidarCache(){
  _cacheUltimaLectura = null;
  _cacheTimestamp = 0;
}

/* ==========================================================================
   FUNCIONES INTERNAS
   ========================================================================== */

/**
 * Hace un GET al backend.
 * @param {Object} params  Ej: { accion: 'obtenerTodo' }
 * @returns {Promise<Object>}
 */
async function apiGet(params){
  const url = new URL(API_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { method: 'GET' });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

/**
 * Hace un POST al backend.
 * Usa Content-Type text/plain para evitar el preflight de CORS.
 * @param {Object} body  { accion, tabla, datos }
 * @returns {Promise<Object>}
 */
async function apiPost(body){
  if(typeof navigator !== 'undefined' && !navigator.onLine){
    throw new Error('Sin conexión: el cambio no se guardó. Reconéctate e inténtalo de nuevo.');
  }
  const payload = { ...body, token: API_TOKEN };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

/* ==========================================================================
   API PÚBLICA
   ========================================================================== */

/**
 * Lee TODAS las pestañas del Sheet.
 * Usa caché si está disponible y no ha expirado.
 *
 * @param {boolean} [forzar=false]  Si true, ignora el caché y va al Sheet.
 * @returns {Promise<Object>}  { transacciones: [...], cuentas: [...], ... }
 */
async function apiObtenerTodo(forzar = false){
  const ahora = Date.now();
  const cacheValido = _cacheUltimaLectura
    && !forzar
    && (ahora - _cacheTimestamp) < CACHE_TTL_MS;

  if(cacheValido){
    console.log('📦 Datos desde caché (no se llama al Sheet)');
    return _cacheUltimaLectura;
  }

  console.log('🌐 Pidiendo datos al Sheet...');
  const res = await apiGet({ accion: 'obtenerTodo' });
  if(!res.ok) throw new Error(res.error || 'Error al leer');

  _cacheUltimaLectura = res.datos;
  _cacheTimestamp = ahora;
  return res.datos;
}

/**
 * Crea un registro nuevo. El ID lo genera el backend.
 * Invalida el caché después de escribir.
 *
 * @param {string} tabla  Ej: 'transacciones'
 * @param {Object} datos  { Fecha, Monto, Tipo, ... }
 * @returns {Promise<{ ok:boolean, id:string }>}
 */
async function apiCrear(tabla, datos){
  const res = await apiPost({ accion: 'crear', tabla, datos });
  invalidarCache();
  return res;
}

/**
 * Actualiza un registro existente por ID.
 * Invalida el caché después de escribir.
 *
 * @param {string} tabla
 * @param {Object} datos  Debe incluir ID.
 */
async function apiActualizar(tabla, datos){
  const res = await apiPost({ accion: 'actualizar', tabla, datos });
  invalidarCache();
  return res;
}

/**
 * Elimina un registro por ID.
 * Invalida el caché después de escribir.
 *
 * @param {string} tabla
 * @param {string} id
 */
async function apiEliminar(tabla, id){
  const res = await apiPost({ accion: 'eliminar', tabla, datos: { ID: id } });
  invalidarCache();
  return res;
}
