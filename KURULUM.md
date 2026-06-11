# Hexadigital Mağaza — Kurulum Rehberi

Bu site **saf statik** (HTML/CSS/JS) bir projedir. Build aracı gerekmez; Firebase
CDN üzerinden ES module olarak yüklenir ve GitHub Pages'te doğrudan çalışır.

---

## 1. Kodda doldurulması gereken tek yer

`js/firebase-config.js` dosyasındaki **`ADMIN_EMAILS`** dizisine yetkili admin
Google maillerinizi ekleyin:

```js
export const ADMIN_EMAILS = [
    "siz@gmail.com",
];
```

Aynı mailleri `firestore.rules` içindeki `adminEmails()` listesine de yazın.

---

## 2. Firebase Konsol ayarları (tek seferlik)

[Firebase Console](https://console.firebase.google.com/) → `hexadigital-cf3f2` projesi:

1. **Authentication → Sign-in method →** `Google` sağlayıcısını **etkinleştir**.
2. **Authentication → Settings → Authorized domains →** şunları ekleyin:
   - `localhost` (yerel test için — genelde ekli gelir)
   - GitHub Pages alanınız, örn. `kullaniciadi.github.io`
3. **Firestore Database → Create database** (production mode, bölge: `eur3` veya size yakın).
4. **Firestore → Rules** sekmesine `firestore.rules` dosyasının içeriğini yapıştırıp
   **Publish** deyin. (Mailleri doldurmayı unutmayın!)
5. **Storage (ürün görseli yüklemek için):**
   - **Storage → Get Started** ile etkinleştirin.
   - **Storage → Rules** sekmesine `storage.rules` dosyasının içeriğini yapıştırıp
     **Publish** deyin. (Admin maillerini doldurmayı unutmayın — `firestore.rules`
     ile aynı olmalı!)
   - Artık admin panelinden görsel dosyası yükleyebilirsiniz. (İsterseniz yine
     "Görsel URL'si" alanını da kullanabilirsiniz.)
   - **Sipariş sistemi Storage GEREKTİRMEZ** — siparişler Firestore'da tutulur;
     Storage yalnızca ürün görselleri içindir.

---

## 3. Yerel test

`file://` ile açmak ES module + Firebase için **çalışmaz**. Basit bir yerel sunucu gerekir:

```bash
# Proje klasöründe:
python -m http.server 5500
```

Sonra tarayıcıda:
- Mağaza: <http://localhost:5500/shop.html>
- Admin: <http://localhost:5500/admin.html>

> VS Code kullanıyorsanız **Live Server** eklentisi de olur.

---

## 4. İlk kullanım

1. `admin.html` → **Google ile Giriş** → yetkili mailinizle girin.
2. **"Örnek Verileri Yükle"** ile 6 demo ürünü Firestore'a basın (ya da elle ekleyin).
3. Ürünlere görsel ekleyin (Storage'a yükleyin **veya** URL girin).
4. `shop.html` → ürünleri görün, sepete ekleyin, **WhatsApp ile Sipariş Ver**.

### Sipariş akışı

1. Müşteri sepeti onaylayınca sipariş Firestore'daki `orders` koleksiyonuna
   kaydedilir ve kısa bir **sipariş key'i** (örn. `7psjctn3`) üretilir.
2. WhatsApp mesajında ürün listesi + bir **site içi sipariş linki** gider:
   `…/siparis.html?id=7psjctn3`
3. Sen (sipariş alan) bu linke tıklayınca **siparis.html** açılır; görselli
   sipariş listesini görür ve **"PDF İndir"** ile cihazına PDF kaydedebilirsin.

> Sipariş sayfası linke sahip herkese açıktır (key tahmin edilemez). İstersen
> `firestore.rules` içindeki `orders` okuma kuralını `isAdmin()` yaparak yalnızca
> girişli admine kapatabilirsin.

WhatsApp sipariş numarası `js/cart.js` içinde sabittir: **+90 535 410 18 26**
(değiştirmek için `WHATSAPP_NUMBER`).

---

## 5. GitHub Pages'e yayınlama

1. Repoyu GitHub'a push edin.
2. **Settings → Pages →** Source: `main` / `(root)` seçin, kaydedin.
3. Verilen `https://kullaniciadi.github.io/repo/` adresini Firebase **Authorized
   domains**'e eklediğinizden emin olun (madde 2.2), aksi halde Google girişi çalışmaz.

---

## Dosya yapısı (eklenenler)

| Dosya | Görev |
|---|---|
| `shop.html` / `js/shop.js` | Müşteri mağazası + sepet + sipariş oluşturma |
| `siparis.html` / `js/siparis.js` | Sipariş görüntüleme sayfası (`?id=KEY`) + PDF indir |
| `admin.html` / `js/admin.js` | Admin paneli (Google giriş + ürün yönetimi) |
| `js/order.js` | Siparişi Firestore'a yaz / key ile oku / link üret |
| `js/pdf.js` | Görselli sipariş PDF'i üretimi (jsPDF) |
| `js/cart.js` | Sepet (localStorage) + WhatsApp metni + key üretici |
| `js/firebase-config.js` | Firebase init + `ADMIN_EMAILS` |
| `css/shop.css` | Mağaza, admin & sipariş sayfası stilleri |
| `data/dummy-products.json` | Örnek ürünler |
| `firestore.rules` | Firestore güvenlik kuralları (products + orders; konsola kopyalanır) |
| `storage.rules` | Storage güvenlik kuralları (ürün görselleri; konsola kopyalanır) |
