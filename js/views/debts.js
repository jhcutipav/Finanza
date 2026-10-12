/* ==========================================================================
   debts.js — Vista Deudas (conectada al Sheet).
   Depende de: state.js, helpers.js, charts.js, modals.js.
   ========================================================================== */

/**
 * Renderiza debts en su vista.
 * Uso: Se usa en la vista Deudas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderDebts(){
  const debts = (state.debts || []).filter(d=>(d.currency || 'PEN') === state.settings.currency);

  /* ---------- CÁLCULOS ---------- */
  const totalDebt      = debts.reduce((s,d)=> s + d.balance, 0);
  const totalPrincipal = debts.reduce((s,d)=> s + d.principal, 0);
  const totalInstallments = debts.reduce((s,d)=> s + (d.installmentsTotal || 0), 0);
  const paidInstallments  = debts.reduce((s,d)=> s + (d.installmentsPaid  || 0), 0);
  const monthlyTotal = debts.reduce((s,d)=> s + (d.installmentAmount || 0), 0);
  const paidInterest = state.transactions.filter(t=>t.category === 'Cuota de deuda' && t.status === 'Exitoso' &&
    (t.currency || 'PEN') === state.settings.currency)
    .reduce((s,t)=>s + (Number(t.interestPaid) || 0),0);

  /* ---------- STAT CARDS ---------- */
  document.getElementById('debtsStatGrid').innerHTML = [
    debtStatCard('Total adeudado',     fmtMoney(totalDebt),      `${debts.length} deuda${debts.length===1?'':'s'} activas`, 'danger'),
    debtStatCard('Pago mensual total', fmtMoney(monthlyTotal),   'Suma de todas las cuotas', 'accent'),
    debtStatCard('Cuotas pagadas',     `${paidInstallments}/${totalInstallments}`, 'Sobre el total', 'success'),
    debtStatCard('Progreso de pago',   `${totalPrincipal ? Math.round(((totalPrincipal - totalDebt) / totalPrincipal) * 100) : 0}%`, 'Capital amortizado', 'accent'),
    debtStatCard('Intereses pagados', fmtMoney(paidInterest), 'Registrados en las cuotas', 'danger')
  ].join('');

  /* ---------- GRÁFICO BARRAS ---------- */
  renderDebtsBalanceChart(debts);

  /* ---------- DONUT POR TIPO ---------- */
  const byType = {};
  debts.forEach(d=>{
    const t = DEBT_TYPES[d.type] || DEBT_TYPES['other'];
    byType[t.label] = (byType[t.label] || 0) + d.balance;
  });
  const typeEntries = Object.entries(byType);
  const typeColors  = typeEntries.map(([label])=>{
    const found = Object.values(DEBT_TYPES).find(t=> t.label === label);
    return found ? found.color : '#8B899C';
  });

  renderDebtsDonut(typeEntries, typeColors, totalDebt);

  document.getElementById('debtsDonutTotal').textContent = fmtMoney(totalDebt);
  document.getElementById('debtsLegendList').innerHTML = typeEntries.map(([label,val])=>{
    const found = Object.values(DEBT_TYPES).find(t=> t.label === label);
    const color = found ? found.color : '#8B899C';
    const pct = totalDebt ? Math.round((val/totalDebt)*100) : 0;
    return `<div class="legend-row">
      <div class="lg-left"><span class="legend-swatch" style="background:${color}"></span>${escapeHTML(label)}</div>
      <strong>${pct}%&nbsp;&nbsp;${fmtMoney(val)}</strong>
    </div>`;
  }).join('') || `<p class="muted small">Sin deudas registradas.</p>`;

  /* ---------- LISTA ---------- */
  const list = document.getElementById('debtList');
  if(!debts.length){
    list.innerHTML = `<p class="muted">No tienes deudas registradas. ¡Buen trabajo!</p>`;
    return;
  }

  list.innerHTML = debts.map(d=> debtRowHTML(d)).join('');

  list.querySelectorAll('[data-pay-debt]').forEach(b=>{
    b.addEventListener('click', ()=> openDebtPaymentModal(b.dataset.payDebt));
  });
  list.querySelectorAll('[data-edit-debt]').forEach(b=>{
    b.addEventListener('click', ()=> openDebtModal(b.dataset.editDebt));
  });
  list.querySelectorAll('[data-del-debt]').forEach(b=>{
    b.addEventListener('click', ()=> deleteDebt(b.dataset.delDebt));
  });
}

