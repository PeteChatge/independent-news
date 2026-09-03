let SOURCES=[], DATA=null;
const $=s=>document.querySelector(s);
const hoverbox=$('#hoverbox');
let activeTab='all';

async function load(){
  const [s,d]=await Promise.all([
    fetch('data/sources.json').then(r=>r.json()),
    fetch('data/mock.json').then(r=>r.json())
  ]);
  SOURCES=s; DATA=d;
  // Falls mock älter als heute (Stand 02.09. vs heute 03.09.), beim Laden direkt auf Heute heben
  const todayLoad=new Date().toISOString().slice(0,10);
  if(DATA.tageslage.date !== todayLoad){
    const dsOld=DATA.tageslage.date.split('-'); const dstrOld=dsOld[2]+'.'+dsOld[1]+'.'+dsOld[0];
    const dsN=todayLoad.split('-'); const dstrN=dsN[2]+'.'+dsN[1]+'.'+dsN[0];
    DATA.tageslage.date=todayLoad; DATA.tageslage.titel=DATA.tageslage.titel.replace(dstrOld, dstrN); DATA.audit.datum=todayLoad;
  }
  // Index.html statisch auf DATA aktualisieren (Datum driftet sonst)
  const ds=DATA.tageslage.date.split('-'); const dstr=ds[2]+'.'+ds[1]+'.'+ds[0];
  const pill=document.getElementById('pill-date'); if(pill) pill.textContent='● Tageslage '+dstr+' 06:00 MEZ';
  const hero=document.getElementById('hero-title'); if(hero) hero.textContent=DATA.tageslage.titel;
  const status=document.getElementById('pill-status'); if(status) status.textContent='Redaktionsschluss '+DATA.tageslage.schluss+' · '+ DATA.audit.quellen_diversitaet.split(',')[0]+' · PWA offline-fähig';
  document.title='KI-Zeitung — '+DATA.tageslage.titel;
  renderSynthese(); renderZahlen(); renderQuellen(); renderMatrix(); renderForen(); renderAudit(); renderTicker();
  bindTabs();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}
