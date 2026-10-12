/* ==========================================================================
   accounts.js — Vista Cuentas (conectada al Sheet).
   ========================================================================== */

let activeAccountId = '';
let accountScrollTimer = null;
let accountAutoTimer = null;
const ACCOUNT_CARD_COLORS = [
  'linear-gradient(135deg,#8C71FF,#3D2B9A)',
  'linear-gradient(135deg,#2FBE8F,#14785B)',
  'linear-gradient(135deg,#3B9EF2,#2059AE)',
  'linear-gradient(135deg,#F2A93B,#BB6C0B)',
  'linear-gradient(135deg,#DB5B78,#96334E)'
];

/** Usa el color elegido para la cuenta y crea una variante oscura para sus tarjetas. */
function accountCardBackground(account,index){
  const color=String(account.color||'').trim();
  if(!/^#[0-9a-f]{6}$/i.test(color))return ACCOUNT_CARD_COLORS[index%ACCOUNT_CARD_COLORS.length];
  const rgb=color.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));
  const darker='#'+rgb.map(v=>Math.round(v*.62).toString(16).padStart(2,'0')).join('');
  return `linear-gradient(135deg,${color},${darker})`;
}

/**
 * Render principal de la vista Cuentas.
 */
function renderAccounts(){
  const currencies = [...new Set(state.accounts.map(a=>a.currency || 'PEN'))];
  const totals = Object.fromEntries(currencies.map(currency=>[currency,saldoGlobalPorMoneda(currency)]));
  document.getElementById('walletTotalBalance').textContent =
    Object.entries(totals).map(([currency,amount])=>fmtMoney(amount,currency)).join(' · ') || fmtMoney(0,'PEN');
  document.getElementById('walletSourcesLabel').textContent =
    `Saldo neto de ${state.accounts.length} cuentas · deuda de tarjetas restada · separado por moneda`;

  if(!state.accounts.some(a=>a.id===activeAccountId)) activeAccountId=cuentaPrincipalDashboard()?.id||state.accounts[0]?.id||'';
  renderAccountCarousel();
  renderAccountQuickFilters();
  renderSelectedAccountDetails(state.accounts.find(a=>a.id===activeAccountId)||null);
  populateAccountSelects();
}

