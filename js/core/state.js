/* ==========================================================================
   state.js — Estado global, persistencia en localStorage (caché) y
   sincronización con Google Sheets vía api.js.
   Depende de: helpers.js, api.js.
   ========================================================================== */

const STORAGE_KEY = 'finset_data_v5';

/* Metadatos de categorías */
let catalogos = [];
let CATEGORY_META = {};
let CATEGORIES = [];
let TX_SUBTYPES = { income:[], expense:[] };
let METHODS = [];
let DEBT_TYPES = {};
let ACCOUNT_CLASSES = {};
let ACCOUNT_TYPES = [];
let CURRENCIES = {};
let TRANSFER_TYPES = {};
let COMMISSION_PAYERS = {};
let MOVEMENT_TYPES = {};

/**
 * Indica si la fila de catálogo está activa según su columna Activo.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function filaActiva(r){ return !['false','0','no','inactivo'].includes(String(r.Activo ?? 'TRUE').trim().toLowerCase()); }
/**
 * Valida el formato hexadecimal del color de catálogo y usa un gris por defecto si no es válido.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function colorCatalogo(r){ return /^#[0-9a-f]{6}$/i.test(String(r.Color||'')) ? r.Color : '#8B899C'; }
/**
 * Procesa el catálogo leído desde Sheets y prepara mapas de categorías, monedas y clases.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function cargarCatalogos(rows){
  catalogos = (rows || []).slice().sort((a,b)=>(Number(a.Orden)||0)-(Number(b.Orden)||0));
  const grupo = name=>catalogos.filter(r=>r.Grupo === name && filaActiva(r));
  CATEGORY_META = Object.fromEntries(grupo('categoria').map(r=>[r.Codigo,{icon:String(r.Icono||'⚙️').replace(/[<>]/g,''),color:colorCatalogo(r),label:r.Nombre||r.Codigo,movement:r.TipoMovimiento||'both'}]));
  CATEGORIES = grupo('categoria').map(r=>r.Codigo);
  TX_SUBTYPES = {
    income: grupo('categoria').filter(r=>['income','ambos','both'].includes(String(r.TipoMovimiento||'').toLowerCase())).map(r=>r.Codigo),
    expense: grupo('categoria').filter(r=>['expense','ambos','both'].includes(String(r.TipoMovimiento||'').toLowerCase())).map(r=>r.Codigo)
  };
  METHODS = grupo('metodo_pago').map(r=>r.Codigo);
  DEBT_TYPES = Object.fromEntries(grupo('tipo_deuda').map(r=>[r.Codigo,{label:r.Nombre||r.Codigo,icon:String(r.Icono||'📄').replace(/[<>]/g,''),color:colorCatalogo(r)}]));
  ACCOUNT_CLASSES = Object.fromEntries(grupo('clase_cuenta').map(r=>[r.Codigo,{label:r.Nombre||r.Codigo,nature:r.Naturaleza||'activo'}]));
  ACCOUNT_TYPES = grupo('tipo_cuenta').map(r=>r.Codigo);
  CURRENCIES = Object.fromEntries(grupo('moneda').map(r=>[r.Codigo,{label:r.Nombre||r.Codigo,symbol:r.Simbolo||r.Codigo}]));
  TRANSFER_TYPES = Object.fromEntries(grupo('tipo_transferencia').map(r=>[r.Codigo,r.Nombre||r.Codigo]));
  COMMISSION_PAYERS = Object.fromEntries(grupo('pagador_comision').map(r=>[r.Codigo,r.Nombre||r.Codigo]));
  MOVEMENT_TYPES = Object.fromEntries(grupo('tipo_movimiento').map(r=>[r.Codigo,r.Nombre||r.Codigo]));
}
/**
 * Devuelve los códigos y nombres activos de un grupo de catálogo.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function opcionesCatalogo(group){ return catalogos.filter(r=>r.Grupo===group && filaActiva(r)).map(r=>({value:r.Codigo,label:r.Nombre||r.Codigo})); }
/**
 * Rellena un selector HTML con las opciones activas de un grupo de catálogo.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function llenarSelectCatalogo(id, group, selected=''){
  const el=document.getElementById(id); if(!el) return;
  const opts=opcionesCatalogo(group);
  el.innerHTML=opts.map(o=>`<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
  if(selected && opts.some(o=>o.value===selected)) el.value=selected;
}
/**
 * Comprueba es cuenta pasivo y devuelve un valor lógico.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function esCuentaPasivo(account){ return ACCOUNT_CLASSES[account?.accountKind]?.nature === 'pasivo'; }
/**
 * Reconoce una clase de tarjeta de crédito a partir de su código o etiqueta.
 * Uso: Filtra las tarjetas de crédito en Dashboard y en el formulario de Cuentas.
 */
