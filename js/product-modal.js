// ============================================================================
// Ürün detay popup'ı — karta tıklayınca açılır.
// Sol: dikey (uzunlamasına) görsel alanı, sağ/sol oklarla geçişli.
// Sağ: ürün adı, fiyat, açıklama, kategoriye özel özellik tablosu.
// Sağ altta "Sepete Ekle" — eklenince popup kapanır.
//
// Markup tek seferde body'ye enjekte edilir (her sayfaya HTML kopyalamamak için).
// ============================================================================

import { esc, formatPrice, PLACEHOLDER_SVG } from "./product-card.js";
import { getImages } from "./images.js";
import { specRows, categoryName } from "./specs.js";
import { getOptions, validateSelections } from "./options.js";

let root = null;        // popup kök elemanı
let els = null;         // sık kullanılan iç elemanlar
let images = [];        // o an gösterilen ürünün görselleri
let index = 0;          // aktif görsel
let current = null;     // o an açık ürün
let onAdd = null;       // "Sepete Ekle" geri çağrısı — açılışta verilir
let selections = {};    // müşterinin yaptığı seçimler { color: "Siyah" }

/** Popup iskeletini bir kez oluşturur. */
function ensureRoot() {
    if (root) return;

    root = document.createElement("div");
    root.className = "pm-overlay";
    root.id = "product-modal";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
        <div class="pm-dialog" role="dialog" aria-modal="true" aria-labelledby="pm-title">
            <button class="pm-close" data-pm-close aria-label="Kapat">&times;</button>

            <div class="pm-gallery">
                <div class="pm-stage" data-pm-stage>
                    <img class="pm-img" data-pm-img src="" alt="">
                </div>
                <button class="pm-nav pm-nav--prev" data-pm-prev aria-label="Önceki görsel">&#10094;</button>
                <button class="pm-nav pm-nav--next" data-pm-next aria-label="Sonraki görsel">&#10095;</button>
                <div class="pm-thumbs" data-pm-thumbs></div>
                <div class="pm-counter" data-pm-counter></div>
            </div>

            <div class="pm-info">
                <div class="pm-info__scroll">
                    <span class="pm-category" data-pm-category></span>
                    <h2 class="pm-title" id="pm-title" data-pm-title></h2>
                    <div class="pm-price" data-pm-price></div>
                    <p class="pm-desc" data-pm-desc></p>
                    <div class="pm-options" data-pm-options></div>
                    <div class="pm-specs" data-pm-specs></div>
                </div>
                <div class="pm-actions">
                    <span class="pm-warn" data-pm-warn></span>
                    <button class="btn btn--primary pm-add" data-pm-add>Sepete Ekle</button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(root);

    const q = sel => root.querySelector(sel);
    els = {
        dialog:   q(".pm-dialog"),
        img:      q("[data-pm-img]"),
        stage:    q("[data-pm-stage]"),
        prev:     q("[data-pm-prev]"),
        next:     q("[data-pm-next]"),
        thumbs:   q("[data-pm-thumbs]"),
        counter:  q("[data-pm-counter]"),
        category: q("[data-pm-category]"),
        title:    q("[data-pm-title]"),
        price:    q("[data-pm-price]"),
        desc:     q("[data-pm-desc]"),
        specs:    q("[data-pm-specs]"),
        options:  q("[data-pm-options]"),
        warn:     q("[data-pm-warn]"),
        add:      q("[data-pm-add]")
    };

    // Kapatma: × veya diyalog dışındaki boşluk
    root.querySelector("[data-pm-close]").addEventListener("click", closeProductModal);
    root.addEventListener("click", (e) => {
        if (e.target === root) closeProductModal();
    });

    els.prev.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
    els.next.addEventListener("click", (e) => { e.stopPropagation(); step(1); });

    els.add.addEventListener("click", () => {
        if (!current || typeof onAdd !== "function") return;

        // Zorunlu seçimler eksikse popup KAPANMAZ; eksik alanlar işaretlenir
        const { ok, missing } = validateSelections(current, selections);
        if (!ok) {
            els.warn.textContent = `Lütfen seçin: ${missing.join(", ")}`;
            els.warn.style.display = "";
            markMissing();
            return;
        }

        onAdd(current, { ...selections });
        closeProductModal();
    });

    // Klavye: Esc kapat, ←/→ görsel geçişi
    document.addEventListener("keydown", (e) => {
        if (!isOpen()) return;
        if (e.key === "Escape") closeProductModal();
        else if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "ArrowRight") step(1);
    });

    // Mobilde görsel alanında kaydırarak geçiş
    let touchX = null;
    els.stage.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    els.stage.addEventListener("touchend", (e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
        touchX = null;
    }, { passive: true });
}

function isOpen() {
    return !!root && root.classList.contains("open");
}

/** Aktif görseli ve sayaç/thumb durumunu tazeler. */
function showImage(i) {
    if (!images.length) return;
    index = (i + images.length) % images.length;
    els.img.src = images[index];
    els.counter.textContent = `${index + 1} / ${images.length}`;
    els.thumbs.querySelectorAll(".pm-thumb").forEach((t, n) =>
        t.classList.toggle("active", n === index));
}

function step(delta) {
    if (images.length < 2) return;
    showImage(index + delta);
}

/**
 * Sepete eklemeden önceki seçimleri (renk vb.) çip listesi olarak basar.
 * Seçeneksiz üründe bölüm hiç görünmez.
 */
