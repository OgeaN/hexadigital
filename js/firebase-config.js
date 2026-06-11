// ============================================================================
// Firebase yapılandırması (CDN ES Module importu — GitHub Pages uyumlu, build YOK)
// ============================================================================
// Bu dosya Firebase'i başlatır ve auth / firestore / storage örneklerini export eder.
// Sayfalar (shop.js, admin.js) bu dosyadan import eder.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

// Kullanıcının verdiği Firebase projesi yapılandırması
const firebaseConfig = {
    apiKey: "AIzaSyDNH8WrceEbw11X6NYGzBCz_t0xDl5UHhw",
    authDomain: "hexadigital-cf3f2.firebaseapp.com",
    projectId: "hexadigital-cf3f2",
    storageBucket: "hexadigital-cf3f2.firebasestorage.app",
    messagingSenderId: "283151028556",
    appId: "1:283151028556:web:ea0b5eaf8beec1a3a0ffe9",
    measurementId: "G-M72183SV59"
};

// Firebase'i başlat
const app = initializeApp(firebaseConfig);

// Servis örnekleri
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ----------------------------------------------------------------------------
// ADMIN ALLOWLIST
// ----------------------------------------------------------------------------
// Yalnızca bu maillerle Google girişi yapanlar admin panelini kullanabilir.
// >>> BURAYA izinli admin maillerinizi yazın <<<
// Örn: ["ornek@gmail.com", "ikinci.admin@gmail.com"]
//
// ÖNEMLİ: Gerçek güvenlik Firestore Security Rules ile sağlanır (yazma yetkisi
// yalnızca bu maillere açılmalı). Buradaki liste yalnızca arayüz kontrolüdür.
export const ADMIN_EMAILS = [
    // "ornek@gmail.com",
    "osmangundemir1@gmail.com",
    "ab.sametdundar@gmail.com",
    "abdsametdundar84@gmail.com"
];

// Ürün koleksiyonunun adı (Firestore)
export const PRODUCTS_COLLECTION = "products";
