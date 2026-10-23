# WAY 1 - HYBRID - YARYA ZAXO + BAZ ل سەر Contabo

ئەڤە رێکا 1 یا دووماهیێ یە - یادیا بەری ژبیر بکە!

## چی دکەت؟
- YARYA ZAXO PRO V27 ل سەر Contabo (frontend)
- Firebase Firestore هەر دمینیت (database)
- BAZ BADINAN ژی ل گەل ل /baz/
- هیچ کۆدێ Firebase ناهێتە گهورین!

## بۆچی WAY 1؟
- 5 دەقە دانی
- 0 ریسک - داتابەیسا تە هەر Firebase یە
- Hosting cost 90% کێم دبیت (Firebase Hosting گرانە)

## چەوا دانی سەر Contabo؟

### 1. ZIP ڤەکە
unzip yarya-way1-final.zip -d yarya-way1
cd yarya-way1

### 2. ل سەر Contabo VPS
apt update && apt install nodejs npm docker.io docker-compose -y
npm install
docker-compose up -d --build

### 3. تاقی بکە
http://IP-YA-TE:3000/        -> YARYA ZAXO
http://IP-YA-TE:3000/admin.html -> Admin
http://IP-YA-TE:3000/baz/    -> BAZ

## تێبینی
- firebaseConfig ل ناڤ index.html هەر وەکی خۆ مایە، دێ هەر بچیتە yarya-zaxo.firebaseapp.com
- تەنیا hosting گواستیتە سەر Contabo
- ئەگەر بێژیت "FULL" دێ Firebase ژی راکەین

ئامادەیە! 🦅👑