/**
 * Renderiza account carousel en su vista.
 * Uso: Se usa en la vista Cuentas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderAccountCarousel(){
  const track=document.getElementById('accountCards');
  const viewport=document.getElementById('accountCarouselViewport');
  const pagination=document.getElementById('accountPagination');
  if(!track)return;
  if(!state.accounts.length){
    track.innerHTML='<div class="account-empty-state"><span>💳</span><strong>Aún no tienes cuentas</strong><small>Agrega una cuenta o tarjeta para ver su detalle aquí.</small></div>';
    pagination.innerHTML='';
    document.getElementById('accountDetailPanel').innerHTML='<div class="account-detail-empty"><span>◉</span><h3>Detalle de cuenta</h3><p>Cuando agregues una cuenta, aquí verás su saldo y actividad.</p></div>';
    document.getElementById('accountPrevBtn').disabled=true;
    document.getElementById('accountNextBtn').disabled=true;
    return;
  }
  track.innerHTML=state.accounts.map((a,i)=>{
    const typeLabel=opcionesCatalogo('tipo_cuenta').find(x=>x.value===a.type)?.label||a.type;
    const kindLabel=claseCuentaNombre(a.accountKind);
    return `<div class="account-slide" data-account-slide="${escapeHTML(a.id)}">
      <button type="button" class="acc-card ${a.id===activeAccountId?'is-active':''}" data-select-account="${escapeHTML(a.id)}" style="--account-card-bg:${accountCardBackground(a,i)}">
        <span class="acc-card-head"><span>${escapeHTML(a.bank||kindLabel)}</span><span class="acc-brand">${escapeHTML(typeLabel)}</span></span>
        <span class="acc-card-number">${a.last4?'••••  ••••  ••••  '+escapeHTML(a.last4):'CUENTA FINSET'}</span>
        <span class="acc-card-balance-label">${esCuentaPasivo(a)?'Deuda actual':'Saldo disponible'}</span>
        <strong class="acc-card-balance">${fmtMoney(a.balance,a.currency||'PEN')}</strong>
        <span class="acc-card-foot"><span>${escapeHTML(a.name)}${cuentaPrincipalDashboard()?.id===a.id?' · PRINCIPAL':''}</span><span>${escapeHTML(a.currency||'PEN')}</span></span>
      </button>
    </div>`;
  }).join('');
  pagination.innerHTML=state.accounts.map((a,i)=>`<button type="button" class="account-page-dot ${a.id===activeAccountId?'active':''}" data-account-dot="${escapeHTML(a.id)}" aria-label="Ver cuenta ${i+1}"></button>`).join('');
  document.querySelectorAll('[data-select-account]').forEach(card=>card.addEventListener('click',()=>selectAccount(card.dataset.selectAccount,true)));
  document.querySelectorAll('[data-account-dot]').forEach(dot=>dot.addEventListener('click',()=>selectAccount(dot.dataset.accountDot,true)));
  document.getElementById('accountPrevBtn').disabled=state.accounts.length<2;
  document.getElementById('accountNextBtn').disabled=state.accounts.length<2;
  const slide=track.querySelector(`[data-account-slide="${CSS.escape(activeAccountId)}"]`);
  if(viewport&&slide)viewport.scrollLeft=slide.offsetLeft-(viewport.clientWidth-slide.clientWidth)/2;
}

/** Dibuja una etiqueta por cuenta; al tocarla selecciona esa cuenta y actualiza su detalle. */
function renderAccountQuickFilters(){
  const container=document.getElementById('accountsQuickFilters');
  if(!container)return;
  container.innerHTML=state.accounts.map((account,index)=>{
    const color=/^#[0-9a-f]{6}$/i.test(String(account.color||''))?account.color:['#7457f7','#20a77a','#348ee8','#e99b26','#d94f71'][index%5];
    const icon=esTarjetaCredito(account)?'💳 ':'';
    return `<button type="button" class="accounts-quick-chip ${account.id===activeAccountId?'active':''}" data-account-tag="${escapeHTML(account.id)}" style="--account-tag-color:${color}">${icon}${escapeHTML(account.name)}</button>`;
  }).join('')||'<span class="muted small">Agrega cuentas para verlas aquí.</span>';
  container.querySelectorAll('[data-account-tag]').forEach(tag=>tag.addEventListener('click',()=>selectAccount(tag.dataset.accountTag,true)));
}

