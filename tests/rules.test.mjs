import {
    initializeTestEnvironment, assertFails, assertSucceeds
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc } from "firebase/firestore";
import fs from "fs";

const SUPER = "osmangundemir1@gmail.com";
const STORE_ADMIN = "magaza@gmail.com";
const OUTSIDER = "kotu@gmail.com";

const env = await initializeTestEnvironment({
    projectId: "rulecheck-demo",
    // Kurallar proje kökünden okunur (test tests/ altından çalıştırılsa da)
    firestore: {
        rules: fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
        host: "127.0.0.1",
        port: 8571
    }
});

const auth = (email) => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ""), { email }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// ---- Zemin verisi ----
await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "stores/sam3d"), {
        name: "SAM 3D", active: true, adminEmails: [STORE_ADMIN],
        whatsapp: "905", discountRules: [], sortOrder: 0
    });
    await setDoc(doc(db, "stores/other"), {
        name: "Other", active: true, adminEmails: ["baska@gmail.com"], whatsapp: "906"
    });
    await setDoc(doc(db, "products/p1"), { name: "Vazo", price: 100, visible: true, storeId: "sam3d" });
    await setDoc(doc(db, "products/p2"), { name: "Kupa", price: 50, visible: true, storeId: "other" });
    await setDoc(doc(db, "orders/abc12345"), {
        items: [{ name: "x", price: 1, qty: 1 }], subtotal: 1, total: 1,
        discount: null, currency: "TL", storeId: "sam3d", store: {}
    });
});

let pass = 0, fail = 0;
async function t(name, fn) {
    try { await fn(); console.log("  ✓", name); pass++; }
    catch (e) { console.log("  ✗", name, "\n      →", String(e.message).split("\n")[0]); fail++; }
}

const validOrder = (over = {}) => ({
    items: [{ name: "x", price: 100, qty: 1 }],
    subtotal: 100, discount: null, total: 100,
    currency: "TL", storeId: "sam3d", store: { name: "SAM 3D" },
    createdAt: new Date(), ...over
});

console.log("\n=== MAĞAZALAR ===");
await t("mağaza admini kendi mağazasının indirimini güncelleyebilir", () =>
    assertSucceeds(updateDoc(doc(auth(STORE_ADMIN), "stores/sam3d"), {
        discountRules: [{ type: "min-total", minTotal: 2000, percent: 10 }]
    })));

await t("mağaza admini logo/isim güncelleyebilir", () =>
    assertSucceeds(updateDoc(doc(auth(STORE_ADMIN), "stores/sam3d"), {
        name: "SAM 3D Pro", logoUrl: "https://x/y.png"
    })));

await t("YETKİ YÜKSELTME ENGELİ: adminEmails'e kendini ekleyemez", () =>
    assertFails(updateDoc(doc(auth(STORE_ADMIN), "stores/sam3d"), {
        adminEmails: [STORE_ADMIN, OUTSIDER]
    })));

await t("YETKİ YÜKSELTME ENGELİ: adminEmails'i SİLEMEZ (diff koruması)", () =>
    assertFails(updateDoc(doc(auth(STORE_ADMIN), "stores/sam3d"), {
        adminEmails: null
    })));

await t("mağaza admini active alanını değiştiremez", () =>
    assertFails(updateDoc(doc(auth(STORE_ADMIN), "stores/sam3d"), { active: false })));

await t("mağaza admini BAŞKA mağazayı güncelleyemez", () =>
    assertFails(updateDoc(doc(auth(STORE_ADMIN), "stores/other"), { name: "hack" })));

await t("mağaza admini mağaza AÇAMAZ", () =>
    assertFails(setDoc(doc(auth(STORE_ADMIN), "stores/yeni"), {
        name: "X", active: true, adminEmails: [STORE_ADMIN]
    })));

await t("mağaza admini mağaza SİLEMEZ", () =>
    assertFails(deleteDoc(doc(auth(STORE_ADMIN), "stores/sam3d"))));

await t("süper admin mağaza açabilir", () =>
    assertSucceeds(setDoc(doc(auth(SUPER), "stores/yeni2"), {
        name: "Yeni", active: true, adminEmails: []
    })));

await t("süper admin adminEmails atayabilir", () =>
    assertSucceeds(updateDoc(doc(auth(SUPER), "stores/sam3d"), {
        adminEmails: [STORE_ADMIN, "ek@gmail.com"]
    })));

await t("yabancı mağaza güncelleyemez", () =>
    assertFails(updateDoc(doc(auth(OUTSIDER), "stores/sam3d"), { name: "hack" })));

console.log("\n=== ÜRÜNLER ===");
await t("mağaza admini kendi ürününü güncelleyebilir", () =>
    assertSucceeds(updateDoc(doc(auth(STORE_ADMIN), "products/p1"), {
        name: "Vazo v2", price: 120, visible: true, storeId: "sam3d"
    })));

