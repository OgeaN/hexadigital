// ============================================================================
// Mağaza sayfası — Firestore'dan görünür ürünleri çeker, kartları render eder,
// sepet drawer'ını ve WhatsApp siparişini yönetir.
// ============================================================================

import {
    collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db, PRODUCTS_COLLECTION } from "./firebase-config.js";
import {
    getCart, addToCart, removeFromCart, setQty, clearCart,
    cartCount, cartTotal, buildWhatsappUrl
} from "./cart.js";
import { createOrder, buildOrderUrl } from "./order.js";
import { getImages, coverImage } from "./images.js";

// ---------- DOM ----------
const grid = document.getElementById("products-grid");
const status = document.getElementById("shop-status");
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

// HTML kaçışı (XSS koruması — admin metinleri olduğu gibi basılmasın)
function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function formatPrice(n) {
    return Number(n).toLocaleString("tr-TR");
}

// Görsel yokken gösterilecek hexagon placeholder (SVG)
const PLACEHOLDER_SVG = `
    <svg class="product-card__placeholder" width="64" height="64" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    </svg>`;

// ---------- Ürünleri yükle ----------
async function loadProducts() {
    try {
        const q = query(
            collection(db, PRODUCTS_COLLECTION),
            where("visible", "==", true)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            status.textContent = "Şu anda görüntülenecek ürün bulunmuyor.";
            status.style.display = "block";
            return;
        }

        const products = [];
        snap.forEach(doc => products.push({ id: doc.id, ...doc.data() }));

        renderProducts(products);
        status.style.display = "none";
    } catch (err) {
        console.error("Ürünler yüklenemedi:", err);
        status.textContent = "Ürünler yüklenirken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.";
        status.classList.add("error");
        status.style.display = "block";
    }
}

function renderProducts(products) {
    grid.innerHTML = "";
    products.forEach((p, i) => {
        productMap.set(p.id, p);

        const card = document.createElement("article");
        card.className = "card product-card reveal";
        if (i % 3 === 1) card.classList.add("reveal-delay-1");
        if (i % 3 === 2) card.classList.add("reveal-delay-2");

        const imgs = getImages(p);
        let media;
        if (imgs.length === 0) {
            media = `<div class="product-card__media">${PLACEHOLDER_SVG}</div>`;
        } else {
            // Tüm görselleri üst üste koy; ilki aktif. Slide ile geçiş yapılır.
            const slides = imgs.map((url, idx) =>
                `<img class="pc-slide${idx === 0 ? " active" : ""}" src="${esc(url)}" alt="${esc(p.name)}" loading="lazy">`
            ).join("");
            const dots = imgs.length > 1
                ? `<div class="pc-dots">${imgs.map((_, idx) => `<span class="pc-dot${idx === 0 ? " active" : ""}"></span>`).join("")}</div>`
                : "";
            media = `<div class="product-card__media" data-images="${esc(p.id)}" title="Büyütmek için tıkla">${slides}${dots}</div>`;
        }

        card.innerHTML = `
            ${media}
            <div class="product-card__body">
                <h3 class="product-card__title">${esc(p.name)}</h3>
                <p class="product-card__desc">${esc(p.description || "")}</p>
                <div class="product-card__footer">
                    <span class="product-card__price">${formatPrice(p.price)} TL</span>
                    <button class="btn btn--primary" data-add="${esc(p.id)}">Sepete Ekle</button>
                </div>
            </div>`;

        grid.appendChild(card);
    });

    // Çoklu görselli kartlar için otomatik slide + lightbox bağla
    setupSlides();
    setupLightbox();

    // Kartlar JS ile sonradan eklendiği için main.js'in IntersectionObserver'ı
    // bunları yakalamaz; 'reveal' opacity:0 bırakır. Bir sonraki frame'de
    // 'active' ekleyerek görünür yap + giriş animasyonunu tetikle.
    requestAnimationFrame(() => {
        grid.querySelectorAll(".product-card").forEach(card => card.classList.add("active"));
    });

    // "Sepete Ekle" butonları
    grid.querySelectorAll("[data-add]").forEach(btn => {
        btn.addEventListener("click", () => {
            const product = productMap.get(btn.dataset.add);
            if (!product) return;
            // Sepete kapak görseliyle ekle (çoklu görsel → ilk görsel)
            addToCart({ ...product, imageUrl: coverImage(product) });
            openCart();
            flashButton(btn);
        });
    });
}