function renderOptions(product) {
    const opts = getOptions(product);

    if (!opts.length) {
        els.options.innerHTML = "";
        els.options.style.display = "none";
        return;
    }

    els.options.style.display = "";
    els.options.innerHTML = opts.map(o => `
        <div class="pm-option" data-opt-group="${esc(o.key)}">
            <div class="pm-option__label">
                ${esc(o.label || o.key)}
                ${o.required ? `<span class="pm-option__req">*</span>` : ""}
                <span class="pm-option__picked" data-opt-picked="${esc(o.key)}"></span>
            </div>
            <div class="pm-option__values">
                ${o.values.map(v => `
                    <button type="button" class="pm-chip"
                            data-opt-key="${esc(o.key)}" data-opt-val="${esc(v)}">
                        ${esc(v)}
                    </button>`).join("")}
            </div>
        </div>`).join("");

    els.options.querySelectorAll(".pm-chip").forEach(chip =>
        chip.addEventListener("click", () => {
            const key = chip.dataset.optKey;
            const val = chip.dataset.optVal;

            // Aynı çipe tekrar tıklamak seçimi kaldırır (zorunlu değilse anlamlı)
            if (selections[key] === val) delete selections[key];
            else selections[key] = val;

            syncOptionUi();
            // Seçim yapılınca uyarı kendiliğinden kalksın
            els.warn.style.display = "none";
            els.options.querySelectorAll(".pm-option--missing")
                .forEach(g => g.classList.remove("pm-option--missing"));
        }));

    syncOptionUi();
}

/** Çip aktifliklerini ve "seçildi" etiketlerini mevcut seçimlere göre günceller. */
function syncOptionUi() {
    els.options.querySelectorAll(".pm-chip").forEach(chip => {
        chip.classList.toggle("active", selections[chip.dataset.optKey] === chip.dataset.optVal);
    });
    els.options.querySelectorAll("[data-opt-picked]").forEach(el => {
        el.textContent = selections[el.dataset.optPicked] || "";
    });
}

/** Eksik zorunlu seçenek gruplarını görsel olarak işaretler. */
function markMissing() {
    const { missing } = validateSelections(current, selections);
    const missingKeys = getOptions(current)
        .filter(o => o.required && !selections[o.key])
        .map(o => o.key);

    els.options.querySelectorAll("[data-opt-group]").forEach(g => {
        g.classList.toggle("pm-option--missing", missingKeys.includes(g.dataset.optGroup));
    });

    // İlk eksik gruba kaydır — uzun sayfada gözden kaçmasın
    if (missing.length) {
        els.options.querySelector(".pm-option--missing")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

/** Özellik tablosunu üretir. Özellik yoksa bölüm hiç basılmaz. */
function renderSpecs(product) {
    const rows = specRows(product);
    if (!rows.length) {
        els.specs.innerHTML = "";
        els.specs.style.display = "none";
        return;
    }
    els.specs.style.display = "";
    els.specs.innerHTML = `
        <h3 class="pm-specs__heading">Ürün Bilgileri</h3>
        <dl class="pm-specs__list">
            ${rows.map(r => `
                <div class="pm-spec">
                    <dt>${esc(r.label)}</dt>
                    <dd>${esc(r.value)}</dd>
                </div>`).join("")}
        </dl>`;
}

/**
 * Ürün popup'ını açar.
 * @param {object} product
 * @param {object} [opts]
 * @param {number} [opts.startIndex]  hangi görselden başlanacağı
 * @param {(p:object)=>void} [opts.onAddToCart]  verilmezse buton gizlenir
 */
export function openProductModal(product, opts = {}) {
    if (!product) return;
    ensureRoot();

    current = product;
    onAdd = opts.onAddToCart || null;
    images = getImages(product);
    selections = {};   // her açılışta temiz başla

    // ---- Galeri ----
    const multi = images.length > 1;
    if (images.length) {
        els.img.style.display = "";
        els.img.alt = product.name || "";
        els.stage.querySelector(".pm-placeholder")?.remove();
    } else {
        // Görselsiz ürün — placeholder hexagon
        els.img.style.display = "none";
        els.img.src = "";
        if (!els.stage.querySelector(".pm-placeholder")) {
            const ph = document.createElement("div");
            ph.className = "pm-placeholder";
            ph.innerHTML = PLACEHOLDER_SVG;
            els.stage.appendChild(ph);
        }
    }

    els.prev.style.display = multi ? "" : "none";
    els.next.style.display = multi ? "" : "none";
    els.counter.style.display = multi ? "" : "none";

    els.thumbs.innerHTML = multi
        ? images.map((url, i) =>
            `<button class="pm-thumb${i === 0 ? " active" : ""}" data-i="${i}" type="button">
                <img src="${esc(url)}" alt="" loading="lazy">
             </button>`).join("")
        : "";
    els.thumbs.style.display = multi ? "" : "none";
    els.thumbs.querySelectorAll(".pm-thumb").forEach(b =>
        b.addEventListener("click", () => showImage(Number(b.dataset.i))));

    if (images.length) showImage(Math.min(Math.max(opts.startIndex || 0, 0), images.length - 1));

    // ---- Bilgiler ----
    const cat = categoryName(product.category);
    els.category.textContent = cat;
    els.category.style.display = cat ? "" : "none";

    els.title.textContent = product.name || "";
    els.price.textContent = `${formatPrice(product.price)} TL`;

    els.desc.textContent = product.description || "";
    els.desc.style.display = product.description ? "" : "none";

    renderOptions(product);
    renderSpecs(product);

    // ---- Aksiyon ----
    els.add.style.display = onAdd ? "" : "none";
    els.warn.style.display = "none";

    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    // Arka plan kaymasın
    document.body.classList.add("pm-lock");
    els.dialog.scrollTop = 0;
    root.querySelector(".pm-info__scroll").scrollTop = 0;
}

export function closeProductModal() {
    if (!root) return;
    root.classList.remove("open");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("pm-lock");
    current = null;
    onAdd = null;
    selections = {};
}
