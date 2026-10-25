
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;
const DB_FILE = process.env.DB_PATH || (fs.existsSync('/data') ? path.join('/data', 'db.json') : path.join(__dirname, 'db.json'));
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


// --- V58: Admin NOT in code - Password from Environment Variable ONLY ---
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

// ===== V58 - 1 DEVICE = 1 ACCOUNT - HELPERS =====
function checkDuplicateName(colName, plain, currentId){
  if(colName!=='users') return null;
  const low = (plain.usernameLower || plain.username || '').toString().toLowerCase().trim();
  if(!low) return null;
  const col = getCollection('users');
  for(const k in col){
    if(currentId && String(k)===String(currentId)) continue;
    const u = col[k];
    const uLow = (u.usernameLower || u.username || '').toString().toLowerCase().trim();
    if(uLow===low) return k;
  }
  return null;
}
function findAccountByDevice(deviceId){
  if(!deviceId) return null;
  const did = String(deviceId).trim();
  if(!did) return null;
  const col = getCollection('users');
  for(const k in col){
    const u = col[k];
    if(!u) continue;
    const last = (u.lastDeviceId||'').toString().trim();
    const orig = (u.originalDeviceId||'').toString().trim();
    const acc = (u.accountCreatedDevice||'').toString().trim();
    const fp = (u.deviceFingerprint||'').toString().trim();
    const arr = Array.isArray(u.deviceIds) ? u.deviceIds.map(x=>String(x).trim()) : [];
    if(last===did || orig===did || acc===did || fp===did || arr.includes(did)){
      return { id: k, ...u };
    }
  }
  return null;
}
function extractDeviceIdFromData(d){
  if(!d) return '';
  return (d.lastDeviceId || d.deviceId || d.originalDeviceId || d.accountCreatedDevice || d.deviceFingerprint || (Array.isArray(d.deviceIds) && d.deviceIds[0]) || '').toString().trim();
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


// V58 ADMIN EDIT - Rate Limit + Cheat Check + Admin Protection
const rateMap = new Map();
function rateLimit(req,res,next){
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const key = ip + ':' + (req.path||'');
  if(!rateMap.has(key)) rateMap.set(key, []);
  const arr = rateMap.get(key).filter(t=> now - t < 60000);
  arr.push(now);
  rateMap.set(key, arr);
  if(arr.length > 100){
    return res.status(429).json({error:'RATE_LIMIT', message:'زێدە Request - 5 خولەک چاڤەرێ بکە'});
  }
  next();
}
// Blocked users map
const blockedUsers = new Set();
function checkCheatScore(req,res,next){
  if(req.method==='PATCH' && req.originalUrl.includes('/api/firestore/users')){
    try{
      const fields = req.body.fields || {};
      const plain = toPlain(fields);
      delete plain.id; delete plain.code; delete plain.userId;
      if(req.body.fields){
        delete req.body.fields.id; delete req.body.fields.code; delete req.body.fields.userId;
      }
      let curId = null;
      try{ const ex = extractId(req); curId = ex.id; }catch{}
      const dupId = checkDuplicateName('users', plain, curId);
      if(dupId){ return res.status(409).json({error:'DUPLICATE_NAME', message:'ئەڤ ناڤە هەیە - ناڤێ دی بکە - نابیت دوبارە بیت'}); }
      const newScore = plain.bestScore || plain.bestScoreFree || plain.bestScoreMobile || plain.bestScoreCar || 0;
      if(newScore > 10000){ return res.status(403).json({error:'CHEAT', message:'سکۆر گومان - Cheat'}); }
    }catch(e){}
  }
  next();
}
// rateLimit after json - will be added after express.json
// V58: Admin API already protected via isAdminRequest - ensure /api/users needs password
// Also add unblock endpoint
app.post('/api/unblock/:id', (req,res)=>{
  if(!isAdminRequest(req)) return res.status(401).json({error:'UNAUTHORIZED'});
  const id = req.params.id;
  blockedUsers.delete(id);
  res.json({ok:true, unblocked:id});
});

app.use(express.json({limit:'10mb'}));
app.use(rateLimit);
app.use(checkCheatScore);
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
    // V58 FIX: If not found by ID, search by usernameLower/phoneNumber (for users)
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
      // V58: For settings docs, return empty 200 instead of 404 - avoids console spam
      if(col==='settings' || col==='winners'){
        return res.json({name: `projects/yarya-zaxo/databases/(default)/documents/${col}/${encodeURIComponent(id)}`, fields: {}});
      }
      return res.status(404).json({error:'not found', id});
    }
    res.json(docToFirestore(col,id,data));
  }catch(e){ console.error('get doc error', e); res.status(500).json({error:e.message}); }
});