/**
 * Genera el bloque visual de una métrica de deuda para el encabezado de la vista.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function debtStatCard(label, value, sub, tone){
  return `<div class="stat-card">
    <div class="stat-top">
      <span class="stat-label">${label}</span>
      <span class="stat-icon" style="background:${toneColor(tone)}22;color:${toneColor(tone)}">
        ${toneIcon(tone)}
      </span>
    </div>
    <div class="stat-value">${value}</div>
    <div class="stat-foot"><span class="stat-sub">${sub}</span></div>
  </div>`;
}

/**
 * Devuelve el color asociado al tono visual de una tarjeta de deuda.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function toneColor(tone){
  return { danger:'var(--danger)', success:'var(--accent-2)', accent:'var(--accent)' }[tone] || 'var(--accent)';
}
/**
 * Devuelve el icono asociado al tono de una tarjeta de deuda.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function toneIcon(tone){
  if(tone==='danger')  return '⚠️';
  if(tone==='success') return '✓';
  return '💳';
}

/**
 * Genera el HTML de una fila de deuda con saldo, estado y acciones.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function debtRowHTML(d){
  const meta = DEBT_TYPES[d.type] || DEBT_TYPES['other'];
  const progress = d.installmentsTotal
    ? Math.min(100, Math.round((d.installmentsPaid / d.installmentsTotal) * 100))
    : Math.min(100, Math.round(((d.principal - d.balance) / d.principal) * 100));

  return `<div class="debt-row">
    <div class="debt-icon" style="background:${meta.color}22;color:${meta.color}">${escapeHTML(meta.icon)}</div>
    <div class="debt-info">
      <div class="debt-head-row">
        <span class="debt-name">${escapeHTML(d.name)}</span>
        <span class="debt-tag">${escapeHTML(meta.label)}</span>
      </div>
      <div class="debt-meta">
        <span>💵 Cuota: <b>${fmtMoney(d.installmentAmount,d.currency || 'PEN')}</b></span>
        <span>🏦 Paga desde: <b>${escapeHTML(state.accounts.find(a=>a.id === d.paymentAccountId)?.name || 'Elegir al pagar')}</b></span>
        <span>📅 Día ${d.dueDay}</span>
        ${d.interestRate ? `<span>📊 ${d.interestRate}% interés</span>` : ''}
      </div>
      <div class="debt-progress-row">
        <span>${progress}% pagado</span>
        <strong>${fmtMoney(d.principal - d.balance,d.currency || 'PEN')} / ${fmtMoney(d.principal,d.currency || 'PEN')}</strong>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${progress}%;background:${meta.color}"></div></div>
    </div>
    <div class="debt-right">
      <div class="debt-balance">${fmtMoney(d.balance,d.currency || 'PEN')}<small>saldo pendiente</small></div>
      <span class="debt-next">Próximo pago</span>
      <div class="debt-actions">
        <button class="icon-mini-btn" data-pay-debt="${escapeHTML(d.id)}" title="Pagar cuota">💵</button>
        <button class="icon-mini-btn" data-edit-debt="${escapeHTML(d.id)}" title="Editar">✎</button>
        <button class="icon-mini-btn" data-del-debt="${escapeHTML(d.id)}" title="Eliminar">✕</button>
      </div>
    </div>
  </div>`;
}

/**
 * Renderiza debts balance chart en su vista.
 * Uso: Se usa en la vista Deudas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderDebtsBalanceChart(debts){
  const c = chartColors();
  const labels = debts.map(d=> d.name.length > 18 ? d.name.slice(0,17)+'…' : d.name);
  const data   = debts.map(d=> d.balance);
  const colors = debts.map(d=> (DEBT_TYPES[d.type] || DEBT_TYPES['other']).color);

  destroyChart('debtsBalance');
  charts.debtsBalance = new Chart(document.getElementById('debtsBalanceChart'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Saldo pendiente', data, backgroundColor:colors.length ? colors : [c.accent],
        borderRadius:6, barThickness:26 }
    ]},
    options: baseBarOptions(c)
  });
}

/**
 * Renderiza debts donut en su vista.
 * Uso: Se usa en la vista Deudas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderDebtsDonut(entries, colors, total){
  const c = chartColors();
  destroyChart('debtsDonut');
  charts.debtsDonut = new Chart(document.getElementById('debtsDonut'), {
    type:'doughnut',
    data:{
      labels: entries.map(e=> e[0]),
      datasets:[{ data: entries.length ? entries.map(e=> e[1]) : [1],
        backgroundColor: colors.length ? colors : [c.grid], borderWidth:0 }]
    },
    options: donutOptions()
  });
}

/* ---------- MODAL ---------- */