/**
 * Selecciona una cuenta del carrusel, actualiza el estado activo y carga su detalle.
 * Uso: Se usa en el módulo Cuentas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function selectAccount(id,scroll=true){
  const account=state.accounts.find(a=>a.id===id); if(!account)return;
  activeAccountId=id;
  document.querySelectorAll('[data-select-account]').forEach(el=>el.classList.toggle('is-active',el.dataset.selectAccount===id));
  document.querySelectorAll('[data-account-dot]').forEach(el=>el.classList.toggle('active',el.dataset.accountDot===id));
  document.querySelectorAll('[data-account-tag]').forEach(el=>el.classList.toggle('active',el.dataset.accountTag===id));
  if(scroll){
    const viewport=document.getElementById('accountCarouselViewport');
    const slide=document.querySelector(`[data-account-slide="${CSS.escape(id)}"]`);
    if(viewport&&slide)viewport.scrollTo({left:slide.offsetLeft-(viewport.clientWidth-slide.clientWidth)/2,behavior:'smooth'});
  }
  renderSelectedAccountDetails(account);
}

/**
 * Avanza o retrocede una tarjeta en el carrusel de la vista Cuentas.
 * Uso: Se usa en el módulo Cuentas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function moveAccountSlide(offset){
  if(state.accounts.length<2)return;
  const index=Math.max(0,state.accounts.findIndex(a=>a.id===activeAccountId));
  selectAccount(state.accounts[(index+offset+state.accounts.length)%state.accounts.length].id,true);
}

/**
 * Devuelve los movimientos asociados a una cuenta, ordenados del más reciente al más antiguo.
 * Uso: Se usa en el módulo Cuentas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function accountTransactions(account){
  return account?state.transactions.filter(t=>t.accountId===account.id||t.destinationAccountId===account.id).sort((a,b)=>(b.date||'').localeCompare(a.date||'')):[];
}

/**
 * Suma las entradas y salidas que afectaron a una cuenta durante el mes actual.
 * Uso: Se usa en el módulo Cuentas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function accountMonthImpact(account){
  const now=new Date();let positive=0,negative=0,count=0;
  state.transactions.forEach(t=>{
    if(t.status!=='Exitoso')return;
    const date=new Date(`${t.date}T00:00:00`);
    if(date.getFullYear()!==now.getFullYear()||date.getMonth()!==now.getMonth())return;
    const delta=impactoTransaccion(t)[account.id]||0;
    if(!delta)return;
    count++;if(delta>0)positive+=delta;else negative+=Math.abs(delta);
  });
  return {positive,negative,count};
}

/**
 * Renderiza selected account details en su vista.
 * Uso: Se usa en la vista Cuentas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderSelectedAccountDetails(account){
  const panel=document.getElementById('accountDetailPanel');if(!panel)return;
  if(!account){
    panel.innerHTML='<div class="account-detail-empty"><span>◉</span><h3>Detalle de cuenta</h3><p>Cuando agregues una cuenta, aquí verás su saldo y actividad.</p></div>';
    document.querySelector('#walletRecentTable tbody').innerHTML=emptyRow();
    document.getElementById('walletLegendList').innerHTML='<p class="muted small">Sin movimientos para mostrar.</p>';
    document.getElementById('walletDonutTotal').textContent=fmtMoney(0,state.settings.currency);
    renderAccountsFlowChart(null);renderAccountsDonut([]);return;
  }
  const liability=esCuentaPasivo(account),month=accountMonthImpact(account);
  const available=Math.max(0,(account.creditLimit||0)-account.balance);
  const usage=account.creditLimit>0?Math.min(100,Math.round(account.balance/account.creditLimit*100)):0;
  const metrics=liability
    ? `<div class="account-metric"><small>Línea total</small><strong>${fmtMoney(account.creditLimit||0,account.currency)}</strong></div><div class="account-metric"><small>Disponible</small><strong>${fmtMoney(available,account.currency)}</strong></div><div class="account-metric"><small>Total usado</small><strong>${fmtMoney(account.balance,account.currency)}</strong></div>`
    : `<div class="account-metric"><small>Saldo actual</small><strong>${fmtMoney(account.balance,account.currency)}</strong></div><div class="account-metric"><small>Entradas del mes</small><strong>${fmtMoney(month.positive,account.currency)}</strong></div><div class="account-metric"><small>Salidas del mes</small><strong>${fmtMoney(month.negative,account.currency)}</strong></div>`;
  const typeLabel=opcionesCatalogo('tipo_cuenta').find(x=>x.value===account.type)?.label||account.type;
  const recentTransactions=accountTransactions(account);
  panel.innerHTML=`<div class="account-detail-header"><div><small>${escapeHTML(account.bank||'CUENTA')}</small><h3>${escapeHTML(account.name)}</h3><span>${escapeHTML(typeLabel)} · ${escapeHTML(claseCuentaNombre(account.accountKind))} · ${escapeHTML(account.currency||'PEN')}</span></div><div class="account-detail-actions"><button class="btn btn-ghost" id="editSelectedAccount">Editar</button><button class="btn btn-ghost danger-text" id="deleteSelectedAccount">Eliminar</button></div></div>
    <div class="account-metrics">${metrics}</div>
    ${liability&&account.creditLimit>0?`<div class="account-usage"><div><span>Uso de línea</span><strong>${usage}%</strong></div><div class="account-usage-track"><span style="width:${usage}%"></span></div></div>`:''}
    <div class="account-detail-foot"><div><small>${liability?'Consumo de la línea este mes':'Movimientos este mes'}</small><strong>${liability?fmtMoney(month.positive,account.currency):month.count+' movimientos'}</strong></div>${esTarjetaCredito(account)?`<div><small>Día de corte</small><strong>${account.closingDay?`Día ${account.closingDay} de cada mes`:'No configurado'}</strong></div><div><small>Día de pago</small><strong>${account.paymentDay?`Día ${account.paymentDay} de cada mes`:'No configurado'}</strong></div>`:''}<div><small>Último movimiento</small><strong>${recentTransactions[0]?fmtDateShort(recentTransactions[0].date):'Sin movimientos'}</strong></div></div>`;
  document.getElementById('editSelectedAccount').addEventListener('click',()=>openAccountModal(account.id));
  document.getElementById('deleteSelectedAccount').addEventListener('click',()=>deleteAccount(account.id));
  document.querySelector('#walletRecentTable tbody').innerHTML=recentTransactions.slice(0,5).map(t=>miniRow(t)).join('')||emptyRow();

  const byCat={};
  const now=new Date();
  state.transactions.filter(t=>{
      const date=new Date(`${t.date}T00:00:00`);
      return t.accountId===account.id&&t.type==='expense'&&t.status==='Exitoso'&&(t.currency||'PEN')===account.currency&&date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth();
    })
    .forEach(t=>{
      if(t.category==='Transferencia'&&t.transferType==='interna'){byCat.Comisiones=(byCat.Comisiones||0)+(t.commission||0);return;}
      byCat[t.category]=(byCat[t.category]||0)+t.amount;
      if(t.category==='Transferencia'&&t.commissionPayer==='origen')byCat.Comisiones=(byCat.Comisiones||0)+(t.commission||0);
    });
  const topCats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const total=Object.values(byCat).reduce((sum,value)=>sum+value,0)||1;
  document.getElementById('walletLegendList').innerHTML=topCats.map(([cat,value])=>{
    const meta=metaCategoria(cat),pct=Math.round(value/total*100);
    return `<div class="legend-row"><div class="lg-left"><span class="legend-swatch" style="background:${meta.color}"></span>${escapeHTML(etiquetaCategoria(cat))}</div><strong>${pct}%&nbsp;&nbsp;${fmtMoney(value,account.currency)}</strong></div>`;
  }).join('')||'<p class="muted small">Sin gastos registrados en esta cuenta.</p>';
  document.getElementById('walletDonutTotal').textContent=fmtMoney(topCats.length?total:0,account.currency);
  renderAccountsFlowChart(account);renderAccountsDonut(topCats);
}

/**
 * Carga account selects en controles de interfaz.
 * Uso: Se usa en el módulo Cuentas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function populateAccountSelects(){
  const opts = state.accounts.map(a=> `<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}${a.bank ? ' · '+escapeHTML(a.bank) : ''}</option>`).join('');
  const from = document.getElementById('transferFrom');
  const to = document.getElementById('transferTo');
  if(from) from.innerHTML = opts;
  if(to) to.innerHTML = opts;
}

/**
 * Abre el modal de cuenta en modo agregar o editar.
 * @param {string} [id]  Si viene, edita. Si no, agrega.
 */