function esTarjetaCredito(account){
  const raw=String(account?.accountKind||'');
  const code=raw.toLowerCase();
  const meta=ACCOUNT_CLASSES[raw]||ACCOUNT_CLASSES[code];
  const label=String(meta?.label||raw).toLowerCase();
  const labelIdentifiesCard=/tarjeta.*cr[eé]dito|credit.?card/i.test(`${label} ${code}`);
  return code==='credito'||(labelIdentifiesCard&&(!meta||meta.nature==='pasivo'));
}
/** Devuelve la cuenta principal marcada o la primera cuenta no crediticia como alternativa. */
function cuentaPrincipalDashboard(){
  return state.accounts.find(a=>a.isPrimary&&!esTarjetaCredito(a))||state.accounts.find(a=>!esTarjetaCredito(a))||null;
}
/**
 * Busca el nombre de una clase de cuenta a partir del código guardado.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function claseCuentaNombre(code){ return ACCOUNT_CLASSES[code]?.label || code || ''; }
/**
 * Busca los metadatos de una categoría y devuelve valores predeterminados si no existe.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function metaCategoria(code){ return CATEGORY_META[code] || CATEGORY_META.Otros || {icon:'⚙️',color:'#8B899C',label:code||'Otros'}; }
/**
 * Devuelve el nombre legible de una categoría para tablas y resúmenes.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function etiquetaCategoria(code){ return metaCategoria(code).label; }

/* Estado global */
let state = {
  settings: { theme:'light', currency:'PEN', notifications:true, sidebarCollapsed:false },
  user: { name:'Adriana Vives', email:'adriana.vives@correo.com' },
  accounts: [],
  transactions: [],
  goals: [],
  budgets: [],
  debts: [],
  notifications: [],
  catalogos: []
};

/* ==========================================================================
   TRADUCCIÓN ENTRE APP (inglés) Y SHEET (español)
   ==========================================================================
   Cada entidad tiene 2 funciones:
     - <ent>DesdeSheet(fila)  → convierte de Sheet a app
     - <ent>ASheet(obj)       → convierte de app a Sheet
   Si agregas una columna nueva, agrégala en ambos lados.
   ========================================================================== */

