/* ==========================================================================
   modals.js — Apertura/cierre genérico de modales + overlay.
   ========================================================================== */

/**
 * Abre un modal por id y muestra el overlay.
 * @param {string} id
 */
function openModal(id){
  document.getElementById('overlay').classList.add('show');
  document.getElementById(id).classList.add('show');
}

/**
 * Cierra un modal por id. Si no quedan modales abiertos, oculta el overlay.
 * @param {string} id
 */
function closeModal(id){
  document.getElementById(id).classList.remove('show');
  const anyOpen = document.querySelector('.modal.show');
  if(!anyOpen) document.getElementById('overlay').classList.remove('show');
}

/**
 * Conecta los botones [data-close-modal] y el click en el overlay.
 */
function initModals(){
  document.querySelectorAll('[data-close-modal]').forEach(btn=>{
    btn.addEventListener('click', ()=> closeModal(btn.dataset.closeModal));
  });
  document.getElementById('overlay').addEventListener('click', ()=>{
    document.querySelectorAll('.modal.show').forEach(m=> closeModal(m.id));
  });
}