function openAccountModal(id){
  const isEdit = !!id;
  const titleEl = document.querySelector('#accountModal .modal-head h3');
  const subEl   = document.querySelector('#accountModal .modal-head p');
  if(titleEl) titleEl.textContent = isEdit ? 'Editar cuenta' : 'Agregar nueva cuenta';
  if(subEl)   subEl.textContent   = isEdit ? 'Modifica los datos de tu cuenta' : 'Añade una tarjeta o billetera';

  document.getElementById('accountForm').reset();
  llenarSelectCatalogo('accKind','clase_cuenta');
  llenarSelectCatalogo('accType','tipo_cuenta');
  llenarSelectCatalogo('accCurrency','moneda',state.settings.currency||'PEN');
  document.getElementById('accCurrency').disabled = isEdit;

  if(isEdit){
    const a = state.accounts.find(x=> x.id===id);
    if(!a) return;
    // Guardamos el id en un input hidden (lo agregamos abajo en HTML)
    document.getElementById('accId').value     = a.id;
    document.getElementById('accName').value   = a.name;
    document.getElementById('accBalance').value = a.balance;
    document.getElementById('accType').value   = a.type;
    document.getElementById('accCurrency').value = a.currency || 'PEN';
    document.getElementById('accBank').value = a.bank || '';
    document.getElementById('accKind').value = a.accountKind || 'debito';
    document.getElementById('accCreditLimit').value = a.creditLimit || '';
    document.getElementById('accPaymentDay').value = a.paymentDay || '';
    document.getElementById('accClosingDay').value = a.closingDay || '';
    document.getElementById('accIsPrimary').checked = cuentaPrincipalDashboard()?.id===a.id;
    document.getElementById('accColor').value = /^#[0-9a-f]{6}$/i.test(String(a.color||''))?a.color:'#7457f7';
  } else {
    document.getElementById('accId').value = '';
    document.getElementById('accIsPrimary').checked = !cuentaPrincipalDashboard();
    document.getElementById('accColor').value = ['#7457f7','#20a77a','#348ee8','#e99b26','#d94f71'][state.accounts.length%5];
  }

  document.getElementById('accBalanceLabel').textContent =
    esCuentaPasivo({accountKind:document.getElementById('accKind').value}) ? 'Deuda actual de la tarjeta' : 'Saldo inicial';
  updateCreditLimitField();

  openModal('accountModal');
}