/**
 * Transforma las columnas de una fila de Transacciones al objeto interno de la aplicación.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function txDesdeSheet(r){
  return {
    id: r.ID,
    date: r.Fecha,
    amount: parseFloat(r.Monto) || 0,
  currency: r.Moneda || 'PEN',
    type: r.Tipo === 'ingreso' ? 'income' : 'expense',
    name: r.Nombre,
    method: r.Metodo,
    category: r.Categoria,
    status: r.Estado || 'Exitoso',
    accountId: r.CuentaID,
    transferType: r.TipoTransferencia || '',
    destinationAccountId: r.CuentaDestinoID || '',
    destinationAmount: parseFloat(r.MontoDestino) || 0,
    destinationCurrency: r.MonedaDestino || '',
    exchangeRate: parseFloat(r.TasaCambio) || 0,
    commission: parseFloat(r.Comision) || 0,
    commissionPayer: r.ComisionPagador || '',
    debtId: r.DeudaID || '',
    principalPaid: parseFloat(r.CapitalPagado) || 0,
    interestPaid: parseFloat(r.InteresPagado) || 0,
    goalId: r.MetaID || ''
  };
}

/**
 * Transforma el objeto de transacción a los nombres de columna usados por Sheets.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function txASheet(t){
  return {
    ID: t.id,
    Fecha: t.date,
    Monto: t.amount,
    Moneda: t.currency || 'PEN',
    Tipo: t.type === 'income' ? 'ingreso' : 'gasto',
    Nombre: t.name,
    Metodo: t.method,
    Categoria: t.category,
    Estado: t.status || 'Exitoso',
    CuentaID: t.accountId,
    TipoTransferencia: t.transferType || '',
    CuentaDestinoID: t.destinationAccountId || '',
    MontoDestino: t.destinationAmount || '',
    MonedaDestino: t.destinationCurrency || '',
    TasaCambio: t.exchangeRate || '',
    Comision: t.commission || 0,
    ComisionPagador: t.commissionPayer || '',
    DeudaID: t.debtId || '',
    CapitalPagado: t.principalPaid || 0,
    InteresPagado: t.interestPaid || 0,
    MetaID: t.goalId || ''
  };
}

/**
 * Transforma una fila de Cuentas al objeto interno, incluida su clase y su línea de crédito.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function accDesdeSheet(r){
  return {
    id:      r.ID,
    name:    r.Nombre,
    type:    r.Tipo,
    last4:   r.Ultimos4 ? String(r.Ultimos4) : '',
    balance: parseFloat(r.Saldo) || 0,
    creditLimit: parseFloat(r.LineaCredito) || 0,
    paymentDay: parseInt(r.DiaPago,10) || 0,
    closingDay: parseInt(r.DiaCierre,10) || 0,
    currency: r.Moneda || 'PEN',
    bank: r.Banco || '',
    accountKind: r.ClaseCuenta || 'debito',
    color: /^#[0-9a-f]{6}$/i.test(String(r.Color||'')) ? r.Color : '',
    isPrimary: ['true','1','si','sí','yes','x'].includes(String(r.EsPrincipal||'').trim().toLowerCase())
  };
}
/**
 * Transforma una cuenta al formato de columnas esperado por la hoja Cuentas.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function accASheet(a){
  return {
    ID:        a.id,
    Nombre:    a.name,
    Tipo:      a.type,
    Ultimos4:  a.last4,
    Saldo:     a.balance,
    LineaCredito: a.creditLimit || 0,
    DiaCierre: a.closingDay || '',
    DiaPago: a.paymentDay || '',
    Moneda:    a.currency || 'PEN',
    Banco:     a.bank || '',
    ClaseCuenta: a.accountKind || 'debito',
    Color:     a.color || '',
    EsPrincipal: a.isPrimary ? 'SI' : ''
  };
}

/**
 * Transforma una fila de Metas del Sheet al objeto interno.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function goalDesdeSheet(r){
  return {
    id:        r.ID,
    name:      r.Nombre,
    target:    parseFloat(r.Objetivo) || 0,
    saved:     parseFloat(r.Ahorrado) || 0,
    due:       r.Vence,
    accountId: r.CuentaID || null,
    monthlyContribution: parseFloat(r.AporteMensual) || 0
  };
}
/**
 * Transforma una meta al formato de columnas esperado por la hoja Metas.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function goalASheet(g){
  return {
    ID:        g.id,
    Nombre:    g.name,
    Objetivo:  g.target,
    Ahorrado:  g.saved,
    Vence:     g.due,
    CuentaID:  g.accountId || '',
    AporteMensual: g.monthlyContribution || 0
  };
}

/**
 * Transforma una fila de Deudas al objeto interno.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function debtDesdeSheet(r){
  return {
    id:                r.ID,
    name:              r.Nombre,
    type:              r.Tipo,
    principal:         parseFloat(r.Capital) || 0,
    balance:           parseFloat(r.Saldo) || 0,
    installmentAmount: parseFloat(r.MontoCuota) || 0,
    installmentsTotal: parseInt(r.CuotasTotales, 10) || 0,
    installmentsPaid:  parseInt(r.CuotasPagadas, 10) || 0,
    interestRate:      parseFloat(r.TasaInteres) || 0,
    dueDay:            parseInt(r.DiaPago, 10) || 0,
    accountId:         r.CuentaID || null,
    paymentAccountId:  r.CuentaPagoID || '',
    currency:          r.Moneda || 'PEN'
  };
}
/**
 * Transforma una deuda al formato de columnas esperado por Sheets.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function debtASheet(d){
  return {
    ID:              d.id,
    Nombre:          d.name,
    Tipo:            d.type,
    Capital:         d.principal,
    Saldo:           d.balance,
    MontoCuota:      d.installmentAmount,
    CuotasTotales:   d.installmentsTotal,
    CuotasPagadas:   d.installmentsPaid,
    TasaInteres:     d.interestRate,
    DiaPago:         d.dueDay,
    CuentaID:        d.accountId || '',
    CuentaPagoID:    d.paymentAccountId || '',
    Moneda:          d.currency || 'PEN'
  };
}

/**
 * Transforma una fila de Notificaciones al objeto interno.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function notifDesdeSheet(r){
  return {
    id:        r.ID,
    type:      r.Tipo,
    icon:      r.Icono,
    title:     r.Titulo,
    text:      r.Texto,
    time:      r.Tiempo,
    unread:    r.NoLeida === true || r.NoLeida === 'VERDADERO' || r.NoLeida === 'TRUE',
    important: r.Importante === true || r.Importante === 'VERDADERO' || r.Importante === 'TRUE'
  };
}
/**
 * Transforma una notificación al formato de columnas esperado por Sheets.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function notifASheet(n){
  return {
    ID:         n.id,
    Tipo:       n.type,
    Icono:      n.icon,
    Titulo:     n.title,
    Texto:      n.text,
    Tiempo:     n.time,
    NoLeida:    n.unread,
    Importante: n.important
  };
}

/**
 * Transforma una fila de Presupuesto al objeto interno.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function budgetDesdeSheet(r){
  return {
    id:       r.ID,
    category: r.Categoria,
    limit:    parseFloat(r.Limite) || 0,
    kind: r.TipoRegistro || 'presupuesto',
    name: r.NombreFijo || '',
    accountId: r.CuentaID || '',
    dueDay: parseInt(r.DiaVencimiento,10) || 0
  };
}
/**
 * Transforma un presupuesto al formato de columnas esperado por Sheets.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function budgetASheet(b){
  return {
    ID:        b.id,
    Categoria: b.category,
    Limite:    b.limit,
    TipoRegistro: b.kind || 'presupuesto',
    NombreFijo: b.name || '',
    CuentaID: b.accountId || '',
    DiaVencimiento: b.dueDay || ''
  };
}

/* ==========================================================================
   CARGA Y GUARDADO
   ========================================================================== */

