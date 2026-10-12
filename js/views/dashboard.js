/* ==========================================================================
   dashboard.js — Vista Dashboard (antes "Panel").
   Incluye filtros por mes/año y por cuentas (multiselección).
   Depende de: state.js, helpers.js, charts.js.
   ========================================================================== */

/* ---------- ESTADO DE FILTROS DEL DASHBOARD ---------- */
/**
 * Filtros activos del Dashboard.
 * - month: 0..11
 * - year: YYYY
 * - accountIds: [] = todas las cuentas
 */
const dashboardFilters = {
  month: new Date().getMonth(),
  year:  new Date().getFullYear(),
  accountIds: []
};

let dashboardCreditAccountId = '';
let dashboardCreditAutoTimer = null;
const DASH_CREDIT_CARD_COLORS = [
  'linear-gradient(135deg,#8C71FF,#3D2B9A)',
  'linear-gradient(135deg,#2FBE8F,#14785B)',
  'linear-gradient(135deg,#3B9EF2,#2059AE)',
  'linear-gradient(135deg,#F2A93B,#BB6C0B)',
  'linear-gradient(135deg,#DB5B78,#96334E)'
];

/** Usa el color personalizado de la cuenta en las vistas y conserva el tema anterior como alternativa. */
function dashboardAccountColor(account,index=0){
  const color=String(account?.color||'').trim();
  if(!/^#[0-9a-f]{6}$/i.test(color))return DASH_CREDIT_CARD_COLORS[index%DASH_CREDIT_CARD_COLORS.length];
  const rgb=color.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));
  const darker='#'+rgb.map(v=>Math.round(v*.62).toString(16).padStart(2,'0')).join('');
  return `linear-gradient(135deg,${color},${darker})`;
}

/** ¿Hay filtro de cuentas activo? */
function hasAccountFilter(){
  return dashboardFilters.accountIds.length > 0;
}

/** Lista las cuentas permitidas en filtros e indicadores del Dashboard. */
function dashboardEligibleAccounts(){
  return state.accounts.filter(a=>!esTarjetaCredito(a));
}

/** Determina si una cuenta pertenece al filtro financiero del Dashboard. */
function isDashboardEligibleAccount(id){
  return dashboardEligibleAccounts().some(a=>a.id===id);
}

/** Comprueba si una transacción toca alguna cuenta incluida en el filtro del Dashboard. */
function transactionMatchesDashboardAccounts(t){
  const ids=hasAccountFilter()?dashboardFilters.accountIds:dashboardEligibleAccounts().map(a=>a.id);
  return ids.includes(t.accountId)||ids.includes(t.destinationAccountId);
}

/* ---------- HELPERS DE FILTRADO ---------- */

/**
 * Devuelve las transacciones que caen en el mes/año filtrado
 * y en las cuentas seleccionadas (si hay filtro).
 * @returns {Array}
 */
function filteredTransactions(){
  return state.transactions.filter(t=>{
    const d = new Date(t.date + 'T00:00:00');
    if(d.getFullYear() !== dashboardFilters.year) return false;
    if(d.getMonth()    !== dashboardFilters.month) return false;
    if((t.currency || 'PEN') !== state.settings.currency) return false;
    if(!transactionMatchesDashboardAccounts(t)) return false;
    return true;
  });
}

/**
 * Saldo al cierre del mes filtrado, reconstruido hacia atrás desde el saldo actual.
 * Fórmula: saldo_actual − Σ(ingresos posteriores) + Σ(gastos posteriores).
 * @returns {number}
 */
function balanceAtEndOfFilteredMonth(){
  const currentBalance = dashboardEligibleAccounts()
    .filter(a=> a.currency === state.settings.currency)
    .filter(a=> !hasAccountFilter() || dashboardFilters.accountIds.includes(a.id))
    .reduce((s,a)=> s + valorGlobalCuenta(a), 0);

  const end = new Date(dashboardFilters.year, dashboardFilters.month + 1, 0);
  const endIso = end.toISOString().slice(0,10);

  const laterTx = state.transactions.filter(t=>{
    if(t.date <= endIso) return false;
    if(!transactionMatchesDashboardAccounts(t)) return false;
    return true;
  });

  let balance = currentBalance;
  laterTx.forEach(t=>{
    if(t.status !== 'Exitoso') return;
    const impacts = impactoTransaccion(t);
    Object.entries(impacts).forEach(([id, delta])=>{
      const account = state.accounts.find(a=> a.id === id);
      if(account?.currency === state.settings.currency && isDashboardEligibleAccount(id) &&
         (!hasAccountFilter() || dashboardFilters.accountIds.includes(id)))
        balance -= (esCuentaPasivo(account) ? -delta : delta);
    });
  });
  return balance;
}

/**
 * Ahorro total de las metas filtradas por cuenta (no depende del mes todavía).
 * @returns {number}
 */
