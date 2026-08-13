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
import { coverImage } from "./images.js";
import { storeIdFromUrl, getStore, storeBanner, storeLogo } from "./stores.js";
import { renderStoreCards } from "./store-cards.js";
import {
    esc, formatPrice, renderProductCards, setupSlides as setupSlidesShared
} from "./product-card.js";
import { openProductModal } from "./product-modal.js";
import { computeDiscount } from "./discount.js";
import { hasOptions, selectionsLabel } from "./options.js";
import { validateCustomer, saveCustomer, loadCustomer, formatPhone } from "./customer.js";

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
const cartSummaryEl = document.getElementById("cart-summary");
const cartSubtotalEl = document.getElementById("cart-subtotal-amount");
const cartDiscountRow = document.getElementById("cart-discount-row");
const cartDiscountLabel = document.getElementById("cart-discount-label");
const cartDiscountAmount = document.getElementById("cart-discount-amount");
const cartNudgeEl = document.getElementById("cart-nudge");
const custNameEl = document.getElementById("cust-name");
const custPhoneEl = document.getElementById("cust-phone");
const custErrorEl = document.getElementById("cust-error");
const cartCheckout = document.getElementById("cart-checkout");
const cartClear = document.getElementById("cart-clear");

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

    const cards = renderProductCards(grid, products, { clickable: true });

    // Çoklu görselli kartlar için otomatik slide
    slideTimer = setupSlidesShared(grid, slideTimer);

    // Karta tıkla → ürün detay popup'ı (eski davranış: görseli büyüten lightbox)
    cards.forEach((card, i) => {
        card.addEventListener("click", (e) => {
            // "Sepete Ekle" ve diğer etkileşimli öğeler popup'ı açmasın
            if (e.target.closest("button, a")) return;
            openDetail(products[i], card);
        });
    });

    // "Sepete Ekle" butonları
    grid.querySelectorAll("[data-add]").forEach(btn => {
        btn.addEventListener("click", () => {
            const product = productMap.get(btn.dataset.add);
            if (!product) return;

            // Seçimli ürün doğrudan sepete eklenemez — önce renk/boyut seçilmeli.
            // Karttan eklemeye çalışınca popup açılır, seçim orada yapılır.
            if (hasOptions(product)) {
                const card = btn.closest(".product-card");
                openDetail(product, card);
                return;
            }

            addProductToCart(product);
            flashButton(btn);
        });
    });
}

let slideTimer = null;

/**
 * Ürünü sepete ekler (kapak görseliyle) ve bildirim gösterir.
 * @param {object} product
 * @param {object} [selections]  seçimli üründe { color: "Siyah" } gibi
 */
function addProductToCart(product, selections = null) {
    // Sepete kapak görseliyle ekle (çoklu görsel → ilk görsel)
    addToCart(STORE_ID, { ...product, imageUrl: coverImage(product) }, 1, selections);
    showCartToast(product.name, selections, product);
}

