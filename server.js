
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({limit: '10mb'}));
app.use(express.static(path.join(__dirname, 'public')));
const DB_FILE = path.join(__dirname, 'db.json');
let db = { users: [], winners: [], sponsors: [], broadcasts: [], friendRequests: [], messages: [], notifications: [], shopkeepers: [], transactions: [], settings: {} };
try { if(fs.existsSync(DB_FILE)){ db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); console.log('DB loaded'); } } catch(e){}
function saveDB(){ try{ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }catch(e){} }
let leaderboardCache = { data: null, time: 0 };
const CACHE_MS = 10000;
function getLeaderboard(mode='free'){
  const now = Date.now();
  if(leaderboardCache.data && (now - leaderboardCache.time) < CACHE_MS) return leaderboardCache.data;
  let field = 'bestScore'; if(mode==='mobile') field='bestScoreMobile'; if(mode==='car') field='bestScoreCar';
  let users = [...(db.users||[])].filter(u=> u[field] && u[field] > 0);
  users.sort((a,b)=> (b[field]||0) - (a[field]||0));
  const top = users.slice(0, 100).map(u=>({ username: u.username, usernameLower: u.usernameLower, bestScore: u[field]||0, photoBase64: (u.photoBase64||'').slice(0,50000), province: u.province||'', lastSeen: u.lastSeen||0 }));
  leaderboardCache = { data: top, time: now }; return top;
}
app.post('/api/register', (req,res)=>{
  const {username, password, phoneNumber, province, photoBase64} = req.body;
  if(!username || !password) return res.status(400).json({error:'username/password required'});
  const usernameLower = username.toLowerCase();
  if(db.users.find(u=>u.usernameLower===usernameLower)) return res.status(400).json({error:'Username exists'});
  const user = { id: Date.now().toString(), username, usernameLower, password, phoneNumber: phoneNumber||'', province: province||'', photoBase64: (photoBase64||'').slice(0,80000), bestScore: 0, bestScoreMobile: 0, bestScoreCar: 0, unlockedMobile: false, unlockedCar: false, createdAt: Date.now(), lastSeen: Date.now(), deviceIds: [] };
  db.users.push(user); saveDB(); leaderboardCache.time=0; res.json({ok:true, user: {...user, password:undefined}});
});
app.post('/api/login', (req,res)=>{
  const {username, password, deviceId} = req.body;
  const usernameLower = (username||'').toLowerCase();
  const user = db.users.find(u=>u.usernameLower===usernameLower && u.password===password);
  if(!user) return res.status(401).json({error:'Invalid credentials'});
  user.lastSeen = Date.now(); if(deviceId && !user.deviceIds.includes(deviceId)) user.deviceIds.push(deviceId); saveDB(); res.json({ok:true, user: {...user, password:undefined}});
});
app.post('/api/score', (req,res)=>{
  const {usernameLower, score, mode} = req.body;
  const user = db.users.find(u=>u.usernameLower===usernameLower);
  if(!user) return res.status(404).json({error:'User not found'});
  let field='bestScore'; if(mode==='mobile') field='bestScoreMobile'; if(mode==='car') field='bestScoreCar';
  if(score > (user[field]||0)){ user[field]=score; user.lastSeen=Date.now(); saveDB(); leaderboardCache.time=0; }
  res.json({ok:true, bestScore:user[field]});
});
app.get('/api/leaderboard', (req,res)=>{ const mode = req.query.mode || 'free'; const data = getLeaderboard(mode); res.json(data); });
app.get('/api/winners', (req,res)=> res.json((db.winners||[]).slice(-50).reverse()));
app.post('/api/winners', (req,res)=>{ const winner = {...req.body, id: Date.now().toString(), createdAt: Date.now()}; db.winners.push(winner); saveDB(); res.json({ok:true, winner}); });
app.get('/api/sponsors', (req,res)=> res.json(db.sponsors||[]));
app.get('/api/stats', (req,res)=>{ res.json({ totalUsers: (db.users||[]).length, totalWinners: (db.winners||[]).length, onlineEstimate: (db.users||[]).filter(u=> Date.now()-u.lastSeen < 5*60*1000).length, cacheAge: Date.now()-leaderboardCache.time, firebaseCost: 0, hosting: 'Render $7 - 512MB - Never sleeps', costReduction: '100% Firebase $0 - Same game!' }); });
app.get('/admin', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/baz', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'baz', 'index.html')));
app.get('*', (req,res)=>{ const filePath = path.join(__dirname, 'public', req.path); if(fs.existsSync(filePath) && fs.statSync(filePath).isFile()){ return res.sendFile(filePath); } return res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, '0.0.0.0', ()=>{ console.log(`V28 FULL - YARYA ZAXO - NO FIREBASE - $0 - https://yarya-zaxo.onrender.com`); });
