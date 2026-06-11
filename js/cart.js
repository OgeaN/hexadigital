// ============================================================================
// Sepet yardımcıları — saf JS, Firebase'siz. Sepet localStorage'da tutulur.
// ============================================================================

const CART_KEY = "hexa_cart";

// WhatsApp sipariş numarası (uluslararası format, başında + ve boşluk olmadan)
export const WHATSAPP_NUMBER = "905354101826";

// ----------------------------------------------------------------------------
// Okuma / yazma
// ----------------------------------------------------------------------------

/** Sepeti localStorage'dan döndürür. Hata olursa boş dizi. */
export function getCart() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Sepeti localStorage'a yazar ve değişiklik olayını tetikler. */
export function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    // Aynı sekme içindeki dinleyiciler için özel olay
    window.dispatchEvent(new CustomEvent("cart:change", { detail: cart }));
}

// ----------------------------------------------------------------------------
// İşlemler
// ----------------------------------------------------------------------------

/**
 * Ürünü sepete ekler. Zaten varsa adedini artırır.
 * product: { id, name, price, imageUrl }
 */
export function addToCart(product, qty = 1) {
    const cart = getCart();
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: Number(product.price) || 0,
            imageUrl: product.imageUrl || "",
            qty: qty
        });
    }
    saveCart(cart);
    return cart;
}

/** Ürünü sepetten tamamen çıkarır. */
export function removeFromCart(id) {
    const cart = getCart().filter(item => item.id !== id);
    saveCart(cart);
    return cart;
}

/** Bir ürünün adedini ayarlar. 0 veya altına düşerse sepetten çıkarır. */
export function setQty(id, qty) {
    let cart = getCart();
    const item = cart.find(i => i.id === id);
    if (!item) return cart;
    item.qty = qty;
    if (item.qty <= 0) {
        cart = cart.filter(i => i.id !== id);
    }
    saveCart(cart);
    return cart;
}

/** Sepeti tamamen boşaltır. */
export function clearCart() {
    saveCart([]);
    return [];
}

// ----------------------------------------------------------------------------
// Hesaplamalar
// ----------------------------------------------------------------------------

/** Sepetteki toplam ürün adedi (rozet için). */
export function cartCount() {
    return getCart().reduce((sum, item) => sum + item.qty, 0);
}

/** Sepet tutarı toplamı. */
export function cartTotal() {
    return getCart().reduce((sum, item) => sum + item.price * item.qty, 0);
}

// ----------------------------------------------------------------------------
// WhatsApp metni
// ----------------------------------------------------------------------------

/** Fiyatı binlik ayraçlı Türkçe formata çevirir: 2998 -> "2.998" */
function formatPrice(n) {
    return Number(n).toLocaleString("tr-TR");
}

/**
 * WhatsApp sipariş mesajı metnini üretir.
 * Ürün listesi metne YAZILMAZ — sipariş detayı linkte tutulur.
 * @param {string} [orderUrl] - verilirse mesaja sipariş sayfası linki eklenir.
 */
export function buildWhatsappText(orderUrl) {
    const lines = ["Merhaba, sipariş vermek istiyorum."];
    if (orderUrl) {
        lines.push("");
        lines.push("Sipariş detayı ve görselli liste:");
        lines.push(orderUrl);
    }
    return lines.join("\n");
}

/**
 * WhatsApp paylaşım linkini (önceden doldurulmuş mesajla) döndürür.
 * @param {string} [orderUrl] - varsa mesaja sipariş sayfası linki de eklenir.
 */
export function buildWhatsappUrl(orderUrl) {
    const text = encodeURIComponent(buildWhatsappText(orderUrl));
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
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