function savingsAtEndOfFilteredMonth(){
  return filteredDashboardGoals().reduce((s,g)=> s + g.saved, 0);
}

/** Devuelve metas vinculadas a las cuentas visibles en el filtro del Dashboard. */
function filteredDashboardGoals(){
  return state.goals.filter(g=>g.accountId
    ? (hasAccountFilter()?dashboardFilters.accountIds.includes(g.accountId):isDashboardEligibleAccount(g.accountId))
    : !hasAccountFilter());
}

/** Ingresos del mes filtrado (solo exitosos). */
function monthIncome(){
  return filteredTransactions()
    .filter(t=> t.type==='income' && t.status==='Exitoso')
    .reduce((s,t)=> s + t.amount, 0);
}

/** Gastos del mes filtrado (solo exitosos). */
function monthExpense(){
  return filteredTransactions()
    .filter(t=> t.type==='expense' && t.status==='Exitoso')
    .reduce((s,t)=> s + gastoUsuario(t), 0);
}

/* Las transferencias internas no gastan el monto principal; solo su comisión. */
/**
 * Calcula el gasto que cuenta para el presupuesto; las transferencias internas solo cuentan su comisión.
 * Uso: Se usa en el módulo Dashboard, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function gastoUsuario(t){
  // El aporte a una meta es una salida presupuestada hacia otra cuenta, aunque no reduzca el saldo global.
  if(t.goalId&&t.category==='Transferencia'&&t.transferType==='interna')return Number(t.amount)||0;
  if(t.category !== 'Transferencia') return t.amount;
  if(t.transferType === 'interna') return Number(t.commission) || 0;
  return t.amount + (t.commissionPayer === 'origen' ? (Number(t.commission) || 0) : 0);
}

/** Mapa { categoría: monto } de gastos del mes filtrado. */
function expenseByCategory(){
  const map = {};
  filteredTransactions()
    .filter(t=> t.type==='expense' && t.status==='Exitoso')
    .forEach(t=>{
      if(t.goalId&&t.category==='Transferencia'&&t.transferType==='interna'){
        map['Ahorro para metas']=(map['Ahorro para metas']||0)+(Number(t.amount)||0);
        return;
      }
      if(t.category === 'Transferencia' && t.transferType === 'interna'){
        if(t.commission) map['Comisiones'] = (map['Comisiones'] || 0) + t.commission;
        return;
      }
      map[t.category] = (map[t.category] || 0) + t.amount;
      if(t.category === 'Transferencia' && t.commissionPayer === 'origen' && t.commission){
        map['Comisiones'] = (map['Comisiones'] || 0) + t.commission;
      }
    });
  return map;
}

/**
 * Gasto en una categoría dentro del mes filtrado.
 * @param {string} cat
 */
function categorySpend(cat){
  return expenseByCategory()[cat] || 0;
}

/** Saldo total (respetando filtro de cuentas, no de mes). */
function totalBalance(){
  return dashboardEligibleAccounts()
    .filter(a=> a.currency === state.settings.currency)
    .filter(a=> !hasAccountFilter() || dashboardFilters.accountIds.includes(a.id))
    .reduce((s,a)=> s + valorGlobalCuenta(a), 0);
}

/** Ahorro total (respetando filtro de cuentas). */
function totalSavings(){
  return savingsAtEndOfFilteredMonth();
}

/* ---------- UI DE FILTROS ---------- */

/** Años con movimientos, más el actual y el que esté seleccionado. */
function actualizarAniosDashboard(){
  const yearSel=document.getElementById('dashYear');
  if(!yearSel) return;
  const selected=Number(dashboardFilters.year)||new Date().getFullYear();
  const years=new Set([new Date().getFullYear(),selected]);
  state.transactions.forEach(t=>{
    const match=String(t.date||'').match(/^(\d{4})-/);
    if(match) years.add(Number(match[1]));
  });
  yearSel.innerHTML=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join('');
  yearSel.value=String(selected);
}

/**
 * Inicializa los controles del Dashboard: selects de mes/año y dropdown de cuentas.
 * Se llama UNA vez al arrancar la app.
 */
