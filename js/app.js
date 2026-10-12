/* ==========================================================================
   app.js — Orquestador de arranque.
   Se carga al final, cuando todos los módulos ya están en el DOM.
   ========================================================================== */

/**
 * Inicializa la app:
 *  1. Carga el estado (localStorage o seed.json)
 *  2. Conecta listeners de navegación, tema, modales y vistas
 *  3. Aplica el tema y navega al Dashboard
 */
let finsetStarted=false;
async function startFinSetApp(){
  if(finsetStarted)return;
  // Mostrar cargando desde el inicio
  mostrarCargando('Cargando datos...');

  try{
    await loadState();

    if(state.settings.sidebarCollapsed){
      document.getElementById('sidebar').classList.add('collapsed');
    }

    refreshUserChip();
    updateNotifBadge();

    initThemeControls();
    initModals();
    initNavigation();

    initDashboardFilters();
    initTransactionsView();
    initAccountsView();
    initGoalsView();
    initBudgetView();
    initDebtsView();
    initReportsView();
    initSettingsView();
    initNotificationsView();

    applyTheme();
    goToView('dashboard');
    finsetStarted=true;
  }catch(e){
    console.error('Error al inicializar:', e);
    throw e;
  }finally{
    ocultarCargando();
  }
}

/** Muestra primero el acceso; el contenido se inicializa solo tras validar sesión. */
async function init(){await initAuthGate();}

/* Arranca cuando el DOM esté listo */
document.addEventListener('DOMContentLoaded', init);
