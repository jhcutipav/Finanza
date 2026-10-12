/* ==========================================================================
   settings.js — Vista Configuración (perfil, preferencias, datos).
   Depende de: state.js, helpers.js, theme.js, navigation.js.
   ========================================================================== */

/**
 * Render inicial de la vista Configuración.
 * Sincroniza los inputs con el estado actual.
 */
const CATALOG_GROUP_LABELS = {
  categoria:'Categorías', metodo_pago:'Métodos de pago', clase_cuenta:'Clases de cuenta',
  tipo_cuenta:'Tipos de cuenta', moneda:'Monedas', tipo_deuda:'Tipos de deuda'
};
const CATALOG_ICONS = [
  ['💰','Dinero','dinero sueldo ingreso'],['💵','Billetes','efectivo dinero'],['💳','Tarjeta','banco tarjeta credito'],['🏦','Banco','banco cuenta'],['💸','Gasto','pago gasto'],['🪙','Moneda','moneda ahorro'],['💎','Valor','ahorro valor'],['📈','Inversión','inversion crecimiento'],['📉','Pérdida','baja perdida'],['🧾','Recibo','recibo factura'],['💼','Trabajo','trabajo empleo'],['👔','Sueldo','empleo sueldo'],['🤝','Préstamo','prestamo acuerdo'],['🎁','Regalo','regalo premio cashback'],['🔁','Transferencia','transferencia cambio'],['➕','Ingreso','ingreso agregar'],['➖','Egreso','egreso quitar'],['🧮','Cálculo','calculo presupuesto'],
  ['🍽️','Comida','comida restaurante alimentacion'],['🛒','Supermercado','supermercado compras'],['🥦','Alimentos','verduras comida'],['☕','Café','cafe bebida'],['🍔','Comida rápida','hamburguesa comida'],['🍕','Pizza','comida pizza'],['🍰','Postre','postre comida'],['🥤','Bebida','bebida'],['🧺','Mercado','mercado compras'],['🛍️','Compras','compras tienda'],['👕','Ropa','ropa vestimenta'],['👟','Calzado','zapatos ropa'],['💄','Belleza','belleza cosmeticos'],['💇','Peluquería','peluqueria belleza'],['🐾','Mascota','mascota veterinario'],['🎮','Juegos','juegos entretenimiento'],['🎬','Cine','cine entretenimiento'],['🎵','Música','musica entretenimiento'],['📚','Educación','educacion libros estudio'],['🎓','Estudios','estudios universidad'],
  ['🏠','Casa','casa vivienda hogar'],['🏢','Edificio','edificio alquiler oficina'],['🛏️','Dormitorio','dormitorio hogar'],['🛋️','Muebles','muebles hogar'],['🔧','Reparación','reparacion mantenimiento'],['💡','Servicios','luz electricidad'],['🚿','Agua','agua servicios'],['🔥','Gas','gas servicios'],['📶','Internet','internet wifi telefono'],['📱','Celular','celular telefono'],['🧹','Limpieza','limpieza hogar'],['🔑','Alquiler','alquiler casa'],['🧰','Herramientas','herramientas reparacion'],
  ['🚗','Auto','auto carro transporte'],['🚕','Taxi','taxi transporte'],['🚌','Bus','bus transporte'],['🚆','Tren','tren transporte'],['✈️','Viajes','viaje avion vacaciones'],['🚲','Bicicleta','bicicleta transporte'],['⛽','Combustible','gasolina combustible'],['🅿️','Estacionamiento','parking estacionamiento'],['🛣️','Peajes','peaje carretera'],['🧳','Equipaje','viaje equipaje'],['🏨','Hotel','hotel hospedaje'],['🗺️','Paseo','turismo paseo'],
  ['🩺','Salud','salud medico'],['💊','Farmacia','farmacia medicina'],['🏥','Hospital','hospital salud'],['🦷','Dentista','dentista dientes salud'],['🧘','Bienestar','bienestar ejercicio'],['🏋️','Gimnasio','gimnasio deporte'],['⚽','Deporte','deporte futbol'],['❤️','Salud','corazon salud'],['🛡️','Seguro','seguro proteccion'],['👶','Familia','bebe familia'],['🎉','Celebración','fiesta celebracion'],['🎨','Hobby','arte hobby'],['🌱','Plantas','plantas jardin'],['🐶','Perro','perro mascota'],['🐱','Gato','gato mascota'],['🌐','Web','web internet'],['📦','Envío','paquete envio'],['📅','Suscripción','suscripcion fecha'],['⚙️','Otro','otro configuracion'],['❓','Ayuda','ayuda desconocido']
];

