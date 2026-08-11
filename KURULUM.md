# Hexadigital Çok Mağazalı Sistem — Kurulum Rehberi

Bu site **saf statik** (HTML/CSS/JS) bir projedir. Build aracı gerekmez; Firebase
CDN üzerinden ES module olarak yüklenir ve GitHub Pages'te doğrudan çalışır.

Site **çok mağazalıdır**: her mağazanın kendi WhatsApp numarası, kendi ürünleri
ve kendi banner/logosu vardır. Ana sayfada mağaza seçim ekranı bulunur; bir
mağazaya tıklayınca `shop.html?store=MAGAZA_KODU` açılır.

---

## 1. Yetki modeli (önce bunu anlayın)

İki kademe vardır:

| | Kim | Ne yapabilir |
|---|---|---|
| **Süper admin** | `js/firebase-config.js` → `ADMIN_EMAILS` | Mağaza açar/siler, mağazaya yönetici e-postası atar, **tüm** mağazaların ürünlerini yönetir |
| **Mağaza admini** | İlgili mağazanın `adminEmails` listesi (panelden atanır) | **Yalnızca kendi mağazasının** ürünlerini yönetir. Mağaza açamaz, yönetici ekleyemez, mağazayı pasifleştiremez |

Süper admin listesi **kodda** durur; bu bilinçlidir: tüm mağaza kayıtları
silinse bile içeri girebileceğiniz bir kaçış kapısı olsun diye.

### Kodda doldurulması gereken tek yer

`js/firebase-config.js` içindeki **`ADMIN_EMAILS`** dizisine süper admin
Google maillerinizi ekleyin:

```js
export const ADMIN_EMAILS = [
    "siz@gmail.com",
];
```

**Aynı mailleri** `firestore.rules` ve `storage.rules` içindeki
`superAdminEmails()` listelerine de yazın. (Üç yerde de aynı olmalı.)

> Mağaza yöneticilerini koda yazmanız **gerekmez** — onlar admin panelinden,
> mağaza düzenleme formundaki "Mağaza Yöneticileri" alanından atanır.

---

## 2. Firebase Konsol ayarları (tek seferlik)

