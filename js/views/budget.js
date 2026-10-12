/* ========================================================================== 
   budget.js — Presupuestos mensuales y lista reutilizable de gastos fijos.
   ========================================================================== */

/**
 * Filtra los presupuestos para devolver únicamente los gastos fijos de la moneda activa.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function fixedExpenseRecords(){
  return state.budgets.filter(b=>b.kind === 'gasto_fijo').filter(b=>{
    const account = state.accounts.find(a=>a.id === b.accountId);
    return !account || (account.currency || 'PEN') === state.settings.currency;
  });
}

/**
 * Devuelve los registros de presupuesto mensual, excluyendo gastos fijos.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function monthlyBudgetRecords(){
  return state.budgets.filter(b=>b.kind !== 'gasto_fijo');
}

/**
 * Suma límites mensuales y gastos fijos por categoría para los resúmenes.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function budgetCategoriesWithLimits(){
  const totals = new Map();
  monthlyBudgetRecords().forEach(b=>{
    const row = totals.get(b.category) || { category:b.category, limit:0, budget:b };
    row.limit += Number(b.limit) || 0;
    row.budget = b;
    totals.set(b.category,row);
  });
  fixedExpenseRecords().forEach(b=>{
    const row = totals.get(b.category) || { category:b.category, limit:0, budget:null };
    row.limit += Number(b.limit) || 0;
    totals.set(b.category,row);
  });
  state.goals.filter(g=>{
    const destination=state.accounts.find(a=>a.id===g.accountId);
    return Number(g.monthlyContribution)>0&&destination&&!esCuentaPasivo(destination)&&
      (destination.currency||'PEN')===state.settings.currency;
  }).forEach(g=>{
    const category='Ahorro para metas';
    const row=totals.get(category)||{category,limit:0,budget:null};
    row.limit+=Number(g.monthlyContribution)||0;totals.set(category,row);
  });
  state.debts.filter(d=>(d.currency||'PEN')===state.settings.currency&&Number(d.balance)>0&&Number(d.installmentAmount)>0)
    .forEach(d=>{
      const category='Cuota de deuda';
      const row=totals.get(category)||{category,limit:0,budget:null};
      row.limit+=Number(d.installmentAmount)||0;
      totals.set(category,row);
    });
  return [...totals.values()];
}

/**
 * Renderiza budget en su vista.
 * Uso: Se usa en la vista Presupuesto al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderBudget(){
  populateSelect('budgetCategory', CATEGORIES);
  populateSelect('fixedExpenseCategory', CATEGORIES);
  const categories = budgetCategoriesWithLimits();
  const totalPlanned = categories.reduce((s,b)=>s + b.limit,0);
  const totalSpent = categories.reduce((s,b)=>s + categorySpend(b.category),0);
  const pct = totalPlanned ? Math.min(100,Math.round(totalSpent/totalPlanned*100)) : 0;

  document.getElementById('budgetTotalAmount').textContent = fmtMoney(totalPlanned-totalSpent);
  document.getElementById('budgetUsedPct').textContent = pct;
  document.getElementById('budgetTotalFill').style.width = pct+'%';
  document.getElementById('budgetTotalSpent').textContent = fmtMoney(totalSpent);
  document.getElementById('budgetTotalPlanned').textContent = fmtMoney(totalPlanned);
  document.getElementById('budgetOverviewTotal').textContent = fmtMoney(totalPlanned);

  document.getElementById('budgetList').innerHTML = categories.map(row=>{
    const spent = categorySpend(row.category);
    const p = row.limit ? Math.min(100,Math.round(spent/row.limit*100)) : 0;
    const savingsCommitment=row.category==='Ahorro para metas';
    const meta = savingsCommitment?{icon:'🎯',color:'#2FBE8F'}:metaCategoria(row.category);
    const label=savingsCommitment?'Ahorro para metas':etiquetaCategoria(row.category);
    const over = spent > row.limit;
    return `<div class="budget-row">
      <div class="budget-icon" style="background:${meta.color}22;color:${meta.color}">${escapeHTML(meta.icon)}</div>
      <div class="budget-info"><div class="budget-top-row"><span>${escapeHTML(label)}</span><span>${fmtMoney(spent)} / ${fmtMoney(row.limit)}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${p}%;background:${over?'var(--danger)':'var(--accent)'}"></div></div>
      </div>
      <div class="budget-row-actions">${row.budget ? `<button class="icon-mini-btn" data-edit-budget="${escapeHTML(row.budget.id)}">✎</button><button class="icon-mini-btn" data-del-budget="${escapeHTML(row.budget.id)}">✕</button>` : ''}</div>
    </div>`;
  }).join('') || '<p class="muted">No hay presupuestos ni gastos fijos configurados.</p>';

  const fixedRows=fixedExpenseRecords().map(f=>{
    const account = state.accounts.find(a=>a.id === f.accountId);
    return `<div class="budget-row">
      <div class="budget-icon">📌</div>
      <div class="budget-info"><div class="budget-top-row"><span>${escapeHTML(f.name || etiquetaCategoria(f.category))} · ${escapeHTML(etiquetaCategoria(f.category))}</span><span>${fmtMoney(f.limit,state.settings.currency)}</span></div>
        <small class="muted">Cuenta habitual: ${escapeHTML(account?.name || 'elige al pagar')}${account?.bank ? ' · '+escapeHTML(account.bank) : ''}${f.dueDay ? ' · Día '+f.dueDay : ''}</small>
      </div>
      <div class="budget-row-actions"><button class="btn btn-ghost" data-pay-fixed="${escapeHTML(f.id)}">Pagar</button><button class="icon-mini-btn" data-edit-fixed="${escapeHTML(f.id)}">✎</button><button class="icon-mini-btn" data-del-fixed="${escapeHTML(f.id)}">✕</button></div>
    </div>`;
  });
  const goalRows=state.goals.filter(g=>Number(g.monthlyContribution)>0).map(g=>{
    const destination=state.accounts.find(a=>a.id===g.accountId);
    const canPay=destination&&!esCuentaPasivo(destination)&&(destination.currency||'PEN')===state.settings.currency;
    if(!canPay)return '';
    return `<div class="budget-row"><div class="budget-icon">🎯</div><div class="budget-info"><div class="budget-top-row"><span>Aporte a ${escapeHTML(g.name)}</span><span>${fmtMoney(g.monthlyContribution,state.settings.currency)}</span></div><small class="muted">Cuenta de ahorro: ${escapeHTML(destination?.name||'asigna una cuenta en la meta')}</small></div><div class="budget-row-actions"><button class="btn btn-ghost" data-pay-goal="${escapeHTML(g.id)}" ${canPay?'':'disabled'}>Aportar</button></div></div>`;
  });
  const debtRows=(state.debts||[]).filter(d=>(d.currency||'PEN')===state.settings.currency&&Number(d.installmentAmount)>0).map(d=>{
    const account=state.accounts.find(a=>a.id===d.paymentAccountId);
    return `<div class="budget-row"><div class="budget-icon">💳</div><div class="budget-info"><div class="budget-top-row"><span>Cuota de ${escapeHTML(d.name)}</span><span>${fmtMoney(d.installmentAmount,d.currency)}</span></div><small class="muted">Cuenta habitual: ${escapeHTML(account?.name||'elige al pagar')}${d.dueDay?' · Día '+d.dueDay:''}</small></div><div class="budget-row-actions"><button class="btn btn-ghost" data-pay-debt-commitment="${escapeHTML(d.id)}" ${d.balance>0?'':'disabled'}>Pagar cuota</button></div></div>`;
  });
  document.getElementById('fixedExpenseList').innerHTML=[...fixedRows,...goalRows,...debtRows].filter(Boolean).join('')||'<p class="muted">Aún no hay compromisos mensuales configurados.</p>';

  document.querySelectorAll('[data-edit-budget]').forEach(b=>b.addEventListener('click',()=>openBudgetModal(b.dataset.editBudget)));
  document.querySelectorAll('[data-del-budget]').forEach(b=>b.addEventListener('click',()=>deleteBudgetRow(b.dataset.delBudget)));
  document.querySelectorAll('[data-edit-fixed]').forEach(b=>b.addEventListener('click',()=>openFixedExpenseModal(b.dataset.editFixed)));
  document.querySelectorAll('[data-del-fixed]').forEach(b=>b.addEventListener('click',()=>deleteBudgetRow(b.dataset.delFixed)));
  document.querySelectorAll('[data-pay-fixed]').forEach(b=>b.addEventListener('click',()=>registerFixedExpensePayment(b.dataset.payFixed)));
  document.querySelectorAll('[data-pay-goal]').forEach(b=>b.addEventListener('click',()=>openCommitmentPaymentModal(`goal:${b.dataset.payGoal}`)));
  document.querySelectorAll('[data-pay-debt-commitment]').forEach(b=>b.addEventListener('click',()=>openCommitmentPaymentModal(`debt:${b.dataset.payDebtCommitment}`)));
  renderBudgetOverviewDonut(categories);
}

/**
 * Elimina budget row y sincroniza el estado.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function deleteBudgetRow(id){
  if(!confirm('¿Eliminar este registro?')) return;
  try{
    await conCargando('Eliminando...',()=>eliminarPresupuesto(id));
    renderBudget(); renderDashboard();
    toast('Registro eliminado');
  }catch(err){ console.error(err); toast('Error al eliminar: '+err.message); }
}

/**
 * Abre budget modal para crear o editar sus datos.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function openBudgetModal(id){
  const isEdit = !!id;
  document.getElementById('budgetModalTitle').textContent = isEdit ? 'Editar presupuesto' : 'Agregar presupuesto';
  document.getElementById('budgetForm').reset();
  populateSelect('budgetCategory',CATEGORIES);
  if(isEdit){
    const b = state.budgets.find(x=>x.id===id && x.kind !== 'gasto_fijo');
    if(!b) return;
    document.getElementById('budgetId').value = b.id;
    document.getElementById('budgetCategory').value = b.category;
    document.getElementById('budgetLimit').value = b.limit;
  }else document.getElementById('budgetId').value = '';
  openModal('budgetModal');
}

/**
 * Procesa budget submit y coordina validación y guardado.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function handleBudgetSubmit(e){
  e.preventDefault();
  const id = document.getElementById('budgetId').value;
  const old = state.budgets.find(b=>b.id === id);
  const payload = { id:id||null, category:document.getElementById('budgetCategory').value,
    limit:parseFloat(document.getElementById('budgetLimit').value)||0, kind:'presupuesto',
    name:'', accountId:'', dueDay:0 };
  try{
    if(id){ await conCargando('Actualizando presupuesto...',()=>actualizarPresupuesto({...old,...payload})); toast('Presupuesto actualizado'); }
    else { await conCargando('Guardando presupuesto...',()=>crearPresupuesto(payload)); toast('Presupuesto agregado'); }
    closeModal('budgetModal'); renderBudget(); renderDashboard();
  }catch(err){ console.error(err); toast('Error al guardar: '+err.message); }
}

/**
 * Carga fixed expense accounts en controles de interfaz.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function populateFixedExpenseAccounts(selected=''){
  const select = document.getElementById('fixedExpenseAccount');
  select.innerHTML = '<option value="">Selecciona una cuenta</option>' + state.accounts
    .filter(a=>(a.currency||'PEN')===state.settings.currency)
    .map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}${a.bank?' · '+escapeHTML(a.bank):''}</option>`).join('');
  if(state.accounts.some(a=>a.id===selected)) select.value = selected;
}

/**
 * Abre fixed expense modal para crear o editar sus datos.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function openFixedExpenseModal(id){
  document.getElementById('fixedExpenseForm').reset();
  populateSelect('fixedExpenseCategory',CATEGORIES);
  const f = id ? state.budgets.find(b=>b.id===id && b.kind==='gasto_fijo') : null;
  document.getElementById('fixedExpenseModalTitle').textContent = f ? 'Editar gasto fijo' : 'Agregar gasto fijo';
  document.getElementById('fixedExpenseId').value = f?.id || '';
  document.getElementById('fixedExpenseName').value = f?.name || '';
  document.getElementById('fixedExpenseCategory').value = f?.category || 'Servicios';
  document.getElementById('fixedExpenseAmount').value = f?.limit || '';
  document.getElementById('fixedExpenseDueDay').value = f?.dueDay || '';
  populateFixedExpenseAccounts(f?.accountId || '');
  openModal('fixedExpenseModal');
}

/**
 * Procesa fixed expense submit y coordina validación y guardado.
 * Uso: Se usa en el módulo Presupuesto, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function handleFixedExpenseSubmit(e){
  e.preventDefault();
  const id = document.getElementById('fixedExpenseId').value;
  const account = state.accounts.find(a=>a.id===document.getElementById('fixedExpenseAccount').value);
  if(!account){ toast('Selecciona la cuenta que pagarás'); return; }
  const old = state.budgets.find(b=>b.id===id);
  const payload = { id:id||null, kind:'gasto_fijo', name:document.getElementById('fixedExpenseName').value.trim(),
    category:document.getElementById('fixedExpenseCategory').value,
    limit:parseFloat(document.getElementById('fixedExpenseAmount').value)||0,
    accountId:account.id, dueDay:parseInt(document.getElementById('fixedExpenseDueDay').value,10)||0 };
  try{
    if(id) await conCargando('Actualizando gasto fijo...',()=>actualizarPresupuesto({...old,...payload}));
    else await conCargando('Guardando gasto fijo...',()=>crearPresupuesto(payload));
    closeModal('fixedExpenseModal'); renderBudget(); renderDashboard(); toast('Gasto fijo guardado');
  }catch(err){ console.error(err); toast('Error al guardar gasto fijo: '+err.message); }
}

/**
 * Abre el formulario de pago de un gasto fijo para confirmar monto y cuenta de origen.
 * Uso: Se usa desde el botón Pagar de cada gasto fijo.
 */