function initDashboardFilters(){
  const monthSel = document.getElementById('dashMonth');
  const yearSel  = document.getElementById('dashYear');

  monthSel.innerHTML = Array.from({length:12}, (_,i)=> `<option value="${i}">${monthName(i)}</option>`).join('');
  actualizarAniosDashboard();
  monthSel.value = dashboardFilters.month;
  yearSel.value  = dashboardFilters.year;

  // La cuenta principal se aplica solo como selección inicial; el usuario puede cambiar a Todos o a otra cuenta.
  const primary=cuentaPrincipalDashboard();
  dashboardFilters.accountIds=primary?[primary.id]:[];

  monthSel.addEventListener('change', ()=>{
    dashboardFilters.month = parseInt(monthSel.value, 10);
    renderDashboard();
  });
  yearSel.addEventListener('change', ()=>{
    dashboardFilters.year = parseInt(yearSel.value, 10);
    renderDashboard();
  });

  // Dropdown de cuentas: abrir/cerrar
  const filterEl = document.getElementById('accountFilter');
  const btn = document.getElementById('accountFilterBtn');
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    filterEl.classList.toggle('open');
  });
  document.addEventListener('click', (e)=>{
    if(!filterEl.contains(e.target)) filterEl.classList.remove('open');
  });

  renderAccountFilterList();

  // Vincula las flechas una sola vez para evitar que los clics acumulen avances.
  document.getElementById('dashCreditPrev').onclick=()=>moveDashboardCreditCard(-1);
  document.getElementById('dashCreditNext').onclick=()=>moveDashboardCreditCard(1);
  clearInterval(dashboardCreditAutoTimer);
  dashboardCreditAutoTimer=setInterval(()=>{
    const carousel=document.querySelector('#view-dashboard .dashboard-credit-carousel');
    if(currentViewName()==='dashboard'&&state.accounts.filter(esTarjetaCredito).length>1&&
       !carousel?.matches(':hover')&&!carousel?.contains(document.activeElement))moveDashboardCreditCard(1);
  },10000);
}

/**
 * Renderiza la lista de checkboxes de cuentas en el dropdown.
 * Se re-renderiza cada vez que cambian las cuentas.
 */
function renderAccountFilterList(){
  const list = document.getElementById('accountFilterList');
  if(!list) return;

  const colors = ['#7457f7','#20a77a','#348ee8','#e99b26','#d94f71'];
  const accounts=dashboardEligibleAccounts();
  list.innerHTML = `
    <div class="account-filter-head">
      <span>Cuentas sin tarjetas de crédito</span>
      <button type="button" id="accFilterClear">Todos</button>
    </div>
    ${accounts.map((a,i)=> `
      <label class="account-filter-option">
        <input type="checkbox" data-acc-id="${escapeHTML(a.id)}" ${dashboardFilters.accountIds.includes(a.id) ? 'checked' : ''}>
        <span class="acc-dot" style="background:${/^#[0-9a-f]{6}$/i.test(String(a.color||''))?a.color:colors[i % colors.length]}"></span>
        <span>${escapeHTML(a.name)}${a.last4 ? ' ••'+escapeHTML(a.last4) : ''}</span>
        <span class="acc-bal">${fmtMoney(a.balance, a.currency || 'PEN')}</span>
      </label>
    `).join('')}
  `;

  list.querySelectorAll('input[data-acc-id]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const id = cb.dataset.accId;
      if(cb.checked){
        if(!dashboardFilters.accountIds.includes(id)) dashboardFilters.accountIds.push(id);
      } else {
        dashboardFilters.accountIds = dashboardFilters.accountIds.filter(x=> x!==id);
      }
      updateAccountFilterLabel();
      renderDashboard();
    });
  });

  document.getElementById('accFilterClear').addEventListener('click', ()=>{
    dashboardFilters.accountIds = [];
    renderAccountFilterList();
    updateAccountFilterLabel();
    renderDashboard();
  });

  updateAccountFilterLabel();
}

/** Dibuja accesos rápidos Todos/cuenta debajo de los filtros principales. */
function renderDashboardAccountQuickFilters(){
  const nav=document.getElementById('dashboardAccountQuickFilters');if(!nav)return;
  const accounts=dashboardEligibleAccounts();
  const allActive=!hasAccountFilter();
  nav.innerHTML=[
    `<button type="button" class="dashboard-account-chip ${allActive?'active':''}" data-quick-account="all">Todos</button>`,
    ...accounts.map((a,i)=>`<button type="button" class="dashboard-account-chip ${dashboardFilters.accountIds.length===1&&dashboardFilters.accountIds[0]===a.id?'active':''}" data-quick-account="${escapeHTML(a.id)}" style="--account-chip-color:${/^#[0-9a-f]{6}$/i.test(String(a.color||''))?a.color:['#7457f7','#20a77a','#348ee8','#e99b26','#d94f71'][i%5]}">${escapeHTML(a.name)}</button>`)
  ].join('');
  nav.querySelectorAll('[data-quick-account]').forEach(button=>button.addEventListener('click',()=>{
    dashboardFilters.accountIds=button.dataset.quickAccount==='all'?[]:[button.dataset.quickAccount];
    renderDashboard();
  }));
  nav.hidden=accounts.length===0;
}

