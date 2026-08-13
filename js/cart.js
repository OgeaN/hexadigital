// ============================================================================
// Sepet yardımcıları — saf JS, Firebase'siz. Sepet localStorage'da tutulur.
//
// ÇOK MAĞAZALI: Her mağazanın kendi sepeti vardır (hexa_cart_{storeId}).
// Bu yüzden tüm fonksiyonlar İLK PARAMETRE olarak storeId alır.
// (Modül seviyesinde "aktif mağaza" singleton'ı yerine bu tercih edildi:
//  siparis.html ve admin bunu hiç set etmez; bayat bir singleton sessizce
//  yanlış anahtara yazardı.)
// ============================================================================

import { storeCartKey, storeWhatsappNumber } from "./stores.js";
import { cartLineId } from "./options.js";

// ----------------------------------------------------------------------------
// Anahtar
// ----------------------------------------------------------------------------

/** Mağazaya özel localStorage anahtarı. storeId yoksa hata. */
export function cartKey(storeId) {
    if (!storeId) throw new Error("Sepet işlemi için mağaza kimliği (storeId) gerekli.");
    return storeCartKey(storeId);
}

// ----------------------------------------------------------------------------
// Okuma / yazma
// ----------------------------------------------------------------------------

/** Mağazanın sepetini localStorage'dan döndürür. Hata olursa boş dizi. */
export function getCart(storeId) {
    try {
        const raw = localStorage.getItem(cartKey(storeId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Sepeti localStorage'a yazar ve değişiklik olayını tetikler. */
export function saveCart(storeId, cart) {
    localStorage.setItem(cartKey(storeId), JSON.stringify(cart));
    // Aynı sekme içindeki dinleyiciler için özel olay
    window.dispatchEvent(new CustomEvent("cart:change", { detail: { storeId, cart } }));
}

// ----------------------------------------------------------------------------
// İşlemler
// ----------------------------------------------------------------------------

/**
 * Ürünü sepete ekler. Aynı ürün+seçim zaten varsa adedini artırır.
 *
 * SEÇİMLİ ÜRÜNLER: Sepet satırı, ürün id'si ile seçimlerden üretilen bileşik
 * bir anahtarla ayırt edilir (cartLineId). Böylece "siyah vazo" ve "beyaz
 * vazo" ayrı satır olur; aksi hâlde ikincisi birincinin adedini artırırdı.
 * Satırdaki `productId` korunur — sipariş/indirim tarafı asıl ürünü bilmeli.
 *
 * @param {object} product   { id, name, price, imageUrl }
 * @param {number} qty
 * @param {object} [selections]  { color: "Siyah" } gibi seçimler
 */
export function addToCart(storeId, product, qty = 1, selections = null) {
    const cart = getCart(storeId);
    const hasSel = selections && Object.keys(selections).length > 0;
    const lineId = cartLineId(product.id, selections);

    const existing = cart.find(item => item.id === lineId);
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({
            id: lineId,
            productId: product.id,
            name: product.name,
            price: Number(product.price) || 0,
            imageUrl: product.imageUrl || "",
            qty: qty,
            // Seçimsiz ürünlerde alan hiç yazılmaz — eski sepetlerle aynı şekil
            ...(hasSel ? { selections: { ...selections } } : {})
        });
    }
    saveCart(storeId, cart);
    return cart;
}

/** Ürünü sepetten tamamen çıkarır. */
export function removeFromCart(storeId, id) {
    const cart = getCart(storeId).filter(item => item.id !== id);
    saveCart(storeId, cart);
    return cart;
}

/** Bir ürünün adedini ayarlar. 0 veya altına düşerse sepetten çıkarır. */
export function setQty(storeId, id, qty) {
    let cart = getCart(storeId);
    const item = cart.find(i => i.id === id);
    if (!item) return cart;
    item.qty = qty;
    if (item.qty <= 0) {
        cart = cart.filter(i => i.id !== id);
    }
    saveCart(storeId, cart);
    return cart;
}

/** Sepeti tamamen boşaltır. */
export function clearCart(storeId) {
    saveCart(storeId, []);
    return [];
}

// ----------------------------------------------------------------------------
// Hesaplamalar
// ----------------------------------------------------------------------------

/** Sepetteki toplam ürün adedi (rozet için). */
export function cartCount(storeId) {
    return getCart(storeId).reduce((sum, item) => sum + item.qty, 0);
}

/** Sepet tutarı toplamı. */
export function cartTotal(storeId) {
    return getCart(storeId).reduce((sum, item) => sum + item.price * item.qty, 0);
}

// ----------------------------------------------------------------------------
// WhatsApp metni
// ----------------------------------------------------------------------------

/**
 * WhatsApp sipariş mesajı metnini üretir.
 * Ürün listesi metne YAZILMAZ — sipariş detayı linkte tutulur.
 * @param {string} [orderUrl] - verilirse mesaja sipariş sayfası linki eklenir.
 * @param {object} [store]    - verilirse mesaja mağaza adı eklenir.
 */
export function buildWhatsappText(orderUrl, store, customer) {
    const lines = ["Merhaba, sipariş vermek istiyorum."];
    if (store?.name) {
        lines.push("");
        lines.push(`Mağaza: ${store.name}`);
    }
    // Satıcı mesajda kimin yazdığını doğrudan görsün
    if (customer?.name) {
        lines.push(`Ad Soyad: ${customer.name}`);
    }
    if (orderUrl) {
        lines.push("");
        lines.push("Sipariş detayı ve görselli liste:");
        lines.push(orderUrl);
    }
    return lines.join("\n");
}

/**
 * WhatsApp paylaşım linkini (önceden doldurulmuş mesajla) döndürür.
 * Numara mağazadan gelir — yanlış yapılandırılmış bir mağaza sessizce
 * yanlış telefona yönlendirmek yerine HATA verir.
 * @param {string} [orderUrl]
 * @param {object} store - { name, whatsapp }
 * @param {object} [customer] - { name } sipariş sahibi
 */
export function buildWhatsappUrl(orderUrl, store, customer) {
    const number = storeWhatsappNumber(store);
    if (!number) {
        throw new Error(
            "Bu mağaza için WhatsApp numarası tanımlı değil. " +
            "Lütfen mağaza yöneticisiyle iletişime geçin."
        );
    }
    const text = encodeURIComponent(buildWhatsappText(orderUrl, store, customer));
    return `https://wa.me/${number}?text=${text}`;
}

/**
 * Sipariş için kısa, tahmin edilemez bir key üretir (örn. "7psjctn3").
 * 8 karakter, karışabilen harfler (l, o) hariç.
 */
export function generateOrderKey(len = 8) {
    const chars = "abcdefghijkmnpqrstuvwxyz23456789";
    let key = "";
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) key += chars[arr[i] % chars.length];
    return key;
}
