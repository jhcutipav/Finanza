/* ==========================================================================
   goals.js — Vista Metas (conectada al Sheet).
   ========================================================================== */

/**
 * Renderiza goals en su vista.
 * Uso: Se usa en la vista Metas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderGoals(){
  document.getElementById('goalCount').textContent = `${state.goals.length} elementos`;

  document.getElementById('goalGrid').innerHTML = state.goals.map(g=>{
    const pct = g.target>0?Math.min(100, Math.round((g.saved / g.target) * 100)):0;
    const left = Math.max(0, g.target - g.saved);
    const account=state.accounts.find(a=>a.id===g.accountId);
    return `<div class="goal-card">
      <div class="goal-card-head">
        <div>
          <h4>${escapeHTML(g.name)}</h4>
          <span class="goal-due">Vence — ${fmtDateShort(g.due)}</span>
        </div>
        <div class="goal-actions"><button class="goal-edit-btn" data-edit-goal="${escapeHTML(g.id)}">✎</button><button class="btn btn-ghost" data-contribute-goal="${escapeHTML(g.id)}" ${account&&!esCuentaPasivo(account)?'':'disabled'}>Aportar</button></div>
      </div>
      <div class="goal-amount">${fmtMoney(g.saved)} <span>/ ${fmtMoney(g.target)}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="goal-left"><span>${pct}%</span><span>Falta <b>${fmtMoney(left)}</b></span></div>
      <small class="goal-account-note">Destino: ${escapeHTML(account?.name||'sin cuenta de ahorro')}${g.monthlyContribution?` · aporta ${fmtMoney(g.monthlyContribution,account?.currency||state.settings.currency)} al mes`:''}</small>
    </div>`;
  }).join('') || `<p class="muted">No tienes metas todavía. Crea la primera.</p>`;

  document.querySelectorAll('[data-edit-goal]').forEach(b=>{
    b.addEventListener('click', ()=> openGoalModal(b.dataset.editGoal));
  });
  document.querySelectorAll('[data-contribute-goal]').forEach(b=>b.addEventListener('click',()=>openGoalContributionModal(b.dataset.contributeGoal)));

  const notStarted = state.goals.filter(g=> g.saved===0).length;
  const inProgress = state.goals.filter(g=> g.saved>0 && g.saved<g.target).length;
  const finished   = state.goals.filter(g=> g.saved>=g.target).length;

  document.getElementById('totalGoalsCount').textContent = state.goals.length;
  document.getElementById('goalStatusPills').innerHTML = `
    <div class="status-pill-card"><span class="status-pill-icon neutral">○</span><div><strong>${notStarted}</strong><small>No iniciadas</small></div></div>
    <div class="status-pill-card"><span class="status-pill-icon warn">◐</span><div><strong>${inProgress}</strong><small>En progreso</small></div></div>
    <div class="status-pill-card"><span class="status-pill-icon bad">✕</span><div><strong>0</strong><small>Canceladas</small></div></div>
    <div class="status-pill-card"><span class="status-pill-icon ok">✓</span><div><strong>${finished}</strong><small>Terminadas</small></div></div>
  `;

  renderSavingsChart();
}

/**
 * Abre goal modal para crear o editar sus datos.
 * Uso: Se usa en el módulo Metas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function openGoalModal(id){
  const isEdit = !!id;
  document.getElementById('goalModalTitle').textContent = isEdit ? 'Editar meta' : 'Agregar nueva meta';
  document.getElementById('goalForm').reset();
  populateGoalDestinationAccounts();

  if(isEdit){
    const g = state.goals.find(x=> x.id===id);
    if(!g) return;
    document.getElementById('goalId').value     = g.id;
    document.getElementById('goalName').value   = g.name;
    document.getElementById('goalTarget').value = g.target;
    document.getElementById('goalSaved').value  = g.saved;
    document.getElementById('goalDue').value    = g.due;
    document.getElementById('goalAccount').value = g.accountId || '';
    document.getElementById('goalMonthlyContribution').value = g.monthlyContribution || '';
  } else {
    document.getElementById('goalId').value = '';
    document.getElementById('goalAccount').value = '';
  }
  openModal('goalModal');
}

/**
 * Procesa goal submit y coordina validación y guardado.
 * Uso: Se usa en el módulo Metas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function handleGoalSubmit(e){
  e.preventDefault();
  const id = document.getElementById('goalId').value;
  const payload = {
    id: id || null,
    name:   document.getElementById('goalName').value.trim(),
    target: parseFloat(document.getElementById('goalTarget').value) || 0,
    saved:  parseFloat(document.getElementById('goalSaved').value) || 0,
    due:    document.getElementById('goalDue').value,
    accountId: document.getElementById('goalAccount').value || null,
    monthlyContribution: parseFloat(document.getElementById('goalMonthlyContribution').value)||0
  };
  const savingsDestination=state.accounts.find(a=>a.id===payload.accountId);
  if(payload.monthlyContribution>0&&(!savingsDestination||esCuentaPasivo(savingsDestination))){
    toast('Para planificar un aporte mensual, asigna primero una cuenta de ahorro destino');return;
  }

  try{
    if(id){
      await conCargando('Actualizando meta...', ()=> actualizarMeta(payload));
      toast('Meta actualizada');
    } else {
      await conCargando('Guardando meta...', ()=> crearMeta(payload));
      toast('Meta agregada');
    }
    closeModal('goalModal');
    renderGoals();
    renderDashboard();
  }catch(err){
    console.error(err);
    toast('Error al guardar meta: ' + err.message);
  }
}

/** Llena las cuentas disponibles como destino de ahorro de una meta. */
function populateGoalDestinationAccounts(selected=''){
  const select=document.getElementById('goalAccount');
  select.innerHTML='<option value="">Sin cuenta asignada</option>'+state.accounts.filter(a=>!esCuentaPasivo(a)).map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)} · ${escapeHTML(a.currency||'PEN')}</option>`).join('');
  if(state.accounts.some(a=>a.id===selected&&!esCuentaPasivo(a)))select.value=selected;
}

/** Abre el registro de un aporte desde una cuenta de origen hacia la cuenta de ahorro de la meta. */
function openGoalContributionModal(id){
  const goal=state.goals.find(g=>g.id===id),destination=state.accounts.find(a=>a.id===goal?.accountId);
  if(!goal||!destination||esCuentaPasivo(destination)){toast('Asigna una cuenta de ahorro a esta meta primero');return;}
  const sources=state.accounts.filter(a=>a.id!==destination.id&&(a.currency||'PEN')===(destination.currency||'PEN'));
  if(!sources.length){toast('No hay una cuenta de origen con la misma moneda');return;}
  document.getElementById('goalContributionId').value=goal.id;
  document.getElementById('goalContributionTitle').textContent=`Aportar a ${goal.name}`;
  document.getElementById('goalContributionTarget').textContent=`Destino: ${destination.name} · ${destination.currency||'PEN'}`;
  document.getElementById('goalContributionAmount').value=goal.monthlyContribution||'';
  const source=document.getElementById('goalContributionSource');
  source.innerHTML=sources.map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)} · ${escapeHTML(a.currency||'PEN')}</option>`).join('');
  const preferred=cuentaPrincipalDashboard();source.value=sources.some(a=>a.id===preferred?.id)?preferred.id:sources[0].id;
  openModal('goalContributionModal');
}