[Firebase Console](https://console.firebase.google.com/) → `hexadigital-cf3f2` projesi:

1. **Authentication → Sign-in method →** `Google` sağlayıcısını **etkinleştir**.
2. **Authentication → Settings → Authorized domains →** şunları ekleyin:
   - `localhost` (yerel test için — genelde ekli gelir)
   - GitHub Pages alanınız, örn. `kullaniciadi.github.io`
3. **Firestore Database → Create database** (production mode, bölge: `eur3` veya size yakın).
4. **Storage → Get Started** ile Storage'ı etkinleştirin.
5. **Kuralları yayınlayın** (sıralama önemli — aşağıdaki madde 4'e bakın):
   - **Firestore → Rules** → `firestore.rules` içeriğini yapıştır → **Publish**
   - **Storage → Rules** → `storage.rules` içeriğini yapıştır → **Publish**
   - Her ikisinde de süper admin maillerini doldurmayı unutmayın!

6. **Storage CORS ayarı — PDF'e görsel gömmek için ZORUNLU** ⚠️

   Firebase Storage varsayılan olarak CORS başlığı **göndermez**. Bu yüzden
   sipariş PDF'i ürün görsellerini indiremez ve PDF **görselsiz** çıkar.
   (Tarayıcı konsolunda `CORS Missing Allow Origin` hatası görürsünüz.)

   Bu bir kod sorunu değildir; bucket ayarıdır ve **bir kez** yapılır.

   **En kolay yol — Google Cloud Shell** (hiçbir şey kurmanız gerekmez):
   1. <https://console.cloud.google.com/> → sağ üstteki **Cloud Shell** (`>_`) simgesine tıklayın
   2. Açılan terminale şunu yapıştırın (repo kökündeki `cors.json` içeriğiyle aynı):

   ```bash
   cat > cors.json <<'EOF'
   [
     {
       "origin": [
         "https://ogean.github.io",
         "http://localhost:5500",
         "http://127.0.0.1:5500"
       ],
       "method": ["GET", "HEAD"],
       "responseHeader": ["Content-Type", "Content-Length", "Content-Range", "Cache-Control"],
       "maxAgeSeconds": 3600
     }
   ]
   EOF

   gcloud storage buckets update gs://hexadigital-cf3f2.firebasestorage.app --cors-file=cors.json
   ```

   3. Doğrulama — aşağıdaki komut `Access-Control-Allow-Origin` satırı göstermelidir:

   ```bash
   curl -sI -H "Origin: https://ogean.github.io" \
     "https://firebasestorage.googleapis.com/v0/b/hexadigital-cf3f2.firebasestorage.app/o/<DOSYA_YOLU>?alt=media&token=<TOKEN>" \
     | grep -i access-control-allow-origin
   ```

   > **Yeni bir alan adı eklerseniz** (özel domain vb.) `origin` listesine ekleyip
   > komutu tekrar çalıştırın. Ayarı yapmadan da site ve sipariş akışı çalışır;
   > yalnızca **PDF'teki görseller** eksik olur.

> Firestore'da **hiçbir composite index gerekmez.** Sorgular tek eşitlik
> filtresiyle yapılır, kalan süzme/sıralama JS tarafında yapılır.

---

## 3. Yerel test

`file://` ile açmak ES module + Firebase için **çalışmaz**. Basit bir yerel sunucu gerekir:

```bash
# Proje klasöründe:
python -m http.server 5500
```

Sonra tarayıcıda:
- Ana sayfa (mağaza seçimi): <http://localhost:5500/index.html#stores>
- Mağaza: <http://localhost:5500/shop.html?store=sam3d>
- Admin: <http://localhost:5500/admin.html>

> VS Code kullanıyorsanız **Live Server** eklentisi de olur.

---

## 4. İlk kurulum sırası (kendinizi kilitlememek için)

Bu sıra önemlidir:

1. `admin.html` → **Google ile Giriş** → süper admin mailinizle girin.
2. **"Mağazalar" sekmesi** → mağazalarınızı oluşturun. Her mağaza için:
   - **Mağaza Kodu (slug)**: adreste görünür, örn. `sam3d`. Küçük harf, rakam
     ve tire. **Sonradan değiştirilemez** (değiştirilirse ürünler öksüz kalır).
   - **Mağaza Adı**, **WhatsApp numarası** (yalnız rakam: `905354101826`)
   - **Banner** (kartın arkaplanı, geniş görsel) ve **Logo** — dosya yükleyerek
     **veya** hazır URL yapıştırarak
   - **Mağaza Yöneticileri**: o mağazayı yönetecek Google e-postaları
3. **Şimdi kuralları yayınlayın** (madde 2.5). Mağazaları oluşturmadan önce
   yayınlarsanız kural `storeId` şart koştuğu için ürün ekleyemezsiniz.
4. **Ürünler sekmesi** → üstteki **Mağaza** seçicisinden mağazayı seçin →
   ürün ekleyin (veya "Örnek Verileri Yükle").
5. `index.html` → mağaza kartlarını görün → birine tıklayıp sipariş akışını deneyin.

### Eski ürünleri mağazalara taşıma (yalnızca bir kez)

Çok mağazalı yapıdan **önce** eklenmiş ürünlerin `storeId`'si yoktur ve hiçbir
mağazada görünmezler. Mağazalar sekmesinin altındaki
**"Ürünleri Kopyala"** butonu, bu ürünleri **tüm aktif mağazalara** kopyalar.

- Her mağaza kendi kopyasını bağımsız düzenleyebilir (birinde fiyat değiştirmek
  diğerini etkilemez).
- Butona tekrar basmak güvenlidir; daha önce kopyalanmış ürünler atlanır.
- **Eski kayıtlar silinmez.** Kontrol ettikten sonra Firebase konsolundan elle
  silebilirsiniz.

---

## 5. Sipariş akışı

1. Müşteri bir mağaza seçer, sepete ürün ekler. **Her mağazanın sepeti ayrıdır**
   (`localStorage` anahtarı: `hexa_cart_{magazaKodu}`), mağaza değiştirince
   sepetiniz kaybolmaz.
2. Sepeti onaylayınca sipariş `orders` koleksiyonuna kaydedilir ve kısa bir
   **sipariş key'i** (örn. `7psjctn3`) üretilir. Siparişe mağaza bilgisi de
   yazılır (ad, WhatsApp, logo).
3. WhatsApp **o mağazanın numarasıyla** açılır; mesajda mağaza adı ve
   **site içi sipariş linki** bulunur: `…/siparis.html?id=7psjctn3`
4. Bu linke tıklayınca **siparis.html** açılır; mağaza bilgisi + görselli sipariş
   listesi görünür ve **"PDF İndir"** ile PDF kaydedilebilir.

### Sipariş PDF'i

- Başlıkta **mağazanın logosu, adı ve WhatsApp numarası** yer alır.
- Ürün görselleri PDF'e gömülür; **en-boy oranı korunarak** 26 mm'lik kutuya
  ortalanır (dikey/yatay görseller bozulmaz).
- **Türkçe karakterler doğru çıkar** (ş, ğ, ı, İ, ç, ö, ü). Bunun için
  `js/fonts/` altında Latin + Türkçe karakterlere subset'lenmiş Roboto fontu
  gömülüdür (Apache 2.0, ~10 KB/ağırlık). `js/pdf.js` tembel yüklendiği için
  bu yük yalnızca "PDF İndir"e basıldığında iner.
- Görseli CORS engelli veya bozuk olan ürünler PDF'te görselsiz, ama eksiksiz
  şekilde listelenir.

> Sipariş sayfası linke sahip herkese açıktır (key tahmin edilemez).

---

## 6. GitHub Pages'e yayınlama

1. Repoyu GitHub'a push edin.
2. **Settings → Pages →** Source: `main` / `(root)` seçin, kaydedin.
3. Verilen `https://kullaniciadi.github.io/repo/` adresini Firebase **Authorized
   domains**'e eklediğinizden emin olun (madde 2.2), aksi halde Google girişi çalışmaz.

---

## Dosya yapısı

| Dosya | Görev |
|---|---|
| `index.html` / `js/index-stores.js` | Ana sayfa + **mağaza seçim kartları** (banner arkaplanlı) |
| `shop.html` / `js/shop.js` | Mağaza sayfası (`?store=KOD`) + sepet + sipariş oluşturma |
| `siparis.html` / `js/siparis.js` | Sipariş görüntüleme (`?id=KEY`) + mağaza bilgisi + PDF indir |
| `admin.html` / `js/admin.js` | Admin paneli — **Mağazalar** (süper admin) + **Ürünler** sekmeleri |
| `js/stores.js` | Mağaza okuma/yetki modülü (`getStore`, `getStoresForEmail`, `isSuperAdmin`…) |
| `js/store-cards.js` | Mağaza kartı render'ı (index.html ve shop.html ortak kullanır) |
| `js/order.js` | Siparişi Firestore'a yaz / key ile oku / link üret |
| `js/pdf.js` | Mağaza başlıklı, görselli sipariş PDF'i (jsPDF) |
| `js/fonts/Roboto-*.js` | PDF için gömülü Türkçe destekli font (base64, otomatik üretilmiş) |
| `js/cart.js` | **Mağaza başına** sepet (localStorage) + WhatsApp metni + key üretici |
| `js/images.js` | Çoklu görsel yardımcıları (`getImages`, `coverImage`) |
| `js/firebase-config.js` | Firebase init + **süper admin** listesi (`ADMIN_EMAILS`) |
| `css/stores.css` | Mağaza kartları + mağaza başlığı (banner + okunabilirlik perdesi) |
| `css/shop.css` | Mağaza, admin & sipariş sayfası stilleri |
| `data/dummy-products.json` | Örnek ürünler |
| `firestore.rules` | Firestore güvenlik kuralları (stores + products + orders) |
| `storage.rules` | Storage güvenlik kuralları (mağaza banner/logo + ürün görselleri) |

## Firestore veri modeli

```
stores/{slug}          name, tagline, whatsapp, bannerUrls[], bannerUrl,
                       logoUrls[], logoUrl, adminEmails[], active, sortOrder
products/{autoId}      name, description, price, currency, imageUrls[], imageUrl,
                       visible, storeId, (migratedFrom)
orders/{key}           items[], total, currency, storeId,
                       store{name, whatsapp, logoUrl}, createdAt
```
