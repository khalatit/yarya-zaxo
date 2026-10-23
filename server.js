
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;
const DB_FILE = path.join(__dirname, 'db.json');
let db = { users: [], winners: [] };
try { if(fs.existsSync(DB_FILE)){ db = JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } } catch(e){ console.log('DB load error', e); }
if(!db.users) db.users=[];
if(!db.winners) db.winners=[];
function saveDB(){ try{ fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2)); }catch(e){} }
console.log('[fz6bt] DB loaded');
console.log('V29 OLD STYLE - YARYA ZAXO - NO FIREBASE - $0 - https://yarya-zaxo.onrender.com');
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
let cache = { data:null, time:0 };
function getLeaderboard(cat){
  const now=Date.now();
  if(cache.data && now-cache.time<10000 && cache.cat===cat) return cache.data;
  const sorted=[...db.users].sort((a,b)=>(b.bestScore||0)-(a.bestScore||0));
  const result=sorted.slice(0,50).map((u,i)=>({rank:i+1, username:u.username, score:u.bestScore||0, phone:u.phone||''}));
  cache={data:result,time:now,cat};
  return result;
}
app.post('/api/auth', (req,res)=>{
  const {username, phone, password} = req.body;
  const uname=(username||'').trim();
  if(!uname) return res.json({success:false,message:'navê xwe binivise'});
  const lower=uname.toLowerCase();
  let user=db.users.find(u=>u.usernameLower===lower);
  if(!user){
    user={id:Date.now().toString(), username:uname, usernameLower:lower, phone:phone||password||'', bestScore:0, createdAt:new Date().toISOString(), isAdmin:false};
    db.users.push(user); saveDB(); cache.time=0;
  } else {
    if(phone) user.phone=phone;
    saveDB();
  }
  res.json({success:true, user:{username:user.username, bestScore:user.bestScore, isAdmin:!!user.isAdmin}});
});
app.post('/api/score', (req,res)=>{
  const {username, score}=req.body;
  const lower=(username||'').toLowerCase();
  let user=db.users.find(u=>u.usernameLower===lower);
  if(!user) return res.json({success:false});
  const s=parseInt(score)||0;
  if(s>(user.bestScore||0)) { user.bestScore=s; saveDB(); cache.time=0; }
  res.json({success:true, bestScore:user.bestScore});
});
app.get('/api/leaderboard', (req,res)=>{
  const cat=req.query.category||'100';
  res.json({success:true, category:cat, leaderboard:getLeaderboard(cat)});
});
app.get('/api/stats', (req,res)=>{
  res.json({totalUsers:db.users.length, totalWinners:db.winners.length, onlineEstimate:db.users.length, firebaseCost:0, hosting:'Render $7 - 512MB - Never sleeps', costReduction:'100% Firebase $0 - Same game!!', version:'V29 OLD STYLE FULL'});
});
app.get('/api/admin-stats', (req,res)=>{
  res.json({totalUsers:db.users.length, totalWinners:db.winners.length, onlineEstimate:db.users.length, cacheAge:Date.now()-cache.time, firebaseCost:0, hosting:'Render $7 - 512MB - Never sleeps', costReduction:'100% Firebase $0 - Same game!!'});
});
app.get('/baz/', (req,res)=>res.sendFile(path.join(__dirname,'public/baz/index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`V29 OLD STYLE - YARYA ZAXO - NO FIREBASE - $0 - live on ${PORT}`));
