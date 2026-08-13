// ============================================================================
// Ürün kartı — mağaza sayfası (shop.js) ve ana sayfa vitrini (home.js) ortak
// kullanır. Kart işaretlemesi tek yerde durur.
// ============================================================================

import { getImages } from "./images.js";

/** HTML kaçışı (XSS koruması — admin metinleri olduğu gibi basılmasın) */
export function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

export function formatPrice(n) {
    return Number(n).toLocaleString("tr-TR");
}

// Görsel yokken gösterilecek hexagon placeholder (SVG)
export const PLACEHOLDER_SVG = `
    <svg class="product-card__placeholder" width="64" height="64" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    </svg>`;

/**
 * Tek bir ürün kartının HTML'ini üretir.
 * @param {object} p         ürün
 * @param {object} [opts]
 * @param {string} [opts.storeLabel]  kartta gösterilecek mağaza adı (vitrin için)
 * @param {string} [opts.storeHref]   mağaza linki (vitrin için)
 * @param {boolean} [opts.clickable]  karta tıklayınca ürün detay popup'ı açılsın mı
 */
export function productCardHtml(p, opts = {}) {
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
        media = `<div class="product-card__media">${slides}${dots}</div>`;
    }

    // Vitrin kartlarında ürünün hangi mağazaya ait olduğu görünsün
    const storeLine = opts.storeLabel
        ? `<a class="product-card__store" href="${esc(opts.storeHref || "#")}">${esc(opts.storeLabel)}</a>`
        : "";

    // Ana sayfada "Sepete Ekle" yerine mağazaya yönlendirme yapılır:
    // sepet mağazaya özel olduğu için ürün kendi mağazasında sepete eklenmeli.
    const action = opts.storeHref
        ? `<a class="btn btn--primary btn-sm" href="${esc(opts.storeHref)}">İncele</a>`
        : `<button class="btn btn--primary btn-sm" data-add="${esc(p.id)}">Sepete Ekle</button>`;

    return `
        ${media}
        <div class="product-card__body">
            ${storeLine}
            <h3 class="product-card__title">${esc(p.name)}</h3>
            <p class="product-card__desc">${esc(p.description || "")}</p>
            <div class="product-card__footer">
                <span class="product-card__price">${formatPrice(p.price)} TL</span>
                ${action}
            </div>
        </div>`;
}

/**
 * Ürün dizisini bir grid'e basar.
 * @returns {HTMLElement[]} oluşturulan kart elemanları
 */
export function renderProductCards(grid, products, opts = {}) {
    grid.innerHTML = "";
    const cards = products.map((p, i) => {
        const cardOpts = typeof opts === "function" ? opts(p) : opts;
        const card = document.createElement("article");
        card.className = "card product-card reveal";
        // Tıklanabilir kartlarda imleç + "detay" ipucu (CSS bu sınıfa bakar)
        if (cardOpts.clickable) {
            card.classList.add("product-card--clickable");
            card.title = "Detayları görmek için tıklayın";
        }
        if (i % 3 === 1) card.classList.add("reveal-delay-1");
        if (i % 3 === 2) card.classList.add("reveal-delay-2");
        card.innerHTML = productCardHtml(p, cardOpts);
        grid.appendChild(card);
        return card;
    });

    // Kartlar JS ile sonradan eklendiği için main.js'in IntersectionObserver'ı
    // bunları yakalamaz; 'reveal' opacity:0 bırakır. Bir sonraki frame'de
    // 'active' ekleyerek görünür yap + giriş animasyonunu tetikle.
    requestAnimationFrame(() => cards.forEach(c => c.classList.add("active")));
    return cards;
}

/**
 * Çok görselli kartlarda otomatik slide döngüsü kurar.
 * @returns {number} interval id (temizlemek için)
 */
export function setupSlides(grid, prevTimer = null) {
    if (prevTimer) clearInterval(prevTimer);

    // Her ~3 sn'de tüm kartların aktif görselini bir ileri al
    return setInterval(() => {
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