/**
 * Carga el estado desde el Sheet. Si falla, cae al caché de localStorage.
 * @returns {Promise<void>}
 */
async function loadState(){
  try{
    const datos = await apiObtenerTodo();

    state.accounts      = (datos.cuentas       || []).map(accDesdeSheet);
    state.transactions  = (datos.transacciones || []).map(txDesdeSheet);
    state.goals         = (datos.metas         || []).map(goalDesdeSheet);
    state.budgets       = (datos.presupuestos  || []).map(budgetDesdeSheet);
    state.debts         = (datos.deudas        || []).map(debtDesdeSheet);
    state.notifications = (datos.notificaciones|| []).map(notifDesdeSheet);
    state.catalogos = datos.catalogos || [];
    cargarCatalogos(state.catalogos);

    // Caché local
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.log('✅ Datos cargados desde Sheets');

  }catch(e){
    console.warn('⚠️ No se pudo leer del Sheet, usando caché local:', e);

    // Fallback: leer del localStorage
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const cache = JSON.parse(raw);
        Object.assign(state, cache);
      }
    }catch(err){ /* nada */ }

    // Asegura que existan las colecciones
    state.accounts      = state.accounts      || [];
    state.transactions  = state.transactions  || [];
    state.goals         = state.goals         || [];
    state.budgets       = state.budgets       || [];
    state.debts         = state.debts         || [];
    state.notifications = state.notifications || [];
    state.catalogos = state.catalogos || [];
    cargarCatalogos(state.catalogos);

    toast('Trabajando en modo offline');
  }

  // Settings y user siempre desde localStorage (no van al Sheet)
  try{
    const cfg = localStorage.getItem(STORAGE_KEY + '_cfg');
    if(cfg){
      const parsed = JSON.parse(cfg);
      if(parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
      if(parsed.user)     state.user     = { ...state.user,     ...parsed.user };
    }
  }catch(e){ /* nada */ }
}

/**
 * Guarda la configuración (settings + user) en localStorage.
 * Los datos van al Sheet, pero la config es local.
 */
function saveConfig(){
  try{
    localStorage.setItem(STORAGE_KEY + '_cfg', JSON.stringify({
      settings: state.settings,
      user: state.user
    }));
  }catch(e){ /* nada */ }
}

/**
 * Guarda el estado actual en localStorage como caché local.
 * NO escribe al Sheet: eso se hace operación por operación.
 */
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.warn('No se pudo guardar caché local', e); }
}

/* ==========================================================================
   UTILIDADES DE ALTO NIVEL (para las vistas)
   ========================================================================== */

/**
 * Crea una transacción en el Sheet y actualiza el state local.
 * @param {Object} txData  Datos en formato "app"
 * @returns {Promise<Object>}  La transacción con su id
 */
async function crearTransaccion(txData){
  const rollbackBalances = await aplicarImpactoEnSaldos(null, txData);
  let rollbackGoal;
  let res;
  try{
    res = await apiCrear('transacciones', txASheet(txData));
    if(!res.ok) throw new Error(res.error || 'Error al crear');
    txData.id = res.id;
    await aplicarPagoDeuda(null, txData);
    rollbackGoal=await aplicarAporteMeta(null,txData);
    state.transactions.push(txData);
    saveState();
    return txData;
  }catch(err){
    if(rollbackGoal)await rollbackGoal();
    if(txData.id){
      try{ await apiEliminar('transacciones', txData.id); }catch(_){ /* se informará el error original */ }
    }
    await rollbackBalances();
    throw err;
  }
}

/**
 * Actualiza una transacción existente.
 */
