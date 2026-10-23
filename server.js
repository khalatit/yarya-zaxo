
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

function saveDB(){ try{ fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2)); }catch(e){} }
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
  // Support both array and object formats: migrate array to object
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
  return { name: `projects/yarya-zaxo/databases/(default)/documents/${col}/${id}`, fields: toFirestoreFields(data) };
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
  if(op==='EQUAL') return actual===expected;
  if(op==='ARRAY_CONTAINS') return Array.isArray(actual) && actual.includes(expected);
  if(op==='NOT_EQUAL') return actual!==expected;
  if(op==='GREATER_THAN') return actual>expected;
  if(op==='LESS_THAN') return actual<expected;
  return true;
}

app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(__dirname,'public')));

// Firestore REST: GET list
app.get('/api/firestore/:col', (req,res)=>{
  const col = req.params.col;
  const collection = getCollection(col);
  const docs = Object.entries(collection).map(([id,data])=> docToFirestore(col,id,data));
  // Handle pageSize
  const pageSize = parseInt(req.query.pageSize)||50;
  res.json({ documents: docs.slice(0,pageSize) });
});
// GET single doc
app.get('/api/firestore/:col/:id', (req,res)=>{
  const col = req.params.col; const id = decodeURIComponent(req.params.id);
  const collection = getCollection(col);
  const data = collection[id];
  if(!data) return res.status(404).json({error:'not found'});
  res.json(docToFirestore(col,id,data));
});
// POST create
app.post('/api/firestore/:col', (req,res)=>{
  const col = req.params.col;
  const collection = getCollection(col);
  const fields = req.body.fields || req.body;
  const plain = fields.fields ? toPlain(fields.fields) : (fields.stringValue ? toPlain(fields) : req.body);
  // Actually req.body is {fields: {...}}
  const plainData = toPlain(req.body.fields || {});
  const id = Date.now().toString() + Math.random().toString(36).slice(2,6);
  collection[id]=plainData;
  saveDB();
  res.json(docToFirestore(col,id,plainData));
});
// PATCH update (also for setDoc)
app.patch('/api/firestore/:col/:id', (req,res)=>{
  const col = req.params.col; const id = decodeURIComponent(req.params.id);
  const collection = getCollection(col);
  const plainData = toPlain(req.body.fields || {});
  if(!collection[id]) collection[id]={};
  // If setDoc without mask, replace; if updateMask, merge
  Object.assign(collection[id], plainData);
  saveDB();
  res.json(docToFirestore(col,id,collection[id]));
});
// POST with PATCH method via POST? Some SDK uses POST for create already handled.
// DELETE
app.delete('/api/firestore/:col/:id', (req,res)=>{
  const col = req.params.col; const id = decodeURIComponent(req.params.id);
  const collection = getCollection(col);
  delete collection[id];
  saveDB();
  res.json({ok:true});
});
// Also handle DELETE via query param method override (some code uses fetch DELETE with query string)
app.post('/api/firestore-query', (req,res)=>{
  const sq = req.body.structuredQuery || req.body;
  const from = sq.from && sq.from[0];
  const col = from ? from.collectionId : null;
  if(!col) return res.json([]);
  const collection = getCollection(col);
  let entries = Object.entries(collection).map(([id,data])=> ({id, data}));
  // where
  if(sq.where) entries = entries.filter(e=> matchesFilter(e.data, sq.where));
  // orderBy
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
});
// Support runQuery via GET with body? Already POST
app.post('/api/firestore/:col/:id', (req,res)=>{
  // Some SDK may POST to update
  return res.json({ok:true});
});

// Legacy API for V28/V29 compatibility
app.get('/api/leaderboard', (req,res)=>{
  const col = getCollection('users');
  const arr = Object.values(col).sort((a,b)=>(b.bestScore||0)-(a.bestScore||0)).slice(0,100);
  res.json(arr);
});
app.get('/api/stats', (req,res)=>{
  const users = getCollection('users');
  const winners = getCollection('winners');
  res.json({ totalUsers: Object.keys(users).length, totalWinners: Object.keys(winners).length, onlineEstimate: Object.keys(users).length, firebaseCost:0, hosting:'Render $7 - 512MB - Never sleeps', costReduction:'100% Firebase $0 - Same game!!', version:'V30 ORIGINAL FULL' });
});
app.get('/api/admin-stats', (req,res)=>{
  const users = getCollection('users');
  const winners = getCollection('winners');
  res.json({ totalUsers: Object.keys(users).length, totalWinners: Object.keys(winners).length, onlineEstimate: Object.keys(users).length, firebaseCost:0, hosting:'Render $7', costReduction:'100% Firebase $0 - Same game!!' });
});
// Simple auth endpoints for V29 compatibility (kept)
app.post('/api/auth', (req,res)=>{
  const {username, phone, password}=req.body;
  const lower=(username||'').toLowerCase();
  const col=getCollection('users');
  let user=Object.values(col).find(u=>u.usernameLower===lower);
  if(!user){
    const id=Date.now().toString();
    user={username, usernameLower:lower, phone:phone||password||'', bestScore:0, createdAt:new Date().toISOString(), isAdmin:false};
    col[id]=user; saveDB();
  }
  res.json({success:true, user});
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
  if(fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return res.sendFile(filePath);
  return res.sendFile(path.join(__dirname,'public','index.html'));
});
app.listen(PORT, '0.0.0.0', ()=>{
  console.log('V30 ORIGINAL FULL - YARYA ZAXO - NO FIREBASE - $0 - https://yarya-zaxo.onrender.com');
  console.log(`V30 ORIGINAL - live on ${PORT} - DB collections: ${Object.keys(db).join(', ')}`);
});