/**
 * Guarda una cuenta (crear o actualizar).
 */
async function handleAccountSubmit(e){
  e.preventDefault();
  const id = document.getElementById('accId').value;
  const type = document.getElementById('accType').value;
  const accountKind = document.getElementById('accKind').value;
  const isCredit=esTarjetaCredito({accountKind});
  const shouldBecomePrimary=!isCredit&&document.getElementById('accIsPrimary').checked;
  const existing=id?state.accounts.find(a=>a.id===id):null;

  const payload = {
    id: id || null,
    name: document.getElementById('accName').value.trim(),
    type,
    currency: document.getElementById('accCurrency').value,
    bank: document.getElementById('accBank').value.trim(),
    accountKind,
    color: document.getElementById('accColor').value,
    isPrimary: !isCredit&&!!existing?.isPrimary&&document.getElementById('accIsPrimary').checked,
    last4: id
      ? (state.accounts.find(a=> a.id===id)?.last4 || '')  // conserva el last4 al editar
      : (type==='paypal' || type==='cash' ? '' : String(Math.floor(1000+Math.random()*8999))),
    balance: parseFloat(document.getElementById('accBalance').value) || 0,
    creditLimit: esTarjetaCredito({accountKind})
      ? (parseFloat(document.getElementById('accCreditLimit').value) || 0)
      : 0,
    closingDay: esTarjetaCredito({accountKind})
      ? (parseInt(document.getElementById('accClosingDay').value,10) || 0)
      : 0,
    paymentDay: esTarjetaCredito({accountKind})
      ? (parseInt(document.getElementById('accPaymentDay').value,10) || 0)
      : 0
  };

  try{
    if(id){
      await conCargando('Actualizando cuenta...', ()=> actualizarCuenta(payload));
      activeAccountId=id;
      toast('Cuenta actualizada');
    } else {
      await conCargando('Guardando cuenta...', ()=> crearCuenta(payload));
      activeAccountId=payload.id;
      toast('Cuenta agregada');
    }
    if(shouldBecomePrimary)await conCargando('Actualizando cuenta principal...',()=>establecerCuentaPrincipal(payload.id));
    closeModal('accountModal');
    document.getElementById('accountForm').reset();
    renderAccounts();
    renderDashboard();
  }catch(err){
    console.error(err);
    toast('Error al guardar cuenta: ' + err.message);
  }
}