await t("mağaza admini BAŞKA mağazanın ürününü güncelleyemez", () =>
    assertFails(updateDoc(doc(auth(STORE_ADMIN), "products/p2"), {
        name: "hack", price: 1, visible: true, storeId: "other"
    })));

await t("ürün BAŞKA mağazaya taşınamaz", () =>
    assertFails(updateDoc(doc(auth(STORE_ADMIN), "products/p1"), {
        name: "Vazo", price: 100, visible: true, storeId: "other"
    })));

await t("NEGATİF FİYAT reddedilir", () =>
    assertFails(addDoc(collection(auth(STORE_ADMIN), "products"), {
        name: "Bedava", price: -50, visible: true, storeId: "sam3d"
    })));

await t("BOŞ İSİM reddedilir", () =>
    assertFails(addDoc(collection(auth(STORE_ADMIN), "products"), {
        name: "", price: 10, visible: true, storeId: "sam3d"
    })));

await t("anonim kullanıcı ürün ekleyemez", () =>
    assertFails(addDoc(collection(anon(), "products"), {
        name: "spam", price: 1, visible: true, storeId: "sam3d"
    })));

await t("müşteri ürünleri okuyabilir", () =>
    assertSucceeds(getDocs(collection(anon(), "products"))));

console.log("\n=== SİPARİŞLER ===");
await t("müşteri (girişsiz) geçerli sipariş oluşturabilir", () =>
    assertSucceeds(setDoc(doc(anon(), "orders/neworder1"), validOrder())));

await t("TUTAR SAHTECİLİĞİ: total > subtotal reddedilir", () =>
    assertFails(setDoc(doc(anon(), "orders/bad1"), validOrder({ subtotal: 100, total: 5000 }))));

await t("indirim ara toplamı aşamaz", () =>
    assertFails(setDoc(doc(anon(), "orders/bad2"),
        validOrder({ discount: { amount: 99999 }, total: 0 }))));

await t("BOŞ sipariş reddedilir", () =>
    assertFails(setDoc(doc(anon(), "orders/bad3"), validOrder({ items: [] }))));

await t("olmayan mağazaya sipariş reddedilir", () =>
    assertFails(setDoc(doc(anon(), "orders/bad4"), validOrder({ storeId: "yokboyle" }))));

await t("BİLİNMEYEN ALAN (ödendi:true) reddedilir", () =>
    assertFails(setDoc(doc(anon(), "orders/bad5"), validOrder({ odendi: true }))));

console.log("\n=== SİPARİŞ SAHİBİ (müşteri bilgileri) ===");
await t("ad + telefon ile sipariş oluşturulabilir", () =>
    assertSucceeds(setDoc(doc(anon(), "orders/cust1"), validOrder({
        customer: { name: "Ahmet Yılmaz", phone: "5354101826", phoneIntl: "905354101826" }
    }))));

await t("müşteri bilgisi OLMADAN da sipariş oluşturulabilir (eski akış)", () =>
    assertSucceeds(setDoc(doc(anon(), "orders/cust2"), validOrder({ customer: null }))));

await t("BOŞ İSİM reddedilir", () =>
    assertFails(setDoc(doc(anon(), "orders/cust3"), validOrder({
        customer: { name: "", phone: "5354101826" }
    }))));

await t("ŞİŞİRİLMİŞ İSİM (80+ karakter) reddedilir", () =>
    assertFails(setDoc(doc(anon(), "orders/cust4"), validOrder({
        customer: { name: "A".repeat(500), phone: "5354101826" }
    }))));

await t("ŞİŞİRİLMİŞ TELEFON reddedilir", () =>
    assertFails(setDoc(doc(anon(), "orders/cust5"), validOrder({
        customer: { name: "Ahmet Yılmaz", phone: "9".repeat(200) }
    }))));

await t("link sahibi siparişi okuyabilir (get)", () =>
    assertSucceeds(getDoc(doc(anon(), "orders/abc12345"))));

await t("VERİ SIZINTISI ENGELİ: tüm siparişler LİSTELENEMEZ", () =>
    assertFails(getDocs(collection(anon(), "orders"))));

await t("süper admin siparişleri listeleyebilir", () =>
    assertSucceeds(getDocs(collection(auth(SUPER), "orders"))));

await t("var olan sipariş DEĞİŞTİRİLEMEZ", () =>
    assertFails(updateDoc(doc(anon(), "orders/abc12345"), { total: 1 })));

await t("var olan sipariş SİLİNEMEZ", () =>
    assertFails(deleteDoc(doc(anon(), "orders/abc12345"))));

await env.cleanup();
console.log(`\n${"=".repeat(46)}\nSONUÇ: ${pass} geçti, ${fail} başarısız\n`);
process.exit(fail ? 1 : 0);