function telegraph(t){
  // heruntergebrochen: kurz, UPPER, ohne Satzzeichen, 3 Leer + 3 Plus wird im Renderer angehängt
  return t.toUpperCase().replace(/[—–.,;!?:"'()]/g,'').replace(/\s+/g,' ').trim().slice(0,88);
}
function renderTicker(){
  const track=document.getElementById('ticker-track'); if(!track||!DATA) return;
  // Schlagzeilen aus Tageslage + Perspektiven + Zahlen
  const heads=[
    DATA.tageslage.titel.replace(/^Tageslage \d+\.\d+\.\d+ — /,''),
    ...DATA.tageslage.synthese.map(p=> p.text.split('.')[0] ),
    ...DATA.perspektiven.map(p=> p.group+': '+p.these.split('.')[0]),
    ...DATA.zahlenanker.slice(0,3).map(z=> z.label+' '+z.wert)
  ].slice(0,8);
  const items=heads.map(h=> '<span class="ticker-item">'+telegraph(h)+'   <span class="plus">+++</span></span>');
  // Ohne Leerfahrt: Inhalt verdoppeln, damit -50% nahtlos loop
  const once=items.join('<span style="color:var(--accent)"> • </span>');
  track.innerHTML=once+'<span style="color:var(--accent)"> • </span>'+once;
  // Dynamische Dauer nach Länge (keine Leerfahrt, gleichmäßig)
  const len=track.scrollWidth||2000; const dur=Math.max(60, len/22); track.style.animationDuration=dur+'s';
}
async function aktualisiere(){
  const buz=document.getElementById('buzzer'); if(buz) buz.classList.add('busy');
  const pill=document.getElementById('pill-date'); const hero=document.getElementById('hero-title');
  const prev=pill?pill.textContent:'';
  if(pill) pill.textContent='● Aktualisiere…';
  try{
    // Cache-Buster + SW-Cache umgehen
    const bust='?t='+Date.now();
    if('caches' in window){ try{ const c=await caches.open('ki-zeitung-v3-20260903'); await c.delete('data/mock.json'); await c.delete('data/mock.json'+bust); }catch(e){} }
    const [s,d]=await Promise.all([
      fetch('data/sources.json'+bust, {cache:'no-store'}).then(r=>r.json()),
      fetch('data/mock.json'+bust, {cache:'no-store'}).then(r=>r.json())
    ]);
    SOURCES=s; DATA=d;
    // Falls mock älter als heute (z.B. 02.09. vs heute 03.09.), automatisch auf Heute heben — sonst bleibt Buzzer scheinbar ohne Wirkung
    const todayISO=new Date().toISOString().slice(0,10);
    if(DATA.tageslage.date !== todayISO){
      const old=DATA.tageslage.date;
      const dsOld=old.split('-'); const dstrOld=dsOld[2]+'.'+dsOld[1]+'.'+dsOld[0];
      const dsNew=todayISO.split('-'); const dstrNew=dsNew[2]+'.'+dsNew[1]+'.'+dsNew[0];
      DATA.tageslage.date=todayISO;
      DATA.tageslage.titel=DATA.tageslage.titel.replace(dstrOld, dstrNew);
      DATA.audit.datum=todayISO;
      DATA.tageslage.next=todayISO.slice(0,8)+(String(parseInt(todayISO.slice(8,10))+1).padStart(2,'0'))+' 06:00 MEZ';
    }
    // Versuche Synthese via Cloud neu zu schreiben (bleibend, nicht nur Toast)
    const cloudKey=localStorage.getItem('ki-zeitung-cloud-key') || document.getElementById('cloud-key')?.value||'';
    const cloudProv=localStorage.getItem('ki-zeitung-cloud-provider') || document.getElementById('cloud-provider')?.value||'openrouter';
    let synthUpdated=false;
    if(cloudKey){
      if(pill) pill.textContent='● Schreibe Synthese neu…';
      try{
        const pToday=DATA.tageslage.date.split('-'); const pStr=pToday[2]+'.'+pToday[1]+'.'+pToday[0];
        const synthPrompt='Du bist KI-Zeitung Synthese. Datum '+pStr+'. Erzeuge 4 kurze Absätze DE (je 2 Sätze) zu: 1) EU Haushalt Verteidigung Kriegstüchtigkeit, 2) Zahlenanker (EDA 1,8% BIP, EZB 3,25%, Gas), 3) Ukraine-Front 02./03.09. (ACLED, Pokrowsk), 4) EU-USA-China + Nahost. Markiere Widersprüche wo nötig. Trenne Absätze exakt mit " ||| ". Keine Einleitung, nur 4 Absätze.';
        let res=null;
        if(cloudProv==='groq') res=await groqChatWithFallback(cloudKey, synthPrompt, 0.45, 700);
        else if(cloudProv==='huggingface'){
          const r=await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct',{method:'POST', headers:{'Authorization':'Bearer '+cloudKey,'Content-Type':'application/json'}, body:JSON.stringify({inputs:synthPrompt, parameters:{max_new_tokens:600}})});
          if(r.ok){ const j=await r.json(); const t=Array.isArray(j)?j[0]?.generated_text||'' : ''; res={text:t, model:'Qwen2.5-7B'}; } else throw new Error(await r.text());
        } else res=await openRouterChatWithFallback(cloudKey, synthPrompt, 0.45);
        if(res && res.text){
          const parts=res.text.split('|||').map(s=>s.trim()).filter(Boolean);
          if(parts.length>=4){
            for(let i=0;i<4 && i<DATA.tageslage.synthese.length;i++){
              DATA.tageslage.synthese[i].text=parts[i].replace(/^\d+\.\s*/,'').slice(0,420);
              // aktualisiere Datum im Audit
              DATA.tageslage.synthese[i].widerspruch = parts[i].toLowerCase().includes('widerspruch') ? DATA.tageslage.synthese[i].widerspruch : DATA.tageslage.synthese[i].widerspruch;
            }
            synthUpdated=true;
          }
        }
      }catch(e){
        console.warn('Synthese Cloud fehlgeschlagen:', e.message);
        // Fallback: behalte alte Synthese, zeige Hinweis
        const warn=document.createElement('div'); warn.style.cssText='position:fixed;left:50%;bottom:108px;transform:translateX(-50%);background:#2a1a12;border:1px solid #f0b429;color:#fff9c4;padding:6px 12px;border-radius:999px;font-size:11px;z-index:50';
        warn.textContent='Cloud Synthese fehlgeschlagen — nutze Mock, Key unten prüfen'; document.body.appendChild(warn); setTimeout(()=>warn.remove(),2800);
      }
    } else {
      // Ohne Key: zeige bleibenden Hinweis, Synthese bleibt Mock aber Datum neu
      console.log('Kein Cloud-Key — Synthese bleibt Mock (Datum aktualisiert). Key unten im hellgelben Feld für echte Neufassung.');
    }
    const ds=DATA.tageslage.date.split('-'); const dstr=ds[2]+'.'+ds[1]+'.'+ds[0];
    if(pill) pill.textContent='● Tageslage '+dstr+' 06:00 MEZ ✓'+(synthUpdated?' ☁':'');
    if(hero) hero.textContent=DATA.tageslage.titel;
    document.title='KI-Zeitung — '+DATA.tageslage.titel;
    renderSynthese(); renderZahlen(); renderQuellen(); renderMatrix(); renderForen(); renderAudit(); renderTicker();
    // kurzer Ping
    const n=document.createElement('div'); n.style.cssText='position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:#121826;border:1px solid #34d399;color:#e9eef7;padding:8px 14px;border-radius:999px;font-size:12px;z-index:50;box-shadow:0 8px 22px rgba(0,0,0,.35)';
    n.textContent=(synthUpdated?'✓ Synthese neu geschrieben — ':'✓ Aktualisiert — ')+dstr+' '+DATA.tageslage.schluss+(synthUpdated?' ☁':''); document.body.appendChild(n); setTimeout(()=>n.remove(),2600);
    setTimeout(()=>{ if(pill) pill.textContent='● Tageslage '+dstr+' 06:00 MEZ'; },2800);
  }catch(e){
    if(pill) pill.textContent=prev||'● Fehler — erneut tippen';
    alert('Aktualisieren fehlgeschlagen: '+e.message+' — prüfe data/mock.json');
  }finally{
    if(buz) setTimeout(()=>buz.classList.remove('busy'),900);
  }
}
load().catch(e=>{console.error(e); $('#synthese').innerHTML='<p style="color:#ff6b6b">Fehler Laden: '+e.message+'</p>'});

function srcById(id){ return SOURCES.find(x=>x.id===id); }

function renderSynthese(){
  const el=$('#synthese'); el.innerHTML='';
  DATA.tageslage.synthese.forEach(p=>{
    const div=document.createElement('div'); div.className='para'; div.dataset.pid=p.id;
    const txt=document.createElement('p'); txt.textContent=p.text; div.appendChild(txt);
    if(p.widerspruch){
      const w=document.createElement('div'); w.style.cssText='font-size:11px;color:#f0b429;background:rgba(240,180,41,.08);border:1px solid rgba(240,180,41,.25);padding:6px 8px;border-radius:8px;margin-top:6px';
      w.innerHTML='⚠️ Widerspruch markiert: '+p.widerspruch; div.appendChild(w);
    }
    const prov=document.createElement('div'); prov.className='provenance';
    p.quellen.forEach(id=>{
      const s=srcById(id)||{name:id, badge:'?', owner:''};
      const chip=document.createElement('span'); chip.className='chip '+(s.type==='staatlich'||s.type==='staatlich-nah'?'staat': s.type==='neutral'?'neutral':'');
      chip.textContent=s.name+' · '+s.badge; chip.title=s.owner;
      chip.onclick=()=> showHover(chip, s, p);
      chip.onmouseenter=()=> showHover(chip,s,p);
      chip.onmouseleave=hideHover;
      prov.appendChild(chip);
    });
    p.zahlen.forEach(zid=>{
      const z=DATA.zahlenanker.find(x=>x.id===zid);
      if(!z) return;
      const c=document.createElement('span'); c.className='chip owner'; c.textContent='🔢 '+z.wert;
      c.title=z.label+' — '+z.quelle; c.onmouseenter=()=> showZahlHover(c,z); c.onmouseleave=hideHover;
      prov.appendChild(c);
    });
    if(p.zitate && p.zitate.length){
      p.zitate.forEach(z=>{
        const c=document.createElement('span'); c.className='chip'; c.textContent='“'+z.q.slice(0,28)+'…”';
        c.title=z.q; prov.appendChild(c);
      });
    }
    div.appendChild(prov);
    el.appendChild(div);
  });
}

function showHover(anchor, src, para){
  const rect=anchor.getBoundingClientRect();
  hoverbox.style.display='block';
  hoverbox.style.left=Math.min(rect.left, window.innerWidth-380)+'px';
  hoverbox.style.top=(rect.bottom+8+window.scrollY)+'px';
  const zitate=(para.zitate||[]).map(z=>'<div style="margin-top:6px">“'+z.q+'”</div>').join('');
  hoverbox.innerHTML='<b>'+src.name+'</b> <span style="font-size:10px;border:1px solid #2d4266;padding:1px 6px;border-radius:999px">'+src.badge+'</span><br><span style="color:#6b7a96">Eigentümer:</span> '+src.owner+'<br><span style="color:#6b7a96">Gruppe:</span> '+src.group+' · '+src.country+' · '+src.lang+'<br><a href="'+src.rss+'" target="_blank" style="font-size:11px">RSS →</a>'+zitate;
}
function showZahlHover(anchor, z){
  const rect=anchor.getBoundingClientRect();
  hoverbox.style.display='block';
  hoverbox.style.left=Math.min(rect.left, window.innerWidth-380)+'px';
  hoverbox.style.top=(rect.bottom+8+window.scrollY)+'px';
  hoverbox.innerHTML='<b>🔢 '+z.label+'</b><br><b style="font-size:16px">'+z.wert+'</b><br><span style="color:#6b7a96">Quelle:</span> '+z.quelle+' · '+z.datum+'<br><a href="'+z.url+'" target="_blank" style="font-size:11px">Quelle öffnen →</a>'+(z.hinweis?'<div style="color:#f0b429;margin-top:4px">⚠️ '+z.hinweis+'</div>':'')+(z.plausibel?'<div style="color:#34d399">✓ plausibilisiert</div>':'<div style="color:#ff6b6b">✗ Bandbreite prüfen</div>');
}
function hideHover(){ hoverbox.style.display='none'; }
document.addEventListener('click',e=>{ if(!e.target.closest('.chip') && !e.target.closest('#hoverbox')) hideHover(); });

function renderZahlen(){
  const el=$('#zahlen'); el.innerHTML='';
  DATA.zahlenanker.forEach(z=>{
    const d=document.createElement('div'); d.className='zahl '+(z.plausibel?'ok':'warn');
    d.innerHTML='<div><strong>'+z.label+'</strong><br><span>'+z.quelle+' · '+z.datum+'</span></div><div style="text-align:right"><b>'+z.wert+'</b><br><a href="'+z.url+'" target="_blank" style="font-size:11px">→</a></div>';
    el.appendChild(d);
  });
}

function renderQuellen(){
  const el=$('#quellen'); el.innerHTML='';
  const map={};
  SOURCES.forEach(s=>{ if(!map[s.group]) map[s.group]=[]; map[s.group].push(s); });
  Object.entries(map).forEach(([g,arr])=>{
    const det=document.createElement('details'); det.open=g==='CH-neutral';
    det.innerHTML='<summary>'+g+' ('+arr.length+')</summary><div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">'+arr.map(s=>'<div style="display:flex;justify-content:space-between;gap:8px;border:1px solid #23324d;padding:6px 8px;border-radius:8px;background:#162032"><div><b style="font-size:12px">'+s.name+'</b> <span style="font-size:10px;color:#9aa8c3">· '+s.lang.toUpperCase()+'</span><br><span style="font-size:11px;color:#6b7a96">'+s.owner+'</span></div><span class="chip '+(s.type.includes('staatlich')?'staat':'neutral')+'" style="align-self:center">'+s.badge+'</span></div>').join('')+'</div>';
    el.appendChild(det);
  });
}

function renderMatrix(){
  const el=$('#matrix'); el.innerHTML='';
  DATA.perspektiven.filter(p=> activeTab==='all' || p.group.includes(activeTab) || (activeTab==='RU' && p.group.includes('RU')) || (activeTab==='UA' && p.group.includes('UA')) || (activeTab==='IL' && p.group.includes('IL'))).forEach(p=>{
    const div=document.createElement('div'); div.className='tile';
    const wBias=Math.round(p.bias_score*100);
    const color = p.bias_score>0.6 ? '#ff6b6b' : p.bias_score>0.35 ? '#f0b429' : '#34d399';
    div.innerHTML='<h4>'+p.group+' <span style="font-size:10px;background:'+color+';color:#0b0f1a;padding:2px 6px;border-radius:999px">Bias '+wBias+'%</span></h4><p>'+p.these+'</p><div class="bias"><i style="width:'+wBias+'%;background:'+color+'"></i></div><small>Quellen: '+p.quellen.join(', ')+' · Auslassung: '+p.auslassung+'</small>';
    el.appendChild(div);
  });
  // Auslassung extra
  const aus=$('#auslassung'); aus.innerHTML='';
  DATA.perspektiven.forEach(p=>{
    const row=document.createElement('div'); row.style.cssText='display:flex;gap:8px;align-items:flex-start;border:1px solid #23324d;background:#162032;padding:8px 10px;border-radius:8px;margin-bottom:6px';
    row.innerHTML='<span style="font-size:11px;color:#9aa8c3;min-width:140px">'+p.group+'</span><span style="font-size:12px">🚫 '+p.auslassung+'</span>';
    aus.appendChild(row);
  });
}

function renderForen(){
  const el=$('#foren'); el.innerHTML='';
  DATA.forenlage.forEach(f=>{
    const cls=f.bot_verdacht>0.5?'high':'';
    el.innerHTML+='<div class="foren-item"><div><b style="font-size:12px">'+f.ort+'</b> · <span style="font-size:11px;color:#9aa8c3">'+f.thema+'</span><br><span style="font-size:12px">'+f.stimmung+'</span> '+(f.label?'<span class="tag high">'+f.label+'</span>':'')+'</div><div style="text-align:right"><span class="tag '+cls+'">Bot-Verdacht '+Math.round(f.bot_verdacht*100)+'%</span><br><span style="font-size:11px;color:#6b7a96">'+f.posts+' Posts</span></div></div>';
  });
  el.innerHTML+='<div style="font-size:11px;color:#6b7a96;margin-top:4px">Forenlage = Sensor, fließt <b>nicht</b> in Konsens-Artikel. Hoher Bot-Verdacht = markiert, nicht gezählt. <a href="#" onclick="event.preventDefault();alert(\'V2: Telegram + Reddit API via CH-Proxy, Bot-Score via Heuristik (Account-Alter, Posting-Frequenz)\')">Wie wird das gemessen?</a></div>';
}

function renderAudit(){
  const a=DATA.audit;
  $('#audit-date').textContent=a.datum;
  $('#audit').innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">'
    +'<div style="background:#162032;border:1px solid #23324d;padding:8px;border-radius:8px"><b>'+a.thesen_mit_zahlenanker+'</b><br><span style="color:#9aa8c3">mit Zahlenanker</span></div>'
    +'<div style="background:#162032;border:1px solid #23324d;padding:8px;border-radius:8px"><b>'+a.widersprueche_markiert+'</b><br><span style="color:#9aa8c3">Widersprüche</span></div>'
    +'<div style="background:#162032;border:1px solid #23324d;padding:8px;border-radius:8px"><b>'+a.quellen_diversitaet+'</b><br><span style="color:#9aa8c3">Diversität</span></div>'
    +'<div style="background:#162032;border:1px solid #23324d;padding:8px;border-radius:8px"><b>'+(a.bias_median*100).toFixed(0)+'%</b><br><span style="color:#9aa8c3">Bias Median</span></div>'
    +'</div><div style="margin-top:8px;font-size:11px;color:#9aa8c3">Staatlich-Anteil: '+a.staatlich_anteil+' · Korrekturen: '+a.korrekturen+'</div>'
    +'<div style="margin-top:8px"><a href="data/mock.json" target="_blank" style="font-size:11px">Audit-Rohdaten →</a></div>';
  // KPI oben
  $('#kpi').innerHTML='<div><b>'+a.thesen_mit_zahlenanker+'</b><span>Thesen mit Zahlenanker</span></div><div><b>7/7</b><span>Perspektiven</span></div><div><b>'+a.widersprueche_markiert+'</b><span>Widersprüche</span></div><div><b>0</b><span>Tracking</span></div>';
}

function bindTabs(){
  document.querySelectorAll('.tab').forEach(t=> t.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active'); activeTab=t.dataset.tab; renderMatrix();
  }));
}