/**
 * Elimina una cuenta por id.
 */
async function deleteAccount(id){
  if(!confirm('¿Eliminar esta cuenta? Esta acción no borra sus transacciones.')) return;
  try{
    await conCargando('Eliminando cuenta...', ()=> eliminarCuenta(id));
    if(!state.accounts.some(a=>a.isPrimary)){
      const fallback=state.accounts.find(a=>!esTarjetaCredito(a));
      if(fallback)await conCargando('Asignando cuenta principal...',()=>establecerCuentaPrincipal(fallback.id));
    }
    renderAccounts();
    renderDashboard();
    toast('Cuenta eliminada');
  }catch(err){
    console.error(err);
    toast('Error al eliminar: ' + err.message);
  }
}

/**
 * Transferencia entre cuentas.
 * Nota: por ahora solo actualiza el state local. En un próximo paso se
 * puede hacer que genere 2 transacciones en el Sheet.
 */
async function handleTransfer(e){
  e.preventDefault();
  const fromId = document.getElementById('transferFrom').value;
  const toId   = document.getElementById('transferTo').value;
  const amount = parseFloat(document.getElementById('transferAmount').value) || 0;

  if(fromId === toId){ toast('Elige cuentas diferentes'); return; }
  const from = state.accounts.find(a=> a.id===fromId);
  const to   = state.accounts.find(a=> a.id===toId);
  if(!from || !to){ toast('Cuentas inválidas'); return; }
  if(amount > from.balance){ toast('Saldo insuficiente'); return; }

  if(!Number.isFinite(amount) || amount <= 0){ toast('Ingresa un monto válido'); return; }
  try{
    await conCargando('Registrando transferencia...', ()=> transferirEntreCuentas(fromId, toId, amount));
    closeModal('transferModal');
    document.getElementById('transferForm').reset();
    renderAccounts();
    renderDashboard();
    toast(`Transferencia de ${fmtMoney(amount)} guardada`);
  }catch(err){
    console.error(err);
    toast('No se guardó la transferencia: ' + err.message);
  }
}

/**
 * Renderiza accounts flow chart en su vista.
 * Uso: Se usa en la vista Cuentas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderAccountsFlowChart(account){
  const c = chartColors();
  const title=document.getElementById('walletFlowTitle');
  if(title)title.textContent=`Evolución ${account&&esCuentaPasivo(account)?'de la deuda':'del saldo'} · últimos 30 días`;
  const end=new Date();end.setHours(12,0,0,0);
  const isoFor=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const deltas={};
  if(account) state.transactions.filter(t=>t.status==='Exitoso').forEach(t=>{
    const delta=impactoTransaccion(t)[account.id]||0;
    if(delta)deltas[t.date]=(deltas[t.date]||0)+delta;
  });
  const dayData=[];let running=account?.balance||0;
  for(let offset=0;offset<30;offset++){
    const day=new Date(end);day.setDate(end.getDate()-offset);
    const iso=isoFor(day);dayData.push({iso,value:running});running-=deltas[iso]||0;
  }
  dayData.reverse();
  destroyChart('walletFlow');
  const options=baseLineOptions(c);
  options.scales.x.ticks.maxTicksLimit=6;
  charts.walletFlow = new Chart(document.getElementById('walletFlowChart'), {
    type:'line',
    data:{ labels: dayData.map(d=>fmtDateShort(d.iso)), datasets:[
      { label:account?(esCuentaPasivo(account)?'Deuda':'Saldo'):'Saldo', data:dayData.map(d=>d.value), borderColor:c.accent,
        backgroundColor: hexAlpha(c.accent,0.12), fill:true, tension:.4,
        pointRadius:0, borderWidth:2.5 }
    ]},
    options
  });
}

/**
 * Renderiza accounts donut en su vista.
 * Uso: Se usa en la vista Cuentas al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderAccountsDonut(topCats){
  const c = chartColors();
  const palette = topCats.map(([cat])=> metaCategoria(cat).color);
  destroyChart('walletDonut');
  charts.walletDonut = new Chart(document.getElementById('walletDonut'), {
    type:'doughnut',
    data:{
      labels: topCats.map(x=> x[0]==='Comisiones'?'Comisiones':etiquetaCategoria(x[0])),
      datasets:[{ data: topCats.map(x=> x[1]),
        backgroundColor: palette.length ? palette : [c.grid], borderWidth:0 }]
    },
    options: donutOptions()
  });
}

/**
 * Inicializa accounts view y conecta controles con eventos.
 * Uso: Se invoca desde js/app.js durante el arranque. Actualizar esta nota si cambia su responsabilidad.
 */