/** Registra el aporte como transferencia interna y actualiza el saldo de la meta vinculada. */
async function handleGoalContributionSubmit(e){
  e.preventDefault();
  const goal=state.goals.find(g=>g.id===document.getElementById('goalContributionId').value);
  const destination=state.accounts.find(a=>a.id===goal?.accountId);
  const source=state.accounts.find(a=>a.id===document.getElementById('goalContributionSource').value);
  const amount=parseFloat(document.getElementById('goalContributionAmount').value)||0;
  if(!goal||!destination||!source||amount<=0){toast('Revisa la meta, las cuentas y el monto del aporte');return;}
  if((source.currency||'PEN')!==(destination.currency||'PEN')){toast('El origen y el destino deben tener la misma moneda');return;}
  const tx={id:null,type:'expense',category:'Transferencia',amount,currency:source.currency||'PEN',name:`Aporte a meta: ${goal.name}`,
    method:'Transferencia bancaria',accountId:source.id,transferType:'interna',destinationAccountId:destination.id,destinationAmount:amount,
    destinationCurrency:destination.currency||'PEN',commission:0,commissionPayer:'',date:new Date().toISOString().slice(0,10),status:'Exitoso',goalId:goal.id};
  try{
    await conCargando('Registrando aporte...',()=>crearTransaccion(tx));
    closeModal('goalContributionModal');renderGoals();renderBudget();renderDashboard();renderAccounts();renderTransactions();
    toast(`Aporte de ${fmtMoney(amount,tx.currency)} registrado`);
  }catch(err){console.error(err);toast('Error al registrar el aporte: '+err.message);}
}

/**
 * Renderiza savings chart en su vista.
 * Uso: Se usa en la vista Metas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderSavingsChart(){
  const c = chartColors();
  const labels = state.goals.map(g=> g.name);
  const data   = state.goals.map(g=> g.saved);
  destroyChart('savings');
  charts.savings = new Chart(document.getElementById('savingsChart'), {
    type:'line',
    data:{ labels, datasets:[
      { label:'Ahorrado', data, borderColor:c.accent,
        backgroundColor: hexAlpha(c.accent,0.15), fill:true, tension:.4,
        pointRadius:4, pointBackgroundColor:c.accent, borderWidth:2.5 }
    ]},
    options: baseLineOptions(c)
  });
}

/**
 * Inicializa goals view y conecta controles con eventos.
 * Uso: Se invoca desde js/app.js durante el arranque. Actualizar esta nota si cambia su responsabilidad.
 */
function initGoalsView(){
  document.getElementById('addGoalBtn').addEventListener('click', ()=> openGoalModal());
  document.getElementById('goalForm').addEventListener('submit', handleGoalSubmit);
  document.getElementById('goalContributionForm').addEventListener('submit',handleGoalContributionSubmit);
  document.getElementById('goalFilterProgress').addEventListener('click', function(){
    this.classList.toggle('active');
  });
}
