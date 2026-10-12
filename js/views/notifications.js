/* ==========================================================================
   notifications.js — Vista Notificación (conectada al Sheet).
   ========================================================================== */

let notifFilter = 'all';

/**
 * Renderiza notifications en su vista.
 * Uso: Se usa en la vista Notificaciones al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderNotifications(){
  const list = state.notifications || [];

  document.querySelectorAll('[data-notif-filter]').forEach(chip=>{
    chip.classList.toggle('active', chip.dataset.notifFilter === notifFilter);
    if(!chip.dataset.wired){
      chip.dataset.wired = '1';
      chip.addEventListener('click', ()=>{
        notifFilter = chip.dataset.notifFilter;
        renderNotifications();
      });
    }
  });

  const markAll = document.getElementById('markAllReadBtn');
  if(markAll && !markAll.dataset.wired){
    markAll.dataset.wired = '1';
    // Marcar todas como leídas
    markAll.addEventListener('click', async ()=>{
      try{
        await conCargando('Marcando como leídas...', async ()=>{
          const pendientes = state.notifications.filter(n=> n.unread);
          for(const n of pendientes){
            const wasUnread = n.unread;
            n.unread = false;
            try{ await actualizarNotificacion(n); }
            catch(err){ n.unread = wasUnread; saveState(); throw err; }
          }
        });
        updateNotifBadge();
        renderNotifications();
        toast('Todas marcadas como leídas');
      }catch(err){
        console.error(err);
        toast('Error: ' + err.message);
      }
    });
  }

  let items = [...list];
  if(notifFilter === 'unread')    items = items.filter(n=> n.unread);
  if(notifFilter === 'important') items = items.filter(n=> n.important);

  const container = document.getElementById('notifList');
  if(!items.length){
    container.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon">🔔</div>
        <h3>Sin notificaciones</h3>
        <p class="muted small">No tienes avisos con este filtro.</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map(n=> notifItemHTML(n)).join('');

  container.querySelectorAll('[data-mark-read]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.markRead;
      const n = state.notifications.find(x=> x.id===id);
      if(!n) return;
      const wasUnread = n.unread;
      n.unread = false;
      try{
        await conCargando('Marcando...', ()=> actualizarNotificacion(n));
        updateNotifBadge();
        renderNotifications();
      }catch(err){
        n.unread = wasUnread;
        saveState();
        console.error(err);
        toast('Error: ' + err.message);
      }
    });
  });
}

/**
 * Genera el HTML de una notificación para la lista de la vista Notificaciones.
 * Uso: Se usa en el módulo Notificaciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function notifItemHTML(n){
  const safeType = ['info','warning','success','danger'].includes(n.type) ? n.type : 'info';
  return `<div class="notif-item ${n.unread ? 'unread' : ''}">
    <div class="notif-icon ${safeType}">${escapeHTML(n.icon)}</div>
    <div class="notif-body">
      <div class="notif-title">
        ${escapeHTML(n.title)}
        ${n.important ? '<span class="badge-important">IMPORTANTE</span>' : ''}
      </div>
      <div class="notif-text">${escapeHTML(n.text)}</div>
      <div class="notif-time">${escapeHTML(n.time)}</div>
    </div>
    <div class="notif-right">
      <span class="notif-dot"></span>
      ${n.unread ? `<button class="notif-mark-btn" data-mark-read="${escapeHTML(n.id)}">Marcar leída</button>` : ''}
    </div>
  </div>`;
}

/**
 * Actualiza notif badge en el estado o la interfaz.
 * Uso: Se usa en el módulo Notificaciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function updateNotifBadge(){
  const unread = (state.notifications || []).filter(n=> n.unread).length;
  const badge = document.getElementById('notifBadge');
  if(!badge) return;
  if(unread > 0){
    badge.textContent = unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Inicializa notifications view y conecta controles con eventos.
 * Uso: Se invoca desde js/app.js durante el arranque. Actualizar esta nota si cambia su responsabilidad.
 */
function initNotificationsView(){
  updateNotifBadge();
}