/** Actualiza el label del botón de cuentas según el filtro activo. */
function updateAccountFilterLabel(){
  const label = document.getElementById('accountFilterLabel');
  const filterEl = document.getElementById('accountFilter');
  if(!label) return;

  if(!hasAccountFilter()){
    label.textContent = 'Todas las cuentas';
    filterEl.classList.remove('active');
  } else if(dashboardFilters.accountIds.length === 1){
    const acc = state.accounts.find(a=> a.id === dashboardFilters.accountIds[0]);
    label.textContent = acc ? acc.name : '1 cuenta';
    filterEl.classList.add('active');
  } else {
    label.textContent = `${dashboardFilters.accountIds.length} cuentas`;
    filterEl.classList.add('active');
  }
}

/* ---------- RENDER PRINCIPAL ---------- */

/**
 * Renderiza toda la vista Dashboard con los filtros actuales.
 */
function renderDashboard(){
  const eligibleIds=new Set(dashboardEligibleAccounts().map(a=>a.id));
  dashboardFilters.accountIds=dashboardFilters.accountIds.filter(id=>eligibleIds.has(id));
  actualizarAniosDashboard();
  renderAccountFilterList();

  renderDashboardAccountQuickFilters();

  const bal = balanceAtEndOfFilteredMonth();
  const inc = monthIncome();
  const exp = monthExpense();
  const sav = savingsAtEndOfFilteredMonth();

  document.getElementById('statGrid').innerHTML = [
    statCard('Saldo al cierre', bal, '+12.1%', 'up', iconWallet()),
    statCard('Ingresos',        inc, '+6.3%',  'up', iconArrowDown()),
    statCard('Gastos',          exp, '+2.4%',  'down', iconArrowUp()),
    statCard('Ahorros totales', sav, '+12.1%', 'up', iconTarget())
  ].join('');

  // Transacciones recientes del mes filtrado
  const recent = [...filteredTransactions()]
    .sort((a,b)=> b.date.localeCompare(a.date))
    .slice(0,5);
  document.querySelector('#recentTxTable tbody').innerHTML =
    recent.map(t=> miniRow(t)).join('') || emptyRow();

  // Metas mini (filtradas por cuenta)
  const visibleGoals = filteredDashboardGoals();
  document.getElementById('goalMiniList').innerHTML =
    visibleGoals.slice(0,3).map(g=>{
      const pct = Math.min(100, Math.round((g.saved/g.target)*100));
      return `<div class="goal-mini-row">
        <div class="goal-mini-top"><span>${escapeHTML(g.name)}</span><span>${fmtMoney(g.saved)} / ${fmtMoney(g.target)}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('') || `<p class="muted small">Sin metas para las cuentas seleccionadas.</p>`;

  // Presupuesto del mes filtrado
  const budgetCategories = budgetCategoriesWithLimits();
  const totalBudget = budgetCategories.reduce((s,b)=> s + b.limit, 0);
  const spentOnBudgeted = budgetCategories.reduce((s,b)=> s + categorySpend(b.category), 0);
  document.getElementById('budgetRemaining').textContent =
    fmtMoney(Math.max(0, totalBudget - spentOnBudgeted));
  document.getElementById('budgetSpentThisMonth').textContent  = fmtMoney(spentOnBudgeted);
  document.getElementById('budgetTotalThisMonth').textContent  = fmtMoney(totalBudget);

  renderMoneyFlowChart();
  renderBudgetDonut('budgetDonut', spentOnBudgeted, totalBudget);
  renderDashboardCreditWidgets();
  renderDashboardAccounts();
}

/* ---------- COMPONENTES INTERNOS ---------- */

/**
 * Devuelve el HTML de una stat-card.
 */
function statCard(label, value, change, dir, icon){
  return `<div class="stat-card">
    <div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon">${icon}</span></div>
    <div class="stat-value">${fmtMoney(value)}</div>
    <div class="stat-foot">
      <span class="stat-change ${dir}">${dir==='up'?'↑':'↓'} ${change}</span>
      <span class="stat-sub">vs. mes anterior</span>
    </div>
  </div>`;
}

/**
 * Devuelve el SVG de billetera usado en la tarjeta de saldo del Dashboard.
 * Uso: Se usa en el módulo Dashboard, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function iconWallet(){    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2"/></svg>`; }
/**
 * Devuelve el SVG de flecha hacia abajo usado en la tarjeta de ingresos.
 * Uso: Se usa en el módulo Dashboard, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function iconArrowDown(){ return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 4v16M6 14l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
/**
 * Devuelve el SVG de flecha hacia arriba usado en la tarjeta de egresos.
 * Uso: Se usa en el módulo Dashboard, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function iconArrowUp(){   return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 20V4M6 10l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
/**
 * Devuelve el SVG de objetivo usado en la tarjeta de ahorros.
 * Uso: Se usa en el módulo Dashboard, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function iconTarget(){    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>`; }

/**
 * Fila compacta de transacción (usada en Dashboard y Billetera).
 */
function miniRow(t){
  const meta = metaCategoria(t.category);
  const amt = t.type==='income' ? `+${fmtMoney(t.amount, t.currency)}` : `-${fmtMoney(t.amount, t.currency)}`;
  return `<tr>
    <td style="color:var(--text-muted); width:70px;">${escapeHTML(fmtDateShort(t.date))}</td>
    <td class="${t.type==='income'?'amount-pos':'amount-neg'}" style="width:90px;">${amt}</td>
    <td><div class="tx-name-cell"><span class="tx-icon">${escapeHTML(meta.icon)}</span>${escapeHTML(t.name)}</div></td>
    <td style="color:var(--text-muted);">${escapeHTML(etiquetaCategoria(t.category))}</td>
  </tr>`;
}

/** Fila vacía para tablas sin datos. */
function emptyRow(){
  return `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Sin datos para este período</td></tr>`;
}

/* ---------- GRÁFICOS DEL DASHBOARD ---------- */

/** Serie diaria del mes seleccionado y neto diario (ingresos menos egresos). */
function monthlyFlowSeries(){
  const tx = filteredTransactions().filter(t=> t.status==='Exitoso');
  const daysInMonth = new Date(dashboardFilters.year, dashboardFilters.month + 1, 0).getDate();
  const inc = Array(daysInMonth).fill(0);
  const exp = Array(daysInMonth).fill(0);
  tx.forEach(t=>{
    const day = parseInt(t.date.slice(8,10), 10);
    if(day < 1 || day > daysInMonth) return;
    if(t.type==='income') inc[day-1] += Number(t.amount)||0;
    else if(t.type==='expense') exp[day-1] += gastoUsuario(t);
  });
  const net = inc.map((amount,index)=>amount-exp[index]);
  return { labels:Array.from({length:daysInMonth},(_,i)=>String(i+1)), inc, exp, net };
}

/** Render de ingresos y egresos diarios junto al flujo neto de cada día. */
function renderMoneyFlowChart(){
  const c = chartColors();
  const { labels, inc, exp, net } = monthlyFlowSeries();
  destroyChart('moneyFlow');
  charts.moneyFlow = new Chart(document.getElementById('moneyFlowChart'), {
    type:'bar',
    data:{ labels, datasets:[
      { type:'bar', label:'Ingresos', data:inc, backgroundColor:c.dark, borderRadius:5, maxBarThickness:12 },
      { type:'bar', label:'Egresos', data:exp, backgroundColor:c.faint, borderRadius:5, maxBarThickness:12 },
      { type:'line', label:'Flujo neto diario', data:net, borderColor:c.accent, backgroundColor:hexAlpha(c.accent,.12),
        pointRadius:2, pointHoverRadius:4, borderWidth:2, tension:.32, fill:false, spanGaps:true }
    ]},
    options:{...baseBarOptions(c), interaction:{mode:'index',intersect:false}, scales:{
      x:{grid:{display:false},ticks:{color:c.text,font:{size:10,family:'Inter'},maxRotation:0,autoSkip:true,maxTicksLimit:16}},
      y:{grid:{color:c.grid},ticks:{color:c.text,font:{size:11,family:'Inter'}}}
    },plugins:{...baseBarOptions(c).plugins,legend:{display:false}}}
  });
}

/** Devuelve todas las cuentas reconocidas por el catálogo como tarjetas de crédito. */
function dashboardCreditAccounts(){
  return state.accounts.filter(a=>esTarjetaCredito(a));
}

/**
 * Devuelve porcentaje, etiqueta y color de alerta para el uso de una línea.
 * Uso: Se comparte entre el resumen global y el detalle de cada tarjeta.
 */
function creditUsageStatus(limit,used){
  if(!(Number(limit)>0))return {pct:null,label:'LÍMITE SIN CONFIGURAR',level:'is-unconfigured',color:'var(--text-muted)'};
  const pct=Math.max(0,Math.round((Number(used)||0)/Number(limit)*100));
  if(pct<30)return {pct,label:'USO BAJO',level:'is-low',color:'var(--accent-2)'};
  if(pct<=70)return {pct,label:'PRECAUCIÓN',level:'is-medium',color:'#F2A000'};
  return {pct,label:'USO ALTO',level:'is-high',color:'var(--danger)'};
}

/**
 * Calcula la próxima fecha mensual de corte o pago para un día configurado.
 * Uso: Muestra fechas futuras en el panel individual de cada tarjeta de crédito.
 */
function nextCreditCycleDate(day,fromDate=new Date()){
  const cycleDay=parseInt(day,10);if(!(cycleDay>=1&&cycleDay<=31))return null;
  const today=new Date(fromDate);today.setHours(0,0,0,0);
  for(let offset=0;offset<13;offset++){
    const first=new Date(today.getFullYear(),today.getMonth()+offset,1);
    const lastDay=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
    const candidate=new Date(first.getFullYear(),first.getMonth(),Math.min(cycleDay,lastDay));
    if(candidate>=today)return candidate;
  }
  return null;
}

/**
 * Formatea el próximo corte o vencimiento de pago para el panel de tarjeta.
 * Uso: Se llama desde renderDashboardCreditCarousel() para cada tarjeta activa.
 */
function creditCycleDateLabel(day){
  const date=nextCreditCycleDate(day);
  return date?new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric'}).format(date):'No configurado';
}

/**
 * Avanza o retrocede la selección del carrusel de tarjetas de crédito del Dashboard.
 * Uso: Se usa en el módulo Dashboard, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function moveDashboardCreditCard(offset){
  const accounts=dashboardCreditAccounts();
  if(accounts.length<2)return;
  let index=accounts.findIndex(a=>a.id===dashboardCreditAccountId);
  if(index<0)index=0;
  dashboardCreditAccountId=accounts[(index+offset+accounts.length)%accounts.length].id;
  renderDashboardCreditWidgets();
}

/** Dibuja el resumen global y el carrusel con detalle por tarjeta. */
function renderDashboardCreditWidgets(){
  renderCreditLineSummary();
  renderDashboardCreditCarousel();
}

/**
 * Resume líneas, deuda y disponible de tarjetas, separando monedas.
 * Uso: Se usa en la vista Dashboard al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderCreditLineSummary(){
  const el=document.getElementById('creditGlobalWidget');
  if(!el)return;
  const accounts=dashboardCreditAccounts();
  if(!accounts.length){
    el.style.removeProperty('--credit-alert-color');
    el.innerHTML='<div class="credit-global-heading"><div><h3>💳 Línea de crédito total</h3><p class="muted small">Suma de tus tarjetas</p></div></div><p class="muted small">Agrega una tarjeta de crédito para ver aquí la línea total.</p>';
    return;
  }
  const currencies=[...new Set(accounts.map(a=>a.currency||'PEN'))];
  const primaryCurrency=currencies.includes(state.settings.currency)?state.settings.currency:currencies[0];
  const primary=accounts.filter(a=>(a.currency||'PEN')===primaryCurrency);
  const total=primary.reduce((s,a)=>s+(Number(a.creditLimit)||0),0);
  const used=primary.reduce((s,a)=>s+(Number(a.balance)||0),0);
  const overall=creditUsageStatus(total,used);
  el.style.setProperty('--credit-alert-color',overall.color);
  const grouped=currencies.map(currency=>{
    const items=accounts.filter(a=>(a.currency||'PEN')===currency);
    const limit=items.reduce((s,a)=>s+(Number(a.creditLimit)||0),0);
    const debt=items.reduce((s,a)=>s+(Number(a.balance)||0),0);
    const free=items.reduce((s,a)=>s+Math.max(0,(Number(a.creditLimit)||0)-(Number(a.balance)||0)),0);
    return {currency,limit,debt,free,status:creditUsageStatus(limit,debt)};
  });
  el.innerHTML=`<div class="credit-global-heading"><div><h3>💳 Línea de crédito total</h3><p class="muted small">Suma de ${accounts.length} tarjeta${accounts.length===1?'':'s'}</p></div><span class="credit-alert ${overall.level}">${overall.label}</span></div>
    <div class="credit-global-main"><div><strong>${fmtMoney(total,primaryCurrency)}</strong><span>Línea total en ${escapeHTML(primaryCurrency)} · ${overall.pct===null?'completa el límite':`${overall.pct}% usado`}</span></div><div class="credit-global-ring" style="--credit-used:${Math.min(100,overall.pct||0)}%;--credit-usage-color:${overall.color}" aria-label="${overall.pct===null?'Límite no configurado':`${overall.pct}% de línea usada`}"><span>${overall.pct===null?'—':`${overall.pct}%`}</span></div></div>
    <div class="credit-global-totals">${grouped.map(g=>`<div class="credit-currency-group"><strong>${escapeHTML(g.currency)}</strong><div><small>LÍNEA</small><b>${fmtMoney(g.limit,g.currency)}</b></div><div><small>USADO</small><b>${fmtMoney(g.debt,g.currency)}</b></div><div><small>DISPONIBLE</small><b>${fmtMoney(g.free,g.currency)}</b></div><div class="credit-currency-status" style="--credit-usage-color:${g.status.color}"><small>${g.status.pct===null?'USO':`${g.status.pct}% USADO`}</small><span class="credit-mini-track"><i style="width:${Math.min(100,g.status.pct||0)}%"></i></span></div></div>`).join('')}</div>`;
}

/**
 * Lista en el lateral las cuentas que no son tarjetas de crédito.
 * Se usa en renderDashboard() para mostrar saldo y tipo de cada cuenta.
 */
function renderDashboardAccounts(){
  const list=document.getElementById('dashboardAccountsList');
  const count=document.getElementById('dashboardAccountCount');
  if(!list)return;
  const accounts=state.accounts.filter(a=>!esTarjetaCredito(a));
  if(count)count.textContent=`${accounts.length} cuenta${accounts.length===1?' activa':'s activas'}`;
  if(!accounts.length){
    list.innerHTML='<p class="muted small dashboard-accounts-empty">No hay cuentas fuera de tarjetas de crédito.</p>';
    return;
  }
  list.innerHTML=accounts.map(account=>{
    const kind=claseCuentaNombre(account.accountKind)||'Cuenta';
    const subtitle=[account.bank,kind,account.currency||'PEN'].filter(Boolean).join(' · ');
    const balance=valorGlobalCuenta(account);
    return `<a href="#" class="dashboard-account-item link-btn" data-goto="accounts">
      <span class="dashboard-account-icon" style="--account-item-bg:${dashboardAccountColor(account,state.accounts.indexOf(account))}">${escapeHTML((account.name||'C').trim().slice(0,1).toUpperCase())}</span>
      <span class="dashboard-account-copy"><strong>${escapeHTML(account.name||'Cuenta')}</strong><small>${escapeHTML(subtitle)}</small></span>
      <span class="dashboard-account-balance">${fmtMoney(balance,account.currency||'PEN')}</span>
    </a>`;
  }).join('');
}

/**
 * Suma el consumo y el número de movimientos que aumentaron la deuda durante el mes seleccionado.
 * Uso: Se usa en el módulo Dashboard, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function dashboardCreditMonthSummary(account){
  let consumed=0,count=0;
  state.transactions.forEach(t=>{
    if(t.status!=='Exitoso'||(t.currency||'PEN')!==(account.currency||'PEN'))return;
    const d=String(t.date||'');
    if(!d.startsWith(`${dashboardFilters.year}-${String(dashboardFilters.month+1).padStart(2,'0')}-`))return;
    const delta=Number(impactoTransaccion(t)[account.id])||0;
    if(delta>0){consumed+=delta;count++;}
  });
  return {consumed,count};
}

/**
 * Pinta la tarjeta activa y sus detalles en el Dashboard.
 * Uso: Se usa en la vista Dashboard al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderDashboardCreditCarousel(){
  const stage=document.getElementById('dashCreditCardStage');
  const detail=document.getElementById('dashCreditDetail');
  const pagination=document.getElementById('dashCreditPagination');
  const prev=document.getElementById('dashCreditPrev'),next=document.getElementById('dashCreditNext');
  if(!stage||!detail||!pagination)return;
  const accounts=dashboardCreditAccounts();
  if(!accounts.some(a=>a.id===dashboardCreditAccountId))dashboardCreditAccountId=accounts[0]?.id||'';
  if(prev)prev.disabled=accounts.length<2;if(next)next.disabled=accounts.length<2;
  if(!accounts.length){
    stage.innerHTML='<div class="dashboard-credit-empty"><span>💳</span><strong>Aún no tienes tarjetas de crédito</strong><small>Cuando agregues una tarjeta, aquí verás su línea, deuda y consumo.</small></div>';
    detail.innerHTML='<div class="dashboard-credit-empty"><strong>Detalle de tarjeta</strong><small>La información de tus tarjetas aparecerá aquí.</small></div>';
    pagination.innerHTML='';destroyChart('dashboardCreditHistory');return;
  }
  const index=accounts.findIndex(a=>a.id===dashboardCreditAccountId);
  const account=accounts[index];
  const brand=opcionesCatalogo('tipo_cuenta').find(x=>x.value===account.type)?.label||account.type||'Tarjeta';
  const line=Number(account.creditLimit)||0, debt=Number(account.balance)||0;
  const available=Math.max(0,line-debt), usage=creditUsageStatus(line,debt);
  const month=dashboardCreditMonthSummary(account);
  stage.innerHTML=`<div class="dashboard-credit-card" style="--account-card-bg:${dashboardAccountColor(account,index)}">
    <div class="dashboard-credit-card-top"><span>${escapeHTML(account.bank||account.name)}</span><span>${escapeHTML(brand)}</span></div>
    <div class="dashboard-credit-card-number">${account.last4?'••••  ••••  ••••  '+escapeHTML(account.last4):'TARJETA FINSET'}</div>
    <strong>${escapeHTML(account.name)}</strong><div class="dashboard-credit-card-bottom"><span>${escapeHTML(account.currency||'PEN')}</span><span>${escapeHTML(claseCuentaNombre(account.accountKind))}</span></div>
  </div>`;
  let touchStartX=0;
  stage.ontouchstart=e=>{touchStartX=e.changedTouches[0]?.screenX||0;};
  stage.ontouchend=e=>{const delta=(e.changedTouches[0]?.screenX||touchStartX)-touchStartX;if(Math.abs(delta)>45)moveDashboardCreditCard(delta<0?1:-1);};
  pagination.innerHTML=accounts.map((a,i)=>`<button type="button" class="account-page-dot ${a.id===account.id?'active':''}" data-dash-credit-dot="${escapeHTML(a.id)}" aria-label="Ver tarjeta ${i+1}"></button>`).join('');
  pagination.querySelectorAll('[data-dash-credit-dot]').forEach(dot=>dot.addEventListener('click',()=>{dashboardCreditAccountId=dot.dataset.dashCreditDot;renderDashboardCreditWidgets();}));
  detail.innerHTML=`<div class="dashboard-credit-detail-head"><div><h3>${escapeHTML(account.name)}</h3><span>${escapeHTML(account.bank||'')} · ${escapeHTML(brand)}</span></div><span class="credit-alert ${usage.level}">${usage.label}</span></div>
    <div class="dashboard-credit-metrics"><div><small>LÍNEA TOTAL</small><strong>${fmtMoney(line,account.currency)}</strong></div><div><small>DISPONIBLE</small><strong>${fmtMoney(available,account.currency)}</strong></div><div><small>TOTAL USADO</small><strong>${fmtMoney(debt,account.currency)}</strong></div></div>
    <div class="account-usage"><div><span>Uso de línea</span><strong>${usage.pct===null?'—':`${usage.pct}%`}</strong></div><div class="account-usage-track"><span style="width:${Math.min(100,usage.pct||0)}%;--credit-usage-color:${usage.color}"></span></div></div>
    <div class="dashboard-credit-month"><div><small>CONSUMO DEL MES</small><strong>${fmtMoney(month.consumed,account.currency)}</strong><span>${month.count} movimiento${month.count===1?'':'s'} · ${escapeHTML(monthName(dashboardFilters.month))}</span></div><div><small>PRÓXIMO CORTE</small><strong>${escapeHTML(creditCycleDateLabel(account.closingDay))}</strong><span>${account.closingDay?`Día ${account.closingDay} de cada mes`:'Agrega el día de corte'}</span></div><div><small>PRÓXIMO PAGO</small><strong>${escapeHTML(creditCycleDateLabel(account.paymentDay))}</strong><span>${account.paymentDay?`Día ${account.paymentDay} de cada mes`:'Agrega el día de pago'}</span></div></div>
    <div class="dashboard-credit-history-label">EVOLUCIÓN DE DEUDA · ÚLTIMOS 30 DÍAS</div><div class="dashboard-credit-history"><canvas id="dashboardCreditHistory"></canvas></div>
    <a href="#" class="link-btn dashboard-credit-more" data-goto="accounts">Ver detalle completo →</a>`;
  renderDashboardCreditHistory(account);
}

/**
 * Dibuja la evolución reciente de deuda de la tarjeta activa.
 * Uso: Se usa en la vista Dashboard al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderDashboardCreditHistory(account){
  const canvas=document.getElementById('dashboardCreditHistory');if(!canvas)return;
  const c=chartColors(),days=30,end=new Date();end.setHours(0,0,0,0);
  const start=new Date(end);start.setDate(start.getDate()-days+1);
  const deltas=Array(days).fill(0);
  state.transactions.forEach(t=>{
    if(t.status!=='Exitoso')return;
    const delta=Number(impactoTransaccion(t)[account.id])||0;if(!delta)return;
    const date=new Date(`${t.date}T00:00:00`);const offset=Math.round((date-start)/86400000);
    if(offset>=0&&offset<days)deltas[offset]+=delta;
  });
  let value=(Number(account.balance)||0)-deltas.reduce((s,n)=>s+n,0);
  const series=deltas.map(delta=>(value+=delta));
  const labels=Array.from({length:days},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return `${d.getDate()}/${d.getMonth()+1}`;});
  destroyChart('dashboardCreditHistory');
  charts.dashboardCreditHistory=new Chart(canvas,{type:'line',data:{labels,datasets:[{label:'Deuda',data:series,borderColor:c.accent,backgroundColor:hexAlpha(c.accent,.15),fill:true,borderWidth:2,pointRadius:0,pointHoverRadius:3,tension:.3}]},options:{...baseLineOptions(c),plugins:{...baseLineOptions(c).plugins,legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:c.text,maxRotation:0,autoSkip:true,maxTicksLimit:6}},y:{grid:{color:c.grid},ticks:{color:c.text,callback:value=>fmtMoney(value,account.currency)}}}}});
}

/** Render del donut de presupuesto (gastado vs disponible). */
function renderBudgetDonut(canvasId, spent, total){
  const c = chartColors();
  const remaining = Math.max(0, total - spent);
  destroyChart(canvasId);
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type:'doughnut',
    data:{
      labels:['Gastado','Disponible'],
      datasets:[{ data:[spent, remaining || 0.0001], backgroundColor:[c.accent, c.grid], borderWidth:0 }]
    },
    options: donutOptions()
  });
}