function initAccountsView(){
  document.getElementById('accountPrevBtn').addEventListener('click',()=>moveAccountSlide(-1));
  document.getElementById('accountNextBtn').addEventListener('click',()=>moveAccountSlide(1));
  clearInterval(accountAutoTimer);
  accountAutoTimer=setInterval(()=>{
    const carousel=document.querySelector('#view-accounts .account-carousel');
    if(currentViewName()==='accounts'&&state.accounts.length>1&&
       !carousel?.matches(':hover')&&!carousel?.contains(document.activeElement))moveAccountSlide(1);
  },10000);
  document.getElementById('accountCarouselViewport').addEventListener('scroll',()=>{
    clearTimeout(accountScrollTimer);
    accountScrollTimer=setTimeout(()=>{
      const viewport=document.getElementById('accountCarouselViewport');
      const center=viewport.scrollLeft+viewport.clientWidth/2;
      const slides=[...document.querySelectorAll('[data-account-slide]')];
      const nearest=slides.sort((a,b)=>Math.abs(a.offsetLeft+a.clientWidth/2-center)-Math.abs(b.offsetLeft+b.clientWidth/2-center))[0];
      if(nearest&&nearest.dataset.accountSlide!==activeAccountId)selectAccount(nearest.dataset.accountSlide,false);
    },90);
  });
  document.getElementById('transferBtn').addEventListener('click', ()=>{
    openTxModal();
    document.getElementById('txType').value = 'expense';
    populateTransactionSubtypes('expense', 'Transferencia');
    document.getElementById('txTransferType').value = 'interna';
    updateTransactionFields();
  });
  document.getElementById('requestBtn').addEventListener('click', ()=>{
    toast('Solicitud de dinero enviada');
  });
  document.getElementById('addAccountBtn').addEventListener('click', ()=>{
    openAccountModal();
  });
  document.getElementById('accountForm').addEventListener('submit', handleAccountSubmit);
  document.getElementById('accKind').addEventListener('change', ()=>{
    const kind = document.getElementById('accKind').value;
    document.getElementById('accBalanceLabel').textContent = esCuentaPasivo({accountKind:kind}) ? 'Deuda actual de la tarjeta' : 'Saldo inicial';
    updateCreditLimitField();
  });
  document.getElementById('transferForm').addEventListener('submit', handleTransfer);
}

/**
 * Actualiza credit limit field en el estado o la interfaz.
 * Uso: Se usa en el módulo Cuentas, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function updateCreditLimitField(){
  const isCreditCard=esTarjetaCredito({accountKind:document.getElementById('accKind').value});
  document.getElementById('accCreditLimitRow').hidden=!isCreditCard;
  document.getElementById('accClosingDayRow').hidden=!isCreditCard;
  document.getElementById('accPaymentDayRow').hidden=!isCreditCard;
  document.getElementById('accPrimaryRow').hidden=isCreditCard;
}