async function actualizarTransaccion(txData){
  const anterior = state.transactions.find(t=> t.id === txData.id);
  if(!anterior) throw new Error('No se encontró la transacción');
  const rollbackBalances = await aplicarImpactoEnSaldos(anterior, txData);
  let rollbackDebt;
  let rollbackGoal;
  let res;
  try{
    rollbackDebt = await aplicarPagoDeuda(anterior, txData);
    rollbackGoal = await aplicarAporteMeta(anterior,txData);
    res = await apiActualizar('transacciones', txASheet(txData));
    if(!res.ok) throw new Error(res.error || 'Error al actualizar');
  }catch(err){
    if(rollbackGoal)await rollbackGoal();
    if(rollbackDebt) await rollbackDebt();
    await rollbackBalances();
    throw err;
  }
  const idx = state.transactions.findIndex(t=> t.id === txData.id);
  if(idx >= 0) state.transactions[idx] = txData;
  saveState();
  return txData;
}

/**
 * Elimina una transacción por id.
 */
async function eliminarTransaccion(id){
  const anterior = state.transactions.find(t=> t.id === id);
  if(!anterior) throw new Error('No se encontró la transacción');
  const rollbackBalances = await aplicarImpactoEnSaldos(anterior, null);
  let rollbackDebt;
  let rollbackGoal;
  let res;
  try{
    rollbackDebt = await aplicarPagoDeuda(anterior, null);
    rollbackGoal = await aplicarAporteMeta(anterior,null);
    res = await apiEliminar('transacciones', id);
    if(!res.ok) throw new Error(res.error || 'Error al eliminar');
  }catch(err){
    if(rollbackGoal)await rollbackGoal();
    if(rollbackDebt) await rollbackDebt();
    await rollbackBalances();
    throw err;
  }
  state.transactions = state.transactions.filter(t=> t.id !== id);
  saveState();
}

/**
 * Crea una cuenta en el Sheet y actualiza el state.
 */
async function crearCuenta(accData){
  const res = await apiCrear('cuentas', accASheet(accData));
  if(!res.ok) throw new Error(res.error || 'Error al crear');
  accData.id = res.id;
  state.accounts.push(accData);
  saveState();
  return accData;
}

/**
 * Actualiza una cuenta existente en el Sheet.
 * @param {Object} accData  Debe incluir id.
 */
async function actualizarCuenta(accData){
  const res = await apiActualizar('cuentas', accASheet(accData));
  if(!res.ok) throw new Error(res.error || 'Error al actualizar');
  const idx = state.accounts.findIndex(a=> a.id === accData.id);
  if(idx >= 0) state.accounts[idx] = accData;
  saveState();
  return accData;
}

/**
 * Marca una única cuenta no crediticia como principal y sincroniza la marca con Sheets.
 * Uso: Se invoca desde el formulario de Cuentas para establecer el filtro inicial del Dashboard.
 */
async function establecerCuentaPrincipal(id){
  const destino=state.accounts.find(a=>a.id===id);
  if(!destino)throw new Error('No se encontró la cuenta principal');
  if(esTarjetaCredito(destino))throw new Error('La cuenta principal del Dashboard debe ser una cuenta que no sea de crédito');
  const anteriores=state.accounts.map(a=>({...a}));
  const actualizadas=state.accounts.map(a=>({...a,isPrimary:a.id===id}));
  const escrituras=[];
  try{
    // Escribe primero las demás cuentas sin marca y deja la seleccionada para el final.
    for(const cuenta of actualizadas.filter(a=>a.id!==id&&a.isPrimary!==anteriores.find(x=>x.id===a.id)?.isPrimary)){
      await apiActualizar('cuentas',accASheet(cuenta));
      escrituras.push(anteriores.find(x=>x.id===cuenta.id));
      Object.assign(state.accounts.find(a=>a.id===cuenta.id),cuenta);
    }
    const principal=actualizadas.find(a=>a.id===id);
    await apiActualizar('cuentas',accASheet(principal));
    escrituras.push(anteriores.find(x=>x.id===id));
    Object.assign(destino,principal);
    saveState();
    return destino;
  }catch(error){
    // Intenta restaurar las filas escritas si una actualización falla a mitad del proceso.
    let rollbackFailed=false;
    for(const anterior of escrituras.reverse()){
      try{await apiActualizar('cuentas',accASheet(anterior));}
      catch(_rollbackError){rollbackFailed=true;}
    }
    for(const anterior of anteriores){
      const actual=state.accounts.find(a=>a.id===anterior.id);
      if(actual)Object.assign(actual,anterior);
    }
    saveState();
    if(rollbackFailed)throw new Error('No se pudo completar el cambio ni restaurar todas las marcas. Recarga los datos de Sheets y revisa la columna EsPrincipal.');
    throw error;
  }
}

