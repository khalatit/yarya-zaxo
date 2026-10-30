
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;
const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_PATH = path.join(DATA_DIR, 'data.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(express.json({limit: '10mb'}));
app.use(express.static(__dirname));

function ensureDataDir(){
  try{ if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true}); }catch(e){}
}

function defaultData(){
  return {
    users: {},
    broadcasts: {},
    sponsors: {},
    shopkeepers: {},
    winners: {},
    settings: { social: {tiktok:'',facebook:'',instagram:''}, config: {} },
    friendRequests: {},
    messages: {},
    unlockTransactions: {},
    meta: { created: new Date().toISOString() }
  };
}

let store = defaultData();

function loadStore(){
  ensureDataDir();
  try{
    if(fs.existsSync(DATA_PATH)){
      const raw = fs.readFileSync(DATA_PATH,'utf-8');
      const parsed = JSON.parse(raw);
      store = {...defaultData(), ...parsed};
      // ensure sub objects
      for(const k of Object.keys(defaultData())){
        if(!store[k]) store[k]=defaultData()[k];
      }
    }
  }catch(e){ console.error('load error', e.message); store = defaultData(); }
}

function saveStore(){
  ensureDataDir();
  try{
    fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
  }catch(e){ console.error('save error', e.message); }
}

loadStore();

function authAdmin(req,res,next){
  const pwd = req.headers['x-admin-password'];
  if(!pwd || pwd !== ADMIN_PASSWORD){
    return res.status(401).json({error:'unauthorized'});
  }
  next();
}

// Users
app.get('/api/users', (req,res)=>{
  const list = Object.values(store.users);
  res.json(list);
});

app.get('/api/users/:id', (req,res)=>{
  const id = decodeURIComponent(req.params.id);
  const u = store.users[id];
  if(!u) return res.status(404).json({error:'not found'});
  res.json(u);
});

app.post('/api/users/:id', (req,res)=>{
  const id = decodeURIComponent(req.params.id);
  const existing = store.users[id] || {};
  store.users[id] = {...existing, ...req.body, _id:id, updatedAt: new Date().toISOString()};
  saveStore();
  res.json(store.users[id]);
});

app.patch('/api/users/:id', (req,res)=>{
  const id = decodeURIComponent(req.params.id);
  const existing = store.users[id] || {};
  store.users[id] = {...existing, ...req.body, _id:id, updatedAt: new Date().toISOString()};
  saveStore();
  res.json(store.users[id]);
});

app.delete('/api/users/:id', authAdmin, (req,res)=>{
  const id = decodeURIComponent(req.params.id);
  delete store.users[id];
  saveStore();
  res.json({ok:true});
});

app.get('/api/check-admin', authAdmin, (req,res)=>{ res.json({ok:true}); });

// Leaderboard
app.get('/api/leaderboard', (req,res)=>{
  const type = req.query.type || 'free';
  let users = Object.values(store.users);
  // filter out admin
  users = users.filter(u=> !u.isAdmin && (u.usernameLower||'').toLowerCase()!=='admin' && (u.username||'').toLowerCase()!=='admin');
  // sort by score field
  const scoreField = type==='mobile'?'bestScoreMobile': type==='car'?'bestScoreCar':'bestScoreFree';
  users.sort((a,b)=>{
    const sa = (a[scoreField]||a.bestScore||0);
    const sb = (b[scoreField]||b.bestScore||0);
    return sb-sa;
  });
  res.json(users.slice(0,100));
});

// Score update
app.post('/api/score', (req,res)=>{
  const {id, username, score, type} = req.body;
  const key = (id||username||'').toLowerCase();
  if(!key) return res.status(400).json({error:'id required'});
  const existing = store.users[key] || {usernameLower:key, username:username||key};
  const field = type==='mobile'?'bestScoreMobile': type==='car'?'bestScoreCar':'bestScoreFree';
  const current = existing[field]||0;
  if(score>current) existing[field]=score;
  if(score>(existing.bestScore||0)) existing.bestScore=score;
  existing.updatedAt = new Date().toISOString();
  store.users[key]=existing;
  saveStore();
  res.json({ok:true, user:existing});
});