/** Ürün detay popup'ını, kartta o an görünen görselden başlatarak açar. */
function openDetail(product, card) {
    if (!product) return;
    const slides = card?.querySelectorAll(".pc-slide") || [];
    const start = [...slides].findIndex(s => s.classList.contains("active"));
    openProductModal(product, {
        startIndex: start < 0 ? 0 : start,
        onAddToCart: addProductToCart
    });
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

function showCartToast(name, selections = null, product = null) {
    // Drawer zaten açıksa toast'a gerek yok
    if (cartDrawer.classList.contains("open")) return;

    // Seçimli üründe hangi varyantın eklendiği görünsün ("Renk: Siyah")
    const sel = selections ? selectionsLabel(selections, product) : "";

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
        <span><strong>${esc(name)}</strong>${sel ? ` <em>(${esc(sel)})</em>` : ""} sepete eklendi</span>
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

/**
 * Ara toplam / indirim / toplam satırlarını günceller.
 * Mağazanın hiç indirim kuralı yoksa özet gizli kalır — tek satırlık
 * "Toplam" görünümü korunur.
 */
function renderCartSummary(cart) {
    // Sepetin TAMAMI verilir: adet/çeşit bazlı kurallar tutar dışındaki
    // ölçüleri de görebilsin (toptan, min adet, min çeşit).
    const d = computeDiscount(cart, store);

    cartTotalEl.textContent = `${formatPrice(d.total)} TL`;

    // Sepet boşken indirim özeti/teşviki anlamsız
    const hasRules = !!(d.discount || d.next);
    if (!cart.length || !hasRules) {
        cartSummaryEl.style.display = "none";
        cartNudgeEl.style.display = "none";
        return;
    }

    cartSummaryEl.style.display = "";
    cartSubtotalEl.textContent = `${formatPrice(d.subtotal)} TL`;

    if (d.discount) {
        cartDiscountRow.style.display = "";
        // Sepet geneli oran yoksa indirim yalnızca toptan satırlardan gelir
        cartDiscountLabel.textContent = d.percent
            ? `İndirim (%${d.percent})`
            : "Toptan alış indirimi";
        cartDiscountAmount.textContent = `−${formatPrice(d.discount)} TL`;
    } else {
        cartDiscountRow.style.display = "none";
    }

    // Teşvik metni artık kural türüne göre discount.js'te üretiliyor
    if (d.nextLabel) {
        cartNudgeEl.style.display = "";
        cartNudgeEl.textContent = d.nextLabel;
    } else {
        cartNudgeEl.style.display = "none";
    }
}

// Sepet içeriğini render et
function renderCart() {
    const cart = getCart(STORE_ID);
    updateBadge();
    renderCartSummary(cart);

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
        // Seçimli satırlarda varyant görünsün ("Renk: Siyah")
        const product = productMap.get(item.productId || item.id);
        const sel = item.selections ? selectionsLabel(item.selections, product) : "";

        return `
            <div class="cart-item">
                ${img}
                <div class="cart-item__info">
                    <div class="cart-item__name">${esc(item.name)}</div>
                    ${sel ? `<div class="cart-item__sel">${esc(sel)}</div>` : ""}
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

/** Müşteri formu hata mesajı (boş metin → gizler). */
function showCustomerError(msg) {
    if (!custErrorEl) return;
    custErrorEl.textContent = msg;
    custErrorEl.style.display = msg ? "" : "none";
    custNameEl?.classList.toggle("invalid", !!msg);
    custPhoneEl?.classList.toggle("invalid", !!msg);
}

/** Daha önce sipariş vermiş kullanıcının bilgilerini forma doldurur. */
function prefillCustomer() {
    const saved = loadCustomer();
    if (!saved) return;
    if (custNameEl && !custNameEl.value) custNameEl.value = saved.name || "";
    // Kayıtlı numara "5354101826" biçiminde; okunur hâle getir
    if (custPhoneEl && !custPhoneEl.value && saved.phone) {
        custPhoneEl.value = formatPhone(saved.phone);
    }
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

    // Kullanıcı yazmaya başlayınca hata mesajı kalksın
    [custNameEl, custPhoneEl].forEach(el =>
        el?.addEventListener("input", () => showCustomerError("")));

    prefillCustomer();

    // Sepet her değiştiğinde drawer + rozeti tazele
    window.addEventListener("cart:change", renderCart);
    // Diğer sekmelerden gelen değişiklikler (localStorage) — sadece BU mağazanınki
    window.addEventListener("storage", (e) => {
        if (e.key === cartKey(STORE_ID)) renderCart();
    });
}

async function checkout() {
    // Sipariş sahibi bilgileri — satıcı müşteriye ulaşabilmeli.
    // Doğrulama sipariş YAZILMADAN önce yapılır ki eksik bilgiyle kayıt oluşmasın.
    const { ok, error, customer } = validateCustomer(custNameEl?.value, custPhoneEl?.value);
    if (!ok) {
        showCustomerError(error);
        (String(custNameEl.value || "").trim().includes(" ") ? custPhoneEl : custNameEl).focus();
        return;
    }
    showCustomerError("");
    saveCustomer(customer);   // sonraki siparişte hazır gelsin

    const original = cartCheckout.innerHTML;
    cartCheckout.dataset.busy = "1";
    cartCheckout.style.pointerEvents = "none";
    cartCheckout.textContent = "Sipariş hazırlanıyor...";

    try {
        // 1) Siparişi Firestore'a yaz, key al (mağaza + müşteri bilgisiyle)
        const { key } = await createOrder(store, customer);
        // 2) Site içi sipariş sayfası linki üret
        const orderUrl = buildOrderUrl(key);
        // 3) WhatsApp metnini sepet DOLUYKEN üret (temizleme öncesi!)
        //    Numara mağazadan gelir; tanımsızsa burada hata fırlar ve sepet KORUNUR.
        const waUrl = buildWhatsappUrl(orderUrl, store, customer);
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
