(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').trim();
  const fmt=v=>v==null?'':String(v);
  const medal=i=>i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1);
  const put=(id,html)=>{const e=$(id);if(e)e.innerHTML=html;};
  function table(headers,rows,opts={}){
    const {rank=false,nowrap=false}=opts;
    if(!headers.length)return '<div class="empty">Nu există date în această foaie.</div>';
    return `<div class="table-wrap"><table class="gw-table ${nowrap?'nowrap':''}"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr>${headers.map((_,j)=>`<td>${rank&&j===0?`<span class="rank">${medal(i)}</span>`:''}${esc(r[j])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function box(title,body){return `<section class="content-box"><h3 class="section-title">${esc(title)}</h3>${body}</section>`;}
  function download(file,label){return `<a class="download" href="assets/${file}" download>⬇️ ${label}</a>`;}
  function tabs(id,names,active=0){return `<div class="sheet-tabs" data-tabs="${id}">${names.map((s,i)=>`<button type="button" class="sheet-tab ${i===active?'active':''}" data-sheet="${id}-${i}">${esc(s)}</button>`).join('')}</div>`;}
  function raw(rows){
    if(!Array.isArray(rows)||!rows.length)return '<div class="empty">Nu există date în această foaie.</div>';
    const headers=(rows[0]||[]).map((h,i)=>clean(h)||`Coloana ${i+1}`);
    const body=rows.slice(1).filter(r=>r.some(v=>v!==null&&v!==''&&v!==undefined));
    return table(headers,body.map(r=>headers.map((_,i)=>r[i]??'')),{nowrap:true});
  }
  function recordRows(rows){return `<div class="record-list">${rows.filter(r=>r.some(v=>v!==null&&v!==''&&v!==undefined)).map(r=>`<div class="record"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>`;}
  function renderSheet(group,name,rows){
    if(group==='coop'){
      if(name.trim()==='Total'){
        let sections=[],cur=[];
        rows.forEach(r=>{if(!r||r.every(v=>v==null||v==='')){if(cur.length)sections.push(cur);cur=[];}else cur.push(r);});
        if(cur.length)sections.push(cur);
        return sections.map(sec=>{const title=clean(sec[0][2]||sec[0][0]||'Statistici');const heads=sec[0].map((v,i)=>clean(v)||`Coloana ${i+1}`);return box(title,table(heads,sec.slice(1).filter(r=>r.some(v=>v!=null&&v!=='' )).map(r=>heads.map((_,i)=>r[i]??'')),{nowrap:true}));}).join('')||raw(rows);
      }
      return box('👤 '+name,raw(rows));
    }
    if(group==='pes'&&name==='Record')return recordRows(rows);
    if(group==='osm'&&(name==='Record '||name==='Record'))return recordRows(rows);
    if(group==='osm'&&name==='Meciuri')return box('📅 Meciuri',raw(rows));
    return box(name,raw(rows));
  }
  function sheetPage(group,rootId,data,filename,label){
    const names=Object.keys(data||{});
    if(!names.length){put(rootId,'<div class="empty">Nu există date disponibile.</div>');return;}
    put(rootId,`<div class="page-intro"><h3>${group==='coop'?'📊 Stats Co-Op':group==='pes'?'⚽ Tabela PES':'🏅 Palmares OSM'}</h3><p>${group==='coop'?'Statistici generale și foi individuale pentru fiecare jucător.':group==='pes'?'Campionat, golaveraj, serii și recorduri.':'Clasament, goluri, cartonașe, meciuri și trofee.'}</p></div>${tabs(group,names)}<div id="${group}Body"></div>${download(filename,label)}`);
    const root=$(rootId);
    const show=idx=>{const name=names[idx]||names[0];const body=$(group+'Body');if(body)body.innerHTML=renderSheet(group,name,data[name]||[]);};
    root.querySelectorAll('.sheet-tab').forEach((b,i)=>b.addEventListener('click',()=>{root.querySelectorAll('.sheet-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');show(i);}));
    show(0);
  }
  function renderAll(){
    const D=window.GAMES_WORLD_DATA||{};
    const coop=D.coop||{},pes=D.pes||{},osm=D.osm||{};
    const total=coop['Total ']||coop.Total||[];
    const ranked=total.slice(1).filter(r=>r[0]!=null&&typeof r[1]==='number').sort((a,b)=>b[1]-a[1]).slice(0,3);
    put('homePodium',box('🏆 Top Co-Op',`<div class="podium">${[ranked[1],ranked[0],ranked[2]].filter(Boolean).map((r,i)=>`<div class="pod p${[2,1,3][i]}"><div class="medal">${['🥈','🥇','🥉'][i]}</div><div class="pname">${esc(r[0])}</div><div class="ppts">${esc(r[1])} puncte</div></div>`).join('')}</div>`));
    sheetPage('coop','statsCoop',coop,'Stats_Co-oP.xlsx','Descarcă Stats Co-oP.xlsx');
    sheetPage('pes','tabelaPes',pes,'Tabela_Pes.xlsx','Descarcă Tabela PES.xlsx');
    sheetPage('osm','palmaresOsm',osm,'Palmares_OSM.xlsx','Descarcă Palmares OSM.xlsx');
  }
  const titles={home:'Home',statsCoop:'Stats Co-Op',tabelaPes:'Tabela PES',palmaresOsm:'Palmares OSM',players:'Jucători',admin:'Administrator'};
  const subs={home:'Dashboard Games World',statsCoop:'Statistici Co-Op și VS',tabelaPes:'Clasament și recorduri PES',palmaresOsm:'Palmares și statistici OSM',players:'Profilurile jucătorilor',admin:'Panou de administrare'};
  function nav(id){const sec=$(id);if(!sec||!sec.classList.contains('page'))return;document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x===sec));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===id));if($('pageTitle'))$('pageTitle').textContent=titles[id]||id;if($('pageSubtitle'))$('pageSubtitle').textContent=subs[id]||'';}
  document.addEventListener('click',e=>{const n=e.target.closest('[data-page]');if(n)nav(n.dataset.page);});
  $('refreshBtn')?.addEventListener('click',()=>location.reload());
  window.GW_RENDER_STATS=renderAll;
  renderAll();
})();
