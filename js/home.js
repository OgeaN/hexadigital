// ============================================================================
// Ana sayfa vitrini — mağaza kartları + tüm mağazalardan öne çıkan ürünler
// + global arama (ürün ve mağaza adlarında, istemci tarafında filtreler).
// ============================================================================

import {
    collection, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db, PRODUCTS_COLLECTION } from "./firebase-config.js";
import { getActiveStores, buildStoreShopUrl } from "./stores.js";
import { storeCardHtml, revealCards } from "./store-cards.js";
import { renderProductCards, setupSlides } from "./product-card.js";

const $ = id => document.getElementById(id);

const storesGrid = $("stores-grid");
const storesStatus = $("stores-status");
const featuredGrid = $("featured-grid");
const featuredStatus = $("featured-status");
const featuredTitle = $("featured-title");
const featuredSubtitle = $("featured-subtitle");
const searchForm = $("global-search");
const searchInput = $("q");
const searchClear = $("q-clear");

// Vitrinde gösterilecek en fazla ürün (arama yokken)
const FEATURED_LIMIT = 8;

let allStores = [];
let allProducts = [];   // { ...ürün, _store }
let slideTimer = null;

function setStatus(el, msg, isError = false) {
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("error", isError);
    el.style.display = msg ? "block" : "none";
}

/** Türkçe karakterleri de kapsayan, büyük/küçük harf duyarsız arama anahtarı. */
function norm(s) {
    return String(s || "").toLocaleLowerCase("tr").trim();
}

// ---------------------------------------------------------------------------
// Yükleme
// ---------------------------------------------------------------------------
async function load() {
    // 1) Mağazalar
    try {
        allStores = await getActiveStores();
    } catch (err) {
        console.error("Mağazalar yüklenemedi:", err);
        setStatus(storesStatus, "Mağazalar yüklenirken bir sorun oluştu.", true);
        setStatus(featuredStatus, "");
        return;
    }

    if (allStores.length === 0) {
        setStatus(storesStatus, "Henüz mağaza tanımlanmamış.");
        setStatus(featuredStatus, "");
        return;
    }

    renderStores(allStores);

    // 2) Tüm mağazaların görünür ürünleri (tek okuma, istemcide süzülür)
    const storeById = new Map(allStores.map(s => [s.id, s]));
    try {
        const snap = await getDocs(collection(db, PRODUCTS_COLLECTION));
        snap.forEach(d => {
            const p = { id: d.id, ...d.data() };
            const store = storeById.get(p.storeId);
            // Yalnızca görünür ürünler + AKTİF bir mağazaya ait olanlar
            if (p.visible === true && store) allProducts.push({ ...p, _store: store });
        });
    } catch (err) {
        console.error("Ürünler yüklenemedi:", err);
        setStatus(featuredStatus, "Ürünler yüklenirken bir sorun oluştu.", true);
        return;
    }

    applyFilter("");
}

function renderStores(stores) {
    if (stores.length === 0) {
        storesGrid.innerHTML = "";
        setStatus(storesStatus, "Aramanızla eşleşen mağaza bulunamadı.");
        return;
    }
    storesGrid.innerHTML = stores.map(storeCardHtml).join("");
    setStatus(storesStatus, "");
    revealCards(storesGrid);
}

function renderFeatured(products) {
    if (products.length === 0) {
        featuredGrid.innerHTML = "";
        setStatus(featuredStatus, "Aramanızla eşleşen ürün bulunamadı.");
        return;
    }

    renderProductCards(featuredGrid, products, (p) => ({
        storeLabel: p._store?.name || "",
        storeHref: buildStoreShopUrl(p.storeId)
    }));

    setStatus(featuredStatus, "");
    slideTimer = setupSlides(featuredGrid, slideTimer);
}

// ---------------------------------------------------------------------------
// Arama
// ---------------------------------------------------------------------------
function applyFilter(rawQuery) {
    const q = norm(rawQuery);

    if (!q) {
        renderStores(allStores);
        renderFeatured(allProducts.slice(0, FEATURED_LIMIT));
        featuredTitle.textContent = "Öne Çıkan Ürünler";
        featuredSubtitle.textContent = "Tüm mağazalardan seçmeler.";
        return;
    }

    const stores = allStores.filter(s =>
        norm(s.name).includes(q) || norm(s.tagline).includes(q) || norm(s.id).includes(q));

    const products = allProducts.filter(p =>
        norm(p.name).includes(q) ||
        norm(p.description).includes(q) ||
        norm(p._store?.name).includes(q));

    renderStores(stores);
    renderFeatured(products);
    featuredTitle.textContent = "Arama Sonuçları";
    featuredSubtitle.textContent =
        `"${rawQuery.trim()}" için ${products.length} ürün, ${stores.length} mağaza bulundu.`;
}

// Yazarken filtrele (hafif debounce)
let debounce = null;
searchInput?.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => applyFilter(searchInput.value), 180);
});

// Enter'da sayfa yenilenmesin
searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFilter(searchInput.value);
});

searchClear?.addEventListener("click", () => {
    searchInput.value = "";
    searchInput.focus();
    applyFilter("");
});

load();
