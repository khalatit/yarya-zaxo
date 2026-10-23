const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Static hosting for YARYA ZAXO PRO - Firebase database stays!
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/admin', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/about', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/baz', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'baz', 'index.html')));

// SPA fallback - important for Firebase hosting rewrites
app.get('*', (req,res)=>{
  if(req.path.startsWith('/baz')){
    return res.sendFile(path.join(__dirname, 'public', 'baz', 'index.html'));
  }
  // Check if file exists
  const fs = require('fs');
  const filePath = path.join(__dirname, 'public', req.path);
  if(fs.existsSync(filePath) && fs.statSync(filePath).isFile()){
    return res.sendFile(filePath);
  }
  // Otherwise serve YARYA index (like Firebase hosting rewrites)
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', ()=>{
  console.log(`✅ WAY 1 - YARYA ZAXO + BAZ live on http://0.0.0.0:${PORT}`);
  console.log(`   YARYA ZAXO: http://localhost:${PORT}/`);
  console.log(`   Admin: http://localhost:${PORT}/admin.html`);
  console.log(`   BAZ: http://localhost:${PORT}/baz/`);
  console.log(`   Firebase DB: still yarya-zaxo.firebaseapp.com (hybrid)`);
});
