
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;
const DB_FILE = path.join(__dirname, 'db.json');
let db = {};
try { if(fs.existsSync(DB_FILE)){ db = JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } } catch(e){ console.log('DB load error', e); }
if(!db.users) db.users = {};
if(!db.winners) db.winners = {};
if(!db.broadcasts) db.broadcasts = {};
if(!db.sponsors) db.sponsors = {};
if(!db.friendRequests) db.friendRequests = {};
if(!db.messages) db.messages = {};
if(!db.notifications) db.notifications = {};
if(!db.shopkeepers) db.shopkeepers = {};
if(!db.transactions) db.transactions = {};
if(!db.unlockTransactions) db.unlockTransactions = {};
if(!db.typing) db.typing = {};
if(!db.settings) db.settings = {};
if(!db.leaderboard) db.leaderboard = {};


// --- V49: Admin NOT in code - Password from Environment Variable ONLY ---
// Set in Render: Settings -> Environment -> ADMIN_PASSWORD = your secret
// No hardcoded username/password in code - Safe
function isAdminRequest(req){
  const pwd = process.env.ADMIN_PASSWORD || '';
  if(!pwd) return false; // If no password set, admin APIs are CLOSED - safe
  const hdr = req.headers['x-admin-password'] || '';
  const bodyPwd = (req.body && req.body.adminPassword) || '';
  return hdr === pwd || bodyPwd === pwd;
}

function saveDB(){ try{ fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2)); }catch(e){ console.error('save error', e); } }
function safeDecode(s){
  if(!s) return s;
  try{ return decodeURIComponent(s); }catch(e){
    try{ return decodeURI(s); }catch(e2){ return s; }
  }
}
function toPlain(fields){
  const out={};
  if(!fields) return out;
  for(const k in fields){
    const v=fields[k];
    if(v.stringValue !== undefined) out[k]=v.stringValue;
    else if(v.integerValue !== undefined) out[k]=parseInt(v.integerValue);
    else if(v.doubleValue !== undefined) out[k]=parseFloat(v.doubleValue);
    else if(v.booleanValue !== undefined) out[k]=v.booleanValue;
    else if(v.timestampValue !== undefined) out[k]=v.timestampValue;
    else if(v.arrayValue !== undefined) out[k]=(v.arrayValue.values||[]).map(x=> toPlain({tmp:x}).tmp);
    else if(v.mapValue !== undefined) out[k]=toPlain(v.mapValue.fields||{});
    else if(v.nullValue !== undefined) out[k]=null;
    else out[k]=v;
  }
  return out;
}
function toFirestoreFields(obj){
  const fields={};
  for(const k in obj){
    const v=obj[k];
    if(v===null || v===undefined) fields[k]={nullValue:null};
    else if(typeof v==='string') fields[k]={stringValue:v};
    else if(typeof v==='number') fields[k]= Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v};
    else if(typeof v==='boolean') fields[k]={booleanValue:v};
    else if(Array.isArray(v)) fields[k]={arrayValue:{values: v.map(x=> toFirestoreFields({tmp:x}).tmp)}};
    else if(typeof v==='object') fields[k]={mapValue:{fields: toFirestoreFields(v)}};
    else fields[k]={stringValue: String(v)};
  }
  return fields;
}
function getCollection(col){
  if(!db[col]) db[col]={};
  if(Array.isArray(db[col])){
    const obj={};
    db[col].forEach((item,idx)=>{
      const id=item.id || item.usernameLower || String(idx);
      obj[id]=item;
    });
    db[col]=obj;
  }
  return db[col];
}
function docToFirestore(col, id, data){
  return { name: `projects/yarya-zaxo/databases/(default)/documents/${col}/${encodeURIComponent(id)}`, fields: toFirestoreFields(data) };
}
function matchesFilter(docData, filter){
  if(!filter) return true;
  const ff = filter.fieldFilter;
  if(!ff) return true;
  const field = ff.field.fieldPath;
  const op = ff.op;
  const valObj = ff.value;
  let expected;
  if(valObj.stringValue !== undefined) expected=valObj.stringValue;
  else if(valObj.integerValue !== undefined) expected=parseInt(valObj.integerValue);
  else if(valObj.doubleValue !== undefined) expected=parseFloat(valObj.doubleValue);
  else if(valObj.booleanValue !== undefined) expected=valObj.booleanValue;
  else if(valObj.arrayValue !== undefined) expected=(valObj.arrayValue.values||[]).map(x=> toPlain({tmp:x}).tmp);
  else expected=valObj;
  const actual = docData[field];
  if(op==='EQUAL' || op==='==') return actual===expected;
  if(op==='ARRAY_CONTAINS' || op==='array-contains') return Array.isArray(actual) && actual.includes(expected);
  if(op==='NOT_EQUAL' || op==='!=') return actual!==expected;
  if(op==='GREATER_THAN') return actual>expected;
  if(op==='LESS_THAN') return actual<expected;
  if(op==='GREATER_THAN_OR_EQUAL') return actual>=expected;
  if(op==='LESS_THAN_OR_EQUAL') return actual<=expected;
  return true;
}

