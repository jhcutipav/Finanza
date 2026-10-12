/* ==========================================================================
   theme.js — Gestión de tema claro/oscuro.
   Depende de: state.js, charts.js.
   ========================================================================== */

/**
 * Aplica el tema actual (state.settings.theme) al <html data-theme>.
 * También sincroniza los botones de tema y re-renderiza gráficos
 * porque los colores de Chart.js dependen del tema.
 */
function applyTheme(){
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  const isDark = state.settings.theme === 'dark';

  ['lightBtn','lightBtn2'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.toggle('active', !isDark);
  });
  ['darkBtn','darkBtn2'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.toggle('active', isDark);
  });

  // Redibuja los gráficos visibles con los colores del tema nuevo
  if(typeof renderAllCharts === 'function') renderAllCharts();
}

/**
 * Cambia el tema, lo persiste y lo aplica.
 * @param {'light'|'dark'} mode
 */
function setTheme(mode){
  state.settings.theme = mode;
  saveState();
  applyTheme();
}

/**
 * Conecta los botones de tema (sidebar y settings).
 */
function initThemeControls(){
  const pairs = [
    ['lightBtn',  'light'], ['darkBtn',  'dark'],
    ['lightBtn2', 'light'], ['darkBtn2', 'dark']
  ];
  pairs.forEach(([id, mode])=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', ()=> setTheme(mode));
  });
}