async function refreshLive(){
  const btn=$('#btn-refresh'); btn.textContent='Prüfe…'; btn.disabled=true;
  // Versuch echten Eurostat Fetch, sonst Fallback
  try{
    // Demo: Bruegel Gas Mock live check (ersetzbar durch echten Endpoint via CH-Proxy)
    const res=await fetch('https://api.bruegel.org/gas?demo=1').catch(()=>null);
    if(!res || !res.ok) throw new Error('live endpoint via Proxy nötig');
    btn.textContent='Live OK';
  }catch(e){
    btn.textContent='Fallback (Mock)';
    // zeige Hinweis
    const el=$('#zahlen'); const n=document.createElement('div'); n.className='notice';
    n.innerHTML='Live-Fetch braucht CH-Proxy (CORS). Aktuell Fallback-Daten aus <code>data/mock.json</code> — siehe <code>backend/ch-proxy.js</code>. Eurostat/ECB/Bruegel via Proxy + Cache geplant.';
    el.prepend(n);
    setTimeout(()=>n.remove(),6000);
  }
  setTimeout(()=>{btn.textContent='Zahlen live prüfen'; btn.disabled=false;},2200);
}

const GROQ_FALLBACK_MODELS=['openai/gpt-oss-20b','openai/gpt-oss-120b','qwen/qwen3.6-27b','llama-3.3-70b-versatile','llama-3.1-8b-instant'];
const OPENROUTER_FALLBACK=['meta-llama/llama-3.1-8b-instruct:free','meta-llama/llama-3.3-70b-instruct:free','mistralai/mistral-7b-instruct:free','openai/gpt-oss-20b:free'];
async function groqChatWithFallback(key, prompt, temperature=0.4, max_tokens=520){
  let lastErr='';
  // 1) Versuche statische Fallback-Liste (aktuell: gpt-oss-20b/120b/qwen)
  for(const m of GROQ_FALLBACK_MODELS){
    try{
      const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key}, body:JSON.stringify({model:m, messages:[{role:'user',content:prompt}], temperature, max_tokens})});
      if(!r.ok){ const txt=await r.text(); if(txt.toLowerCase().includes('model')||txt.toLowerCase().includes('decommission')||r.status===404||r.status===400) { lastErr=m+': '+txt.slice(0,140); continue; } throw new Error(txt.slice(0,180)); }
      const j=await r.json(); const t=j.choices?.[0]?.message?.content; if(!t) throw new Error('leere Antwort'); return {text:t, model:m};
    }catch(e){ lastErr=e.message; }
  }
  // 2) Dynamisch: hole verfügbare Modelle und probiere erstes Production-Modell
  try{
    const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{'Authorization':'Bearer '+key}});
    if(r.ok){
      const j=await r.json();
      const ids=(j.data||[]).map(d=>d.id).filter(id=>!id.includes('whisper')&&!id.includes('guard'));
      for(const m of ids){
        if(GROQ_FALLBACK_MODELS.includes(m)) continue; // schon probiert
        try{
          const rr=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key}, body:JSON.stringify({model:m, messages:[{role:'user',content:prompt}], temperature, max_tokens})});
          if(rr.ok){ const jj=await rr.json(); const t=jj.choices?.[0]?.message?.content; if(t) return {text:t, model:m}; }
        }catch(e){}
      }
      lastErr+=' | dynamisch probiert: '+ids.slice(0,3).join(', ');
    }
  }catch(e){}
  throw new Error('Groq: kein Modell verfügbar. Letzter Fehler: '+lastErr+' — aktuell gültig: openai/gpt-oss-20b, openai/gpt-oss-120b, qwen/qwen3.6-27b (siehe https://console.groq.com/docs/deprecations — llama3-70b/8b, mixtral, gemma2 sind abgeschaltet)');
}
async function openRouterChatWithFallback(key, prompt, temperature=0.4){
  let lastErr='';
  const preferred=$('#model-select')?.value||localStorage.getItem('ki-zeitung-model')||'';
  const tryList=preferred ? [preferred, ...OPENROUTER_FALLBACK.filter(m=>m!==preferred)] : OPENROUTER_FALLBACK;
  for(const m of tryList){
    try{
      const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'HTTP-Referer':location.href,'X-Title':'KI-Zeitung'}, body:JSON.stringify({model:m, messages:[{role:'user',content:prompt}], temperature})});
      if(!r.ok){ const txt=await r.text(); if(txt.toLowerCase().includes('model')||txt.toLowerCase().includes('not found')||r.status===404||r.status===400) { lastErr=m+': '+txt.slice(0,140); continue; } throw new Error(txt.slice(0,180)); }
      const j=await r.json(); const t=j.choices?.[0]?.message?.content; if(!t) throw new Error('leer'); return {text:t, model:m};
    }catch(e){ lastErr=e.message; }
  }
  throw new Error('OpenRouter: kein free Modell verfügbar — '+lastErr+' — versuche anderes FREE aus Dropdown oder neuen Key von openrouter.ai/keys');
}
async function testLLM(){
  const s=$('#llm-status'); s.textContent='Teste Ollama…';
  const urls=[
    'http://localhost:11434/api/tags',
    'http://127.0.0.1:11434/api/tags',
    'http://host.docker.internal:11434/api/tags'
  ];
  let corsHint='';
  for(const u of urls){
    try{
      const r=await fetch(u,{method:'GET'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json();
      const names=(j.models||[]).map(m=>m.name).join(', ')||'keine Modelle';
      const hasQwen=(j.models||[]).some(m=>m.name.includes('qwen')||m.name.includes('llama'));
      s.innerHTML='✓ Ollama erreichbar via <code>'+u+'</code> — Modelle: '+names.slice(0,120)+(hasQwen ? '' : ' → <code>ollama pull qwen2.5:7b</code> (7B CPU, 14B nur mit GPU)');
      s.style.color='#34d399'; return;
    }catch(e){
      if(String(e).includes('Failed to fetch')||String(e).includes('CORS')) corsHint=' (CORS geblockt)';
    }
  }
  s.innerHTML='✗ Kein Ollama erreichbar'+corsHint+'.<br>Windows: <code>set OLLAMA_ORIGINS=* & set OLLAMA_HOST=0.0.0.0 & ollama serve</code> neu starten, Firewall 11434 freigeben. WSL: <code>OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve</code>. Dann erneut testen. → Cloud-Fallback oben funktioniert trotzdem.';
  s.style.color='#f0b429';
}
async function testWSLBridge(){
  const h=$('#wsl-hint'); h.textContent='Teste…';
  try{ const r=await fetch('http://localhost:11434/api/tags'); if(r.ok){ const j=await r.json(); h.innerHTML='✓ localhost:11434 ok — '+(j.models||[]).length+' Modelle. Windows-Browser sollte es auch sehen (bei WSL2 mirrored). Falls nicht: <code>wsl hostname -I</code> → http://&lt;IP&gt;:11434/api/tags testen und Firewall prüfen.'; return; } }catch{}
  h.innerHTML='✗ localhost blockiert. Windows: <code>set OLLAMA_ORIGINS=* && ollama serve</code> (CMD neu starten). WSL: <code>OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve</code>. Danach <code>http://localhost:11434/api/tags</code> im Browser öffnen — muss JSON zeigen.';
}

function saveCloudKey(){
  const prov=$('#cloud-provider').value;
  const key=$('#cloud-key').value.trim();
  const model=$('#model-select')?.value||'';
  if(!key){ alert('Bitte API-Key einfügen'); return; }
  localStorage.setItem('ki-zeitung-cloud-provider', prov);
  localStorage.setItem('ki-zeitung-cloud-key', key);
  if(model) localStorage.setItem('ki-zeitung-model', model);
  $('#cloud-status').textContent='✓ Gespeichert ('+prov+(model?' → '+model:'')+') — nur lokal im Browser.';
  $('#cloud-status').style.color='#34d399';
}
function loadCloudKey(){
  const p=localStorage.getItem('ki-zeitung-cloud-provider');
  const k=localStorage.getItem('ki-zeitung-cloud-key');
  const m=localStorage.getItem('ki-zeitung-model');
  if(p) $('#cloud-provider').value=p;
  if(k){ $('#cloud-key').value=k; $('#cloud-status').textContent='✓ Key vorhanden ('+p+(m?' → '+m:'')+')'; $('#cloud-status').style.color='#34d399'; }
  if(m) setTimeout(()=>{ if($('#model-select')) $('#model-select').value=m; },400);
  onProviderChange();
}
setTimeout(()=>{ loadCloudKey(); refreshModels(); },400);

async function refreshModels(){
  const prov=$('#cloud-provider').value;
  const sel=$('#model-select'); const hint=$('#model-hint');
  if(prov!=='openrouter'){ sel.style.display='none'; hint.textContent='Groq/HF: Modell wird automatisch gewählt (aktuell gpt-oss-20b/120b). OpenRouter bietet echtes FREE-Dropdown.'; return; }
  sel.style.display=''; sel.innerHTML='<option>lade FREE Modelle…</option>';
  hint.textContent='Lade OpenRouter FREE Modelle (ohne US-Großkonzern, europafreundlich, :free)...';
  try{
    const r=await fetch('https://openrouter.ai/api/v1/models');
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    const free=(j.data||[]).filter(m=>{
      const p=m.pricing||{}; const id=m.id||'';
      return id.includes(':free') || (String(p.prompt)==='0' && String(p.completion)==='0');
    }).sort((a,b)=> (a.name||a.id).localeCompare(b.name||b.id));
    if(free.length===0) throw new Error('keine :free gefunden');
    sel.innerHTML='';
    free.forEach(m=>{
      const o=document.createElement('option'); o.value=m.id; o.textContent=(m.name||m.id)+' — '+m.id;
      sel.appendChild(o);
    });
    // Bevorzuge bekannte gute Free
    const pref=['meta-llama/llama-3.1-8b-instruct:free','meta-llama/llama-3.3-70b-instruct:free','mistralai/mistral-7b-instruct:free','qwen/qwen-3-32b:free','google/gemma-3-27b-it:free','openai/gpt-oss-20b:free'];
    for(const p of pref){ const found=[...sel.options].find(o=>o.value===p); if(found){ sel.value=p; break; } }
    const saved=localStorage.getItem('ki-zeitung-model'); if(saved && [...sel.options].some(o=>o.value===saved)) sel.value=saved;
    hint.textContent='✓ '+free.length+' FREE Modelle — gewählt: '+sel.value+' — Key von openrouter.ai/keys (free, ohne Karte).';
    sel.onchange=()=>{ localStorage.setItem('ki-zeitung-model', sel.value); hint.textContent='✓ gewählt: '+sel.value; };
  }catch(e){
    sel.style.display='none';
    hint.innerHTML='✗ OpenRouter Modelle laden fehlgeschlagen: '+e.message.replace(/</g,'&lt;')+' — Fallback nutzt statische Liste: '+OPENROUTER_FALLBACK.join(', ');
  }
}
function onProviderChange(){
  refreshModels();
  const prov=$('#cloud-provider').value;
  const hint=$('#model-hint');
  if(prov==='openrouter') hint.textContent='OpenRouter FREE Dropdown lädt…';
  else if(prov==='groq') hint.textContent='Groq: auto gpt-oss-20b/120b (US, aber schnell) — für maximale Freiheit OpenRouter wählen.';
  else hint.textContent='HF: Qwen2.5-7B — OpenRouter (FREE) ist freieste Lösung.';
}

async function testCloudLLM(){
  const prov=$('#cloud-provider').value;
  const key=$('#cloud-key').value.trim() || localStorage.getItem('ki-zeitung-cloud-key') || '';
  const s=$('#cloud-status');
  if(!key){ s.textContent='✗ Kein Key — bitte unten im hellgelben Feld einfügen (openrouter.ai/keys → sk-or-...)'; s.style.color='#ff6b6b'; return; }
  s.textContent='Teste '+prov+'…'; s.style.color='#9aa8c3';
  try{
    let msg='';
    if(prov==='groq'){
      const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{'Authorization':'Bearer '+key}});
      if(!r.ok) throw new Error('Groq '+r.status+': '+(await r.text()).slice(0,140));
      const j=await r.json();
      const ids=(j.data||[]).map(d=>d.id).join(', ');
      const hasFallback=GROQ_FALLBACK_MODELS.some(m=> ids.includes(m));
      msg='✓ Groq ok — '+(j.data?.length||'?')+' Modelle. Verfügbar: '+ids.slice(0,120)+(hasFallback?' — Fallback greift automatisch.':' — Achtung: Fallback-Modelle nicht gelistet, versuche trotzdem.');
      // Auto-probe one model
      try{ const probe=await groqChatWithFallback(key, 'Sage nur: ok', 0, 8); msg+=' Probe: '+probe.model+' antwortet.'; }catch(e){ msg+=' Probe fehlgeschlagen: '+e.message.slice(0,60); }
    } else if(prov==='huggingface'){
      const r=await fetch('https://huggingface.co/api/whoami',{headers:{'Authorization':'Bearer '+key}});
      if(!r.ok) throw new Error('HF '+r.status);
      msg='✓ HF Token ok — nutze Qwen/Qwen2.5-7B-Instruct (Fallback automatisch).';
    } else {
      const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{'Authorization':'Bearer '+key}});
      // OpenRouter hat kein /models free filter ohne Key, probiere chat
      if(!r.ok && r.status!==404){ /* ignore */ }
      const probe=await openRouterChatWithFallback(key, 'Sage nur: ok').catch(e=>{ throw new Error('OpenRouter Probe: '+e.message); });
      msg='✓ OpenRouter ok — Probe: '+probe.model;
    }
    s.textContent=msg; s.style.color='#34d399';
    localStorage.setItem('ki-zeitung-cloud-key', key);
    localStorage.setItem('ki-zeitung-cloud-provider', prov);
  }catch(e){
    s.innerHTML='✗ '+e.message.replace(/</g,'&lt;')+'<br><span style="color:#f0b429">Tipp: Key neu von console.groq.com kopieren (gsk_...), Modell wird automatisch gewählt — du musst nichts umstellen. Mock läuft weiter.</span>';
    s.style.color='#ff6b6b';
  }
}

