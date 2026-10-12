/* Inicio de sesión de FinSet; el backend de Apps Script valida todas las sesiones. */
const FINSET_AUTH_KEY='WszB3svTeQCQYnngMELTw9Vuf';

/** Obtiene el token de sesión guardado como temporal o persistente. */
function authStoredToken(){return localStorage.getItem(FINSET_AUTH_KEY)||sessionStorage.getItem(FINSET_AUTH_KEY)||'';}

/** Guarda el token según la preferencia de mantener iniciada la sesión. */
function authStoreToken(token,remember){
  localStorage.removeItem(FINSET_AUTH_KEY);sessionStorage.removeItem(FINSET_AUTH_KEY);
  (remember?localStorage:sessionStorage).setItem(FINSET_AUTH_KEY,token);
}

/** Presenta uno de los paneles de acceso y limpia mensajes anteriores. */
function authShowPanel(name){
  ['login','setup','recover'].forEach(panel=>{const el=document.getElementById(`auth${panel[0].toUpperCase()+panel.slice(1)}Panel`);if(el)el.hidden=panel!==name;});
  document.querySelectorAll('.auth-message').forEach(el=>{el.textContent='';el.classList.remove('success');});
}

/** Muestra un mensaje accesible debajo del formulario indicado. */
function authMessage(id,message,success=false){
  const el=document.getElementById(id);if(!el)return;el.textContent=message;el.classList.toggle('success',success);
}

/** Activa FinSet tras recibir o restaurar una sesión válida del backend. */
async function authEnter(token,remember){
  authStoreToken(token,remember);document.body.classList.add('authenticated');
  try{await startFinSetApp();}
  catch(error){document.body.classList.remove('authenticated');authMessage('authLoginMessage','No se pudo cargar FinSet: '+error.message);}
}

/** Conecta el login, la configuración inicial y la recuperación de contraseña. */
async function initAuthGate(){
  document.getElementById('authLoginForm').addEventListener('submit',async e=>{
    e.preventDefault();authMessage('authLoginMessage','Validando...');
    try{
      const result=await apiAuthPost('login',{email:document.getElementById('authLoginEmail').value,password:document.getElementById('authLoginPassword').value,remember:document.getElementById('authRemember').checked});
      if(!result.ok)throw new Error(result.error||'No se pudo iniciar sesión.');
      await authEnter(result.token,document.getElementById('authRemember').checked);
    }catch(error){authMessage('authLoginMessage',error.message);}
  });
  document.getElementById('authSetupForm').addEventListener('submit',async e=>{
    e.preventDefault();authMessage('authSetupMessage','Guardando acceso...');
    const password=document.getElementById('authSetupPassword').value;
    if(password!==document.getElementById('authSetupConfirm').value){authMessage('authSetupMessage','Las contraseñas no coinciden.');return;}
    try{
      const result=await apiAuthPost('setupAuth',{setupKey:document.getElementById('authSetupKey').value,email:document.getElementById('authSetupEmail').value,password});
      if(!result.ok)throw new Error(result.error||'No se pudo configurar el acceso.');
      await authEnter(result.token,true);
    }catch(error){authMessage('authSetupMessage',error.message);}
  });
  document.getElementById('authRequestResetForm').addEventListener('submit',async e=>{
    e.preventDefault();authMessage('authRecoverMessage','Solicitando código...');
    try{
      const result=await apiAuthPost('requestPasswordReset',{email:document.getElementById('authResetEmail').value});
      if(!result.ok)throw new Error(result.error||'No se pudo enviar el código.');
      document.getElementById('authResetPasswordForm').hidden=false;
      authMessage('authRecoverMessage',result.message,true);
    }catch(error){authMessage('authRecoverMessage',error.message);}
  });
  document.getElementById('authResetPasswordForm').addEventListener('submit',async e=>{
    e.preventDefault();authMessage('authRecoverMessage','Actualizando contraseña...');
    try{
      const result=await apiAuthPost('resetPassword',{email:document.getElementById('authResetEmail').value,code:document.getElementById('authResetCode').value,password:document.getElementById('authResetPassword').value});
      if(!result.ok)throw new Error(result.error||'No se pudo cambiar la contraseña.');
      document.getElementById('authResetPasswordForm').hidden=true;document.getElementById('authLoginEmail').value=document.getElementById('authResetEmail').value;
      authShowPanel('login');authMessage('authLoginMessage',result.message,true);
    }catch(error){authMessage('authRecoverMessage',error.message);}
  });
  document.querySelectorAll('[data-auth-show]').forEach(button=>button.addEventListener('click',()=>authShowPanel(button.dataset.authShow)));

  try{
    const status=await apiAuthPost('authStatus');
    if(!status.ok)throw new Error(status.error||'No se pudo verificar la configuración.');
    if(!status.configured){authShowPanel('setup');return;}
    const token=authStoredToken();
    if(token){
      const valid=await apiAuthPost('validateSession',{sessionToken:token});
      if(valid.ok){await authEnter(token,Boolean(localStorage.getItem(FINSET_AUTH_KEY)));return;}
      localStorage.removeItem(FINSET_AUTH_KEY);sessionStorage.removeItem(FINSET_AUTH_KEY);
    }
    authShowPanel('login');
  }catch(error){authShowPanel('login');authMessage('authLoginMessage','No se pudo conectar para validar el acceso. Comprueba tu conexión e inténtalo de nuevo.');console.error(error);}
}

/** Cierra la sesión en el servidor y elimina también la copia local de datos. */
async function authLogout(){
  const token=authStoredToken();
  try{if(token)await apiAuthPost('logout',{sessionToken:token});}catch(error){console.warn('No se pudo invalidar la sesión en el servidor',error);}
  localStorage.removeItem(FINSET_AUTH_KEY);sessionStorage.removeItem(FINSET_AUTH_KEY);
  localStorage.removeItem(typeof STORAGE_KEY==='undefined'?'finset_data_v5':STORAGE_KEY);
  window.location.reload();
}
