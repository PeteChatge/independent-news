// CH-Proxy Stub — läuft auf CH-VPS (z.B. Hetzner CH / Infomaniak) oder lokal via Node
// Zweck: CORS umgehen, RU/IR/CH RSS ohne EU-IP-Block holen, Cache, Rechtssicherheit nach Gutachten.
// Nutzung: node backend/ch-proxy.js  -> http://localhost:8787/rss?url=...

import http from 'http';
import { URL } from 'url';

const ALLOWED = [
  'www.nzz.ch','www.srf.ch','www.watson.ch',
  'www.theguardian.com','www.ft.com','rss.nytimes.com',
  'wyborcza.pl','www.delfi.lt','www.hs.fi','hotnews.ro',
  'meduza.io','novayagazeta.eu','www.kommersant.ru',
  'www.pravda.com.ua','kyivindependent.com',
  'www.haaretz.com','www.timesofisrael.com',
  'www.iranintl.com','www.tasnimnews.com',
  'ec.europa.eu','www.ecb.europa.eu','www.bruegel.org','acleddata.com','data.unhcr.org'
];
const CACHE = new Map();
const TTL = 15*60*1000;

function allowedHost(u){ try{ const h=new URL(u).hostname; return ALLOWED.some(a=> h===a || h.endsWith('.'+a)); }catch{return false} }

const server=http.createServer(async (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  if(req.method==='OPTIONS'){ res.writeHead(204).end(); return; }
  const url=new URL(req.url, 'http://localhost');
  if(url.pathname==='/health'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true, cache:CACHE.size})); return; }
  if(url.pathname==='/rss'){
    const target=url.searchParams.get('url');
    if(!target || !allowedHost(target)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'host not allowed', allowed:ALLOWED})); return; }
    const hit=CACHE.get(target);
    if(hit && Date.now()-hit.ts < TTL){ res.writeHead(200,{'Content-Type': hit.ct, 'X-Cache':'HIT', 'X-CH-Proxy':'1'}); res.end(hit.body); return; }
    try{
      const r=await fetch(target, {headers:{'User-Agent':'KI-Zeitung-Bot/1.0 (+https://ki-zeitung.local)'}});
      const body=Buffer.from(await r.arrayBuffer());
      const ct=r.headers.get('content-type')||'application/rss+xml';
      CACHE.set(target,{body, ct, ts:Date.now()});
      res.writeHead(r.status,{'Content-Type': ct, 'X-Cache':'MISS', 'X-CH-Proxy':'1'});
      res.end(body);
    }catch(e){ res.writeHead(502,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:String(e)})); }
    return;
  }
  res.writeHead(404,{'Content-Type':'text/plain'}); res.end('Use /rss?url=ENCODED_URL  or /health');
});
const PORT=process.env.PORT||8787;
server.listen(PORT, ()=> console.log('CH-Proxy läuft auf http://localhost:'+PORT+' — /rss?url=...  /health'));