// Broadcasts
app.get('/api/broadcasts', (req,res)=>{ res.json(Object.values(store.broadcasts)); });
app.post('/api/broadcasts', authAdmin, (req,res)=>{
  const id = req.body.id || Date.now().toString();
  store.broadcasts[id] = {...req.body, _id:id, createdAt:new Date().toISOString()};
  saveStore(); res.json(store.broadcasts[id]);
});
app.delete('/api/broadcasts/:id', authAdmin, (req,res)=>{
  delete store.broadcasts[req.params.id]; saveStore(); res.json({ok:true});
});

// Sponsors
app.get('/api/sponsors', (req,res)=>{ res.json(Object.values(store.sponsors)); });
app.post('/api/sponsors', authAdmin, (req,res)=>{
  const id = req.body.id || Date.now().toString();
  store.sponsors[id] = {...req.body, _id:id, createdAt:new Date().toISOString()};
  saveStore(); res.json(store.sponsors[id]);
});
app.delete('/api/sponsors/:id', authAdmin, (req,res)=>{
  delete store.sponsors[req.params.id]; saveStore(); res.json({ok:true});
});
app.patch('/api/sponsors/:id', authAdmin, (req,res)=>{
  const id=req.params.id; const ex=store.sponsors[id]||{}; store.sponsors[id]={...ex,...req.body}; saveStore(); res.json(store.sponsors[id]);
});

// Shopkeepers
app.get('/api/shopkeepers', (req,res)=>{ res.json(Object.values(store.shopkeepers)); });
app.post('/api/shopkeepers', authAdmin, (req,res)=>{
  const id = req.body.id || req.body.username || Date.now().toString();
  store.shopkeepers[id] = {...req.body, _id:id, createdAt:new Date().toISOString()};
  saveStore(); res.json(store.shopkeepers[id]);
});
app.patch('/api/shopkeepers/:id', authAdmin, (req,res)=>{
  const id=req.params.id; const ex=store.shopkeepers[id]||{}; store.shopkeepers[id]={...ex,...req.body}; saveStore(); res.json(store.shopkeepers[id]);
});
app.delete('/api/shopkeepers/:id', authAdmin, (req,res)=>{
  delete store.shopkeepers[req.params.id]; saveStore(); res.json({ok:true});
});

// Winners
app.get('/api/winners', (req,res)=>{
  let list = Object.values(store.winners);
  list.sort((a,b)=> new Date(b.createdAt||0)-new Date(a.createdAt||0));
  res.json(list.slice(0,100));
});
app.post('/api/winners', authAdmin, (req,res)=>{
  const id = req.body.id || Date.now().toString();
  store.winners[id] = {...req.body, _id:id, createdAt:new Date().toISOString()};
  saveStore(); res.json(store.winners[id]);
});
app.delete('/api/winners/:id', authAdmin, (req,res)=>{
  delete store.winners[req.params.id]; saveStore(); res.json({ok:true});
});

// Settings social
app.get('/api/settings/social', (req,res)=>{ res.json(store.settings.social||{}); });
app.post('/api/settings/social', authAdmin, (req,res)=>{
  store.settings.social = {...(store.settings.social||{}), ...req.body};
  saveStore(); res.json(store.settings.social);
});

app.get('/api/settings/config', (req,res)=>{ res.json(store.settings.config||{}); });
app.post('/api/settings/config', authAdmin, (req,res)=>{
  store.settings.config = {...(store.settings.config||{}), ...req.body};
  saveStore(); res.json(store.settings.config);
});

// Compatibility for old paths used in original code -> redirect to new

// Serve index
app.get('/', (req,res)=>{ res.sendFile(path.join(__dirname,'index.html')); });

app.listen(PORT, ()=>{ console.log('Server running on '+PORT+' data='+DATA_PATH); });