// ---------- Otomatik görsel slide (çok görselli kartlar) ----------
let slideTimer = null;
function setupSlides() {
    if (slideTimer) clearInterval(slideTimer);

    // Her ~3 sn'de tüm kartların aktif görselini bir ileri al
    slideTimer = setInterval(() => {
        grid.querySelectorAll(".product-card__media").forEach(media => {
            const slides = media.querySelectorAll(".pc-slide");
            if (slides.length < 2) return;
            const dots = media.querySelectorAll(".pc-dot");
            let cur = [...slides].findIndex(s => s.classList.contains("active"));
            if (cur < 0) cur = 0;
            const next = (cur + 1) % slides.length;
            slides[cur].classList.remove("active");
            slides[next].classList.add("active");
            if (dots.length) {
                dots[cur]?.classList.remove("active");
                dots[next]?.classList.add("active");
            }
        });
    }, 3000);
}

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

// ---------- Sepet drawer ----------
function openCart() {
    cartDrawer.classList.add("open");
    cartOverlay.classList.add("open");
}

function closeCart() {
    cartDrawer.classList.remove("open");
    cartOverlay.classList.remove("open");
}

// Rozet güncelle
function updateBadge() {
    const count = cartCount();
    cartBadge.textContent = count;
    cartBadge.classList.toggle("visible", count > 0);
}

// Sepet içeriğini render et
function renderCart() {
    const cart = getCart();
    updateBadge();
    cartTotalEl.textContent = `${formatPrice(cartTotal())} TL`;

    if (cart.length === 0) {
        cartItemsEl.innerHTML = `<p class="cart-empty">Sepetiniz boş.</p>`;
        cartCheckout.classList.add("disabled");
        cartCheckout.style.pointerEvents = "none";
        cartCheckout.style.opacity = "0.5";
        return;
    }

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
        b.addEventListener("click", () => { removeFromCart(b.dataset.remove); }));
}

function changeQty(id, delta) {
    const item = getCart().find(i => i.id === id);
    if (!item) return;
    setQty(id, item.qty + delta);
}

// ---------- Olaylar ----------
cartToggle.addEventListener("click", () => {
    renderCart();
    openCart();
});
cartClose.addEventListener("click", closeCart);
cartOverlay.addEventListener("click", closeCart);

cartCheckout.addEventListener("click", async (e) => {
    e.preventDefault();
    if (getCart().length === 0 || cartCheckout.dataset.busy === "1") return;
    await checkout();
});

async function checkout() {
    const original = cartCheckout.innerHTML;
    cartCheckout.dataset.busy = "1";
    cartCheckout.style.pointerEvents = "none";
    cartCheckout.textContent = "Sipariş hazırlanıyor...";

    try {
        // 1) Siparişi Firestore'a yaz, key al
        const { key } = await createOrder();
        // 2) Site içi sipariş sayfası linki üret
        const orderUrl = buildOrderUrl(key);
        // 3) WhatsApp metnini sepet DOLUYKEN üret (temizleme öncesi!)
        const waUrl = buildWhatsappUrl(orderUrl);
        // 4) Sepeti temizle (sipariş kaydedildi)
        clearCart();
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

cartClear.addEventListener("click", () => {
    clearCart();
});

// Sepet her değiştiğinde drawer + rozeti tazele
window.addEventListener("cart:change", renderCart);
// Diğer sekmelerden gelen değişiklikler (localStorage)
window.addEventListener("storage", (e) => {
    if (e.key === "hexa_cart") renderCart();
});

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

// ---------- Başlangıç ----------
updateBadge();
renderCart();
loadProducts();
