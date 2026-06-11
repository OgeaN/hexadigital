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

export const ORDERS_COLLECTION = "orders";

/**
 * Mevcut sepetten bir sipariş oluşturup Firestore'a yazar.
 * @returns {Promise<{ key: string }>} oluşturulan siparişin key'i
 */
export async function createOrder() {
    const cart = getCart();
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
            imageUrl: i.imageUrl || ""
        }));

        await setDoc(refDoc, {
            items,
            total: cartTotal(),
            currency: "TL",
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
