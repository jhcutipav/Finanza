/* ==========================================================================
   charts.js — Helpers de Chart.js: paleta por tema, opciones base,
   destrucción de charts y renderAllCharts().
   Depende de: state.js, helpers.js.
   ========================================================================== */

/* Registro de instancias de Chart por key, para poder destruirlas antes de redibujar. */
const charts = {};

/**
 * Paleta de colores según el tema actual.
 * @returns {{grid:string,text:string,accent:string,dark:string,faint:string}}
 */
function chartColors(){
  const dark = state.settings.theme === 'dark';
  return {
    grid:   dark ? '#2A2745' : '#ECEAF6',
    text:   dark ? '#9B98B5' : '#8B899C',
    accent: dark ? '#8C71FF' : '#7C5CFC',
    dark:   dark ? '#F3F1FC' : '#17152A',
    faint:  dark ? '#3A3660' : '#DAD7EE'
  };
}

/**
 * Destruye un chart existente por key para evitar memory leaks.
 * @param {string} key
 */
function destroyChart(key){
  if(charts[key]){
    charts[key].destroy();
    delete charts[key];
  }
}

/**
 * Convierte un hex "#RRGGBB" a rgba con alpha.
 * @param {string} hex
 * @param {number} alpha 0..1
 * @returns {string}
 */
function hexAlpha(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Opciones base para gráficos de barras.
 * @param {object} c  Paleta (chartColors()).
 */
function baseBarOptions(c){
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{ display:false },
      tooltip:{ backgroundColor:c.dark, padding:10, cornerRadius:8,
        titleFont:{ family:'Inter' }, bodyFont:{ family:'Inter' } }
    },
    scales:{
      x:{ grid:{ display:false }, ticks:{ color:c.text, font:{ size:11, family:'Inter' } } },
      y:{ grid:{ color:c.grid },  ticks:{ color:c.text, font:{ size:11, family:'Inter' } } }
    }
  };
}

/**
 * Opciones base para gráficos de línea.
 * @param {object} c
 */
function baseLineOptions(c){
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{ display:false },
      tooltip:{ backgroundColor:c.dark, padding:10, cornerRadius:8 }
    },
    scales:{
      x:{ grid:{ display:false }, ticks:{ color:c.text, font:{ size:10, family:'Inter' }, maxRotation:0, autoSkip:true, maxTicksLimit:7 } },
      y:{ grid:{ color:c.grid },  ticks:{ color:c.text, font:{ size:11, family:'Inter' } } }
    }
  };
}

/**
 * Opciones base para donuts.
 */
function donutOptions(){
  return {
    responsive:true, maintainAspectRatio:false, cutout:'72%',
    plugins:{ legend:{ display:false }, tooltip:{ enabled:true } }
  };
}

/**
 * Redibuja los gráficos de la vista activa. Se llama al cambiar de tema.
 */
function renderAllCharts(){
  if(typeof currentViewName !== 'function') return;
  const name = currentViewName();
  if(typeof renderView === 'function') renderView(name);
}