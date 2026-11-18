(function(){
  'use strict';
  const SOURCES=[
    {group:'osm',sheet:'Record ',url:'https://docs.google.com/spreadsheets/d/e/2PACX-1vRUQXscDdkXeMojhH_qNr0o16RFJ8p5Nak8YH9GlrxAfEqigsgxl3y0Jj5f5rJKVGFgU2_UHZjYvGQ3/pub?output=csv',label:'Palmares OSM'},
    {group:'coop',sheet:'Total ',url:'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt1ERcvjLJfYr1CXycj6hQ9PHTXIvQ_L1eaBSVlTGfWPTxuRBM4bmOJSrJQnnQvXbmdxCxzhbsJWhH/pub?output=csv',label:'Stats Co-Op'},
    {group:'pes',sheet:'Record',url:'https://docs.google.com/spreadsheets/d/e/2PACX-1vSmBNa8xbq88eFbXZ4MlQXGaSm9O2eV_RrKZVDn12xIIfTCpu0klhDpOOXQrT-EFsoiywYzU_89oiVZ/pub?output=csv',label:'Tabela PES'}
  ];
  const $=id=>document.getElementById(id);
  const setStatus=(message,state='')=>{const el=$('syncStatus');if(el)el.innerHTML=`<i class="sync-dot ${state}"></i><span>${message}</span>`;};
  const log=message=>{const el=$('syncLog');if(el)el.textContent+=(el.textContent?'\n':'')+message;};
  function parseCSV(input){
    const text=input.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(quoted){if(ch==='"'&&next==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}else if(ch!=='\r')cell+=ch;}
    if(cell!==''||row.length){row.push(cell);rows.push(row);}
    const clean=rows.filter(r=>r.some(v=>String(v).trim()!=='' )).map(r=>r.map(v=>{const s=String(v).trim();if(!s)return null;if(/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(s))return Number(s);if(/^[-+]?\d+,\d+$/.test(s))return Number(s.replace(',','.'));return s;}));
    while(clean.length&&clean[clean.length-1].every(v=>v==null))clean.pop();return clean;
  }
  async function fetchRows(source){
    const url=source.url+(source.url.includes('?')?'&':'?')+'_gw='+Date.now();
    const response=await fetch(url,{method:'GET',mode:'cors',cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const text=await response.text();
    if(!text.trim()||text.trim().startsWith('<')||/google sheets|sign in|access denied/i.test(text.slice(0,500)))throw new Error('Google nu a returnat un CSV public valid');
    const rows=parseCSV(text);if(!rows.length)throw new Error('foaia CSV este goală');return rows;
  }
  async function syncAll(){
    if(syncAll.running)return false;syncAll.running=true;setStatus('Se sincronizează…','busy');if($('syncLog'))$('syncLog').textContent='';
    const previous=window.GAMES_WORLD_DATA||{};const next={...previous};let success=0,errors=0,changed=false;
    try{
      for(const source of SOURCES){try{const rows=await fetchRows(source);const old=JSON.stringify(next[source.group]?.[source.sheet]||[]);if(old!==JSON.stringify(rows))changed=true;next[source.group]={...(next[source.group]||{}),[source.sheet]:rows};success++;log(`✓ ${source.label}: ${rows.length} rânduri — foaia „${source.sheet.trim()}”`);}catch(err){errors++;log(`✗ ${source.label}: ${err.message}`);}}
      if(success){window.GAMES_WORLD_DATA=next;localStorage.setItem('gamesWorldLiveDataV2',JSON.stringify(next));localStorage.setItem('gamesWorldLiveSyncAtV2',new Date().toISOString());if(changed&&typeof window.GW_RENDER_STATS==='function')window.GW_RENDER_STATS();}
      if(success===3&&!errors)setStatus('Live sincronizat','ok');else if(success)setStatus(`Parțial: ${success}/3 foi live`,'err');else setStatus('Offline — date Excel locale','err');
      return success===3;
    }catch(err){setStatus('Eroare sincronizare','err');log(err.message);return false;}finally{syncAll.running=false;}
  }
  function open(){const m=$('syncModal');if(m){m.classList.add('open');m.setAttribute('aria-hidden','false');}}
  function close(){const m=$('syncModal');if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');}}
  window.GW_SYNC={syncAll,open,close};
  document.addEventListener('DOMContentLoaded',()=>{
    $('syncSettingsBtn')?.addEventListener('click',open);$('syncCloseBtn')?.addEventListener('click',close);$('syncTestBtn')?.addEventListener('click',syncAll);$('syncNowBtn')?.addEventListener('click',syncAll);
    $('syncModal')?.addEventListener('click',e=>{if(e.target.id==='syncModal')close();});
    const last=Date.parse(localStorage.getItem('gamesWorldLiveSyncAtV2')||'');if(!last||Date.now()-last>300000)syncAll();
    window.setInterval(syncAll,300000);
  });
})();
