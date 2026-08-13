# Güvenlik Kuralları Testleri

`firestore.rules` dosyasının gerçekten koruduğunu doğrulayan testler.
Firebase emülatöründe çalışır — canlı veriye dokunmaz.

## Çalıştırma

```bash
npm install --no-save @firebase/rules-unit-testing firebase
firebase emulators:exec --only firestore --project rulecheck-demo "node tests/rules.test.mjs"
```

Test dosyası ESM'dir; `package.json` yoksa `.mjs` uzantısı yeterlidir.

## Kapsam (29 test)

**Mağazalar**
- Mağaza admini kendi mağazasının indirim/logo/isim alanlarını güncelleyebilir
- Yetki yükseltme engeli: `adminEmails` **değiştirilemez ve silinemez**
- `active` alanına dokunulamaz (süper adminin kapattığı mağaza geri açılamaz)
- Başka mağaza güncellenemez; mağaza açılamaz/silinemez
- Süper admin tüm bunları yapabilir

**Ürünler**
- Yalnız kendi mağazasının ürünleri yönetilebilir
- Ürün başka mağazaya **taşınamaz**
- Negatif fiyat / boş isim reddedilir
- Anonim kullanıcı ürün ekleyemez, ama okuyabilir

**Siparişler**
- Müşteri giriş yapmadan sipariş oluşturabilir
- **Tutar sahteciliği engeli:** `total > subtotal` reddedilir
- İndirim tutarı ara toplamı aşamaz
- Boş sipariş, olmayan mağaza, bilinmeyen alan reddedilir
- **Veri sızıntısı engeli:** tek sipariş linkle okunur (`get`), ama tüm koleksiyon
  **listelenemez** (`list` yalnız süper admine açık)
- Var olan sipariş değiştirilemez/silinemez

## Not

Bu testler `firestore.rules` dosyasını proje kökünden okur. Kuralları
değiştirdikten sonra tekrar çalıştırın.