/**
 * Renderiza settings en su vista.
 * Uso: Se usa en la vista Configuración al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderSettings(){
  document.getElementById('settingsName').value     = state.user.name;
  document.getElementById('settingsEmail').value    = state.user.email;
  document.getElementById('settingsNotifToggle').checked = state.settings.notifications;
  llenarSelectCatalogo('settingsCurrency','moneda',state.settings.currency);
  renderCatalogManager();
}

/**
 * Renderiza catalog manager en su vista.
 * Uso: Se usa en la vista Configuración al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderCatalogManager(){
  const filter=document.getElementById('catalogFilter');
  if(!filter) return;
  const groups=Object.keys(CATALOG_GROUP_LABELS);
  const selected=filter.value || groups[0];
  filter.innerHTML=groups.map(g=>`<option value="${g}">${CATALOG_GROUP_LABELS[g]}</option>`).join('');
  filter.value=groups.includes(selected)?selected:groups[0];
  const rows=catalogos.filter(r=>r.Grupo===filter.value).sort((a,b)=>(Number(a.Orden)||0)-(Number(b.Orden)||0));
  const list=document.getElementById('catalogList');
  list.innerHTML=rows.map(r=>`<div class="catalog-item ${filaActiva(r)?'':'is-inactive'}">
    <div><strong>${escapeHTML(r.Nombre||r.Codigo)}</strong><small>${escapeHTML(r.Codigo)}${r.Simbolo?' · '+escapeHTML(r.Simbolo):''}</small></div>
    <span class="catalog-state">${filaActiva(r)?'Activa':'Inactiva'}</span>
    <button class="btn btn-ghost" type="button" data-edit-catalog="${escapeHTML(r.ID)}">Editar</button>
  </div>`).join('') || '<p class="muted small">No hay opciones en este grupo.</p>';
  list.querySelectorAll('[data-edit-catalog]').forEach(b=>b.addEventListener('click',()=>openCatalogModal(b.dataset.editCatalog)));
}

/**
 * Actualiza catalog fields en el estado o la interfaz.
 * Uso: Se usa en el módulo Configuración, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function updateCatalogFields(){
  const g=document.getElementById('catalogGroup').value;
  document.getElementById('catalogNatureRow').hidden=g!=='clase_cuenta';
  document.getElementById('catalogMovementRow').hidden=g!=='categoria';
  document.getElementById('catalogSymbolRow').hidden=g!=='moneda';
}

/**
 * Renderiza catalog icon picker en su vista.
 * Uso: Se usa en la vista Configuración al abrirla o refrescar sus datos. Actualizar esta nota si cambia su responsabilidad.
 */
function renderCatalogIconPicker(query=''){
  const picker=document.getElementById('catalogIconPicker'); if(!picker) return;
  const q=(query||'').trim().toLocaleLowerCase('es');
  const selected=document.getElementById('catalogIcon').value;
  const matches=CATALOG_ICONS.filter(([icon,name,tags])=>!q||`${name} ${tags} ${icon}`.toLocaleLowerCase('es').includes(q));
  picker.innerHTML=matches.map(([icon,name])=>`<button type="button" class="catalog-icon-option ${icon===selected?'selected':''}" data-catalog-icon="${escapeHTML(icon)}" title="${escapeHTML(name)}" aria-label="${escapeHTML(name)}">${escapeHTML(icon)}</button>`).join('') || '<span class="muted small">No encontré iconos con esa búsqueda.</span>';
  picker.querySelectorAll('[data-catalog-icon]').forEach(btn=>btn.addEventListener('click',()=>{
    document.getElementById('catalogIcon').value=btn.dataset.catalogIcon;
    document.getElementById('catalogIconPreview').textContent=btn.dataset.catalogIcon;
    document.getElementById('catalogIconName').textContent=CATALOG_ICONS.find(x=>x[0]===btn.dataset.catalogIcon)?.[1]||'Personalizado';
    document.getElementById('catalogIconDropdown').open=false;
    renderCatalogIconPicker(document.getElementById('catalogIconSearch').value);
  }));
}