app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(__dirname,'public')));

// Helper to extract doc ID from original URL safely (handles / ? % chars)
function extractId(req){
  // URL is /api/firestore/col/id?query - we need id part after col/
  const url = req.originalUrl || req.url;
  // Remove /api/firestore/
  let after = url.replace(/^\/api\/firestore\//,'');
  // after is col/id?query or col/id
  const qIndex = after.indexOf('?');
  if(qIndex!==-1) after = after.substring(0,qIndex);
  // after is col/id (id may contain encoded / as %2F or literal /)
  const slashIdx = after.indexOf('/');
  if(slashIdx===-1) return {col: safeDecode(after), id: null};
  const col = safeDecode(after.substring(0,slashIdx));
  let idPart = after.substring(slashIdx+1);
  // Express may have already decoded parts, but we try safe decode
  idPart = safeDecode(idPart);
  // If id contains further / because username had /, join them
  return {col, id: idPart};
}

// Firestore REST: GET list - /api/firestore/:col
app.get('/api/firestore/:col', (req,res)=>{
  try{
    const col = safeDecode(req.params.col);
    const collection = getCollection(col);
    const docs = Object.entries(collection).map(([id,data])=> docToFirestore(col,id,data));
    const pageSize = parseInt(req.query.pageSize)||100;
    res.json({ documents: docs.slice(0,pageSize) });
  }catch(e){ console.error('list error', e); res.status(500).json({error:e.message}); }
});

// GET single doc - handle any ID with special chars
app.get(/^\/api\/firestore\/([^\/]+)\/(.+)$/, (req,res)=>{
  try{
    const col = safeDecode(req.params[0]);
    const rawId = req.params[1];
    const id = safeDecode(rawId.split('?')[0]);
    const collection = getCollection(col);
    let data = collection[id];
    let foundId = id;
    // V49 FIX: If not found by ID, search by usernameLower/phoneNumber (for users)
    if(!data && col==='users'){
      const foundKey = Object.keys(collection).find(k=>{
        const u = collection[k];
        const low = (u.usernameLower||u.username||'').toString().toLowerCase().trim();
        return low===id.toLowerCase().trim();
      });
      if(foundKey){ data = collection[foundKey]; foundId = foundKey; }
    }
    if(!data){
      const foundKey = Object.keys(collection).find(k=> k===id || safeDecode(k)===id || k===rawId);
      if(foundKey){
        return res.json(docToFirestore(col,foundKey,collection[foundKey]));
      }
      // V49: For settings docs, return empty 200 instead of 404 - avoids console spam
      if(col==='settings' || col==='winners'){
        return res.json({name: `projects/yarya-zaxo/databases/(default)/documents/${col}/${encodeURIComponent(id)}`, fields: {}});
      }
      return res.status(404).json({error:'not found', id});
    }
    res.json(docToFirestore(col,id,data));
  }catch(e){ console.error('get doc error', e); res.status(500).json({error:e.message}); }
});

// POST create - V49 ICON FIX - NO MERGE - SAME NAME FORBIDDEN
app.post('/api/firestore/:col', (req,res)=>{
  try{
    const col = safeDecode(req.params.col);
    const collection = getCollection(col);
    const plainData = toPlain(req.body.fields || {});
    // --- V32: STRICT UNIQUE CHECK for users ---
    if(col==='users'){
      const low = (plainData.usernameLower || plainData.username || '').toString().toLowerCase().trim();
      const phone = (plainData.phoneNumber || plainData.phone || '').toString().trim();
      for(const k in collection){
        const u = collection[k];
        const uLow = (u.usernameLower || u.username || '').toString().toLowerCase().trim();
        const uPhone = (u.phoneNumber || u.phone || '').toString().trim();
        if(low && uLow===low){
          console.log(`[STRICT] REJECTED duplicate username: ${low} - QeDexeye!`);
          return res.status(409).json({error:'USERNAME_TAKEN', message:'ئەم ناڤە هاتیە گرتن - قەدەغەیە - ناڤەکێ دی هەلبژێرە'});
        }
        if(phone && phone.length>=7 && uPhone===phone){
          console.log(`[STRICT] REJECTED duplicate phone: ${phone}`);
          return res.status(409).json({error:'PHONE_TAKEN', message:'ئەم ژمارا موبایلێ هاتیە گرتن - قەدەغەیە'});
        }
      }
      // Each account is PRIVATE - Random ID so scores are separate, not shared
      const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
      // Store usernameLower as unique key but keep ID separate - so 1 name cannot be reused
      collection[id]= {...plainData, usernameLower: low};
      saveDB();
      console.log(`[STRICT] New PRIVATE account: ${low} ID=${id} - Score separate`);
      return res.json(docToFirestore(col,id,collection[id]));
    }
    const id = Date.now().toString() + Math.random().toString(36).slice(2,6);
    collection[id]=plainData;
    saveDB();
    res.json(docToFirestore(col,id,plainData));
  }catch(e){ console.error('create error', e); res.status(500).json({error:e.message}); }
});

// --- V32: Check username availability ---
app.get('/api/check-username/:low', (req,res)=>{
  try{
    const low = safeDecode(req.params.low).toLowerCase().trim();
    const col = getCollection('users');
    const exists = Object.values(col).some(u=> (u.usernameLower||u.username||'').toString().toLowerCase().trim()===low);
    res.json({available: !exists, taken: exists, message: exists ? 'ئەم ناڤە هاتیە گرتن - قەدەغەیە' : 'ئەم ناڤە ئازایە'});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// --- V32: PATCH strict - do not allow changing username to taken one ---
// GET leaderboard - ensure each doc is separate, no merging

// V49 ICON FIX - Direct config endpoint - NO cache - for ALL players
app.get('/api/config', (req,res)=>{
  try{
    const cfg = (db.settings && db.settings.config) || {};
    res.set('Cache-Control','no-store, no-cache, must-revalidate');
    res.json({ ...cfg, _version: cfg._version || 0, _updatedAt: cfg._updatedAt || 0 });
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/config-version', (req,res)=>{
  const cfg = (db.settings && db.settings.config) || {};
  res.json({ version: cfg._version || 0 });
});


// V49 ICON FIX - Force reset ranking + new timer - server side (no batch bug)
app.post('/api/reset-ranking/:type', (req,res)=>{
  try{
    const type = req.params.type;
    const col = getCollection('users');
    for(const id in col){
      const u = col[id];
      if(type==='free'){ u.bestScoreFree=0; u.bestScore=0; }
      else if(type==='mobile'){ u.bestScoreMobile=0; u.unlockedMobile=false; u.mobileUnlockedAt=null; }
      else if(type==='car'){ u.bestScoreCar=0; u.unlockedCar=false; u.carUnlockedAt=null; }
    }
    // New timer - use stored duration or 7 days
    const cfg = getCollection('settings')['config'] || {};
    const durKey = type==='free'?'freeDurationMs': type==='mobile'?'mobileDurationMs':'carDurationMs';
    let dur = cfg[durKey] || 7*24*60*60*1000;
    if(typeof dur==='string') dur = parseInt(dur);
    const newEnd = new Date(Date.now()+dur).toISOString();
    if(!getCollection('settings')['config']) getCollection('settings')['config']={};
    const c = getCollection('settings')['config'];
    if(type==='free'){ c.freeEndAt=newEnd; c.freeStartAt=new Date().toISOString(); }
    else if(type==='mobile'){ c.mobileEndAt=newEnd; c.mobileStartAt=new Date().toISOString(); }
    else { c.carEndAt=newEnd; c.carStartAt=new Date().toISOString(); }
    c._version = (c._version||0)+1; c._updatedAt = Date.now();
    saveDB();
    res.json({ok:true, newEnd, type});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/leaderboard/:type', (req,res)=>{
  try{
    const type = req.params.type;
    const col = getCollection('users');
    let users = Object.entries(col).map(([id,u])=>({id, username:u.username||u.displayName||u.name||id, displayName:u.displayName||u.username||u.name||id, name:u.username||u.displayName||id, bestScore:u.bestScore||0, bestScoreFree:u.bestScoreFree||u.bestScore||0, bestScoreMobile:u.bestScoreMobile||0, bestScoreCar:u.bestScoreCar||0, score: u.bestScore||0, isAdmin:u.isAdmin||false}));
    const field = type==='free'?'bestScoreFree': type==='mobile'?'bestScoreMobile':'bestScoreCar';
    users.sort((a,b)=> (b[field]||0)-(a[field]||0));
    res.json(users.slice(0,20));
  }catch(e){ res.status(500).json({error:e.message}); }
});


// V49 ICON FIX - Pick winner = Highest score among ALL users, for ALL rankings
app.post('/api/pick-winner/:type', (req,res)=>{
  try{
    const type = req.params.type;
    const col = getCollection('users');
    const field = type==='free'?'bestScoreFree': type==='mobile'?'bestScoreMobile':'bestScoreCar';
    // Find highest score - check both specific field AND generic bestScore
    let best = null, bestScore = -1;
    for(const id in col){
      const u = col[id];
      const sc = (u[field]||0) > 0 ? (u[field]||0) : (u.bestScore||0);
      // Also consider bestScoreFree for free, bestScore for others
      const score = type==='free' ? Math.max(u.bestScoreFree||0, u.bestScore||0) : (u[field]||0);
      if(score > bestScore){
        bestScore = score;
        best = {id, ...u, _score: score};
      }
    }
    if(!best || bestScore<=0){
      return res.json({winnerName:'کەس نەبوو', winnerScore:0, winnerId:'none'});
    }
    const winnerName = best.username || best.displayName || best.name || best.id || 'کەس نەبوو';
    const winnerScore = bestScore;
    const winnerId = best.id;
    // Save winner doc - use cycle based on current config end time
    const cfg = getCollection('settings')['config'] || {};
    const endAt = cfg[type+'EndAt'] || new Date().toISOString();
    const endTs = Math.floor(new Date(endAt).getTime()/1000);
    const cycleId = type + '_' + endTs;
    const winners = getCollection('winners');
    // If existing winner is bad (کەس نەبوو/undefined), overwrite it
    const existing = winners[cycleId];
    if(!existing || existing.winnerName==='کەس نەبوو' || existing.winnerName==='undefined' || !existing.winnerName){
      winners[cycleId] = {
        type, winnerName, winnerScore, winnerId,
        winnerPhone: best.phoneNumber||'', phoneNumber: best.phoneNumber||'',
        prize: type==='free' ? (cfg.freePrize||'100$') : type==='mobile' ? (cfg.mobilePrize||'ئایفون 18 پرو ماکس') : (cfg.carPrize||'ترومبێل'),
        createdAt: new Date().toISOString(), endAt: new Date().toISOString(), docId: cycleId
      };
      saveDB();
    } else {
      // Use existing good winner
      return res.json({winnerName: existing.winnerName, winnerScore: existing.winnerScore, winnerId: existing.winnerId, cycleId, existing:true});
    }
    // Also update currentWinners flat for bottom bar gold cup
    if(!getCollection('settings')['currentWinners']) getCollection('settings')['currentWinners']={};
    const cw = getCollection('settings')['currentWinners'];
    cw[type+'Name'] = winnerName;
    cw[type+'Score'] = winnerScore;
    cw[type+'Prize'] = type==='free' ? (cfg.freePrize||'100$') : type==='mobile' ? (cfg.mobilePrize||'ئایفون 18 پرو ماکس') : (cfg.carPrize||'ترومبێل');
    cw.lastType = type;
    cw.lastUpdate = new Date().toISOString();
    saveDB();
    res.json({winnerName, winnerScore, winnerId, cycleId});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/leaderboard-strict', (req,res)=>{
  try{
    const col = getCollection('users');
    const users = Object.entries(col).map(([id,u])=>({id, ...u}));
    // Sort by bestScore desc, each is separate private account
    users.sort((a,b)=> (b.bestScore||0)-(a.bestScore||0));
    res.json(users.slice(0,50));
  }catch(e){ res.status(500).json({error:e.message}); }
});

// PATCH update - handle any ID
app.patch(/^\/api\/firestore\/([^\/]+)\/(.+)$/, (req,res)=>{
  try{
    const col = safeDecode(req.params[0]);
    const rawId = req.params[1];
    const id = safeDecode(rawId.split('?')[0]);
    const collection = getCollection(col);
    const plainData = toPlain(req.body.fields || {});
    if(!collection[id]) collection[id]={};
    Object.assign(collection[id], plainData);
    if(col==='settings' && id==='config'){ collection[id]._version = (collection[id]._version||0)+1; collection[id]._updatedAt = Date.now(); }
    saveDB();
    res.json(docToFirestore(col,id,collection[id]));
  }catch(e){ console.error('patch error', e, req.originalUrl); res.status(500).json({error:e.message, stack:e.stack}); }
});

// PUT as alternative to PATCH
app.put(/^\/api\/firestore\/([^\/]+)\/(.+)$/, (req,res)=>{
  try{
    const col = safeDecode(req.params[0]);
    const rawId = req.params[1];
    const id = safeDecode(rawId.split('?')[0]);
    const collection = getCollection(col);
    const plainData = toPlain(req.body.fields || {});
    if(!collection[id]) collection[id]={};
    Object.assign(collection[id], plainData);
    saveDB();
    res.json(docToFirestore(col,id,collection[id]));
  }catch(e){ console.error('put error', e); res.status(500).json({error:e.message}); }
});

// DELETE - handle any ID
app.delete(/^\/api\/firestore\/([^\/]+)\/(.+)$/, (req,res)=>{
  try{
    const col = safeDecode(req.params[0]);
    const rawId = req.params[1];
    const id = safeDecode(rawId.split('?')[0]);
    const collection = getCollection(col);
    delete collection[id];
    saveDB();
    res.json({ok:true});
  }catch(e){ console.error('delete error', e); res.status(500).json({error:e.message}); }
});

// Firestore runQuery
app.post('/api/firestore-query', (req,res)=>{
  try{
    const sq = req.body.structuredQuery || req.body;
    const from = sq.from && sq.from[0];
    const col = from ? from.collectionId : null;
    if(!col) return res.json([]);
    const collection = getCollection(col);
    let entries = Object.entries(collection).map(([id,data])=> ({id, data}));
    if(sq.where) entries = entries.filter(e=> matchesFilter(e.data, sq.where));
    if(sq.orderBy && sq.orderBy[0]){
      const field = sq.orderBy[0].field.fieldPath;
      const dir = sq.orderBy[0].direction;
      entries.sort((a,b)=>{
        const va=a.data[field]||0, vb=b.data[field]||0;
        if(typeof va==='string') return dir==='DESCENDING' ? vb.localeCompare(va) : va.localeCompare(vb);
        return dir==='DESCENDING' ? vb-va : va-vb;
      });
    }
    if(sq.limit) entries = entries.slice(0, sq.limit);
    const result = entries.map(e=> ({ document: docToFirestore(col, e.id, e.data) }));
    res.json(result);
  }catch(e){ console.error('query error', e); res.status(500).json({error:e.message}); }
});


// --- V49 ADMIN: List users ---
app.get('/api/users', (req,res)=>{ if(!isAdminRequest(req)) return res.status(401).json({error:'UNAUTHORIZED', message:'Password پێویستە'});
  try{
    const col = getCollection('users');
    const users = Object.entries(col).map(([id,u])=>({id, username: u.username, usernameLower: u.usernameLower, phoneNumber: u.phoneNumber, phone: u.phone, bestScore: u.bestScore||0, isAdmin: u.isAdmin||false, createdAt: u.createdAt}));
    users.sort((a,b)=>(b.bestScore||0)-(a.bestScore||0));
    res.json({users, total: users.length});
  }catch(e){ res.status(500).json({error:e.message}); }
});
// --- V49 ADMIN: Set isAdmin ---
app.post('/api/set-admin', (req,res)=>{ if(!isAdminRequest(req)) return res.status(401).json({error:'UNAUTHORIZED', message:'Password پێویستە'});
  try{
    const {usernameLower, isAdmin} = req.body;
    const low = (usernameLower||'').toString().toLowerCase().trim();
    if(!low) return res.status(400).json({error:'usernameLower required'});
    const col = getCollection('users');
    let foundId = Object.keys(col).find(k=> (col[k].usernameLower||col[k].username||'').toString().toLowerCase().trim()===low);
    if(!foundId) return res.status(404).json({error:'user not found', message:'یوزەر نەهاتە دیتن'});
    col[foundId].isAdmin = isAdmin===true;
    saveDB();
    console.log(`[ADMIN] ${low} isAdmin = ${col[foundId].isAdmin}`);
    res.json({ok:true, message: isAdmin ? `✅ ${col[foundId].username} بوو ADMIN 👑` : `❌ ${col[foundId].username} ژ ADMIN هاتە برن`, user: col[foundId]});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/leaderboard', (req,res)=>{
  const col = getCollection('users');
  const arr = Object.values(col).sort((a,b)=>(b.bestScore||0)-(a.bestScore||0)).slice(0,100);
  res.json(arr);
});
app.get('/api/stats', (req,res)=>{
  const users = getCollection('users');
  const winners = getCollection('winners');
  res.json({ totalUsers: Object.keys(users).length, totalWinners: Object.keys(winners).length, hosting:'Render $7 - 512MB - Never sleeps', firebaseCost:0, costReduction:'100% Firebase $0 - Same game!!', version:'V49 ICON FIX URI' });
});
app.post('/api/auth', (req,res)=>{
  const {username, phone, password}=req.body;
  const lower=(username||'').toLowerCase();
  const col=getCollection('users');
  let foundId = Object.keys(col).find(k=> col[k].usernameLower===lower);
  if(!foundId){
    const id=lower || Date.now().toString();
    const user={username, usernameLower:lower, phone:phone||password||'', bestScore:0, createdAt:new Date().toISOString(), isAdmin:false};
    col[id]=user; saveDB();
    return res.json({success:true, user});
  }
  res.json({success:true, user:col[foundId]});
});
app.post('/api/score', (req,res)=>{
  const {username, score, usernameLower}=req.body;
  const lower=(usernameLower||username||'').toLowerCase();
  const col=getCollection('users');
  const id=Object.keys(col).find(k=> col[k].usernameLower===lower);
  if(!id) return res.json({success:false});
  const s=parseInt(score)||0;
  if(s>(col[id].bestScore||0)){ col[id].bestScore=s; saveDB(); }
  res.json({success:true, bestScore:col[id].bestScore});
});

app.get('*', (req,res)=>{
  const filePath = path.join(__dirname, 'public', req.path);
  if(req.path.startsWith('/api/')) return res.status(404).json({error:'api not found '+req.path});
  if(fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return res.sendFile(filePath);
  return res.sendFile(path.join(__dirname,'public','index.html'));
});
app.listen(PORT, '0.0.0.0', ()=>{
  console.log('V49 ICON FIX - YARYA ZAXO - NO FIREBASE - $0 - https://yarya-zaxo.onrender.com');
  console.log(`V49 ICON FIX - live on ${PORT} - DB collections: ${Object.keys(db).join(', ')}`);
});
