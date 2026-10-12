/* ==========================================================================
   navigation.js — Cambio de vistas y wiring del sidebar.
   Depende de: state.js y las funciones render* de cada vista.
   ========================================================================== */

const VIEW_TITLES = {
  dashboard:     ['Dashboard', 'Resumen de tu actividad'],
  transactions:  ['Transacciones', 'Resumen de tus movimientos'],
  accounts:      ['Cuentas', 'Tus tarjetas, débito y efectivo'],
  budget:        ['Presupuesto', 'Gastos fijos y presupuesto del mes'],
  goals:         ['Metas', 'Cuentas de ahorro para tus objetivos'],
  debts:         ['Deudas', 'Préstamos y saldos pendientes'],
  analytics:     ['Analítica', 'Vista detallada de tu situación financiera'],
  reports:       ['Reportes', 'Histórico y exportaciones'],
  settings:      ['Configuración', 'Preferencias de tu cuenta'],
  notifications: ['Notificación', 'Avisos, recordatorios y alertas']
};

/**
 * Cambia a una vista por nombre, actualiza el título y dispara su render.
 * @param {string} name
 */
function goToView(name){
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>{
    b.classList.toggle('active', b.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach(v=>{
    v.classList.toggle('active', v.id === `view-${name}`);
  });

  const titles = VIEW_TITLES[name] || ['', ''];
  document.getElementById('pageTitle').textContent    = titles[0];
  document.getElementById('pageSubtitle').textContent = titles[1];

  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded','false');

  renderView(name);
}

/**
 * Llama al render de la vista indicada.
 * @param {string} name
 */
function renderView(name){
  if(name==='dashboard'     && typeof renderDashboard     === 'function') renderDashboard();
  if(name==='transactions'  && typeof renderTransactions  === 'function') renderTransactions();
  if(name==='accounts'      && typeof renderAccounts      === 'function') renderAccounts();
  if(name==='goals'         && typeof renderGoals         === 'function') renderGoals();
  if(name==='budget'        && typeof renderBudget        === 'function') renderBudget();
  if(name==='debts'         && typeof renderDebts         === 'function') renderDebts();
  if(name==='analytics'     && typeof renderAnalytics     === 'function') renderAnalytics();
  if(name==='reports'       && typeof renderReports       === 'function') renderReports();
  if(name==='settings'      && typeof renderSettings      === 'function') renderSettings();
  if(name==='notifications' && typeof renderNotifications === 'function') renderNotifications();
}

/** Devuelve el nombre de la vista actualmente visible. */
function currentViewName(){
  const active = document.querySelector('.view.active');
  return active ? active.id.replace('view-','') : 'dashboard';
}

/** Conecta nav-items, links con data-goto, sidebar, etc. */
function initNavigation(){
  document.querySelectorAll('.nav-item[data-view]').forEach(btn=>{
    btn.addEventListener('click', ()=> goToView(btn.dataset.view));
  });

  // Delegación para .link-btn[data-goto]
  document.body.addEventListener('click', (e)=>{
    const link = e.target.closest('.link-btn[data-goto]');
    if(link){
      e.preventDefault();
      goToView(link.dataset.goto);
    }
  });

  document.getElementById('collapseBtn').addEventListener('click', ()=>{
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('collapsed');
    state.settings.sidebarCollapsed = sb.classList.contains('collapsed');
    saveState();
  });

  document.getElementById('mobileMenuBtn').addEventListener('click', ()=>{
    document.getElementById('sidebar').classList.add('mobile-open');
    document.getElementById('overlay').classList.add('show');
    document.getElementById('mobileMenuBtn').setAttribute('aria-expanded','true');
  });

  document.getElementById('overlay').addEventListener('click', ()=>{
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('mobileMenuBtn').setAttribute('aria-expanded','false');
    if(!document.querySelector('.modal.show'))document.getElementById('overlay').classList.remove('show');
  });

  document.getElementById('helpBtn').addEventListener('click', ()=>{
    alert('Centro de ayuda: gestiona tus transacciones, cuentas, metas, deudas y presupuesto desde el menú lateral. Todos tus datos se guardan automáticamente en este navegador.');
  });

  document.getElementById('logoutBtn').addEventListener('click', ()=>{
    if(confirm('¿Deseas cerrar sesión? Se borrará la copia local de tus datos en este dispositivo.')){
      authLogout();
    }
  });

  document.getElementById('searchBtn').addEventListener('click', ()=>{
    goToView('transactions');
    setTimeout(()=> document.getElementById('txSearch').focus(), 50);
  });

  document.getElementById('notifBtn').addEventListener('click', ()=>{
    goToView('notifications');
  });

  document.getElementById('manageWidgetsBtn').addEventListener('click', ()=>{
    toast('Implementación proximamente.');
  });
  document.getElementById('addTransactionBtn').addEventListener('click', ()=>{
    openTxModal();
  });
}