async function registerFixedExpensePayment(id){
  openCommitmentPaymentModal(`fixed:${id}`);
}

/** Abre un selector común para pagar gastos fijos, aportar a metas o pasar a pagar una cuota. */
function openCommitmentPaymentModal(selected=''){
  const fixed=fixedExpenseRecords();
  const goals=state.goals.filter(g=>Number(g.monthlyContribution)>0&&
    (state.accounts.some(a=>a.id===g.accountId&&!esCuentaPasivo(a)&&(a.currency||'PEN')===state.settings.currency)));
  const debts=(state.debts||[]).filter(d=>(d.currency||'PEN')===state.settings.currency&&d.balance>0&&d.installmentAmount>0);
  if(!fixed.length&&!goals.length&&!debts.length){toast('No hay compromisos mensuales disponibles para registrar');return;}
  const select=document.getElementById('commitmentPaymentItem');
  select.innerHTML=[
    fixed.length?`<optgroup label="Gastos fijos">${fixed.map(f=>`<option value="fixed:${escapeHTML(f.id)}">${escapeHTML(f.name||etiquetaCategoria(f.category))}</option>`).join('')}</optgroup>`:'',
    goals.length?`<optgroup label="Aportes de ahorro">${goals.map(g=>`<option value="goal:${escapeHTML(g.id)}">Aporte a ${escapeHTML(g.name)}</option>`).join('')}</optgroup>`:'',
    debts.length?`<optgroup label="Cuotas de deuda">${debts.map(d=>`<option value="debt:${escapeHTML(d.id)}">Cuota de ${escapeHTML(d.name)}</option>`).join('')}</optgroup>`:''
  ].join('');
  if(selected&&[...select.options].some(o=>o.value===selected))select.value=selected;
  updateCommitmentPaymentFields();
  openModal('commitmentPaymentModal');
}

