// ============================================================================
// Mağaza sayfası — ?store=SLUG ile bir mağazayı açar, o mağazanın görünür
// ürünlerini listeler, sepet drawer'ını ve WhatsApp siparişini yönetir.
// Sepet ve WhatsApp numarası mağazaya özeldir.
// ============================================================================

import {
    collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db, PRODUCTS_COLLECTION } from "./firebase-config.js";
import {
    cartKey, getCart, addToCart, removeFromCart, setQty, clearCart,
    cartCount, cartTotal, buildWhatsappUrl
} from "./cart.js";
import { createOrder, buildOrderUrl } from "./order.js";
import { getImages, coverImage } from "./images.js";
import { storeIdFromUrl, getStore, storeBanner, storeLogo } from "./stores.js";
import { renderStoreCards } from "./store-cards.js";
import {
    esc, formatPrice, renderProductCards, setupSlides as setupSlidesShared
} from "./product-card.js";

// ---------- Mağaza bağlamı ----------
const STORE_ID = storeIdFromUrl();
let store = null;   // init() içinde doldurulur

// ---------- DOM ----------
const grid = document.getElementById("products-grid");
const status = document.getElementById("shop-status");
const storeHero = document.getElementById("store-hero");
const storeNameEl = document.getElementById("store-name");
const storeTaglineEl = document.getElementById("store-tagline");
const storeLogoEl = document.getElementById("store-logo");
const storesGrid = document.getElementById("stores-grid");
const shopHeading = document.getElementById("shop-heading");
const shopIntro = document.getElementById("shop-intro");
// Mağaza içi araç çubuğu (arama + sıralama)
const toolbar = document.getElementById("shop-toolbar");
const searchInput = document.getElementById("shop-search");
const searchClear = document.getElementById("shop-search-clear");
const sortSelect = document.getElementById("shop-sort");
const resultCount = document.getElementById("shop-count");
const cartToggle = document.getElementById("cart-toggle");
const cartBadge = document.getElementById("cart-badge");
const cartDrawer = document.getElementById("cart-drawer");
const cartOverlay = document.getElementById("cart-overlay");
const cartClose = document.getElementById("cart-close");
const cartItemsEl = document.getElementById("cart-items");
const cartTotalEl = document.getElementById("cart-total-amount");
const cartCheckout = document.getElementById("cart-checkout");
const cartClear = document.getElementById("cart-clear");

// Lightbox
const lbOverlay = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbPrev = document.getElementById("lb-prev");
const lbNext = document.getElementById("lb-next");
const lbClose = document.getElementById("lb-close");
const lbCounter = document.getElementById("lb-counter");

// Yerel ürün önbelleği (id -> ürün) — sepete eklerken kullanılır
const productMap = new Map();

// esc / formatPrice / kart işaretlemesi product-card.js'ten gelir.

// Bu mağazanın tüm görünür ürünleri (arama/sıralama bunun üzerinde çalışır)
let allProducts = [];

/** Türkçe karakterleri de kapsayan, büyük/küçük harf duyarsız arama anahtarı. */
function norm(s) {
    return String(s || "").toLocaleLowerCase("tr").trim();
}

// ---------- Ürünleri yükle ----------
async function loadProducts() {
    try {
        // Tek eşitlik filtresi → composite index gerekmez.
        // `visible` filtresi JS'te yapılır (kataloglar küçük).
        const q = query(
            collection(db, PRODUCTS_COLLECTION),
            where("storeId", "==", STORE_ID)
        );
        const snap = await getDocs(q);

        const products = [];
        snap.forEach(doc => {
            const data = doc.data();
            if (data.visible === true) products.push({ id: doc.id, ...data });
        });

        if (products.length === 0) {
            status.textContent = "Bu mağazada şu anda görüntülenecek ürün bulunmuyor.";
            status.style.display = "block";
            return;
        }

        allProducts = products;
        applyFilter();
        status.style.display = "none";
    } catch (err) {
        console.error("Ürünler yüklenemedi:", err);
        status.textContent = "Ürünler yüklenirken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.";
        status.classList.add("error");
        status.style.display = "block";
    }
}

