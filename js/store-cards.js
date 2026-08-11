// ============================================================================
// Mağaza kartı render'ı — ana sayfa vitrini (home.js) ve shop.html'in mağaza
// seçici hâli aynı işaretlemeyi kullansın diye ortak modül.
// ============================================================================

import { getActiveStores, buildStoreShopUrl, storeBanner, storeLogo } from "./stores.js";
import { esc } from "./product-card.js";

export { esc };

/** Tek bir mağaza kartının HTML'ini üretir. */
export function storeCardHtml(store, index = 0) {
    const banner = storeBanner(store);
    const logo = storeLogo(store);

    // Arkaplanı CSS değişkeniyle ver; banner yoksa düz koyu zemine düş.
    const bgStyle = banner
        ? ` style="--store-banner: url('${esc(banner)}')"`
        : "";
    const noBanner = banner ? "" : " store-card--no-banner";

    // reveal gecikmeleri mevcut kart diliyle aynı (main.css)
    const delay = index % 3 === 1 ? " reveal-delay-1"
                : index % 3 === 2 ? " reveal-delay-2" : "";

    const logoHtml = logo
        ? `<img class="store-card__logo" src="${esc(logo)}" alt="${esc(store.name)}" loading="lazy">`
        : "";

    const taglineHtml = store.tagline
        ? `<p class="store-card__tagline">${esc(store.tagline)}</p>`
        : "";

    return `
        <a class="store-card reveal${delay}${noBanner}"
           href="${esc(buildStoreShopUrl(store.id))}"${bgStyle}>
            ${logoHtml}
            <h3 class="store-card__name">${esc(store.name || store.id)}</h3>
            ${taglineHtml}
            <span class="store-card__cta">Mağazaya git</span>
        </a>`;
}

/**
 * Kartlar JS ile sonradan eklendiği için main.js'in IntersectionObserver'ı
 * bunları yakalamaz; 'reveal' opacity:0 bırakır. Bir sonraki frame'de
 * 'active' ekleyerek görünür yap + giriş animasyonunu tetikle.
 */
export function revealCards(grid, selector = ".store-card") {
    requestAnimationFrame(() => {
        grid.querySelectorAll(selector).forEach(c => c.classList.add("active"));
    });
}

/**
 * Aktif mağazaları verilen grid'e render eder (shop.html mağaza seçicisi için).
 * @param {HTMLElement} grid    kartların basılacağı kapsayıcı
 * @param {HTMLElement} status  yükleniyor / boş / hata mesajı elemanı
 */
export async function renderStoreCards(grid, status) {
    if (!grid) return [];

    try {
        const stores = await getActiveStores();

        if (stores.length === 0) {
            if (status) {
                status.textContent = "Henüz mağaza tanımlanmamış.";
                status.style.display = "block";
            }
            return [];
        }

        grid.innerHTML = stores.map(storeCardHtml).join("");
        if (status) status.style.display = "none";
        revealCards(grid);

        return stores;
    } catch (err) {
        console.error("Mağazalar yüklenemedi:", err);
        if (status) {
            status.textContent = "Mağazalar yüklenirken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.";
            status.classList.add("error");
            status.style.display = "block";
        }
        return [];
    }
}
