/* ==========================================================================
   helpers.js — Utilidades globales sin dependencias del estado.
   Se carga ANTES de state.js porque state.js usa uid() y fmtMoney().
   ========================================================================== */

/**
 * Genera un id corto pseudoaleatorio.
 * @returns {string} id de 8 caracteres.
 */
function uid(){
  return Math.random().toString(36).slice(2, 10);
}

/** Escapa texto dinámico antes de insertarlo en una plantilla HTML. */
function escapeHTML(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
}

/**
 * Formatea un número como moneda según la moneda activa (state.settings.currency).
 * Si no hay estado aún, usa USD por defecto.
 * @param {number} n  Monto a formatear.
 * @param {string} [currency]  Override opcional de la moneda.
 * @returns {string} Ej: "-$1,250.00"
 */
function fmtMoney(n, currency){
  const c = currency || (typeof state !== 'undefined' && state.settings && state.settings.currency) || 'USD';
  const symbols = typeof CURRENCIES !== 'undefined'
    ? Object.fromEntries(Object.entries(CURRENCIES).map(([code,meta])=>[code,meta.symbol]))
    : { USD: '$', PEN: 'S/ ', EUR: '€' };
  const sign = n < 0 ? '-' : '';
  return `${sign}${symbols[c] || c+' '}${Math.abs(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) como "05 sep".
 * @param {string} iso
 * @returns {string}
 */
function fmtDateShort(iso){
  const d = new Date(iso + 'T00:00:00');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`;
}

/**
 * Devuelve el nombre del mes en español a partir de su índice (0-11).
 * @param {number} idx
 * @returns {string}
 */
function monthName(idx){
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return names[idx] || '';
}

/**
 * Muestra un toast temporal en la parte inferior de la pantalla.
 * @param {string} msg  Mensaje a mostrar.
 */
let __toastTimer;
/**
 * Muestra un mensaje temporal en la interfaz y oculta el mensaje anterior.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function toast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(()=> el.classList.remove('show'), 2200);
}

/* ==========================================================================
   OVERLAY DE CARGANDO GLOBAL
   ========================================================================== */

/**
 * Muestra el overlay de cargando con un texto opcional.
 * @param {string} [texto]  Texto a mostrar debajo del spinner.
 */
function mostrarCargando(texto){
  const overlay = document.getElementById('loadingOverlay');
  const txt = document.getElementById('loadingText');
  if(txt) txt.textContent = texto || 'Cargando...';
  if(overlay) overlay.classList.add('show');
}

/**
 * Oculta el overlay de cargando.
 */
function ocultarCargando(){
  const overlay = document.getElementById('loadingOverlay');
  if(overlay) overlay.classList.remove('show');
}

/**
 * Envuelve una operación async mostrando el overlay de cargando.
 * Uso:
 *   const resultado = await conCargando('Guardando...', () => apiCrear(...));
 *   const resultado = await conCargando(() => apiCrear(...));  // texto por defecto
 *
 * @param {string|Function} textoOpcional  Texto, o directamente la función si no hay texto.
 * @param {Function} [fn]                  La función async a ejecutar.
 * @returns {Promise<any>}                 El resultado de la función.
 */
async function conCargando(textoOpcional, fn){
  let texto = 'Cargando...';
  let operacion = textoOpcional;

  if(typeof textoOpcional === 'string'){
    texto = textoOpcional;
    operacion = fn;
  }

  mostrarCargando(texto);
  try{
    return await operacion();
  } finally {
    // Pequeña pausa mínima para que el usuario note el cambio
    setTimeout(ocultarCargando, 150);
  }
}
