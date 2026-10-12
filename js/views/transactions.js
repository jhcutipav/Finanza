/* ========================================================================== 
   transactions.js — Vista de transacciones y transferencias.
   Depende de state.js, helpers.js, modals.js y dashboard.js.
   ========================================================================== */

let txSortKey = 'date';
let txSortDir = -1;
let txSearchTerm = '';

/**
 * Renderiza transactions en su vista.
 * Uso: Se usa en la vista Transacciones al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderTransactions(){
  populateSelect('txMethod', opcionesCatalogo('metodo_pago'));
  populateTransactionAccounts();

  let rows = [...state.transactions];
  if(txSearchTerm){
    const q = txSearchTerm.toLowerCase();
    rows = rows.filter(t=>
      (t.name || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q) ||
      (t.method || '').toLowerCase().includes(q)
    );
  }
  rows.sort((a,b)=>{
    if(txSortKey === 'amount') return (a.amount - b.amount) * txSortDir;
    return (a.date || '').localeCompare(b.date || '') * txSortDir;
  });

  document.getElementById('txCount').textContent =
    `${rows.length} elemento${rows.length === 1 ? '' : 's'}`;
  const tbody = document.querySelector('#txTable tbody');
  tbody.innerHTML = rows.map(fullRow).join('') ||
    '<tr><td colspan="7" style="text-align:center;padding:30px;">No se encontraron transacciones</td></tr>';

  tbody.querySelectorAll('.row-menu-btn').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const menu = btn.closest('.row-menu');
      const wasOpen = menu.classList.contains('open');
      closeAllRowMenus();
      if(!wasOpen) menu.classList.add('open');
    });
  });
  tbody.querySelectorAll('[data-edit-tx]').forEach(btn=>
    btn.addEventListener('click', ()=> openTxModal(btn.dataset.editTx)));
  tbody.querySelectorAll('[data-del-tx]').forEach(btn=>
    btn.addEventListener('click', ()=> deleteTx(btn.dataset.delTx)));
}

/**
 * Genera una fila de transacción completa con sus datos y acciones disponibles.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function fullRow(t){
  const meta = metaCategoria(t.category);
  const isIncome = t.type === 'income';
  const amount = `${isIncome ? '+' : '−'}${fmtMoney(t.amount, t.currency)}`;
  const detail = t.category === 'Transferencia' && t.transferType === 'interna'
    ? `Interna · ${state.accounts.find(a=>a.id===t.accountId)?.name||'Origen'} → ${state.accounts.find(a=>a.id===t.destinationAccountId)?.name||'Destino'} · comisión ${fmtMoney(t.commission || 0, t.currency)}`
    : t.category === 'Transferencia' && t.transferType === 'externa'
      ? `Externa · comisión ${fmtMoney(t.commission||0,t.currency)} · paga ${t.commissionPayer==='origen'?'origen':'destinatario'}`
    : t.category === 'Cuota de deuda'
      ? `Capital ${fmtMoney(t.principalPaid || 0,t.currency)} · interés ${fmtMoney(t.interestPaid || 0,t.currency)}`
      : etiquetaCategoria(t.category);
  return `<tr>
    <td>${escapeHTML(fmtDateShort(t.date))}</td>
    <td class="${isIncome ? 'amount-pos' : 'amount-neg'}">${amount}</td>
    <td><div class="tx-name-cell"><span class="tx-icon">${escapeHTML(meta.icon)}</span>${escapeHTML(t.name)}</div></td>
    <td class="muted">${escapeHTML(t.method || '')}</td>
    <td class="muted">${escapeHTML(detail)}</td>
    <td><span class="status-pill">${escapeHTML(t.status || 'Exitoso')}</span></td>
    <td><div class="row-menu">
      <button class="row-menu-btn">⋯</button>
      <div class="row-menu-list">
        ${t.debtId ? '<span class="muted small">Edita los pagos desde Deudas</span>' : `<button data-edit-tx="${escapeHTML(t.id)}">Editar</button>`}
        <button class="danger" data-del-tx="${escapeHTML(t.id)}">Eliminar</button>
      </div>
    </div></td>
  </tr>`;
}

/**
 * Carga select en controles de interfaz.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function populateSelect(id, options){
  const select = document.getElementById(id);
  if(!select) return;
  select.innerHTML = options.map(o=>{
    const value=typeof o==='object' ? o.value : o;
    const label=typeof o==='object' ? o.label : (CATEGORY_META[o]?.label || o);
    return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
  }).join('');
}

/**
 * Carga transaction accounts en controles de interfaz.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function populateTransactionAccounts(){
  const source = document.getElementById('txAccount');
  const destination = document.getElementById('txDestinationAccount');
  const sourceValue = source?.value || '';
  const destinationValue = destination?.value || '';
  const options = state.accounts.map(a=>
    `<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}${a.bank ? ' · '+escapeHTML(a.bank) : ''} (${escapeHTML(a.currency || 'PEN')})</option>`
  ).join('');
  if(source){
    source.innerHTML = '<option value="">Selecciona una cuenta</option>' + options;
    if(state.accounts.some(a=>a.id === sourceValue)) source.value = sourceValue;
  }
  if(destination){
    destination.innerHTML = '<option value="">Selecciona una cuenta</option>' + options;
    if(state.accounts.some(a=>a.id === destinationValue)) destination.value = destinationValue;
  }
}

/**
 * Carga transaction subtypes en controles de interfaz.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function populateTransactionSubtypes(type, selected = ''){
  const options = TX_SUBTYPES[type] || TX_SUBTYPES.income;
  populateSelect('txCategory', options.map(code=>({value:code,label:CATEGORY_META[code]?.label||code})));
  const select = document.getElementById('txCategory');
  if(options.includes(selected)) select.value = selected;
}

/**
 * Actualiza transaction fields en el estado o la interfaz.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function updateTransactionFields(){
  const isTransfer = document.getElementById('txType').value === 'expense' &&
    document.getElementById('txCategory').value === 'Transferencia';
  const transferType = document.getElementById('txTransferType').value;
  const internal = isTransfer && transferType === 'interna';
  const source = state.accounts.find(a=>a.id === document.getElementById('txAccount').value);
  const destination = state.accounts.find(a=>a.id === document.getElementById('txDestinationAccount').value);

  document.getElementById('transferFields').hidden = !isTransfer;
  document.getElementById('destinationAccountRow').hidden = !internal;
  document.getElementById('commissionPayerRow').hidden = !isTransfer || internal;

  const fx = internal && source?.currency === 'PEN' && destination?.currency === 'USD';
  document.getElementById('exchangeFields').hidden = !fx;
  const amount = document.getElementById('txAmount');
  const amountLabel = document.getElementById('txAmountLabel');
  amount.readOnly = fx;
  amountLabel.textContent = fx ? 'Total que sale de la cuenta (S/)' : 'Monto';

  const currency = document.getElementById('txCurrency');
  if(source) currency.value = source.currency || 'PEN';
  currency.disabled = !!source;
  if(fx) updateExchangeAmount();
}

/**
 * Actualiza exchange amount en el estado o la interfaz.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function updateExchangeAmount(){
  const usd = parseFloat(document.getElementById('txDestinationAmount').value) || 0;
  const rate = parseFloat(document.getElementById('txExchangeRate').value) || 0;
  const fee = parseFloat(document.getElementById('txCommission').value) || 0;
  document.getElementById('txAmount').value = usd > 0 && rate > 0
    ? (usd * rate + fee).toFixed(2) : '';
}

/**
 * Abre tx modal para crear o editar sus datos.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function openTxModal(id){
  const transaction = id ? state.transactions.find(t=>t.id === id) : null;
  if(id && !transaction) return;
  document.getElementById('txModalTitle').textContent = transaction
    ? 'Editar transacción' : 'Agregar nueva transacción';
  document.getElementById('txForm').reset();
  populateSelect('txMethod', opcionesCatalogo('metodo_pago'));
  llenarSelectCatalogo('txType','tipo_movimiento', transaction?.type || 'income');
  llenarSelectCatalogo('txTransferType','tipo_transferencia', transaction?.transferType || 'externa');
  llenarSelectCatalogo('txCommissionPayer','pagador_comision', transaction?.commissionPayer || 'origen');
  llenarSelectCatalogo('txCurrency','moneda', transaction?.currency || state.settings.currency || 'PEN');
  populateTransactionAccounts();

  if(transaction){
    document.getElementById('txId').value = transaction.id;
    document.getElementById('txType').value = transaction.type;
    populateTransactionSubtypes(transaction.type, transaction.category);
    document.getElementById('txAmount').value = transaction.amount;
    document.getElementById('txCurrency').value = transaction.currency || 'PEN';
    document.getElementById('txName').value = transaction.name || '';
    document.getElementById('txMethod').value = transaction.method || METHODS[0];
    document.getElementById('txAccount').value = transaction.accountId || '';
    document.getElementById('txDate').value = transaction.date || new Date().toISOString().slice(0,10);
    document.getElementById('txTransferType').value = transaction.transferType || 'externa';
    document.getElementById('txDestinationAccount').value = transaction.destinationAccountId || '';
    document.getElementById('txCommission').value = transaction.commission || 0;
    document.getElementById('txCommissionPayer').value = transaction.commissionPayer || 'origen';
    document.getElementById('txDestinationAmount').value = transaction.destinationAmount || '';
    document.getElementById('txExchangeRate').value = transaction.exchangeRate || '';
  }else{
    document.getElementById('txId').value = '';
    populateTransactionSubtypes(document.getElementById('txType').value);
    document.getElementById('txDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('txCurrency').value = state.settings.currency || 'PEN';
    document.getElementById('txAccount').value = state.accounts[0]?.id || '';
    document.getElementById('txTransferType').value = 'externa';
    document.getElementById('txCommission').value = 0;
  }
  updateTransactionFields();
  openModal('txModal');
}

/**
 * Cierra los menús de acciones abiertos en las filas de transacciones.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function closeAllRowMenus(){
  document.querySelectorAll('.row-menu.open').forEach(m=>m.classList.remove('open'));
}

/**
 * Elimina tx y sincroniza el estado.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function deleteTx(id){
  if(!confirm('¿Eliminar esta transacción?')) return;
  try{
    await conCargando('Eliminando...', ()=>eliminarTransaccion(id));
    renderTransactions(); renderDashboard(); renderAccounts();
    toast('Transacción eliminada');
  }catch(err){
    console.error(err); toast('Error al eliminar: ' + err.message);
  }
}

/**
 * Procesa tx submit y coordina validación y guardado.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function handleTxSubmit(e){
  e.preventDefault();
  const id = document.getElementById('txId').value;
  const existing = id ? state.transactions.find(t=>t.id === id) : null;
  const type = document.getElementById('txType').value;
  const category = document.getElementById('txCategory').value;
  const source = state.accounts.find(a=>a.id === document.getElementById('txAccount').value);
  if(!source){ toast('Selecciona una cuenta de origen'); return; }

  const isTransfer = type === 'expense' && category === 'Transferencia';
  const transferType = isTransfer ? document.getElementById('txTransferType').value : '';
  const destination = transferType === 'interna'
    ? state.accounts.find(a=>a.id === document.getElementById('txDestinationAccount').value)
    : null;
  const fee = isTransfer ? (parseFloat(document.getElementById('txCommission').value) || 0) : 0;
  let amount = parseFloat(document.getElementById('txAmount').value) || 0;
  let destinationAmount = 0;
  let exchangeRate = 0;
  let destinationCurrency = '';

  if(isTransfer && transferType === 'interna'){
    if(!destination || destination.id === source.id){ toast('Selecciona una cuenta destino distinta'); return; }
    if(source.currency === destination.currency){
      if(fee > amount){ toast('La comisión no puede superar el monto transferido'); return; }
      destinationAmount = amount - fee;
      destinationCurrency = destination.currency;
    }else if(source.currency === 'PEN' && destination.currency === 'USD'){
      destinationAmount = parseFloat(document.getElementById('txDestinationAmount').value) || 0;
      exchangeRate = parseFloat(document.getElementById('txExchangeRate').value) || 0;
      if(destinationAmount <= 0 || exchangeRate <= 0){ toast('Completa dólares a recibir y tipo de cambio'); return; }
      amount = destinationAmount * exchangeRate + fee;
      destinationCurrency = 'USD';
    }else{
      toast('Por ahora la conversión interna disponible es de PEN a USD'); return;
    }
  }else if(isTransfer && transferType === 'externa' &&
           document.getElementById('txCommissionPayer').value === 'destino' && fee > amount){
    toast('La comisión cobrada al destinatario no puede superar el monto enviado'); return;
  }

  if(!isTransfer && source.currency !== document.getElementById('txCurrency').value){
    toast('La moneda del movimiento debe coincidir con la moneda de la cuenta'); return;
  }

  const payload = {
    id: id || null,
    type,
    category,
    amount,
    currency: source.currency || 'PEN',
    name: document.getElementById('txName').value.trim(),
    method: document.getElementById('txMethod').value,
    accountId: source.id,
    date: document.getElementById('txDate').value,
    status: existing?.status || 'Exitoso',
    transferType,
    destinationAccountId: destination?.id || '',
    destinationAmount,
    destinationCurrency,
    exchangeRate,
    commission: fee,
    commissionPayer: isTransfer && transferType === 'externa'
      ? document.getElementById('txCommissionPayer').value : (isTransfer ? 'origen' : '')
  };

  try{
    if(id){
      await conCargando('Actualizando transacción...', ()=>actualizarTransaccion(payload));
      toast('Transacción actualizada');
    }else{
      await conCargando('Guardando transacción...', ()=>crearTransaccion(payload));
      toast('Transacción agregada');
    }
    closeModal('txModal');
    renderTransactions(); renderDashboard(); renderAccounts();
  }catch(err){
    console.error(err); toast('Error al guardar: ' + err.message);
  }
}

/**
 * Exporta csv para descargar los datos.
 * Uso: Se usa en el módulo Transacciones, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function exportCSV(){
  const header = ['Fecha','Tipo','Subtipo','Monto','Moneda','Descripción','Método','Cuenta origen','Cuenta destino','Comisión','Tipo transferencia'];
  const rows = state.transactions.map(t=>[
    t.date, t.type, t.category, t.amount, t.currency, t.name, t.method,
    state.accounts.find(a=>a.id === t.accountId)?.name || '',
    state.accounts.find(a=>a.id === t.destinationAccountId)?.name || '',
    t.commission || 0, t.transferType || ''
  ]);
  const csv = [header, ...rows].map(row=>row.map(v=>`"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'transacciones_finset.csv'; a.click();
  URL.revokeObjectURL(url); toast('CSV exportado');
}

/**
 * Inicializa transactions view y conecta controles con eventos.
 * Uso: Se invoca desde js/app.js durante el arranque. Actualizar esta nota si cambia su responsabilidad.
 */
