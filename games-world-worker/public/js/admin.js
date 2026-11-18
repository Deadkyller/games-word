/* Jucători (public) + panou de administrare (ascuns, doar cu parolă).
 * Profilurile și fotografiile stau în Cloudflare KV (src/worker.js): le văd toți vizitatorii.
 * Parola (secretul ADMIN_PASSWORD din Cloudflare) e verificată pe server; sesiunea e un cookie HttpOnly.
 * Panoul NU are buton în aplicație: se deschide doar la adresa  .../#admin */
(function(){
'use strict';

const CACHE_KEY='gamesWorldProfilesCacheV3';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lsGet=(k,f)=>{try{const x=localStorage.getItem(k);return x?JSON.parse(x):f}catch(e){return f}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const img=id=>'/api/image?id='+encodeURIComponent(id);

let profiles=lsGet(CACHE_KEY,[]);
let status='loading';      // loading | ok | error | cache
let editingId=null, pendingImage='', pendingPreview='', viewingId=null, isAdmin=false;

/* ---------------- date ---------------- */
function daysSince(date){
  if(!date)return 0;
  const d=new Date(date+'T00:00:00'), now=new Date();
  d.setHours(0,0,0,0); now.setHours(0,0,0,0);
  return Math.max(0,Math.floor((now-d)/86400000));
}
function formatDate(v){
  if(!v)return '—';
  const d=new Date(v+'T00:00:00');
  return isNaN(d)?v:d.toLocaleDateString('ro-RO');
}

/* ---------------- server ---------------- */
async function api(url,opts){
  const r=await fetch(url,Object.assign({credentials:'same-origin'},opts||{}));
  if(r.status===401){isAdmin=false;setTimeout(()=>adminPage(),0);throw new Error('Sesiunea a expirat. Intră din nou.');}
  let data=null;try{data=await r.json();}catch(e){}
  if(!r.ok)throw new Error((data&&data.error)||('HTTP '+r.status));
  return data;
}
async function loadProfiles(){
  try{
    const r=await (await fetch('/api/players',{cache:'no-store'})).json();
    profiles=r.players||[];lsSet(CACHE_KEY,profiles);status='ok';
  }catch(e){status=profiles.length?'cache':'error';}
  renderPlayers();
  if(isAdminPageOpen()&&isAdmin)renderDashboard();
}
const isAdminPageOpen=()=>$('admin')?.classList.contains('active');

/* ---------------- statistici din Sheet-uri (potrivire după nume) ---------------- */
const norm=s=>String(s||'').toLowerCase().replace(/\(c\)/g,'').replace(/\s+/g,' ').trim();
function statsFor(name){
  const D=window.GAMES_WORLD_DATA||{}, n=norm(name), out=[];
  const hit=s=>{const k=norm(s);return k&&n.includes(k)};
  const coop=Object.keys(D.coop||{}).find(s=>norm(s)!=='total'&&hit(s));
  if(coop){const r=(D.coop[coop]||[])[1]||[];
    out.push(['Puncte Co-Op',r[0]],['Goluri Co-Op',r[1]],['Asisturi',r[5]],['Victorii VS',r[2]],['Înfrângeri VS',r[3]]);}
  const pes=((D.pes||{}).Campionatu||[]).slice(1).find(r=>r&&hit(r[0]));
  if(pes)out.push(['Echipă PES',pes[1]],['Puncte campionat PES',pes[2]]);
  const osm=((D.osm||{}).Clasament||[]).slice(1,6).find(r=>r&&r[0]&&hit(r[0]));
  if(osm)out.push(['Puncte OSM',osm[1]]);
  return out.filter(x=>x[1]!==undefined&&x[1]!==null&&x[1]!=='');
}

/* ---------------- pagina publică „Jucători” ---------------- */
function statusLine(){
  return status==='loading'?'Se încarcă profilurile…'
    :status==='error'?'Nu s-au putut încărca profilurile. Încearcă din nou mai târziu.'
    :status==='cache'?'Afișez ultima versiune salvată (serverul nu răspunde acum).':'';
}
function renderPlayers(){
  const root=$('players'); if(!root)return;
  if(viewingId&&profiles.find(p=>p.id===viewingId)){showProfile(viewingId);return;}
  viewingId=null;
  const q=(root.querySelector('#playerSearch')?.value||'').toLowerCase().trim();
  const list=profiles.filter(p=>(p.name+' '+(p.competitor?'concurent':'')).toLowerCase().includes(q));
  root.innerHTML=`
    <div class="page-intro"><h3>👤 Jucători</h3><p>Profilurile jucătorilor Games World.</p></div>
    <div class="gw-toolbar"><input id="playerSearch" class="gw-input" style="max-width:420px" placeholder="Caută jucător…" value="${esc(q)}"></div>
    ${isAdmin?'<div class="gw-toolbar"><button class="gw-btn primary small" id="addPlayerInline">➕ Adaugă jucător</button> <span class="badge">Mod administrator</span></div>':''}
    ${statusLine()?`<p style="color:var(--muted)">${statusLine()}</p>`:''}
    ${list.length?`<div class="player-grid">${list.map(p=>`
      <article class="player-card">
        <div class="player-photo">${p.image?`<img src="${img(p.image)}" alt="${esc(p.name)}" loading="lazy">`:'<div class="player-placeholder">👤</div>'}</div>
        <div class="player-info">
          <div class="player-name">${esc(p.name)}</div>
          <div class="player-meta">🏆 Concurent: <b>${p.competitor?'Da':'Nu'}</b><br>📅 Înscris: ${formatDate(p.joinDate)}<br>⏱️ Pe site: <b>${daysSince(p.joinDate)} zile</b></div>
          <div class="player-actions"><button class="gw-btn primary small" data-profile="${esc(p.id)}">Vezi profil</button>${isAdmin?` <button class="gw-btn small" data-inline-edit="${esc(p.id)}">✏️ Editează</button>`:''}</div>
        </div>
      </article>`).join('')}</div>`:
      (status==='loading'?'':'<div class="content-box"><div class="empty">Nu există încă jucători.</div></div>')}`;
  const s=root.querySelector('#playerSearch');
  s?.addEventListener('input',()=>{renderPlayers();const n=root.querySelector('#playerSearch');n?.focus();n?.setSelectionRange(n.value.length,n.value.length);});
  root.querySelectorAll('[data-profile]').forEach(b=>b.addEventListener('click',()=>showProfile(b.dataset.profile)));
  root.querySelectorAll('[data-inline-edit]').forEach(b=>b.addEventListener('click',()=>editInline(b.dataset.inlineEdit)));
  root.querySelector('#addPlayerInline')?.addEventListener('click',()=>editInline(null));
}
function editInline(id){
  goTo('admin');
  adminPage().then(()=>{if(isAdmin)openEditor(id);});
}
async function checkAdmin(){
  try{const me=await api('/api/me');if(me.admin&&!isAdmin){isAdmin=true;renderPlayers();}}catch(e){}
}
function showProfile(id){
  const p=profiles.find(x=>x.id===id); if(!p)return;
  viewingId=id;
  const st=statsFor(p.name);
  $('players').innerHTML=`
    <div class="gw-toolbar"><button class="gw-btn" id="backPlayers">← Înapoi la jucători</button>${isAdmin?` <button class="gw-btn primary" id="editProfileBtn">✏️ Editează</button>`:''}</div>
    <div class="player-profile">
      <div class="profile-photo">${p.image?`<img src="${img(p.image)}" alt="${esc(p.name)}" loading="lazy">`:'<div class="player-placeholder">👤</div>'}</div>
      <div class="content-box">
        <h1>${esc(p.name)}</h1>
        <div class="profile-details" style="margin-top:18px">
          <div class="profile-detail"><span>Concurent</span><b>${p.competitor?'Da':'Nu'}</b></div>
          <div class="profile-detail"><span>Data înscrierii</span><b>${formatDate(p.joinDate)}</b></div>
          <div class="profile-detail"><span>Pe site</span><b>${daysSince(p.joinDate)} zile</b></div>
          ${st.map(([l,v])=>`<div class="profile-detail"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}
        </div>
      </div>
    </div>`;
  $('backPlayers').onclick=()=>{viewingId=null;renderPlayers();};
  $('editProfileBtn')?.addEventListener('click',()=>editInline(id));
}

/* ---------------- administrare (ascunsă) ---------------- */
async function adminPage(){
  const root=$('admin'); if(!root)return;
  root.innerHTML='<div class="content-box">Se verifică sesiunea…</div>';
  try{
    const me=await (await fetch('/api/me',{credentials:'same-origin',cache:'no-store'})).json();
    isAdmin=!!me.admin;
  }catch(e){isAdmin=false;}
  isAdmin?renderDashboard():renderLogin();
}
function renderLogin(){
  const root=$('admin');
  root.innerHTML=`<div class="admin-login content-box">
    <div class="admin-lock">🛡️</div><h2>Administrator</h2><p style="color:var(--muted)">Introdu parola pentru a edita profilurile.</p>
    <form id="loginForm" class="admin-form"><input id="adminPass" class="gw-input" type="password" placeholder="Parola" autocomplete="current-password" maxlength="200" required><button class="gw-btn primary" id="loginBtn">🔓 Intră în panou</button></form>
    <div id="loginMsg" style="color:#ff9aa8;margin-top:10px"></div></div>`;
  setTimeout(()=>$('adminPass')?.focus(),0);
  $('loginForm').onsubmit=async e=>{
    e.preventDefault();const msg=$('loginMsg'),btn=$('loginBtn');
    msg.textContent='';btn.disabled=true;
    try{
      const r=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({password:$('adminPass').value})});
      if(r.status===401)throw new Error('bad');
      if(r.status===429)throw new Error('many');
      if(r.status===503)throw new Error('conf');
      if(!r.ok)throw new Error('http');
      isAdmin=true;renderDashboard();
    }catch(err){
      btn.disabled=false;
      msg.textContent=err.message==='bad'?'Parolă incorectă.'
        :err.message==='many'?'Prea multe încercări. Așteaptă 15 minute.'
        :err.message==='conf'?'Parola de administrator nu este setată în Cloudflare (ADMIN_PASSWORD).'
        :'Nu s-a putut face autentificarea. Încearcă din nou.';
    }
  };
}
async function logout(){
  try{await fetch('/api/logout',{method:'POST',credentials:'same-origin'});}catch(e){}
  isAdmin=false;location.hash='';goTo('home');
}
function renderDashboard(){
  const root=$('admin');
  root.innerHTML=`<div class="admin-userbar"><div><h3>🔐 Panou Administrator</h3><div style="color:var(--muted)">Gestionare jucători</div></div><div><span class="badge">Acces autorizat</span> <button id="logoutBtn" class="gw-btn small">Ieșire</button></div></div>
  <div class="content-box"><div class="gw-toolbar"><button id="newPlayerBtn" class="gw-btn primary">➕ Adaugă jucător</button></div>
  <div class="table-wrap"><table class="admin-table"><thead><tr><th>Jucător</th><th>Concurent</th><th>Înscris</th><th>Zile</th><th>Acțiuni</th></tr></thead><tbody>${profiles.length?profiles.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.competitor?'Da':'Nu'}</td><td>${formatDate(p.joinDate)}</td><td>${daysSince(p.joinDate)}</td><td><button class="gw-btn small" data-edit="${esc(p.id)}">Editează</button> <button class="gw-btn danger small" data-del="${esc(p.id)}">Șterge</button></td></tr>`).join(''):'<tr><td colspan="5">Nu există jucători.</td></tr>'}</tbody></table></div></div>
  <div id="adminEditor"></div>`;
  $('logoutBtn').onclick=logout;
  $('newPlayerBtn').onclick=()=>openEditor();
  root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.edit));
  root.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deletePlayer(b.dataset.del));
}
function openEditor(id){
  editingId=id||null;const p=id?profiles.find(x=>x.id===id):null;
  pendingImage=p?.image||'';pendingPreview=p?.image?img(p.image):'';
  $('adminEditor').innerHTML=`<div class="content-box"><h3>${p?'✏️ Editează jucător':'➕ Adaugă jucător'}</h3>
    <form id="playerForm" class="admin-form" style="margin-top:16px">
      <div class="form-grid">
        <div class="form-field full"><label>Nume și prenume</label><input id="pName" class="gw-input" maxlength="80" value="${esc(p?.name||'')}" required></div>
        <div class="form-field"><label>Concurent</label><select id="pCompetitor" class="gw-select"><option value="1" ${p?.competitor!==false?'selected':''}>Da</option><option value="0" ${p?.competitor===false?'selected':''}>Nu</option></select></div>
        <div class="form-field"><label>Data înscrierii</label><input id="pDate" class="gw-input" type="date" value="${esc(p?.joinDate||new Date().toISOString().slice(0,10))}" required></div>
        <div class="form-field full"><label>Fotografie</label><input id="pPhoto" class="gw-input" type="file" accept="image/*"><small style="color:var(--muted)">JPG, PNG, WEBP. Imaginea este micșorată automat în browser (max. 1200 px).</small></div>
        <div class="form-field full">${pendingPreview?`<img id="photoPreview" class="photo-preview" src="${esc(pendingPreview)}" alt="Previzualizare">`:'<div id="photoPreview" class="photo-preview" style="display:flex;align-items:center;justify-content:center">👤</div>'}</div>
      </div>
      <div id="editMsg" style="color:#ff9aa8;min-height:1.2em"></div>
      <div class="gw-toolbar"><button class="gw-btn primary" id="saveBtn" type="submit">💾 Salvează</button><button class="gw-btn" id="cancelEdit" type="button">Anulează</button></div>
    </form></div>`;
  $('pPhoto').onchange=e=>readPhoto(e.target.files?.[0]);
  $('cancelEdit').onclick=()=>renderDashboard();
  $('playerForm').onsubmit=e=>{e.preventDefault();savePlayer()};
  $('adminEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
function readPhoto(file){
  if(!file)return;
  const msg=$('editMsg'),btn=$('saveBtn');
  const r=new FileReader();r.onload=()=>{
    const im=new Image();im.onload=()=>{
      const max=1200, scale=Math.min(1,max/im.width,max/im.height);
      const c=document.createElement('canvas');c.width=Math.round(im.width*scale);c.height=Math.round(im.height*scale);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height);
      c.toBlob(async blob=>{
        if(!blob){msg.textContent='Imaginea nu a putut fi citită.';return;}
        btn.disabled=true;msg.textContent='Se încarcă fotografia…';
        try{
          const res=await api('/api/image',{method:'POST',headers:{'content-type':'image/jpeg'},body:blob});
          pendingImage=res.id;pendingPreview=c.toDataURL('image/jpeg',.8);msg.textContent='';
          const box=$('photoPreview');if(box)box.outerHTML=`<img id="photoPreview" class="photo-preview" src="${pendingPreview}" alt="Previzualizare">`;
        }catch(e){msg.textContent='Fotografia nu s-a încărcat: '+e.message;}
        btn.disabled=false;
      },'image/jpeg',.82);
    };im.src=r.result;
  };r.readAsDataURL(file);
}
async function savePlayer(){
  const name=$('pName').value.trim(), joinDate=$('pDate').value, competitor=$('pCompetitor').value==='1', msg=$('editMsg'), btn=$('saveBtn');
  if(!name||!joinDate){msg.textContent='Completează numele și data înscrierii.';return;}
  btn.disabled=true;msg.textContent='Se salvează…';
  try{
    await api('/api/players',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:editingId||undefined,name,competitor,joinDate,image:pendingImage})});
    editingId=null;pendingImage='';pendingPreview='';
    await loadProfiles();renderDashboard();
  }catch(e){btn.disabled=false;msg.textContent='Eroare la salvare: '+e.message;}
}
async function deletePlayer(id){
  const p=profiles.find(x=>x.id===id);if(!p)return;
  if(!confirm('Ștergi definitiv profilul lui '+p.name+'?'))return;
  try{await api('/api/players?id='+encodeURIComponent(id),{method:'DELETE'});await loadProfiles();renderDashboard();}
  catch(e){alert('Eroare la ștergere: '+e.message);}
}

/* ---------------- rutare: panoul se deschide doar la #admin ---------------- */
function goTo(page){
  const t=document.createElement('a');t.dataset.page=page;t.style.display='none';document.body.appendChild(t);t.click();t.remove();
}
function route(){ if(location.hash==='#admin'){goTo('admin');adminPage();} }

function init(){
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-page]');
    if(nav&&nav.dataset.page==='players'){viewingId=null;setTimeout(renderPlayers,0);}
  });
  window.addEventListener('hashchange',route);
  window.addEventListener('gw-stats-rendered',()=>{if(viewingId)showProfile(viewingId);});
  renderPlayers();
  route();
  checkAdmin();
  loadProfiles();
  window.setInterval(()=>{if(!document.hidden)loadProfiles();},20000);   // profilurile se actualizează la 20 de secunde
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadProfiles();});
  window.addEventListener('focus',loadProfiles);
  window.GW_PLAYERS={renderPlayers,adminPage};
}
document.addEventListener('DOMContentLoaded',init);
})();