// POST create - V58 ADMIN EDIT - NO MERGE - SAME NAME FORBIDDEN
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
        /* V58: PHONE ALLOWED SHARED - باب و کور/کچ دبێت ١ ژمارا موبایلێ بکاربینن */
      }
      // V58: DEVICE CHECK - 1 DEVICE = 1 ACCOUNT
      const devId = extractDeviceIdFromData(plainData);
      if(devId){
        const existing = findAccountByDevice(devId);
        if(existing){
          console.log(`[V58] BLOCKED new account on device ${devId} - already has ${existing.username}`);
          return res.status(409).json({error:'DEVICE_ALREADY_HAS_ACCOUNT', message:'⛔ ئەڤ جیهازە ئەکاونتێ هەیە - ١ جیهاز = ١ ئەکاونت - دێ زڤریتە سەر یا رەسەن', existingId: existing.id, existingUsername: existing.username, existingUsernameLower: existing.usernameLower, existingCode: existing.privateCode || '', existingPhone: existing.phoneNumber || '', existingPhoto: existing.photoBase64 || ''});
        }
      }
      // Each account is PRIVATE - Random ID so scores are separate, not shared
      const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
      // Store usernameLower as unique key but keep ID separate - so 1 name cannot be reused
      const finalDev = extractDeviceIdFromData(plainData) || '';
      collection[id]= {...plainData, usernameLower: low, lastDeviceId: finalDev, originalDeviceId: finalDev, accountCreatedDevice: finalDev, deviceFingerprint: finalDev, deviceIds: finalDev ? [finalDev] : [], isOriginal: true};
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



app.get('/api/fix-missing-device', (req,res)=>{ try{ const col=getCollection('users'); let f=0; for(const k in col){ const u=col[k]; if(!u.lastDeviceId){ const fb='missing_'+k; u.lastDeviceId=fb; u.originalDeviceId=fb; u.accountCreatedDevice=fb; u.deviceFingerprint=fb; u.deviceIds=[fb]; f++; } } saveDB(); res.json({ok:true,fixed:f}); }catch(e){ res.status(500).json({error:e.message}); } });
app.post('/api/admin/score-control', (req,res)=>{ try{ const {playerId,type,action,amount}=req.body||{}; if(!playerId) return res.status(400).json({error:'NO_ID'}); const users=getCollection('users'); let fid=null; if(users[playerId]) fid=playerId; if(!fid){ const low=String(playerId).toLowerCase().trim(); fid=Object.keys(users).find(k=> (users[k].usernameLower||users[k].username||'').toString().toLowerCase().trim()===low); } if(!fid) return res.status(404).json({error:'NOT_FOUND'}); const user=users[fid]; const amt=parseInt(amount)||0; const t=(type||'all').toLowerCase(); if(action==='delete'){ delete users[fid]; saveDB(); return res.json({ok:true}); } let tg=[]; if(t==='all') tg=['bestScoreFree','bestScoreMobile','bestScoreCar','bestScore']; else if(t==='free') tg=['bestScoreFree','bestScore']; else if(t==='mobile') tg=['bestScoreMobile']; else if(t==='car') tg=['bestScoreCar']; else tg=[t]; if(action==='reset') tg.forEach(f=>user[f]=0); else if(action==='add') tg.forEach(f=>user[f]=Math.max(0,(parseInt(user[f])||0)+amt)); else if(action==='sub') tg.forEach(f=>user[f]=Math.max(0,(parseInt(user[f])||0)-amt)); else if(action==='set') tg.forEach(f=>user[f]=Math.max(0,amt)); if(t==='free'||t==='all') user.bestScore=user.bestScoreFree||0; const cfg=(getCollection('settings')['config']||(getCollection('settings')['config']={})); cfg._version=(cfg._version||0)+1; saveDB(); res.json({ok:true,playerId:fid,username:user.username,bestScore:user.bestScore||0,bestScoreFree:user.bestScoreFree||0,bestScoreMobile:user.bestScoreMobile||0,bestScoreCar:user.bestScoreCar||0}); }catch(e){ res.status(500).json({error:e.message}); } });
app.get('/api/leaderboard-version', (req,res)=>{ try{ const cfg=(getCollection('settings')['config']||{}); res.json({version:cfg._version||0}); }catch(e){ res.json({version:0}); } });
app.get('/api/lookup-by-code/:code', (req,res)=>{ try{ const code=(req.params.code||'').toString().trim(); const col=getCollection('users'); let found=null,fid=null; for(const k in col){ const u=col[k]; const codes=[u.privateCode,u.code,u.secretCode].map(x=>(x||'').toString().trim()); if(codes.includes(code)){ found=u; fid=k; break; } } if(!found) return res.status(404).json({error:'NOT_FOUND'}); res.json({id:fid,username:found.username||fid,usernameLower:found.usernameLower||found.username||'',bestScore:found.bestScore||0,bestScoreFree:found.bestScoreFree||found.bestScore||0,bestScoreMobile:found.bestScoreMobile||0,bestScoreCar:found.bestScoreCar||0,phoneNumber:found.phoneNumber||'',privateCode:found.privateCode||code,unlockedMobile:!!found.unlockedMobile,unlockedCar:!!found.unlockedCar}); }catch(e){ res.status(500).json({error:e.message}); } });
app.post('/api/admin/unfreeze', (req,res)=>{ try{ const cfg=getCollection('settings'); if(cfg['freezeStatus']) cfg['freezeStatus']={active:false,endedAt:Date.now()}; saveDB(); res.json({ok:true}); }catch(e){ res.status(500).json({error:e.message}); } });