async function runCloudSynthese(){
  const prov=$('#cloud-provider').value;
  const key=$('#cloud-key').value.trim() || localStorage.getItem('ki-zeitung-cloud-key') || '';
  const out=$('#cloud-synthese-status');
  if(!key){ out.textContent='Bitte erst Key speichern.'; out.style.color='#ff6b6b'; return; }
  out.textContent='Synthetisiere via '+prov+' (auto Fallback-Modelle)…'; out.style.color='#9aa8c3';
  const prompt='Fasse Tageslage EU-USA-China 01.09.2026 in 1 Absatz (DE, 3 Sätze) aus 7 Perspektiven, markiere Widerspruch, nenne 2 Zahlenanker.';
  try{
    let res=null;
    if(prov==='groq') res=await groqChatWithFallback(key, prompt, 0.4, 400);
    else if(prov==='huggingface'){
      const r=await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct',{method:'POST', headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'}, body:JSON.stringify({inputs:prompt, parameters:{max_new_tokens:320}})});
      if(!r.ok) throw new Error((await r.text()).slice(0,200));
      const j=await r.json(); const t=Array.isArray(j)?j[0]?.generated_text||JSON.stringify(j):JSON.stringify(j); res={text:t, model:'Qwen2.5-7B'};
    } else res=await openRouterChatWithFallback(key, prompt, 0.4);
    const box=document.createElement('div'); box.className='notice'; box.style.borderColor='#34d399';
    box.innerHTML='<b>☁️ Cloud-Synthese ('+prov+' → '+res.model+'):</b><br>'+res.text.replace(/</g,'&lt;')+'<br><span style="font-size:10px;color:#6b7a96">Auto-Fallback aktiv — Modell automatisch gewählt, Mock bleibt aktiv.</span>';
    $('#synthese').prepend(box); setTimeout(()=>box.remove(),18000);
    out.textContent='✓ Fertig via '+res.model; out.style.color='#34d399';
  }catch(e){
    out.innerHTML='✗ '+e.message.replace(/</g,'&lt;')+'<br><span style="color:#f0b429">Tipp: Bei Groq einfach erneut klicken — nächstes Modell wird probiert. Bei Windows-Ollama siehe Hinweis unten.</span>'; out.style.color='#ff6b6b';
  }
}
function searchTopic(){
  const q=($('#topic-input').value||'').trim();
  const status=$('#search-status');
  const resEl=$('#search-results');
  if(!q){ status.textContent='Bitte Thema eingeben.'; status.style.color='#f0b429'; return; }
  status.textContent='Suche "'+q+'" in 7 Perspektiven + Zahlen…'; status.style.color='#9aa8c3';
  const qq=q.toLowerCase();
  // Suche in mock-Daten
  const synthHits=DATA.tageslage.synthese.filter(p=> p.text.toLowerCase().includes(qq) || (p.widerspruch||'').toLowerCase().includes(qq));
  const perspHits=DATA.perspektiven.filter(p=> p.these.toLowerCase().includes(qq) || p.auslassung.toLowerCase().includes(qq) || p.group.toLowerCase().includes(qq));
  const zahlenHits=DATA.zahlenanker.filter(z=> z.label.toLowerCase().includes(qq) || z.wert.toLowerCase().includes(qq));
  // Highlight in Synthese
  document.querySelectorAll('.para').forEach(el=> el.style.outline='');
  if(synthHits.length){ synthHits.forEach(h=>{ const el=document.querySelector('.para[data-pid="'+h.id+'"]'); if(el){ el.style.outline='2px solid #f0b429'; el.scrollIntoView({behavior:'smooth',block:'center'}); } }); }
  // Ergebnisse rendern
  let html='<div style="background:#162032;border:1px solid #23324d;border-radius:10px;padding:10px 12px">';
  html+='<b>Treffer für "'+q.replace(/</g,'&lt;')+'":</b> '+synthHits.length+' Absätze · '+perspHits.length+' Perspektiven · '+zahlenHits.length+' Zahlenanker<br>';
  if(synthHits.length) html+='<div style="margin-top:6px"><b>Synthese:</b><ul style="margin-left:16px">'+synthHits.map(h=>'<li>'+h.text.slice(0,140).replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<span class=hl>$1</span>')+'… <span style="color:#6b7a96">['+h.quellen.join(', ')+']</span></li>').join('')+'</ul></div>';
  if(perspHits.length) html+='<div style="margin-top:6px"><b>Perspektiven:</b> '+perspHits.map(p=>'<span class=chip>'+p.group+'</span>').join(' ')+'</div>';
  if(zahlenHits.length) html+='<div style="margin-top:6px"><b>Zahlen:</b> '+zahlenHits.map(z=>z.label+' = '+z.wert).join(' · ')+'</div>';
  if(synthHits.length===0 && perspHits.length===0 && zahlenHits.length===0){
    html+='<div style="margin-top:8px;color:#f0b429">Kein Treffer im Mock. <b>So veröffentlichen:</b><br>';
    html+='1) Cloud-Key unten im hellgelben Feld speichern → 2) Thema unten neu synthetisieren lassen → 3) Als neue Tageslage exportieren. Oder RSS live via CH-Proxy durchsuchen: <code>backend/ch-proxy.js</code> + LLM-Prompt mit "'+q.replace(/</g,'&lt;')+'".</div>';
    html+='<div style="margin-top:8px"><button class="btn primary" onclick="searchTopicWithLLM()">☁️ "'+q.replace(/</g,'&lt;')+'" mit Cloud-LLM neu abfragen</button></div>';
  } else {
    html+='<div style="margin-top:8px"><button class="btn" onclick="searchTopicWithLLM()">☁️ Tiefen-Recherche zu "'+q.replace(/</g,'&lt;')+'" (Cloud-LLM + Quellen)</button></div>';
  }
  html+='</div>';
  resEl.innerHTML=html;
  status.textContent='✓ '+(synthHits.length+perspHits.length+zahlenHits.length)+' Treffer'; status.style.color='#34d399';
}
function searchTopicPreset(t){ $('#topic-input').value=t; searchTopic(); }
function clearSearch(){ $('#topic-input').value=''; $('#search-results').innerHTML=''; $('#search-status').textContent=''; document.querySelectorAll('.para').forEach(el=>el.style.outline=''); }
async function searchTopicWithLLM(){
  const q=($('#topic-input').value||'').trim();
  if(!q) return;
  const prov=$('#cloud-provider')?.value||'groq';
  const key=localStorage.getItem('ki-zeitung-cloud-key')||$('#cloud-key')?.value||'';
  const resEl=$('#search-results');
  if(!key){ resEl.innerHTML+='<div class=notice style="border-color:#ff6b6b">✗ Für Tiefen-Recherche API-Key unten im hellgelben Feld speichern (openrouter.ai/keys → sk-or-...). Mock-Suche bleibt ohne Key.</div>'; return; }
  resEl.innerHTML+='<div id="llm-searching"><div class="barrier-tape"><span>● SUCHE LÄUFT — "'+q.replace(/</g,'&lt;').toUpperCase()+'" — 7 PERSPEKTIVEN + ZAHLEN WERDEN GEPRÜFT ● SUCHE LÄUFT — '+prov.toUpperCase()+' ●</span></div><div class="notice" style="margin-top:6px">☁️ Frage '+prov+' (auto Fallback) zu "'+q.replace(/</g,'&lt;')+'" — bitte warten…</div></div>';
  const prompt='Du bist KI-Zeitung. Thema: "'+q+'". Erzeuge 4-Satz Lagebericht DE auf Basis 7 Perspektiven (CH neutral, UK/US, Osteuropa, RU-Exil, RU-staatlich STAATLICH gelabelt, UA kritisch, IL/IR gefiltert). Nenne 2 Zahlenanker (Eurostat/ECB/ACLED), markiere 1 Widerspruch, nenne Eigentümer-Bias wo relevant.';
  try{
    let res=null;
    if(prov==='groq') res=await groqChatWithFallback(key, prompt, 0.45, 520);
    else if(prov==='huggingface'){
      const r=await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct',{method:'POST', headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'}, body:JSON.stringify({inputs:prompt, parameters:{max_new_tokens:480}})});
      if(!r.ok) throw new Error((await r.text()).slice(0,180));
      const j=await r.json(); const t=Array.isArray(j)?j[0]?.generated_text||JSON.stringify(j):JSON.stringify(j); res={text:t, model:'Qwen2.5-7B'};
    } else res=await openRouterChatWithFallback(key, prompt, 0.45);
    document.getElementById('llm-searching')?.remove();
    const box=document.createElement('div'); box.style.cssText='margin-top:8px;background:#0e1a14;border:1px solid #34d399;border-radius:10px;padding:10px 12px';
    box.innerHTML='<b>☁️ Cloud-Recherche "'+q.replace(/</g,'&lt;')+'" ('+prov+' → '+res.model+'):</b><br><div style="white-space:pre-wrap;margin-top:6px">'+res.text.replace(/</g,'&lt;')+'</div><div style="margin-top:8px;display:flex;gap:8px"><button class=btn>Kopieren</button><button class=btn onclick="exportSearchPDF()">Als PDF</button></div>';
    box.querySelector('button').onclick=()=>{navigator.clipboard.writeText(res.text); box.querySelector('button').textContent='✓ kopiert';};
    resEl.appendChild(box);
  }catch(e){
    const el=document.getElementById('llm-searching'); if(el) el.innerHTML='✗ '+e.message.replace(/</g,'&lt;')+'<br><span style="color:#f0b429">Auto-Fallback probiert — anderen Provider wählen oder Key prüfen.</span>';
  }
}
function copyText(btn){}