function initTransactionsView(){
  document.getElementById('txForm').addEventListener('submit', handleTxSubmit);
  document.getElementById('txSearch').addEventListener('input', e=>{
    txSearchTerm = e.target.value; renderTransactions();
  });
  document.querySelectorAll('#txTable th[data-sort]').forEach(th=>th.addEventListener('click', ()=>{
    const key = th.dataset.sort;
    if(txSortKey === key) txSortDir *= -1;
    else { txSortKey = key; txSortDir = -1; }
    renderTransactions();
  }));
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
  const analyticsExport = document.getElementById('analyticsExportBtn');
  if(analyticsExport) analyticsExport.addEventListener('click', exportCSV);
  document.getElementById('addTxBtn').addEventListener('click', ()=>openTxModal());
  document.getElementById('txType').addEventListener('change', e=>{
    populateTransactionSubtypes(e.target.value); updateTransactionFields();
  });
  document.getElementById('txCategory').addEventListener('change', updateTransactionFields);
  document.getElementById('txTransferType').addEventListener('change', updateTransactionFields);
  document.getElementById('txAccount').addEventListener('change', updateTransactionFields);
  document.getElementById('txDestinationAccount').addEventListener('change', updateTransactionFields);
  ['txDestinationAmount','txExchangeRate','txCommission'].forEach(id=>
    document.getElementById(id).addEventListener('input', ()=>{
      if(!document.getElementById('exchangeFields').hidden) updateExchangeAmount();
    }));
  document.addEventListener('click', closeAllRowMenus);
}
