// ============================================================================
// Sipariş modülü — siparişi Firestore'a yazar ve key ile geri okur.
// Sipariş key'i doğrudan doküman ID'si olarak kullanılır (orders/{key}),
// böylece okuma tek getDoc ile yapılır; sorgu/index gerekmez.
// ============================================================================

import {
    doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { getCart, cartTotal, generateOrderKey } from "./cart.js";
import { storeLogo, storeWhatsappNumber } from "./stores.js";
import { discountSnapshot } from "./discount.js";
import { selectionsLabel } from "./options.js";

export const ORDERS_COLLECTION = "orders";

/**
 * Verilen mağazanın sepetinden bir sipariş oluşturup Firestore'a yazar.
 * Mağaza bilgisi siparişe DENORMALIZE edilir: sipariş tarihsel bir kayıttır
 * (mağaza sonradan isim değiştirebilir) ve siparis.html tek getDoc ile çalışır.
 * @param {object} store - { id, name, whatsapp, logoUrl/logoUrls }
 * @param {object} [customer] - { name, phone, phoneIntl } sipariş sahibi
 * @returns {Promise<{ key: string }>} oluşturulan siparişin key'i
 */
export async function createOrder(store, customer = null) {
    if (!store?.id) throw new Error("Mağaza bilgisi eksik.");

    const cart = getCart(store.id);
    if (cart.length === 0) throw new Error("Sepet boş.");

    // Çakışma ihtimaline karşı birkaç deneme yap
    for (let attempt = 0; attempt < 5; attempt++) {
        const key = generateOrderKey();
        const refDoc = doc(db, ORDERS_COLLECTION, key);

        // Aynı key var mı? (çok düşük ihtimal ama kontrol edelim)
        const existing = await getDoc(refDoc);
        if (existing.exists()) continue;

        const items = cart.map(i => ({
            name: i.name,
            price: Number(i.price) || 0,
            qty: i.qty,
            imageUrl: i.imageUrl || "",
            // Müşterinin sepete eklerken yaptığı seçimler (renk vb.).
            // Seçimsiz üründe alan hiç yazılmaz — eski siparişlerle aynı şekil.
            ...(i.selections ? { selections: i.selections } : {}),
            // Seçim etiketleri ürün silinse bile okunabilsin diye hazır metin
            ...(i.selections ? { selectionsLabel: selectionsLabel(i.selections) } : {})
        }));

        // İndirim de mağaza gibi ANLIK kopyalanır: mağaza kuralı sonradan
        // değişse bile sipariş tutarı değişmemeli.
        // `total` indirim SONRASI ödenecek tutardır (eski siparişlerde
        // indirim yoktu; subtotal === total olduğu için uyumluluk korunur).
        // Sepetin tamamı verilir — adet/çeşit/toptan kuralları da hesaplansın
        const subtotal = cartTotal(store.id);
        const discount = discountSnapshot(cart, store);

        await setDoc(refDoc, {
            items,
            subtotal,
            discount,                                   // indirim yoksa null
            total: subtotal - (discount?.amount || 0),
            currency: "TL",
            storeId: store.id,
            // Anlık kopya — mağaza sonradan değişse bile sipariş aynı kalır
            store: {
                name: store.name || "",
                whatsapp: storeWhatsappNumber(store),
                logoUrl: storeLogo(store)
            },
            // Sipariş sahibi — satıcı müşteriye ulaşabilsin.
            // Eski siparişlerde bu alan yoktur → gösterim tarafı null'a hazırlıklı.
            customer: customer ? {
                name: customer.name || "",
                phone: customer.phone || "",
                phoneIntl: customer.phoneIntl || ""
            } : null,
            createdAt: serverTimestamp()
        });

        return { key };
    }
    throw new Error("Sipariş anahtarı üretilemedi, lütfen tekrar deneyin.");
}

/**
 * Key ile siparişi Firestore'dan okur.
 * @returns {Promise<object|null>} sipariş verisi veya bulunamazsa null
 */
export async function getOrder(key) {
    if (!key) return null;
    const snap = await getDoc(doc(db, ORDERS_COLLECTION, key));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Verilen key için site içi sipariş sayfası URL'sini üretir.
 * Örn: https://site.com/siparis.html?id=7psjctn3
 */
export function buildOrderUrl(key) {
    const base = location.href.substring(0, location.href.lastIndexOf("/") + 1);
    return `${base}siparis.html?id=${key}`;
}
