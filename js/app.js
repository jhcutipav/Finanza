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
async function init(){
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
  }catch(e){
    console.error('Error al inicializar:', e);
    toast('Error al cargar: ' + e.message);
  }finally{
    ocultarCargando();
  }
}

/* Arranca cuando el DOM esté listo */
document.addEventListener('DOMContentLoaded', init);