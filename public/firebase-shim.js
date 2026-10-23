
// V30 - Firebase Shim - $0 - Replaces Firebase SDK with Render API
// Same interface as firebase/firestore.js but uses /api/firestore
export function initializeApp(config){ return { config, _config: config }; }
export function getFirestore(app){ return { app, _app: app }; }

// Helpers to convert Firestore field values <-> plain JS
function toPlain(fields){
  const out = {};
  if(!fields) return out;
  for(const k in fields){
    const v = fields[k];
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

// Document reference
export function doc(db, collectionId, docId){ return { _collectionId: collectionId, _docId: docId, id: docId, path: collectionId+'/'+docId }; }
export function collection(db, collectionId){ return { _collectionId: collectionId, id: collectionId, path: collectionId }; }
export function where(fieldPath, op, value){ return { type:'where', fieldPath, op, value }; }
export function orderBy(fieldPath, direction='asc'){ return { type:'orderBy', fieldPath, direction: direction.toLowerCase() }; }
export function limit(n){ return { type:'limit', n }; }
export function query(colRef, ...constraints){
  return { _collectionId: colRef._collectionId, _constraints: constraints, _isQuery:true };
}
export function serverTimestamp(){ return new Date().toISOString(); }

function makeDocSnapshot(id, fields){
  const plain = toPlain(fields||{});
  return {
    id,
    exists: ()=> true,
    data: ()=> plain,
    get: (field)=> plain[field]
  };
}
function makeQuerySnapshot(docs){
  return {
    docs,
    forEach: (cb)=> docs.forEach(cb),
    empty: docs.length===0,
    size: docs.length
  };
}

async function fetchFirestore(path, opts){
  const url = path.startsWith('/api/') ? path : '/api/firestore'+path;
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error('Firestore shim fetch fail '+r.status+' '+url);
  return r.json();
}

export async function getDoc(docRef){
  try{
    const data = await fetchFirestore(`/${docRef._collectionId}/${encodeURIComponent(docRef._docId)}`);
    if(!data || !data.fields) return { exists: ()=> false, data: ()=> null, id: docRef._docId };
    return makeDocSnapshot(docRef._docId, data.fields);
  }catch(e){
    return { exists: ()=> false, data: ()=> null, id: docRef._docId };
  }
}
export async function getDocs(q){
  const colId = q._collectionId || q.id;
  // Build query body for /api/firestore-query
  let whereClause=null, orderByClause=null, limitN=null;
  if(q._constraints){
    for(const c of q._constraints){
      if(c.type==='where') whereClause=c;
      if(c.type==='orderBy') orderByClause=c;
      if(c.type==='limit') limitN=c.n;
    }
  }
  // If no constraints, simple list
  if(!whereClause && !orderByClause){
    const data = await fetchFirestore(`/${colId}?pageSize=${limitN||50}`);
    const docs = (data.documents||[]).map(d=>{
      const id = d.name.split('/').pop();
      return makeDocSnapshot(id, d.fields);
    });
    return makeQuerySnapshot(docs);
  }
  // Use query endpoint
  const body = { structuredQuery: { from: [{collectionId: colId}] } };
  if(whereClause){
    const opMap = {'==':'EQUAL','!=':'NOT_EQUAL','>':'GREATER_THAN','<':'LESS_THAN','>=':'GREATER_THAN_OR_EQUAL','<=':'LESS_THAN_OR_EQUAL','array-contains':'ARRAY_CONTAINS','in':'IN','EQUAL':'EQUAL','NOT_EQUAL':'NOT_EQUAL'};
    const firestoreOp = opMap[whereClause.op] || whereClause.op;
    body.structuredQuery.where = { fieldFilter: { field: {fieldPath: whereClause.fieldPath}, op: firestoreOp, value: {stringValue: String(whereClause.value)} } };
    // Handle non-string values
    const val = whereClause.value;
    if(typeof val==='number') body.structuredQuery.where.fieldFilter.value = {integerValue: String(val)};
    if(typeof val==='boolean') body.structuredQuery.where.fieldFilter.value = {booleanValue: val};
    if(Array.isArray(val)) body.structuredQuery.where.fieldFilter.op = 'ARRAY_CONTAINS';
  }
  if(orderByClause) body.structuredQuery.orderBy = [{field:{fieldPath: orderByClause.fieldPath}, direction: orderByClause.direction==='desc' ? 'DESCENDING' : 'ASCENDING'}];
  if(limitN) body.structuredQuery.limit = limitN;
  const res = await fetch('/api/firestore-query', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const arr = await res.json();
  const docs = (Array.isArray(arr)?arr:[]).map(item=>{
    const docData = item.document || item;
    const id = (docData.name||'').split('/').pop();
    return makeDocSnapshot(id, docData.fields);
  });
  return makeQuerySnapshot(docs);
}
export async function setDoc(docRef, data){
  const fields = toFirestoreFields(data);
  await fetchFirestore(`/${docRef._collectionId}/${encodeURIComponent(docRef._docId)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fields})});
}
export async function updateDoc(docRef, data){
  const fields = toFirestoreFields(data);
  const mask = Object.keys(fields).map(f=>`updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  await fetchFirestore(`/${docRef._collectionId}/${encodeURIComponent(docRef._docId)}?${mask}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fields})});
}
export async function addDoc(colRef, data){
  if(colRef._collectionId==='users' && data.usernameLower){
    try{ const cr = await fetch(`/api/check-username/${encodeURIComponent(data.usernameLower.toLowerCase().trim())}`); const cd = await cr.json(); if(cd.taken){ throw new Error('USERNAME_TAKEN - ئەم ناڤە هاتیە گرتن - قەدەغەیە'); } }catch(e){ if(e.message.includes('USERNAME_TAKEN')) throw e; }
  }
  const fields = toFirestoreFields(data);
  const res = await fetchFirestore(`/${colRef._collectionId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fields})});
  const name = res.name || '';
  const id = name.split('/').pop() || Date.now().toString();
  return { id };
}
export async function deleteDoc(docRef){
  await fetchFirestore(`/${docRef._collectionId}/${encodeURIComponent(docRef._docId)}`, {method:'DELETE'});
}
export function writeBatch(db){
  const ops=[];
  return {
    set: (docRef, data)=> ops.push({type:'set', docRef, data}),
    update: (docRef, data)=> ops.push({type:'update', docRef, data}),
    delete: (docRef)=> ops.push({type:'delete', docRef}),
    commit: async ()=>{
      for(const op of ops){
        if(op.type==='set') await setDoc(op.docRef, op.data);
        if(op.type==='update') await updateDoc(op.docRef, op.data);
        if(op.type==='delete') await deleteDoc(op.docRef);
      }
    }
  };
}
export async function getCountFromServer(q){
  const snap = await getDocs(q);
  return { data: { count: snap.size } };
}
export function onSnapshot(q, cb){
  getDocs(q).then(snap=> cb(snap)).catch(()=>{});
  return ()=>{};
}
export async function getFirestoreFromShim(){ return {}; }