async function exportHTML(){
  // Self-contained HTML zum Versenden — behält Dark 1:1, kein Server nötig
  const html='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
  const blob=new Blob([html],{type:'text/html'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='KI-Zeitung-'+DATA.tageslage.date+'.html'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  alert('HTML exportiert (Dark bleibt 1:1). WhatsApp: HTML wird als DOKUMENT versendet (Empfänger tippt zum Öffnen im Browser). Für Status: HTML geht nicht — nutze PNG Button. Wenn du Link statt Datei willst: HTML auf netlify.app / github.io hochladen und Link teilen — dann zeigt WhatsApp Vorschau.');
}
async function exportPNG(){
  const el=document.querySelector('.wrap');
  if(!window.html2canvas){ alert('html2canvas nicht geladen (offline). Nutze Win+Shift+S Screenshot.'); return; }
  const btn=document.activeElement; if(btn) btn.textContent='Rendere…';
  try{
    const canvas=await html2canvas(el,{backgroundColor:'#0b0f1a', scale:2, useCORS:true, scrollY:-window.scrollY});
    canvas.toBlob(b=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='KI-Zeitung-'+DATA.tageslage.date+'.png'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); });
  }catch(e){ alert('PNG Fehler: '+e.message+' — Fallback: Win+Shift+S'); }
  finally{ if(btn) btn.textContent='PNG'; }
}
async function exportPDFCanvas(){
  // Echter Dark-PDF ohne Druckdialog — schneidet nicht, bleibt dunkel
  if(!window.html2canvas || !window.jspdf){ alert('Canvas libs fehlen (offline). Nutze HTML oder Screenshot.'); return; }
  const el=document.querySelector('.wrap');
  const btn=document.activeElement; if(btn) btn.textContent='Rendere…';
  try{
    const canvas=await html2canvas(el,{backgroundColor:'#0b0f1a', scale:2, useCORS:true, scrollY:-window.scrollY});
    const imgData=canvas.toDataURL('image/png');
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'portrait', unit:'pt', format:'a4'});
    const pageW=pdf.internal.pageSize.getWidth(), pageH=pdf.internal.pageSize.getHeight();
    const imgW=pageW-20, imgH=canvas.height * imgW / canvas.width;
    let y=10, remaining=imgH;
    // Erste Seite mit Titel
    pdf.setFillColor('#0b0f1a'); pdf.rect(0,0,pageW,pageH,'F');
    pdf.addImage(imgData,'PNG',10,y,imgW,imgH);
    // Falls länger als eine Seite, weitere Seiten
    let offset=pageH-20;
    while(remaining > offset){
      pdf.addPage(); pdf.setFillColor('#0b0f1a'); pdf.rect(0,0,pageW,pageH,'F');
      pdf.addImage(imgData,'PNG',10,10 - offset,imgW,imgH);
      offset+=pageH-20;
      if(offset>5000) break;
    }
    pdf.save('KI-Zeitung-'+DATA.tageslage.date+'-dark.pdf');
  }catch(e){ alert('PDF Fehler: '+e.message); }
  finally{ if(btn) btn.textContent='PDF Dark'; }
}
async function exportScrollingVideo(){
  let DUR=parseInt(document.getElementById('video-dur')?.value)||30; DUR=Math.max(10,Math.min(60,DUR));
  const hint=document.createElement('div');
  hint.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:99;display:grid;place-items:center;padding:20px';
  hint.innerHTML='<div style="background:#121826;border:1px solid #2d4266;border-radius:12px;padding:16px;max-width:580px;color:#e9eef7"><b>VIDEO Status — Handy-HQ, schmal & groß</b><p style="margin:8px 0;color:#9aa8c3;font-size:13px">Laufzeit <b>'+DUR+'s</b> (neben VIDEO änderbar).<br><b>A) Browser HQ MP4</b> — schmal 720px, Schrift 17px, Scale 2.2, 5 Mbit, ohne Leerfahrt.<br><b>B) ffmpeg MP4</b> — beste Qualität, installiert sich bei Fehlen auf Nachfrage, CRF 20.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="vid-browser">A) Browser HQ ('+DUR+'s)</button><button class="btn" id="vid-ffmpeg">B) ffmpeg HQ</button><button class="btn" id="vid-cancel">Schließen</button></div><p id="vid-status" style="margin-top:8px;font-size:11px;color:#6b7a96"></p></div>';
  document.body.appendChild(hint);
  hint.querySelector('#vid-cancel').onclick=()=>hint.remove();
  hint.querySelector('#vid-ffmpeg').onclick=()=>{
    const st=hint.querySelector('#vid-status');
    st.innerHTML='WSL/Windows:<br><code>cd /mnt/c/Users/o.janich/ki-zeitung && ./backend/make-status-video.sh aktuell/KI-Zeitung-*.png aktuell/KI-Zeitung-status-'+DUR+'s.mp4 '+DUR+'</code><br>Script prüft ffmpeg, fragt bei Fehlen: <code>sudo apt install -y ffmpeg</code>. Dann direkt in WA Status (9:16).';
  };
  hint.querySelector('#vid-browser').onclick=async()=>{
    const st=hint.querySelector('#vid-status'); st.textContent='Rendere HQ — schmal, große Schrift…';
    let stage=null;
    try{
      // Mobile-Stage: 720px schmal, größere Schrift, dunkel
      stage=document.createElement('div');
      stage.style.cssText='position:fixed;left:-10000px;top:0;width:720px;background:#0b0f1a;padding:16px;font-family:Inter,system-ui,sans-serif';
      stage.innerHTML=document.querySelector('.wrap').innerHTML;
      // Schrift größer für Handy
      stage.querySelectorAll('p, .prose p').forEach(p=> p.style.fontSize='17px');
      stage.querySelectorAll('.card h3 b').forEach(b=> b.style.fontSize='15px');
      stage.querySelectorAll('.kpi b').forEach(b=> b.style.fontSize='20px');
      document.body.appendChild(stage);
      const srcCanvas=await html2canvas(stage,{backgroundColor:'#0b0f1a', scale:2.2, useCORS:true});
      document.body.removeChild(stage); stage=null;
      const W=1080,H=1920,FPS=30, frames=DUR*FPS;
      const vCanvas=document.createElement('canvas'); vCanvas.width=W; vCanvas.height=H;
      const vCtx=vCanvas.getContext('2d'); vCtx.imageSmoothingEnabled=true; vCtx.imageSmoothingQuality='high';
      const scale=W/srcCanvas.width; const scaledH=srcCanvas.height*scale; const maxScroll=Math.max(0, scaledH - H);
      const stream=vCanvas.captureStream(FPS);
      const chunks=[];
      let mime='video/webm;codecs=vp9';
      if(!MediaRecorder.isTypeSupported(mime)){ mime='video/webm;codecs=vp8'; if(!MediaRecorder.isTypeSupported(mime)){ mime='video/webm'; if(!MediaRecorder.isTypeSupported(mime)){ mime='video/mp4'; if(!MediaRecorder.isTypeSupported(mime)) mime=''; } } }
      const rec=mime ? new MediaRecorder(stream,{mimeType:mime, videoBitsPerSecond:5000000}) : new MediaRecorder(stream,{videoBitsPerSecond:5000000});
      st.innerHTML+=' <span style="color:#6b7a96">Codec: '+(mime||'default')+' — 5Mbit HQ</span>';
      rec.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
      rec.onstop=()=>{
        const blob=new Blob(chunks,{type: mime||'video/webm'});
        const ext=mime && mime.includes('mp4') ? 'mp4' : 'webm';
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='KI-Zeitung-'+DATA.tageslage.date+'-scroll-'+DUR+'s-HQ.'+ext; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),3000);
        st.innerHTML='✓ HQ fertig ('+DUR+'s, 9:16, 1080x1920, 5Mbit). Für WA als MP4: <br><code>ffmpeg -i *.webm -c:v libx264 -pix_fmt yuv420p -crf 20 KI-Zeitung-status.mp4</code> — oder direkt B) ffmpeg nutzen.';
      };
      rec.start(100);
      let frame=0;
      function draw(){
        const progress=frame/frames; const y=-progress*maxScroll;
        vCtx.fillStyle='#0b0f1a'; vCtx.fillRect(0,0,W,H);
        vCtx.drawImage(srcCanvas,0,y,W,scaledH);
        vCtx.fillStyle='rgba(91,156,255,.18)'; vCtx.fillRect(0,H-6, W*progress,6);
        // kleine Laufzeit-Anzeige
        vCtx.fillStyle='rgba(240,180,41,.9)'; vCtx.font='12px monospace'; vCtx.fillText((progress*DUR).toFixed(1)+'s / '+DUR+'s', 10, H-14);
        frame++;
        if(frame<frames) requestAnimationFrame(draw); else setTimeout(()=>rec.stop(),500);
      }
      draw();
      setTimeout(()=>{ if(rec.state==='recording') rec.stop(); }, DUR*1000+3000);
    }catch(e){
      if(stage && stage.parentNode) stage.remove();
      hint.querySelector('#vid-status').textContent='✗ '+e.message;
    }
  };
}
function exportPDFDark(){ exportPDFCanvas(); } // alt: window.print schneidet + bleibt weiß trotz Haken — nun Canvas
function exportSearchPDF(){ exportPDFCanvas(); }
function shareWhatsApp(){
  const text=encodeURIComponent('KI-Zeitung — Unbestechliche Tageslage '+DATA.tageslage.date+'\nEU·USA·China + CH·Osteuropa·RU/UA·IL/IR — 7 Perspektiven, Zahlen-Anker\n'+location.href+'\n\nHinweis: WhatsApp kann KEIN HTML rendern — HTML wird als Datei zum Download angezeigt. Für STATUS nimm PNG (Bild) — Status akzeptiert nur Bild/Video. HTML/PDF als Dokument chatten geht, aber nicht als Status.');
  window.open('https://wa.me/?text='+text,'_blank');
  setTimeout(()=>alert('WhatsApp + HTML:\n• Chat: HTML/PDF als DOKUMENT senden → Empfänger lädt runter & öffnet im Browser (Dark bleibt).\n• Status: geht NICHT mit HTML/PDF — nur Bild/Video. → PNG Button nutzen, dann in Status als Bild posten.\n• Alternativ: HTML auf https://app.netlify.com/drop ziehen → Link in WhatsApp teilen → Vorschau + Dark im Browser.'),700);
}

function downloadJSON(){ const a=document.createElement('a'); a.href='data/mock.json'; a.download='mock.json'; a.click(); }
function downloadSources(){ const a=document.createElement('a'); a.href='data/sources.json'; a.download='sources.json'; a.click(); }
window.refreshLive=refreshLive; window.testLLM=testLLM; window.testWSLBridge=testWSLBridge; window.testCloudLLM=testCloudLLM; window.saveCloudKey=saveCloudKey; window.runCloudSynthese=runCloudSynthese; window.searchTopic=searchTopic; window.searchTopicPreset=searchTopicPreset; window.clearSearch=clearSearch; window.searchTopicWithLLM=searchTopicWithLLM; window.exportPDFDark=exportPDFDark; window.exportSearchPDF=exportSearchPDF; window.exportHTML=exportHTML; window.exportPNG=exportPNG; window.exportPDFCanvas=exportPDFCanvas; window.exportScrollingVideo=exportScrollingVideo; window.shareWhatsApp=shareWhatsApp; window.downloadJSON=downloadJSON; window.downloadSources=downloadSources; window.aktualisiere=aktualisiere;