/* Mantiene la deuda y el contador de cuotas sincronizados con transacciones de pago. */
/**
 * Actualiza capital, interés y saldo pendiente al registrar un pago de deuda.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
async function aplicarPagoDeuda(anterior, nuevo){
  const valido = t=> t && t.status === 'Exitoso' && t.debtId && t.category === 'Cuota de deuda';
  const cambios = new Map();
  if(valido(anterior)) cambios.set(anterior.debtId, {
    principal: Number(anterior.principalPaid) || 0, cuotas: -1
  });
  if(valido(nuevo)){
    const actual = cambios.get(nuevo.debtId) || { principal:0, cuotas:0, paymentAccountId:'' };
    actual.principal -= Number(nuevo.principalPaid) || 0;
    actual.cuotas += 1;
    actual.paymentAccountId = nuevo.accountId;
    cambios.set(nuevo.debtId, actual);
  }
  const guardados = [];
  try{
    for(const [id,delta] of cambios){
      const deuda = state.debts.find(d=>d.id === id);
      if(!deuda) throw new Error('No se encontró la deuda vinculada al pago');
      const original = { ...deuda };
      const actualizada = { ...deuda,
        balance: Math.max(0, deuda.balance + delta.principal),
        installmentsPaid: Math.max(0, (deuda.installmentsPaid || 0) + delta.cuotas),
        paymentAccountId: delta.paymentAccountId || deuda.paymentAccountId || ''
      };
      const res = await apiActualizar('deudas', debtASheet(actualizada));
      if(!res.ok) throw new Error(res.error || 'No se pudo actualizar el saldo de la deuda');
      Object.assign(deuda, actualizada);
      guardados.push({ deuda, original });
    }
    saveState();
  }catch(err){
    for(const cambio of guardados.reverse()){
      await apiActualizar('deudas', debtASheet(cambio.original));
      Object.assign(cambio.deuda, cambio.original);
    }
    saveState();
    throw err;
  }
  return async ()=>{
    for(const cambio of [...guardados].reverse()){
      await apiActualizar('deudas', debtASheet(cambio.original));
      Object.assign(cambio.deuda, cambio.original);
    }
    saveState();
  };
}

/**
 * Actualiza el monto ahorrado de una meta al crear, editar o borrar un aporte interno vinculado.
 * Uso: Se ejecuta automáticamente desde crearTransaccion, actualizarTransaccion y eliminarTransaccion.
 */
async function aplicarAporteMeta(anterior,nuevo){
  const esAporte=t=>t&&t.status==='Exitoso'&&t.goalId&&t.category==='Transferencia'&&t.transferType==='interna';
  const cambios=new Map();
  if(esAporte(anterior))cambios.set(anterior.goalId,-(Number(anterior.amount)||0));
  if(esAporte(nuevo))cambios.set(nuevo.goalId,(cambios.get(nuevo.goalId)||0)+(Number(nuevo.amount)||0));
  const guardados=[];
  try{
    for(const [id,delta] of cambios){
      if(!delta)continue;
      const goal=state.goals.find(g=>g.id===id);
      if(!goal)throw new Error('No se encontró la meta asociada al aporte');
      const original={...goal},actualizada={...goal,saved:Math.max(0,(Number(goal.saved)||0)+delta)};
      const res=await apiActualizar('metas',goalASheet(actualizada));
      if(!res.ok)throw new Error(res.error||'No se pudo actualizar el ahorro de la meta');
      Object.assign(goal,actualizada);guardados.push({goal,original});
    }
    saveState();
  }catch(err){
    for(const cambio of [...guardados].reverse()){
      try{await apiActualizar('metas',goalASheet(cambio.original));}catch(_rollbackError){/* conserva el error original */}
      Object.assign(cambio.goal,cambio.original);
    }
    saveState();throw err;
  }
  return async()=>{
    for(const cambio of [...guardados].reverse()){
      await apiActualizar('metas',goalASheet(cambio.original));
      Object.assign(cambio.goal,cambio.original);
    }
    saveState();
  };
}