// ---------- Arama + sıralama ----------
function applyFilter() {
    const q = norm(searchInput?.value);
    const sort = sortSelect?.value || "default";

    let list = allProducts;
    if (q) {
        list = list.filter(p => norm(p.name).includes(q) || norm(p.description).includes(q));
    }

    // Sıralama kopya üzerinde yapılır — allProducts sırası bozulmasın
    list = [...list];
    if (sort === "price-asc")  list.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === "price-desc") list.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sort === "name")       list.sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));

    renderProducts(list);

    if (resultCount) {
        resultCount.textContent = q
            ? `"${searchInput.value.trim()}" için ${list.length} ürün`
            : `${list.length} ürün`;
    }

    if (list.length === 0) {
        status.textContent = q
            ? "Aramanızla eşleşen ürün bulunamadı."
            : "Bu mağazada şu anda görüntülenecek ürün bulunmuyor.";
        status.classList.remove("error");
        status.style.display = "block";
    } else {
        status.style.display = "none";
    }
}

function renderProducts(products) {
    productMap.clear();
    products.forEach(p => productMap.set(p.id, p));

    renderProductCards(grid, products, { zoomable: true });

    // Çoklu görselli kartlar için otomatik slide + lightbox bağla
    slideTimer = setupSlidesShared(grid, slideTimer);
    setupLightbox();

    // "Sepete Ekle" butonları
    grid.querySelectorAll("[data-add]").forEach(btn => {
        btn.addEventListener("click", () => {
            const product = productMap.get(btn.dataset.add);
            if (!product) return;
            // Sepete kapak görseliyle ekle (çoklu görsel → ilk görsel)
            addToCart(STORE_ID, { ...product, imageUrl: coverImage(product) });
            flashButton(btn);
            showCartToast(product.name);
        });
    });
}

let slideTimer = null;

// ---------- Lightbox (görsele tıkla → büyüt + galeri) ----------
let lbImages = [];
let lbIndex = 0;

function setupLightbox() {
    grid.querySelectorAll("[data-images]").forEach(media => {
        media.addEventListener("click", () => {
            const product = productMap.get(media.dataset.images);
            const imgs = getImages(product);
            if (!imgs.length) return;
            // O an kartta görünen görselden başlat
            const slides = media.querySelectorAll(".pc-slide");
            let start = [...slides].findIndex(s => s.classList.contains("active"));
            openLightbox(imgs, start < 0 ? 0 : start);
        });
    });
}

function openLightbox(images, index = 0) {
    lbImages = images;
    lbIndex = index;
    lbImg.src = lbImages[lbIndex];
    lbOverlay.classList.add("open");
    // Tek görselse okları gizle
    const multi = lbImages.length > 1;
    lbPrev.style.display = multi ? "" : "none";
    lbNext.style.display = multi ? "" : "none";
    lbCounter.style.display = multi ? "" : "none";
    updateLbCounter();
}

function closeLightbox() {
    lbOverlay.classList.remove("open");
    lbImg.src = "";
}

function lbStep(delta) {
    if (!lbImages.length) return;
    lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
    lbImg.src = lbImages[lbIndex];
    updateLbCounter();
}

function updateLbCounter() {
    lbCounter.textContent = `${lbIndex + 1} / ${lbImages.length}`;
}

// Butonda kısa "Eklendi" geri bildirimi
function flashButton(btn) {
    const original = btn.textContent;
    btn.textContent = "Eklendi ✓";
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 900);
}

// Sepete eklendi bildirimi (drawer'ı açmak yerine) — kullanıcı gezinmeye
// devam edebilsin diye. Eskiden her eklemede drawer açılıyordu ve overlay
// arkadaki kartlara tıklamayı engelliyordu.
let toastTimer = null;

function hideCartToast() {
    clearTimeout(toastTimer);
    document.getElementById("cart-toast")?.classList.remove("visible");
}