/**
 * Abre catalog modal para crear o editar sus datos.
 * Uso: Se usa en el módulo Configuración, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
function openCatalogModal(id=''){
  const groups=Object.keys(CATALOG_GROUP_LABELS);
  const groupEl=document.getElementById('catalogGroup');
  groupEl.innerHTML=groups.map(g=>`<option value="${g}">${CATALOG_GROUP_LABELS[g]}</option>`).join('');
  const row=id ? catalogos.find(r=>String(r.ID)===String(id)) : null;
  document.getElementById('catalogForm').reset();
  document.getElementById('catalogId').value=row?.ID||'';
  document.getElementById('catalogModalTitle').textContent=row?'Editar opción':'Agregar opción';
  if(row){
    groupEl.value=row.Grupo;
    document.getElementById('catalogCode').value=row.Codigo||'';
    document.getElementById('catalogCode').readOnly=true;
    document.getElementById('catalogGroup').disabled=true;
    document.getElementById('catalogName').value=row.Nombre||'';
    document.getElementById('catalogNature').value=row.Naturaleza||'activo';
    document.getElementById('catalogMovement').value=row.TipoMovimiento||'ambos';
    document.getElementById('catalogIcon').value=row.Icono||'';
    document.getElementById('catalogColor').value=/^#[0-9a-f]{6}$/i.test(row.Color||'')?row.Color:'#8B899C';
    document.getElementById('catalogSymbol').value=row.Simbolo||'';
    document.getElementById('catalogOrder').value=Number(row.Orden)||100;
    document.getElementById('catalogActive').checked=filaActiva(row);
  }else{
    groupEl.value=document.getElementById('catalogFilter').value||groups[0];
    document.getElementById('catalogCode').readOnly=false;
    document.getElementById('catalogGroup').disabled=false;
    document.getElementById('catalogColor').value='#8B899C';
    document.getElementById('catalogIcon').value='';
  }
  document.getElementById('catalogIconSearch').value='';
  document.getElementById('catalogIconDropdown').open=false;
  const icon=document.getElementById('catalogIcon').value;
  document.getElementById('catalogIconPreview').textContent=icon||'🏷️';
  document.getElementById('catalogIconName').textContent=CATALOG_ICONS.find(x=>x[0]===icon)?.[1]||(icon?'Icono personalizado':'Selecciona un icono');
  renderCatalogIconPicker();
  updateCatalogFields();
  openModal('catalogModal');
}

/**
 * Procesa catalog submit y coordina validación y guardado.
 * Uso: Se usa en el módulo Configuración, desde renderizadores o controladores de eventos. Actualizar esta nota si cambia su responsabilidad.
 */
async function handleCatalogSubmit(e){
  e.preventDefault();
  const id=document.getElementById('catalogId').value;
  const group=document.getElementById('catalogGroup').value;
  const code=document.getElementById('catalogCode').value.trim();
  const name=document.getElementById('catalogName').value.trim();
  if(!code||!name){toast('Completa el código y el nombre');return;}
  if(!id && catalogos.some(r=>r.Grupo===group&&String(r.Codigo).toLowerCase()===code.toLowerCase())){toast('Ese código ya existe en el grupo');return;}
  const protectedCodes={categoria:['Transferencia','Cuota de deuda'],tipo_movimiento:['income','expense'],tipo_transferencia:['interna','externa'],pagador_comision:['origen','destino']};
  if(id && protectedCodes[group]?.includes(code) && !document.getElementById('catalogActive').checked){toast('Esta opción es necesaria para los cálculos del sistema y no se puede desactivar');return;}
  const row={ID:id||undefined,Grupo:group,Codigo:code,Nombre:name,
    Naturaleza:group==='clase_cuenta'?document.getElementById('catalogNature').value:'',
    TipoMovimiento:group==='categoria'?document.getElementById('catalogMovement').value:'',
    Icono:document.getElementById('catalogIcon').value.trim(),
    Color:document.getElementById('catalogColor').value,
    Simbolo:group==='moneda'?document.getElementById('catalogSymbol').value.trim():'',
    Activo:document.getElementById('catalogActive').checked,
    Orden:parseInt(document.getElementById('catalogOrder').value,10)||100};
  try{
    const res=await conCargando('Guardando opción...',()=>id?apiActualizar('catalogos',row):apiCrear('catalogos',row));
    if(!res.ok)throw new Error(res.error||'No se pudo guardar');
    if(id) state.catalogos=state.catalogos.map(r=>String(r.ID)===String(id)?row:r);
    else state.catalogos.push({...row,ID:res.id});
    cargarCatalogos(state.catalogos); saveState();
    closeModal('catalogModal'); renderSettings(); renderView(currentViewName());
    toast('Catálogo actualizado');
  }catch(err){console.error(err);toast('Error al guardar: '+err.message);}
}