/**
 * Abre debt modal para crear o editar sus datos.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function openDebtModal(id){
  const isEdit = !!id;
  document.getElementById('debtModalTitle').textContent = isEdit ? 'Editar deuda' : 'Agregar nueva deuda';
  document.getElementById('debtForm').reset();
  llenarSelectCatalogo('debtType','tipo_deuda');
  llenarSelectCatalogo('debtCurrency','moneda',state.settings.currency||'PEN');
  populateDebtPaymentAccounts('debtPaymentAccount');

  if(isEdit){
    const d = state.debts.find(x=> x.id===id);
    if(!d) return;
    document.getElementById('debtId').value                = d.id;
    document.getElementById('debtName').value              = d.name;
    document.getElementById('debtType').value              = d.type;
    document.getElementById('debtPrincipal').value         = d.principal;
    document.getElementById('debtBalance').value           = d.balance;
    document.getElementById('debtInstallmentAmount').value = d.installmentAmount;
    document.getElementById('debtDueDay').value            = d.dueDay;
    document.getElementById('debtInstallmentsTotal').value = d.installmentsTotal;
    document.getElementById('debtInstallmentsPaid').value  = d.installmentsPaid;
    document.getElementById('debtInterestRate').value      = d.interestRate;
    document.getElementById('debtCurrency').value = d.currency || 'PEN';
    document.getElementById('debtPaymentAccount').value = d.paymentAccountId || '';
  } else {
    document.getElementById('debtId').value = '';
    document.getElementById('debtCurrency').value = state.settings.currency || 'PEN';
  }
  populateDebtPaymentAccounts('debtPaymentAccount');
  const debt = state.debts.find(x=>x.id === id);
  if(debt?.paymentAccountId) document.getElementById('debtPaymentAccount').value = debt.paymentAccountId;
  openModal('debtModal');
}

/**
 * Procesa debt submit y coordina validación y guardado.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function handleDebtSubmit(e){
  e.preventDefault();
  const id = document.getElementById('debtId').value;
  const currency = document.getElementById('debtCurrency').value;
  const paymentAccountId = document.getElementById('debtPaymentAccount').value;
  const paymentAccount = state.accounts.find(a=>a.id === paymentAccountId);
  if(paymentAccount && paymentAccount.currency !== currency){ toast('La cuenta habitual debe tener la misma moneda que la deuda'); return; }
  const payload = {
    id: id || null,
    name:              document.getElementById('debtName').value.trim(),
    type:              document.getElementById('debtType').value,
    principal:         parseFloat(document.getElementById('debtPrincipal').value) || 0,
    balance:           parseFloat(document.getElementById('debtBalance').value) || 0,
    installmentAmount: parseFloat(document.getElementById('debtInstallmentAmount').value) || 0,
    dueDay:            parseInt(document.getElementById('debtDueDay').value, 10) || 0,
    installmentsTotal: parseInt(document.getElementById('debtInstallmentsTotal').value, 10) || 0,
    installmentsPaid:  parseInt(document.getElementById('debtInstallmentsPaid').value, 10) || 0,
    interestRate:      parseFloat(document.getElementById('debtInterestRate').value) || 0,
    accountId: null,
    currency,
    paymentAccountId
  };

  try{
    if(id){
      await conCargando('Actualizando deuda...', ()=> actualizarDeuda(payload));
      toast('Deuda actualizada');
    } else {
      await conCargando('Guardando deuda...', ()=> crearDeuda(payload));
      toast('Deuda agregada');
    }
    closeModal('debtModal');
    renderDebts();
    renderDashboard();
  }catch(err){
    console.error(err);
    toast('Error al guardar deuda: ' + err.message);
  }
}

/**
 * Elimina debt y sincroniza el estado.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function deleteDebt(id){
  if(state.transactions.some(t=>t.debtId === id)){
    toast('Esta deuda tiene pagos registrados. Elimina primero esos movimientos para conservar los saldos.');
    return;
  }
  if(!confirm('¿Eliminar esta deuda?')) return;
  try{
    await conCargando('Eliminando...', ()=> eliminarDeuda(id));
    renderDebts();
    toast('Deuda eliminada');
  }catch(err){
    console.error(err);
    toast('Error al eliminar: ' + err.message);
  }
}

/**
 * Inicializa debts view y conecta controles con eventos.
 * Uso: Se invoca desde js/app.js durante el arranque. Actualizar esta nota si cambia su responsabilidad.
 */
