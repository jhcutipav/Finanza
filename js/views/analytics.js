/* ==========================================================================
   analytics.js — Vista Analítica (stats + balance histórico + donut + barras).
   Depende de: state.js, helpers.js, charts.js, dashboard.js
   (statCardDetailed, categorySpend).
   ========================================================================== */

/**
 * Renderiza la vista Analítica con sus 3 stat-cards, 3 gráficos y leyenda.
 */
function renderAnalytics(){
  const bal = totalBalance();
  const inc = monthIncome();
  const exp = monthExpense();

  document.getElementById('analyticsStatGrid').innerHTML = [
    statCardDetailed('Saldo total', bal, '+12.1%', 'up',
      `${state.transactions.length} transacciones`, iconWallet()),
    statCardDetailed('Ingresos', inc, '+6.3%', 'up',
      `${state.transactions.filter(t=>t.type==='income').length} transacciones`, iconArrowDown()),
    statCardDetailed('Gastos', exp, '-2.4%', 'down',
      `${state.transactions.filter(t=>t.type==='expense').length} transacciones`, iconArrowUp())
  ].join('');

  // Categorías del período/moneda elegidos; las comisiones van separadas.
  const topCats = Object.entries(expenseByCategory()).sort((a,b)=> b[1]-a[1]).slice(0,5);
  const totalExp = topCats.reduce((s,[,value])=>s+value,0) || 1;

  document.getElementById('analyticsLegendList').innerHTML = topCats.map(([cat,val])=>{
    const meta = metaCategoria(cat);
    const pct = Math.round((val/totalExp)*100);
    return `<div class="legend-row">
      <div class="lg-left"><span class="legend-swatch" style="background:${meta.color}"></span>${escapeHTML(cat)}</div>
      <strong>${pct}%&nbsp;&nbsp;${fmtMoney(val, state.settings.currency)}</strong>
    </div>`;
  }).join('');

  document.getElementById('analyticsDonutTotal').textContent = fmtMoney(exp);

  renderBalanceOverviewChart();
  renderAnalyticsDonut(topCats);
  renderBudgetVsExpenseChart();
}

/**
 * Variante de statCard con subtítulo personalizado (para Analítica).
 */
function statCardDetailed(label, value, change, dir, sub, icon){
  return `<div class="stat-card">
    <div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon">${icon}</span></div>
    <div class="stat-value">${fmtMoney(value)}</div>
    <div class="stat-foot">
      <span class="stat-change ${dir}">${dir==='up'?'↑':'↓'} ${change}</span>
      <span class="stat-sub">${sub}</span>
    </div>
  </div>`;
}

/** Render del gráfico "Resumen del saldo total" (línea histórica). */
function renderBalanceOverviewChart(){
  const c = chartColors();
  const tx = [...state.transactions].filter(t=>t.status === 'Exitoso')
    .sort((a,b)=> a.date.localeCompare(b.date));
  const historicalDelta = tx.reduce((sum,t)=> sum + Object.entries(impactoTransaccion(t)).reduce((subtotal,[id,delta])=>{
    const account = state.accounts.find(a=>a.id === id);
    if(account?.currency !== state.settings.currency) return subtotal;
    return subtotal + (esCuentaPasivo(account) ? -delta : delta);
  },0),0);
  const start = totalBalance() - historicalDelta;
  let running = start;
  const points = tx.map(t=>{
    running += Object.entries(impactoTransaccion(t)).reduce((sum,[id,delta])=>
      sum + (state.accounts.find(a=>a.id === id)?.currency === state.settings.currency
        ? (esCuentaPasivo(state.accounts.find(a=>a.id === id)) ? -delta : delta) : 0), 0);
    return running;
  });
  destroyChart('balanceOverview');
  charts.balanceOverview = new Chart(document.getElementById('balanceOverviewChart'), {
    type:'line',
    data:{ labels: tx.map(t=> fmtDateShort(t.date)), datasets:[
      { label:'Saldo total', data:points, borderColor:c.accent,
        backgroundColor: hexAlpha(c.accent,0.12), fill:true, tension:.4,
        pointRadius:0, borderWidth:2.5 }
    ]},
    options: baseLineOptions(c)
  });
}

/**
 * Render del donut de Analítica (top categorías de gasto).
 */
function renderAnalyticsDonut(topCats){
  const c = chartColors();
  const palette = topCats.map(([cat])=> metaCategoria(cat).color);
  destroyChart('analyticsDonut');
  charts.analyticsDonut = new Chart(document.getElementById('analyticsDonut'), {
    type:'doughnut',
    data:{
      labels: topCats.map(x=> x[0]),
      datasets:[{ data: topCats.map(x=> x[1]),
        backgroundColor: palette.length ? palette : [c.grid], borderWidth:0 }]
    },
    options: donutOptions()
  });
}

/** Render del gráfico "Presupuesto vs Gasto" (barras dobles). */
function renderBudgetVsExpenseChart(){
  const c = chartColors();
  const budgets = budgetCategoriesWithLimits();
  const labels  = budgets.map(b=> etiquetaCategoria(b.category));
  const planned = budgets.map(b=> b.limit);
  const spent   = budgets.map(b=> categorySpend(b.category));

  destroyChart('budgetVsExpense');
  charts.budgetVsExpense = new Chart(document.getElementById('budgetVsExpenseChart'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Presupuesto', data:planned, backgroundColor:c.faint,  borderRadius:6, barThickness:18 },
      { label:'Gasto',       data:spent,   backgroundColor:c.accent, borderRadius:6, barThickness:18 }
    ]},
    options: baseBarOptions(c)
  });
}