/**
 * Guarda el perfil (nombre + email) y refresca el user-chip.
 */
function handleSaveProfile(){
  state.user.name  = document.getElementById('settingsName').value.trim()  || state.user.name;
  state.user.email = document.getElementById('settingsEmail').value.trim() || state.user.email;
  saveState();
  refreshUserChip();
  toast('Perfil guardado');
}

/**
 * Cambia la moneda principal y re-renderiza la vista activa.
 * @param {Event} e
 */
function handleCurrencyChange(e){
  state.settings.currency = e.target.value;
  saveState();
  renderView(currentViewName());
  refreshUserChip();
  toast('Moneda actualizada');
}

/**
 * Activa/desactiva las notificaciones.
 * @param {Event} e
 */
function handleNotifToggle(e){
  state.settings.notifications = e.target.checked;
  saveState();
  const badge = document.getElementById('notifBadge');
  if(badge) badge.style.display = e.target.checked ? 'flex' : 'none';
}

/**
 * Restablece TODOS los datos al seed original (con confirmación).
 */
async function handleResetData(){
  if(!confirm('¿Restablecer todos los datos a los valores de ejemplo?')) return;
  await resetState();
  applyTheme();
  refreshUserChip();
  renderSettings();
  renderView(currentViewName());
  renderAccountFilterList();
  toast('Datos restablecidos');
}

/**
 * Borra todos los datos dejando la app vacía (con confirmación).
 */
function handleWipeData(){
  if(!confirm('Esta acción borrará todos tus datos. ¿Continuar?')) return;
  wipeState();
  renderView(currentViewName());
  renderAccountFilterList();
  toast('Datos eliminados');
}

/**
 * Actualiza el nombre/email/avatar en el topbar y en settings.
 */
function refreshUserChip(){
  const initials = state.user.name
    .split(' ')
    .map(w=> w[0])
    .slice(0,2)
    .join('')
    .toUpperCase();

  const nameEl    = document.getElementById('userName');
  const emailEl   = document.getElementById('userEmail');
  const avatarEl  = document.getElementById('userAvatar');
  const avatar2El = document.getElementById('settingsAvatar');

  if(nameEl)    nameEl.textContent    = state.user.name;
  if(emailEl)   emailEl.textContent   = state.user.email;
  if(avatarEl)  avatarEl.textContent  = initials;
  if(avatar2El) avatar2El.textContent = initials;
}

/**
 * Conecta todos los listeners de la vista Configuración.
 */
function initSettingsView(){
  document.getElementById('saveProfileBtn').addEventListener('click', handleSaveProfile);
  document.getElementById('settingsCurrency').addEventListener('change', handleCurrencyChange);
  document.getElementById('settingsNotifToggle').addEventListener('change', handleNotifToggle);
  document.getElementById('resetDataBtn').addEventListener('click', handleResetData);
  document.getElementById('wipeDataBtn').addEventListener('click', handleWipeData);
  document.getElementById('catalogFilter').addEventListener('change',renderCatalogManager);
  document.getElementById('addCatalogBtn').addEventListener('click',()=>openCatalogModal());
  document.getElementById('catalogGroup').addEventListener('change',updateCatalogFields);
  document.getElementById('catalogIconSearch').addEventListener('input',e=>renderCatalogIconPicker(e.target.value));
  document.getElementById('catalogForm').addEventListener('submit',handleCatalogSubmit);
}