/* Calcula el efecto de una transacción exitosa sobre sus cuentas. */
/**
 * Calcula el importe que cada cuenta recibe o pierde por una transacción.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function impactoTransaccion(t){
  const impacto = {};
  if(!t || t.status !== 'Exitoso') return impacto;
  const origen = state.accounts.find(a=> a.id === t.accountId);
  if(!origen) return impacto;
  const add = (id, amount)=> { impacto[id] = (impacto[id] || 0) + amount; };

  const origenCredito = esCuentaPasivo(origen);
  // Un ingreso recibido por transferencia es un ingreso normal a la cuenta.
  if(t.type === 'income' || t.category !== 'Transferencia'){
    const ingreso = t.type === 'income';
    add(t.accountId, origenCredito ? (ingreso ? -t.amount : t.amount) : (ingreso ? t.amount : -t.amount));
    return impacto;
  }

  const fee = Number(t.commission) || 0;
  if(t.transferType === 'externa'){
    const salida = t.amount + (t.commissionPayer === 'origen' ? fee : 0);
    add(t.accountId, origenCredito ? salida : -salida);
    return impacto;
  }

  if(t.transferType === 'interna'){
    const destino = state.accounts.find(a=> a.id === t.destinationAccountId);
    if(!destino) return impacto;
    if(origen.currency === destino.currency){
      const recibido = t.amount - fee;
      add(t.accountId, origenCredito ? t.amount : -t.amount);
      add(t.destinationAccountId, esCuentaPasivo(destino) ? -recibido : recibido);
    }else{
      // Para comprar USD: MontoDestino × tipo de cambio + comisión en PEN.
      const salida = t.destinationAmount * t.exchangeRate + fee;
      add(t.accountId, origenCredito ? salida : -salida);
      add(t.destinationAccountId, esCuentaPasivo(destino) ? -t.destinationAmount : t.destinationAmount);
    }
  }
  return impacto;
}

/* Aplica diferencias de saldo; devuelve una función para revertirlas si falla la escritura. */
/**
 * Aplica al saldo de las cuentas la diferencia entre la versión anterior y la nueva del movimiento.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
async function aplicarImpactoEnSaldos(anterior, nuevo){
  const antes = impactoTransaccion(anterior);
  const despues = impactoTransaccion(nuevo);
  const ids = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const cambios = [];

  try{
    for(const id of ids){
      const cuenta = state.accounts.find(a=> a.id === id);
      if(!cuenta) throw new Error('No se encontró una cuenta de la transacción');
      const delta = (despues[id] || 0) - (antes[id] || 0);
      if(!delta) continue;
      const original = { ...cuenta };
      const actualizada = { ...cuenta, balance: cuenta.balance + delta };
      await apiActualizar('cuentas', accASheet(actualizada));
      Object.assign(cuenta, actualizada);
      cambios.push({ cuenta, original });
    }
    saveState();
  }catch(err){
    for(const cambio of cambios.reverse()){
      await apiActualizar('cuentas', accASheet(cambio.original));
      Object.assign(cambio.cuenta, cambio.original);
    }
    saveState();
    throw err;
  }

  return async ()=>{
    for(const cambio of [...cambios].reverse()){
      await apiActualizar('cuentas', accASheet(cambio.original));
      Object.assign(cambio.cuenta, cambio.original);
    }
    saveState();
  };
}

/* La deuda de tarjeta resta al valor neto global; su saldo visible sigue positivo. */
/**
 * Devuelve el saldo firmado que aporta una cuenta al patrimonio global.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function valorGlobalCuenta(cuenta){
  return esCuentaPasivo(cuenta) ? -cuenta.balance : cuenta.balance;
}
/**
 * Calcula el saldo patrimonial total para una moneda, restando las cuentas pasivas.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
function saldoGlobalPorMoneda(currency = state.settings.currency){
  return state.accounts.filter(a=>(a.currency || 'PEN') === currency)
    .reduce((sum,a)=>sum + valorGlobalCuenta(a),0);
}

/**
 * Registra transferencias y aplica sus efectos en origen, destino y comisión.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
async function transferirEntreCuentas(desdeId, haciaId, monto){
  const desde = state.accounts.find(a=> a.id === desdeId);
  const hacia = state.accounts.find(a=> a.id === haciaId);
  if(!desde || !hacia) throw new Error('No se encontraron las cuentas de la transferencia');
  if(!Number.isFinite(monto) || monto <= 0 || monto > desde.balance) throw new Error('Monto inválido o saldo insuficiente');
  const saldoDesdeAnterior = desde.balance;
  const saldoHaciaAnterior = hacia.balance;
  const desdeActualizada = { ...desde, balance: saldoDesdeAnterior - monto };
  const haciaActualizada = { ...hacia, balance: saldoHaciaAnterior + monto };
  await apiActualizar('cuentas', accASheet(desdeActualizada));
  try{
    await apiActualizar('cuentas', accASheet(haciaActualizada));
  }catch(err){
    // Compensa la primera escritura si la segunda falla.
    try{ await apiActualizar('cuentas', accASheet(desde)); }
    catch(rollbackError){
      throw new Error('Falló la segunda actualización y también la reversión. Recarga los datos y verifica los saldos antes de volver a transferir.');
    }
    throw err;
  }
  desde.balance = desdeActualizada.balance;
  hacia.balance = haciaActualizada.balance;
  saveState();
  return { desde, hacia };
}

/**
 * Crea una meta en el Sheet y actualiza el state.
 */