/** Actualiza monto, moneda y selector de origen según el compromiso elegido. */
function updateCommitmentPaymentFields(){
  const [kind,id]=(document.getElementById('commitmentPaymentItem').value||'').split(':');
  const amountRow=document.getElementById('commitmentPaymentAmountRow'),accountRow=document.getElementById('commitmentPaymentAccountRow');
  const amount=document.getElementById('commitmentPaymentAmount'),accountSelect=document.getElementById('commitmentPaymentAccount');
  const note=document.getElementById('commitmentPaymentNote'),submit=document.getElementById('commitmentPaymentSubmit');
  submit.disabled=false;
  let currency=state.settings.currency,preferred='',excludeId='',planned=0;
  if(kind==='fixed'){
    const fixed=state.budgets.find(b=>b.id===id&&b.kind==='gasto_fijo');if(!fixed)return;
    const defaultAccount=state.accounts.find(a=>a.id===fixed.accountId);
    currency=defaultAccount?.currency||state.settings.currency;preferred=defaultAccount?.id||'';planned=Number(fixed.limit)||0;
    note.textContent=`${etiquetaCategoria(fixed.category)} · puedes ajustar el monto estimado al pagar.`;
    document.getElementById('commitmentPaymentAmountLabel').textContent=`Monto a pagar (${currency})`;
    document.getElementById('commitmentPaymentAccountLabel').textContent='Pagar desde esta cuenta';
    submit.textContent='Registrar pago';
  }else if(kind==='goal'){
    const goal=state.goals.find(g=>g.id===id),destination=state.accounts.find(a=>a.id===goal?.accountId);if(!goal||!destination)return;
    currency=destination.currency||'PEN';excludeId=destination.id;planned=Number(goal.monthlyContribution)||0;
    const primary=cuentaPrincipalDashboard();preferred=primary?.currency===currency?primary.id:'';
    note.textContent=`Destino: ${destination.name}. Al registrar se mueve el dinero y aumenta el ahorro de la meta.`;
    document.getElementById('commitmentPaymentAmountLabel').textContent=`Monto del aporte (${currency})`;
    document.getElementById('commitmentPaymentAccountLabel').textContent='Aportar desde esta cuenta';
    submit.textContent='Registrar aporte';
  }else if(kind==='debt'){
    const debt=state.debts.find(d=>d.id===id);if(!debt)return;
    amountRow.hidden=true;accountRow.hidden=true;amount.required=false;accountSelect.required=false;
    note.textContent=`La cuota estimada es ${fmtMoney(debt.installmentAmount,debt.currency)}. En el siguiente paso separarás capital e intereses y escogerás la cuenta.`;
    submit.textContent='Continuar al pago';return;
  }else return;
  amountRow.hidden=false;accountRow.hidden=false;amount.required=true;accountSelect.required=true;
  amount.value=planned||'';
  const sources=state.accounts.filter(a=>(a.currency||'PEN')===currency&&a.id!==excludeId);
  accountSelect.innerHTML=sources.map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}${a.bank?' · '+escapeHTML(a.bank):''} · ${escapeHTML(claseCuentaNombre(a.accountKind))}</option>`).join('');
  if(sources.some(a=>a.id===preferred))accountSelect.value=preferred;
  else if(sources.length)accountSelect.value=sources[0].id;
  submit.disabled=!sources.length;
  if(!sources.length)note.textContent+=' No hay cuentas compatibles en esta moneda.';
}

/** Registra un egreso desde cualquier cuenta compatible o un aporte como transferencia interna. */
async function handleCommitmentPaymentSubmit(e){
  e.preventDefault();
  const [kind,id]=document.getElementById('commitmentPaymentItem').value.split(':');
  if(kind==='debt'){
    closeModal('commitmentPaymentModal');openDebtPaymentModal(id);return;
  }
  const account=state.accounts.find(a=>a.id===document.getElementById('commitmentPaymentAccount').value);
  const amount=Number(document.getElementById('commitmentPaymentAmount').value)||0;
  if(!account||amount<=0){toast('Selecciona una cuenta y un monto válido');return;}
  let tx;
  if(kind==='fixed'){
    const fixed=state.budgets.find(b=>b.id===id&&b.kind==='gasto_fijo');if(!fixed)return;
    tx={id:null,type:'expense',category:fixed.category,amount,currency:account.currency||'PEN',name:fixed.name,
      method:'Transferencia bancaria',accountId:account.id,date:new Date().toISOString().slice(0,10),status:'Exitoso'};
  }else if(kind==='goal'){
    const goal=state.goals.find(g=>g.id===id),destination=state.accounts.find(a=>a.id===goal?.accountId);
    if(!goal||!destination||account.id===destination.id||(account.currency||'PEN')!==(destination.currency||'PEN')){toast('Verifica la cuenta de ahorro y la cuenta de origen');return;}
    tx={id:null,type:'expense',category:'Transferencia',amount,currency:account.currency||'PEN',name:`Aporte a meta: ${goal.name}`,
      method:'Transferencia bancaria',accountId:account.id,transferType:'interna',destinationAccountId:destination.id,
      destinationAmount:amount,destinationCurrency:destination.currency||'PEN',commission:0,commissionPayer:'',
      date:new Date().toISOString().slice(0,10),status:'Exitoso',goalId:goal.id};
  }else return;
  try{
    await conCargando(kind==='goal'?'Registrando aporte...':'Registrando pago...',()=>crearTransaccion(tx));
    closeModal('commitmentPaymentModal');renderBudget();renderDashboard();renderAccounts();renderTransactions();renderGoals();renderDebts();
    toast(kind==='goal'?'Aporte registrado y meta actualizada':'Pago fijo registrado');
  }catch(err){console.error(err);toast('No se pudo registrar: '+err.message);}
}

/**
 * Renderiza budget overview donut en su vista.
 * Uso: Se usa en la vista Presupuesto al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderBudgetOverviewDonut(categories=budgetCategoriesWithLimits()){
  const c = chartColors();
  const labels = categories.map(b=>b.category==='Ahorro para metas'?'Ahorro para metas':etiquetaCategoria(b.category));
  const data = categories.map(b=>b.limit);
  const palette = categories.map(b=>metaCategoria(b.category).color);
  destroyChart('budgetOverviewDonut');
  charts.budgetOverviewDonut = new Chart(document.getElementById('budgetOverviewDonut'),{
    type:'doughnut',data:{labels,datasets:[{data:data.length?data:[1],backgroundColor:palette.length?palette:[c.grid],borderWidth:0}]},options:donutOptions()
  });
}

/**
 * Inicializa budget view y conecta controles con eventos.
 * Uso: Se invoca desde js/app.js durante el arranque. Actualizar esta nota si cambia su responsabilidad.
 */
function initBudgetView(){
  document.getElementById('addBudgetBtn').addEventListener('click',()=>openBudgetModal());
  document.getElementById('budgetForm').addEventListener('submit',handleBudgetSubmit);
  document.getElementById('addFixedExpenseBtn').addEventListener('click',()=>openFixedExpenseModal());
  document.getElementById('fixedExpenseForm').addEventListener('submit',handleFixedExpenseSubmit);
  document.getElementById('commitmentPaymentItem').addEventListener('change',updateCommitmentPaymentFields);
  document.getElementById('commitmentPaymentForm').addEventListener('submit',handleCommitmentPaymentSubmit);
  document.getElementById('dashFixedCommitmentBtn').addEventListener('click',()=>openCommitmentPaymentModal());
}
