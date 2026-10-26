# YARYA ZAXO - FIXED

## Çi hate çareserkirin?
- **Kêşe:** Bişkoka dikanê `🏪` ji bo HEMÛ yariykeran dihat nîşandan, ne tenê dikan-daran.
- **Sedem:** CSS `#managerBtn { display: flex !important; }` - bi zorê ji bo hemûyan nîşan dida, `display:none` ya inline jî bêbandor bû. Herweha intervalên JS tenê `flex` dikirin, qet `none` nedikirin.
- **Çareserî:**
  1. CSS hat guherandin: `#managerBtn { display: none !important; }` + `#managerBtn.is-shopkeeper { display: flex !important; }`
  2. `window.isShopkeeperUser()` / `window.updateManagerBtnVisibility()` hat zêdekirin - tenê eger `role==='manager' || isManager || shopkeepers collection` hebe nîşan dide.
  3. `checkShopkeeperInFirestore()` - rastiya ji Firestore `shopkeepers` (usernameLower) kontrol dike, ne tenê role.
  4. Her du interval (800ms û 3000ms) naha hem nîşan didin hem vedişêrin.
  5. `openManagerModal()` naha ji bo ne-dikan-daran tê girtin.
  6. `loadMyShopInfoNew()` - tenê dema belgeya shopkeeper hebe nîşan dide, dema nîne vedişêre.

## Bikaranîn
```
npm install
npm start
```
