const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({limit:'10mb'}));
app.use(express.static(__dirname));
const FB_BASE = 'https://firestore.googleapis.com/v1/projects/yarya-zaxo/databases/(default)/documents';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyB5y-soQQwolnaRLPcARamLXq-YbGFph74';
// /api/config - returns dashboard config (proxy to settings/config doc)
app.get('/api/config', async (req,res)=>{
  try{
    const r = await fetch(`${FB_BASE}/settings/config?key=${API_KEY}`);
    if(!r.ok) return res.json({});
    const j = await r.json();
    const f = j.fields||{};
    const get = (k)=> f[k]?.stringValue || f[k]?.booleanValue ?? f[k]?.integerValue ?? f[k]?.timestampValue;
    res.json({freeLocked: f.freeLocked?.booleanValue||false, mobileLocked: f.mobileLocked?.booleanValue||false, carLocked: f.carLocked?.booleanValue||false, freeEndAt: f.freeEndAt?.timestampValue, mobileEndAt: f.mobileEndAt?.timestampValue, carEndAt: f.carEndAt?.timestampValue, freePrize: f.freePrize?.stringValue, mobilePrize: f.mobilePrize?.stringValue, carPrize: f.carPrize?.stringValue, _version: Date.now()});
  }catch(e){ res.json({}); }
});
app.post('/api/firestore-query', async (req,res)=>{
  try{
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/yarya-zaxo/databases/(default)/documents:runQuery?key=${API_KEY}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(req.body)});
    const j = await r.json(); res.status(r.status).json(j);
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.use('/api/firestore', async (req,res)=>{
  const path = req.url.replace(/^\//,'');
  const url = `${FB_BASE}/${path}`;
  try{
    const opts = {method: req.method, headers:{'Content-Type':'application/json'}};
    if(req.body && Object.keys(req.body).length) opts.body = JSON.stringify(req.body);
    const r = await fetch(url, opts);
    const txt = await r.text(); res.status(r.status).send(txt);
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/reset-ranking/:type', (req,res)=> res.json({ok:true}));
app.get('/', (req,res)=> res.sendFile(__dirname+'/index.html'));
app.listen(PORT, ()=> console.log('YARYA ZAXO running on', PORT));