async function crearMeta(goalData){
  const res = await apiCrear('metas', goalASheet(goalData));
  if(!res.ok) throw new Error(res.error || 'Error al crear');
  goalData.id = res.id;
  state.goals.push(goalData);
  saveState();
  return goalData;
}
/**
 * Actualiza una meta en el estado local y la sincroniza con Sheets.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
async function actualizarMeta(goalData){
  const res = await apiActualizar('metas', goalASheet(goalData));
  if(!res.ok) throw new Error(res.error || 'Error al actualizar');
  const idx = state.goals.findIndex(g=> g.id === goalData.id);
  if(idx >= 0) state.goals[idx] = goalData;
  saveState();
  return goalData;
}

/**
 * Crea un presupuesto en el Sheet.
 */
async function crearPresupuesto(bData){
  const res = await apiCrear('presupuestos', budgetASheet(bData));
  if(!res.ok) throw new Error(res.error || 'Error al crear');
  bData.id = res.id;
  state.budgets.push(bData);
  saveState();
  return bData;
}
/**
 * Actualiza un presupuesto local y lo sincroniza con Sheets.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
async function actualizarPresupuesto(bData){
  const res = await apiActualizar('presupuestos', budgetASheet(bData));
  if(!res.ok) throw new Error(res.error || 'Error al actualizar');
  const idx = state.budgets.findIndex(b=> b.id === bData.id);
  if(idx >= 0) state.budgets[idx] = bData;
  saveState();
  return bData;
}
/**
 * Elimina presupuesto y sincroniza el estado.
 * Uso: Se reutiliza desde el núcleo y las vistas que dependen de este módulo. Actualizar esta nota si cambia su responsabilidad.
 */
async function eliminarPresupuesto(id){
  const res = await apiEliminar('presupuestos', id);
  if(!res.ok) throw new Error(res.error || 'Error al eliminar');
  state.budgets = state.budgets.filter(b=> b.id !== id);
  saveState();
}

/**
 * Actualiza una notificación (ej. marcar como leída).
 */
async function actualizarNotificacion(nData){
  const res = await apiActualizar('notificaciones', notifASheet(nData));
  if(!res.ok) throw new Error(res.error || 'Error al actualizar');
  const idx = state.notifications.findIndex(n=> n.id === nData.id);
  if(idx >= 0) state.notifications[idx] = nData;
  saveState();
  return nData;
}

/**
 * Restablece el estado (borra caché local; los datos del Sheet no se tocan).
 */
function resetState(){
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY + '_cfg');
}

/**
 * Borra el estado local en memoria (no toca el Sheet).
 */
function wipeState(){
  state.transactions  = [];
  state.goals         = [];
  state.budgets       = [];
  state.accounts      = [];
  state.debts         = [];
  state.notifications = [];
  saveState();
}

/**
 * Elimina una cuenta por id.
 */
async function eliminarCuenta(id){
  const res = await apiEliminar('cuentas', id);
  if(!res.ok) throw new Error(res.error || 'Error al eliminar');
  state.accounts = state.accounts.filter(a=> a.id !== id);
  saveState();
}

/**
 * Elimina una meta por id.
 */
async function eliminarMeta(id){
  const res = await apiEliminar('metas', id);
  if(!res.ok) throw new Error(res.error || 'Error al eliminar');
  state.goals = state.goals.filter(g=> g.id !== id);
  saveState();
}

/**
 * Crea una deuda en el Sheet.
 */
async function crearDeuda(debtData){
  const res = await apiCrear('deudas', debtASheet(debtData));
  if(!res.ok) throw new Error(res.error || 'Error al crear');
  debtData.id = res.id;
  state.debts.push(debtData);
  saveState();
  return debtData;
}

/**
 * Actualiza una deuda existente.
 */
async function actualizarDeuda(debtData){
  const res = await apiActualizar('deudas', debtASheet(debtData));
  if(!res.ok) throw new Error(res.error || 'Error al actualizar');
  const idx = state.debts.findIndex(d=> d.id === debtData.id);
  if(idx >= 0) state.debts[idx] = debtData;
  saveState();
  return debtData;
}

/**
 * Elimina una deuda por id.
 */
async function eliminarDeuda(id){
  const res = await apiEliminar('deudas', id);
  if(!res.ok) throw new Error(res.error || 'Error al eliminar');
  state.debts = state.debts.filter(d=> d.id !== id);
  saveState();
}
