// ============================================================================
// Mağaza modülü — çok mağazalı yapının ortak katmanı.
// Mağazalar Firestore'da `stores/{slug}` olarak tutulur; doküman ID'si doğrudan
// URL'de kullanılan slug'dır (shop.html?store=sam3d), böylece okuma tek getDoc.
// ============================================================================

import {
    collection, doc, getDoc, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db, ADMIN_EMAILS } from "./firebase-config.js";
import { coverImage } from "./images.js";

export const STORES_COLLECTION = "stores";

// Slug kuralı: küçük harf/rakam ile başlar, arada tire olabilir. 2-31 karakter.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

// ----------------------------------------------------------------------------
// URL / yönlendirme
// ----------------------------------------------------------------------------

/** Adres çubuğundaki ?store= değerini döndürür (yoksa ""). */
export function storeIdFromUrl(search = location.search) {
    return new URLSearchParams(search).get("store") || "";
}

/** Verilen mağaza için mağaza sayfası linki: "shop.html?store=sam3d" */
export function buildStoreShopUrl(storeId) {
    return `shop.html?store=${encodeURIComponent(storeId)}`;
}

/** Slug geçerli mi? (admin panelinde mağaza oluştururken kullanılır) */
export function isValidSlug(slug) {
    return SLUG_RE.test(String(slug || ""));
}

// ----------------------------------------------------------------------------
// Okuma
// ----------------------------------------------------------------------------

/** Tek mağazayı ID ile okur. Bulunamazsa null. */
export async function getStore(storeId) {
    if (!storeId) return null;
    const snap = await getDoc(doc(db, STORES_COLLECTION, storeId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Mağazaları sortOrder → name sırasına dizer (composite index gerekmesin diye JS'te). */
function sortStores(list) {
    return list.sort((a, b) => {
        const d = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
        if (d !== 0) return d;
        return String(a.name || "").localeCompare(String(b.name || ""), "tr");
    });
}

/** Ana sayfada listelenecek aktif mağazalar. */
export async function getActiveStores() {
    const q = query(collection(db, STORES_COLLECTION), where("active", "==", true));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return sortStores(list);
}

/** Tüm mağazalar (pasifler dahil) — admin paneli için. */
export async function getAllStores() {
    const snap = await getDocs(collection(db, STORES_COLLECTION));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return sortStores(list);
}

// ----------------------------------------------------------------------------
// Görseller — ürünlerdeki imageUrls/imageUrl deseninin aynısı olduğu için
// images.js yardımcıları olduğu gibi yeniden kullanılır.
// ----------------------------------------------------------------------------

/** Mağaza kartının arkaplanı olacak banner görseli (yoksa ""). */
export function storeBanner(store) {
    if (!store) return "";
    return coverImage({ imageUrls: store.bannerUrls, imageUrl: store.bannerUrl });
}

/** Mağaza logosu — kartta ve PDF başlığında kullanılır (yoksa ""). */
export function storeLogo(store) {
    if (!store) return "";
    return coverImage({ imageUrls: store.logoUrls, imageUrl: store.logoUrl });
}

// ----------------------------------------------------------------------------
// Sepet / WhatsApp
// ----------------------------------------------------------------------------

/** Mağazaya özel localStorage sepet anahtarı. */
export function storeCartKey(storeId) {
    return `hexa_cart_${storeId}`;
}

/** Mağazanın WhatsApp numarası — yalnızca rakamlar. Tanımsızsa "". */
export function storeWhatsappNumber(store) {
    return String(store?.whatsapp || "").replace(/\D/g, "");
}

// ----------------------------------------------------------------------------
// Yetki (yalnızca arayüz kontrolü — gerçek güvenlik Security Rules'ta)
// ----------------------------------------------------------------------------

/** E-posta süper admin mi? (js/firebase-config.js ADMIN_EMAILS) */
export function isSuperAdmin(email) {
    const e = String(email || "").toLowerCase();
    return !!e && ADMIN_EMAILS.map(x => String(x).toLowerCase()).includes(e);
}

/** Bu e-posta verilen mağazayı yönetebilir mi? */
export function canManageStore(email, store) {
    const e = String(email || "").toLowerCase();
    if (!e) return false;
    if (isSuperAdmin(e)) return true;
    const list = Array.isArray(store?.adminEmails) ? store.adminEmails : [];
    return list.map(x => String(x).toLowerCase()).includes(e);
}

/**
 * Bu e-postanın yönetebildiği mağazalar.
 * Süper admin → hepsi. Diğerleri → adminEmails dizisinde adı geçenler.
 */
export async function getStoresForEmail(email) {
    const e = String(email || "").toLowerCase();
    if (!e) return [];
    if (isSuperAdmin(e)) return getAllStores();

    const q = query(collection(db, STORES_COLLECTION), where("adminEmails", "array-contains", e));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return sortStores(list);
}