// --- V58: DEVICE CHECK - 1 DEVICE = 1 ACCOUNT ---
app.get('/api/check-device/:deviceId', (req,res)=>{
  try{
    const dev = safeDecode(req.params.deviceId).trim();
    const existing = findAccountByDevice(dev);
    if(existing){
      return res.json({hasAccount:true, taken:true, exists:true, user:{id:existing.id, username:existing.username, usernameLower:existing.usernameLower, privateCode:existing.privateCode||'', phoneNumber:existing.phoneNumber||'', photoBase64:existing.photoBase64||'', bio:existing.bio||'', bestScore:existing.bestScore||0, bestScoreFree:existing.bestScoreFree||0, bestScoreMobile:existing.bestScoreMobile||0, bestScoreCar:existing.bestScoreCar||0, deviceIds:existing.deviceIds||[], lastDeviceId:existing.lastDeviceId||'', isAdmin:existing.isAdmin||false}, message:'ئەڤ جیهازە ئەکاونتێ هەیە'});
    }
    return res.json({hasAccount:false, taken:false, exists:false});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/device-account/:deviceId', (req,res)=>{
  try{
    const dev = safeDecode(req.params.deviceId).trim();
    const existing = findAccountByDevice(dev);
    if(!existing) return res.status(404).json({hasAccount:false, message:'ئەڤ جیهازە ئەکاونت نینە'});
    return res.json({hasAccount:true, user:existing});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/check-phone/:phone', (req,res)=>{
  return res.json({available:true, taken:false, allowed:true, message:'ژمارا موبایلێ دبێت باب و کور بکاربینن - ئازایە'});
});
app.post('/api/rename-account', (req,res)=>{
  try{
    const {oldId, oldUsernameLower, newName, newPhone, newBio, newPhoto} = req.body || {};
    const col = getCollection('users');
    const searchLow = (oldUsernameLower || oldId || '').toString().toLowerCase().trim();
    let foundId = null;
    if(oldId && col[oldId]) foundId = oldId;
    if(!foundId){ foundId = Object.keys(col).find(k=> (col[k].usernameLower||col[k].username||'').toString().toLowerCase().trim()===searchLow); }
    if(!foundId) return res.status(404).json({error:'NOT_FOUND', message:'ئەکاونت نەهاتە دیتن'});
    const user = col[foundId];
    if(newName && newName.trim()){
      const newLow = newName.trim().toLowerCase();
      const oldLow = (user.usernameLower||user.username||'').toString().toLowerCase().trim();
      if(newLow!==oldLow){
        const dup = Object.keys(col).find(k=> k!==foundId && (col[k].usernameLower||col[k].username||'').toString().toLowerCase().trim()===newLow);
        if(dup) return res.status(409).json({error:'USERNAME_TAKEN', message:'ئەڤ ناڤە هاتیە گرتن - قەدەغەیە - ناڤێ دی بکە'});
        user.username = newName.trim();
        user.usernameLower = newLow;
      }
    }
    if(newPhone!==undefined) user.phoneNumber = newPhone ? String(newPhone).trim() : user.phoneNumber;
    if(newBio!==undefined) user.bio = newBio;
    if(newPhoto) user.photoBase64 = newPhoto;
    saveDB();
    return res.json({ok:true, user});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// --- V32: PATCH strict - do not allow changing username to taken one ---
// GET leaderboard - ensure each doc is separate, no merging

// V58 ADMIN EDIT - Direct config endpoint - NO cache - for ALL players
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


// V58 ADMIN EDIT - Force reset ranking + new timer - server side (no batch bug)
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


// V58 ADMIN EDIT - Pick winner = Highest score among ALL users, for ALL rankings
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
    if(col==='users'){ const isNew = !collection[id]; const oldU = collection[id]||{}; delete plainData.id; delete plainData.code; delete plainData.userId; if(!isNew && oldU.privateCode) plainData.privateCode=oldU.privateCode; if(!isNew){ delete plainData.originalDeviceId; delete plainData.accountCreatedDevice; delete plainData.deviceFingerprint; delete plainData.deviceIds; delete plainData.lastDeviceId; if(oldU.lastDeviceId) plainData.lastDeviceId=oldU.lastDeviceId; if(oldU.originalDeviceId) plainData.originalDeviceId=oldU.originalDeviceId; if(oldU.accountCreatedDevice) plainData.accountCreatedDevice=oldU.accountCreatedDevice; if(oldU.deviceFingerprint) plainData.deviceFingerprint=oldU.deviceFingerprint; if(oldU.deviceIds) plainData.deviceIds=oldU.deviceIds; } else { const d=extractDeviceIdFromData(plainData)||''; if(d){ plainData.lastDeviceId=d; plainData.originalDeviceId=d; plainData.accountCreatedDevice=d; plainData.deviceFingerprint=d; plainData.deviceIds=[d]; } } const dupId = checkDuplicateName('users', plainData, id); if(dupId){ return res.status(409).json({error:'DUPLICATE_NAME', message:'ئەڤ ناڤە هەیە - نابیت دوبارە بیت'}); } }
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


// --- V58 ADMIN: List users ---
app.get('/api/users', (req,res)=>{ if(!isAdminRequest(req)) return res.status(401).json({error:'UNAUTHORIZED', message:'Password پێویستە'});
  try{
    const col = getCollection('users');
    const users = Object.entries(col).map(([id,u])=>({id, username: u.username, usernameLower: u.usernameLower, phoneNumber: u.phoneNumber, phone: u.phone, bestScore: u.bestScore||0, isAdmin: u.isAdmin||false, createdAt: u.createdAt}));
    users.sort((a,b)=>(b.bestScore||0)-(a.bestScore||0));
    res.json({users, total: users.length});
  }catch(e){ res.status(500).json({error:e.message}); }
});
// --- V58 ADMIN: Set isAdmin ---
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
  res.json({ totalUsers: Object.keys(users).length, totalWinners: Object.keys(winners).length, hosting:'Render $7 - 512MB - Never sleeps', firebaseCost:0, costReduction:'100% Firebase $0 - Same game!!', version:'V58 ADMIN EDIT URI' });
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
  console.log('V58 ADMIN EDIT - YARYA ZAXO - NO FIREBASE - $0 - https://yarya-zaxo.onrender.com');
  console.log(`V58 ADMIN EDIT - live on ${PORT} - DB collections: ${Object.keys(db).join(', ')}`);
});
