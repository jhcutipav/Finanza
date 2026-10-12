/* ==========================================================================
   reports.js — Vista Reportes (resúmenes descargables + histórico + tendencia)
   Depende de: state.js, helpers.js, charts.js.
   ========================================================================== */

/* Estado local de filtros de reportes (independiente del dashboard). */
const reportFilters = {
  month: new Date().getMonth(),
  year:  new Date().getFullYear()
};

/**
 * Renderiza la vista Reportes: filtros, cards, histórico y tendencia.
 */
function renderReports(){
  // Inicializar selects la primera vez
  const monthSel = document.getElementById('reportMonth');
  const yearSel  = document.getElementById('reportYear');
  if(monthSel && !monthSel.options.length){
    monthSel.innerHTML = Array.from({length:12},(_,i)=> `<option value="${i}">${monthName(i)}</option>`).join('');
    yearSel.innerHTML  = [2023,2024,2025,2026].map(y=> `<option value="${y}">${y}</option>`).join('');
    monthSel.value = reportFilters.month;
    yearSel.value  = reportFilters.year;
    monthSel.addEventListener('change', ()=>{
      reportFilters.month = parseInt(monthSel.value,10);
      renderReports();
    });
    yearSel.addEventListener('change', ()=>{
      reportFilters.year = parseInt(yearSel.value,10);
      renderReports();
    });
  }

  /* ---------- CARDS DE REPORTE ---------- */
  const reportDefs = [
    {
      key:'monthly',
      icon:'📅',
      title:'Reporte mensual',
      desc:'Ingresos, gastos y balance del mes seleccionado con desglose por categoría.',
      meta:'CSV · PDF (próximamente)'
    },
    {
      key:'categories',
      icon:'🗂️',
      title:'Reporte por categoría',
      desc:'Detalle de cuánto gastaste en cada categoría durante los últimos 6 meses.',
      meta:'CSV · PDF (próximamente)'
    },
    {
      key:'accounts',
      icon:'💳',
      title:'Reporte por cuenta',
      desc:'Movimientos y saldo consolidado por cuenta, tarjeta y efectivo.',
      meta:'CSV · PDF (próximamente)'
    }
  ];

  document.getElementById('reportCards').innerHTML = reportDefs.map(r=> `
    <div class="report-card" data-report="${r.key}">
      <div class="report-card-icon">${r.icon}</div>
      <h4>${r.title}</h4>
      <p>${r.desc}</p>
      <div class="report-card-foot">
        <small>${r.meta}</small>
        <a href="#" class="link-btn" data-report-action="${r.key}">Generar</a>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-report-action]').forEach(a=>{
    a.addEventListener('click',(e)=>{
      e.preventDefault();
      e.stopPropagation();
      toast('Generación de reporte próximamente');
    });
  });
  document.querySelectorAll('.report-card').forEach(card=>{
    card.addEventListener('click', ()=> toast('Generación de reporte próximamente'));
  });

  /* ---------- HISTÓRICO ÚLTIMOS 6 MESES ---------- */
  const history = last6MonthsHistory();
  const tbody = document.querySelector('#reportsHistoryTable tbody');
  tbody.innerHTML = history.map(h=> {
    const balanceClass = h.balance >= 0 ? 'amount-pos' : 'amount-neg';
    return `<tr>
      <td><b>${h.label}</b></td>
      <td class="amount-pos">+${fmtMoney(h.income)}</td>
      <td class="amount-neg">-${fmtMoney(h.expense)}</td>
      <td class="${balanceClass}">${h.balance>=0?'+':''}${fmtMoney(h.balance)}</td>
      <td>${h.income ? Math.round((h.balance/h.income)*100) : 0}%</td>
    </tr>`;
  }).join('');

  renderDebitIncomeReport(parseInt(monthSel.value,10), parseInt(yearSel.value,10));

  /* ---------- TENDENCIA ---------- */
  renderReportsTrendChart(history);

  /* ---------- EXPORTAR CSV (placeholder) ---------- */
  const exportBtn = document.getElementById('exportReportCsvBtn');
  if(exportBtn && !exportBtn.dataset.wired){
    exportBtn.dataset.wired = '1';
    exportBtn.addEventListener('click', ()=> toast('Exportación de reporte próximamente'));
  }
}

/**
 * Devuelve los últimos 6 meses (más reciente primero) con ingresos/gastos/balance.
 * @returns {Array<{label:string, income:number, expense:number, balance:number}>}
 */
function last6MonthsHistory(){
  const today = new Date();
  const result = [];
  for(let i = 0; i < 6; i++){
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();

    const tx = state.transactions.filter(t=>{
      const td = new Date(t.date + 'T00:00:00');
      return td.getFullYear() === y && td.getMonth() === m && t.status === 'Exitoso' &&
        (t.currency || 'PEN') === state.settings.currency;
    });

    const income  = tx.filter(t=> t.type==='income').reduce((s,t)=> s + t.amount, 0);
    const expense = tx.filter(t=> t.type==='expense').reduce((s,t)=> s + gastoUsuario(t), 0);
    result.push({
      label: `${monthName(m).slice(0,3)} ${y}`,
      income, expense, balance: income - expense
    });
  }
  return result.reverse(); // más antiguo primero para el gráfico
}

/**
 * Gráfico de tendencia (línea) de ingresos vs gastos.
 */
function renderReportsTrendChart(history){
  const c = chartColors();
  destroyChart('reportsTrend');
  charts.reportsTrend = new Chart(document.getElementById('reportsTrendChart'), {
    type:'line',
    data:{
      labels: history.map(h=> h.label),
      datasets:[
        { label:'Ingresos', data: history.map(h=> h.income),
          borderColor:c.accent, backgroundColor: hexAlpha(c.accent,0.12),
          fill:true, tension:.4, pointRadius:3, borderWidth:2.5 },
        { label:'Gastos', data: history.map(h=> h.expense),
          borderColor:c.faint, backgroundColor: hexAlpha(c.faint,0.15),
          fill:true, tension:.4, pointRadius:3, borderWidth:2.5 }
      ]
    },
    options: baseLineOptions(c)
  });
}

/** Wiring de la vista Reportes (los listeners de filtros se hacen en render). */
function initReportsView(){
  // Los filtros de mes/año se conectan en el primer render.
  // No hay más listeners globales por ahora.
}

/* Ingreso registrado en cuentas clasificadas como débito, agrupado por banco/cuenta. */
/**
 * Renderiza debit income report en su vista.
 * Uso: Se usa en la vista Reportes al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderDebitIncomeReport(month, year){
  const totals = new Map();
  state.transactions.filter(t=>{
    const d = new Date(t.date + 'T00:00:00');
    const account = state.accounts.find(a=>a.id === t.accountId);
    return d.getMonth() === month && d.getFullYear() === year && t.status === 'Exitoso' &&
      t.type === 'income' && (t.currency || 'PEN') === state.settings.currency && account?.accountKind === 'debito';
  }).forEach(t=>{
    const account = state.accounts.find(a=>a.id === t.accountId);
    const key = `${account.bank || 'Sin banco'}|${account.id}`;
    const row = totals.get(key) || { bank:account.bank || 'Sin banco', account:account.name, amount:0, count:0 };
    row.amount += t.amount; row.count += 1; totals.set(key,row);
  });
  const tbody = document.querySelector('#debitIncomeReportTable tbody');
  tbody.innerHTML = [...totals.values()].map(r=>`<tr>
    <td>${escapeHTML(r.bank)}</td><td>${escapeHTML(r.account)}</td>
    <td>${r.count}</td><td class="amount-pos">+${fmtMoney(r.amount,state.settings.currency)}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="muted">No hay ingresos en cuentas de débito para este período.</td></tr>';
}