function showCartToast(name) {
    // Drawer zaten açıksa toast'a gerek yok
    if (cartDrawer.classList.contains("open")) return;

    let toast = document.getElementById("cart-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "cart-toast";
        toast.className = "cart-toast";
        document.body.appendChild(toast);
        toast.addEventListener("click", () => { renderCart(); openCart(); });
    }
    toast.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span><strong>${esc(name)}</strong> sepete eklendi</span>
        <span class="cart-toast__cta">Sepeti aç</span>`;
    toast.classList.add("visible");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

// ---------- Sepet drawer ----------
function openCart() {
    cartDrawer.classList.add("open");
    cartOverlay.classList.add("open");
    // Drawer açıkken toast gereksiz — mobilde "Sipariş Ver" butonunu kapatıyor
    hideCartToast();
}

function closeCart() {
    cartDrawer.classList.remove("open");
    cartOverlay.classList.remove("open");
}

// Rozet güncelle
function updateBadge() {
    const count = cartCount(STORE_ID);
    cartBadge.textContent = count;
    cartBadge.classList.toggle("visible", count > 0);
}

// Sepet içeriğini render et
function renderCart() {
    const cart = getCart(STORE_ID);
    updateBadge();
    cartTotalEl.textContent = `${formatPrice(cartTotal(STORE_ID))} TL`;

    if (cart.length === 0) {
        cartItemsEl.innerHTML = `<p class="cart-empty">Sepetiniz boş.</p>`;
        cartCheckout.classList.add("disabled");
        cartCheckout.style.pointerEvents = "none";
        cartCheckout.style.opacity = "0.5";
        return;
    }

    // "disabled" sınıfı sepet dolunca KALDIRILMALI — eskiden yalnızca
    // ekleniyordu ve buton dolu sepette bile devre dışı görünüyordu.
    cartCheckout.classList.remove("disabled");
    cartCheckout.style.pointerEvents = "";
    cartCheckout.style.opacity = "";

    cartItemsEl.innerHTML = cart.map(item => {
        const img = item.imageUrl
            ? `<img class="cart-item__img" src="${esc(item.imageUrl)}" alt="${esc(item.name)}">`
            : `<div class="cart-item__img"></div>`;
        return `
            <div class="cart-item">
                ${img}
                <div class="cart-item__info">
                    <div class="cart-item__name">${esc(item.name)}</div>
                    <div class="cart-item__price">${formatPrice(item.price)} TL</div>
                    <div class="qty-control">
                        <button data-dec="${esc(item.id)}" aria-label="Azalt">−</button>
                        <span>${item.qty}</span>
                        <button data-inc="${esc(item.id)}" aria-label="Artır">+</button>
                    </div>
                </div>
                <button class="cart-item__remove" data-remove="${esc(item.id)}">Kaldır</button>
            </div>`;
    }).join("");

    // Olay bağlama
    cartItemsEl.querySelectorAll("[data-inc]").forEach(b =>
        b.addEventListener("click", () => changeQty(b.dataset.inc, 1)));
    cartItemsEl.querySelectorAll("[data-dec]").forEach(b =>
        b.addEventListener("click", () => changeQty(b.dataset.dec, -1)));
    cartItemsEl.querySelectorAll("[data-remove]").forEach(b =>
        b.addEventListener("click", () => { removeFromCart(STORE_ID, b.dataset.remove); }));
}

function changeQty(id, delta) {
    const item = getCart(STORE_ID).find(i => i.id === id);
    if (!item) return;
    setQty(STORE_ID, id, item.qty + delta);
}

// ---------- Olaylar ----------
function wireCartEvents() {
    cartToggle.addEventListener("click", () => {
        renderCart();
        openCart();
    });
    cartClose.addEventListener("click", closeCart);
    cartOverlay.addEventListener("click", closeCart);

    cartCheckout.addEventListener("click", async (e) => {
        e.preventDefault();
        if (getCart(STORE_ID).length === 0 || cartCheckout.dataset.busy === "1") return;
        await checkout();
    });

    cartClear.addEventListener("click", () => {
        clearCart(STORE_ID);
    });

    // Sepet her değiştiğinde drawer + rozeti tazele
    window.addEventListener("cart:change", renderCart);
    // Diğer sekmelerden gelen değişiklikler (localStorage) — sadece BU mağazanınki
    window.addEventListener("storage", (e) => {
        if (e.key === cartKey(STORE_ID)) renderCart();
    });
}

async function checkout() {
    const original = cartCheckout.innerHTML;
    cartCheckout.dataset.busy = "1";
    cartCheckout.style.pointerEvents = "none";
    cartCheckout.textContent = "Sipariş hazırlanıyor...";

    try {
        // 1) Siparişi Firestore'a yaz, key al (mağaza bilgisiyle birlikte)
        const { key } = await createOrder(store);
        // 2) Site içi sipariş sayfası linki üret
        const orderUrl = buildOrderUrl(key);
        // 3) WhatsApp metnini sepet DOLUYKEN üret (temizleme öncesi!)
        //    Numara mağazadan gelir; tanımsızsa burada hata fırlar ve sepet KORUNUR.
        const waUrl = buildWhatsappUrl(orderUrl, store);
        // 4) Sepeti temizle (sipariş kaydedildi)
        clearCart(STORE_ID);
        closeCart();
        // 5) WhatsApp'ı liste + sipariş linkiyle aç
        window.open(waUrl, "_blank");
    } catch (err) {
        console.error("Sipariş oluşturulamadı:", err);
        alert("Sipariş kaydedilemedi. Lütfen tekrar deneyin.\n\n" + (err.message || ""));
    } finally {
        cartCheckout.innerHTML = original;
        cartCheckout.dataset.busy = "";
        cartCheckout.style.pointerEvents = "";
    }
}

// ---------- Lightbox olayları ----------
lbClose.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", (e) => { e.stopPropagation(); lbStep(-1); });
lbNext.addEventListener("click", (e) => { e.stopPropagation(); lbStep(1); });
// Arka plana (resmin dışına) tıklayınca kapat
lbOverlay.addEventListener("click", (e) => {
    if (e.target === lbOverlay) closeLightbox();
});
// Klavye: Esc kapat, ←/→ gezin
document.addEventListener("keydown", (e) => {
    if (!lbOverlay.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") lbStep(-1);
    else if (e.key === "ArrowRight") lbStep(1);
});

// ============================================================================
// Başlangıç
// ============================================================================

/** Sepet arayüzünü tamamen gizler (mağaza seçilmemiş / bulunamamış durumlar). */
function hideCartUI() {
    cartToggle.style.display = "none";
    closeCart();
}

/** Mağaza yok / pasif → uyarı + mağaza listesine dönüş. */
function showStoreNotFound() {
    hideCartUI();
    grid.innerHTML = "";
    if (storeHero) storeHero.style.display = "none";
    if (toolbar) toolbar.style.display = "none";
    const searchForm = document.getElementById("shop-search-form");
    if (searchForm) searchForm.style.display = "none";
    status.innerHTML =
        `Mağaza bulunamadı. Bağlantı hatalı olabilir veya mağaza yayından kaldırılmış olabilir.
         <br><br>
         <a class="btn btn--primary" href="index.html#stores">Mağazalara dön</a>`;
    status.classList.add("error");
    status.style.display = "block";
}

/** ?store yoksa: ölü sayfa yerine mağaza seçicisini göster. */
async function showStorePicker() {
    hideCartUI();
    if (storeHero) storeHero.style.display = "none";
    if (toolbar) toolbar.style.display = "none";

    // Mağaza içi arama bu modda anlamsız — gizle
    const searchForm = document.getElementById("shop-search-form");
    if (searchForm) searchForm.style.display = "none";

    const introBlock = document.getElementById("shop-intro-block");
    if (introBlock) introBlock.style.display = "";
    if (shopHeading) shopHeading.innerHTML = `<span class="text-highlight">Mağazalar</span>`;
    if (shopIntro) shopIntro.textContent = "Alışverişe başlamak için bir mağaza seçin.";

    grid.style.display = "none";
    status.style.display = "none";
    if (storesGrid) storesGrid.style.display = "";

    const storesStatus = document.getElementById("stores-status");
    if (storesStatus) storesStatus.style.display = "block";
    await renderStoreCards(storesGrid, storesStatus);
}

/** Mağaza başlığını (logo + ad + banner arkaplan) doldurur. */
function renderStoreHero() {
    if (!storeHero) return;

    const banner = storeBanner(store);
    if (banner) {
        storeHero.style.setProperty("--store-banner", `url('${banner}')`);
    }

    if (storeNameEl) storeNameEl.textContent = store.name || store.id;

    if (storeTaglineEl) {
        storeTaglineEl.textContent = store.tagline || "";
        storeTaglineEl.style.display = store.tagline ? "" : "none";
    }

    const logo = storeLogo(store);
    if (storeLogoEl) {
        if (logo) {
            storeLogoEl.src = logo;
            storeLogoEl.alt = store.name || store.id;
            storeLogoEl.style.display = "";
        } else {
            storeLogoEl.style.display = "none";
        }
    }

    // Sekme başlığı da mağazayı yansıtsın
    document.title = `${store.name || store.id} | Hexadigital`;
    storeHero.style.display = "";
}

async function init() {
    // Mağaza seçilmemiş → seçim ekranı
    if (!STORE_ID) {
        await showStorePicker();
        return;
    }

    try {
        store = await getStore(STORE_ID);
    } catch (err) {
        console.error("Mağaza okunamadı:", err);
        showStoreNotFound();
        return;
    }

    // Yok veya pasif → bulunamadı
    if (!store || store.active === false) {
        showStoreNotFound();
        return;
    }

    renderStoreHero();
    wireCartEvents();
    wireToolbar();
    updateBadge();
    renderCart();
    loadProducts();
}

/** Mağaza içi arama + sıralama olaylarını bağlar. */
function wireToolbar() {
    if (toolbar) toolbar.style.display = "";

    let debounce = null;
    searchInput?.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(applyFilter, 180);
    });

    // Enter'da sayfa yenilenmesin
    searchInput?.closest("form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        applyFilter();
    });

    searchClear?.addEventListener("click", () => {
        searchInput.value = "";
        searchInput.focus();
        applyFilter();
    });

    sortSelect?.addEventListener("change", applyFilter);
}

init();