function initDebtsView(){
  document.getElementById('addDebtBtn').addEventListener('click', ()=> openDebtModal());
  document.getElementById('debtForm').addEventListener('submit', handleDebtSubmit);
  document.getElementById('debtCurrency').addEventListener('change', ()=>populateDebtPaymentAccounts('debtPaymentAccount'));
  document.getElementById('debtPaymentForm').addEventListener('submit', handleDebtPaymentSubmit);
  ['debtPaymentPrincipal','debtPaymentInterest'].forEach(id=>document.getElementById(id).addEventListener('input', updateDebtPaymentTotal));
}

/**
 * Carga debt payment accounts en controles de interfaz.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function populateDebtPaymentAccounts(selectId, currency = document.getElementById('debtCurrency')?.value || state.settings.currency){
  const select = document.getElementById(selectId);
  if(!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Selecciona una cuenta</option>' + state.accounts
    .filter(a=>(a.currency || 'PEN') === currency)
    .map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)} · ${escapeHTML(a.bank || a.accountKind || '')}</option>`).join('');
  if(state.accounts.some(a=>a.id === current)) select.value = current;
}

/**
 * Abre debt payment modal para crear o editar sus datos.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function openDebtPaymentModal(id){
  const debt = state.debts.find(d=>d.id === id);
  if(!debt) return;
  document.getElementById('debtPaymentForm').reset();
  document.getElementById('debtPaymentId').value = debt.id;
  document.getElementById('debtPaymentTitle').textContent = `Pagar cuota: ${debt.name}`;
  document.getElementById('debtPaymentScheduled').textContent =
    `Cuota registrada: ${fmtMoney(debt.installmentAmount || 0,debt.currency || 'PEN')} · Cuenta habitual: ${state.accounts.find(a=>a.id === debt.paymentAccountId)?.name || 'elige una cuenta'}`;
  populateDebtPaymentAccounts('debtPaymentAccountSelect', debt.currency || 'PEN');
  document.getElementById('debtPaymentAccountSelect').value = debt.paymentAccountId || '';
  document.getElementById('debtPaymentPrincipal').value = '';
  document.getElementById('debtPaymentInterest').value = 0;
  document.getElementById('debtPaymentDate').value = new Date().toISOString().slice(0,10);
  updateDebtPaymentTotal();
  openModal('debtPaymentModal');
}

/**
 * Actualiza debt payment total en el estado o la interfaz.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function updateDebtPaymentTotal(){
  const amount = (parseFloat(document.getElementById('debtPaymentPrincipal').value) || 0) +
    (parseFloat(document.getElementById('debtPaymentInterest').value) || 0);
  const debt = state.debts.find(d=>d.id === document.getElementById('debtPaymentId').value);
  document.getElementById('debtPaymentTotal').textContent = fmtMoney(amount,debt?.currency || 'PEN');
}

/**
 * Procesa debt payment submit y coordina validación y guardado.
 * Uso: Se usa en el módulo Deudas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function handleDebtPaymentSubmit(e){
  e.preventDefault();
  const debt = state.debts.find(d=>d.id === document.getElementById('debtPaymentId').value);
  const account = state.accounts.find(a=>a.id === document.getElementById('debtPaymentAccountSelect').value);
  const principalPaid = parseFloat(document.getElementById('debtPaymentPrincipal').value) || 0;
  const interestPaid = parseFloat(document.getElementById('debtPaymentInterest').value) || 0;
  if(!debt || !account){ toast('Selecciona la deuda y la cuenta de pago'); return; }
  if(principalPaid + interestPaid <= 0 || principalPaid > debt.balance){ toast('Verifica el monto de capital e intereses'); return; }
  if(account.currency !== (debt.currency || 'PEN')){ toast('La cuenta debe usar la misma moneda que la deuda'); return; }
  const payment = {
    id:null, type:'expense', category:'Cuota de deuda', amount:principalPaid + interestPaid,
    currency:debt.currency || 'PEN', name:`Cuota de ${debt.name}`, method:'Transferencia bancaria',
    accountId:account.id, date:document.getElementById('debtPaymentDate').value, status:'Exitoso',
    debtId:debt.id, principalPaid, interestPaid
  };
  try{
    await conCargando('Registrando pago de cuota...', ()=>crearTransaccion(payment));
    closeModal('debtPaymentModal');
    renderDebts(); renderBudget(); renderDashboard(); renderAccounts(); renderTransactions();
    toast('Cuota registrada: capital e intereses separados');
  }catch(err){
    console.error(err); toast('Error al registrar la cuota: ' + err.message);
  }
}
