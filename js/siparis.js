// ============================================================================
// Sipariş görüntüleme sayfası — URL'deki ?id=KEY ile siparişi Firestore'dan
// çeker, görselli listeyi gösterir, "PDF İndir" butonunu bağlar.
// ============================================================================

import { getOrder } from "./order.js";
import { formatPhone as formatCustomerPhone } from "./customer.js";
// pdf.js (jsPDF CDN) sadece PDF indirilirken yüklenir — sayfa render'ını bloklamasın

const $ = id => document.getElementById(id);
const statusEl = $("order-status");
const itemsEl = $("order-items");
const totalEl = $("order-total");
const totalAmountEl = $("order-total-amount");
const summaryEl = $("order-summary");
const subtotalAmountEl = $("order-subtotal-amount");
const discountLabelEl = $("order-discount-label");
const discountAmountEl = $("order-discount-amount");
const discountLinesEl = $("order-discount-lines");
const customerEl = $("order-customer");
const customerNameEl = $("order-customer-name");
const customerPhoneEl = $("order-customer-phone");
const metaEl = $("order-meta");
const btnPdf = $("btn-pdf");
const storeEl = $("order-store");
const storeLogoEl = $("order-store-logo");
const storeNameEl = $("order-store-name");
const storeWaEl = $("order-store-wa");

let currentOrder = null;
let currentKey = null;

function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
function formatPrice(n) { return Number(n).toLocaleString("tr-TR"); }

// Görsel yoksa placeholder hexagon
const PLACEHOLDER = `
    <svg class="product-card__placeholder" width="40" height="40" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    </svg>`;

function getKeyFromUrl() {
    return new URLSearchParams(location.search).get("id");
}

async function init() {
    currentKey = getKeyFromUrl();
    if (!currentKey) {
        showStatus("Geçersiz sipariş bağlantısı (id eksik).", true);
        return;
    }

    try {
        const order = await getOrder(currentKey);
        if (!order) {
            showStatus("Sipariş bulunamadı. Bağlantı hatalı veya sipariş silinmiş olabilir.", true);
            return;
        }
        currentOrder = order;
        renderOrder(order);
    } catch (err) {
        console.error("Sipariş yüklenemedi:", err);
        showStatus("Sipariş yüklenirken bir sorun oluştu.", true);
    }
}

function showStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("error", isError);
    statusEl.style.display = "block";
}

/** "905354101826" → "+90 535 410 18 26" */
function formatPhone(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("90")) {
        return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
    }
    return d ? "+" + d : "";
}

/** Siparişin verildiği mağazayı gösterir. Eski siparişlerde `store` yoktur. */
function renderStore(order) {
    const store = order.store;
    if (!store?.name) {
        storeEl.style.display = "none";
        return;
    }

    storeNameEl.textContent = store.name;

    if (store.logoUrl) {
        storeLogoEl.src = store.logoUrl;
        storeLogoEl.alt = store.name;
        storeLogoEl.style.display = "";
    } else {
        storeLogoEl.style.display = "none";
    }

    const phone = formatPhone(store.whatsapp);
    if (phone) {
        storeWaEl.textContent = `WhatsApp: ${phone}`;
        storeWaEl.href = `https://wa.me/${String(store.whatsapp).replace(/\D/g, "")}`;
        storeWaEl.style.display = "";
    } else {
        storeWaEl.style.display = "none";
    }

    storeEl.style.display = "flex";
}

/** Sipariş sahibi bilgileri. Eski siparişlerde `customer` alanı yoktur. */
function renderCustomer(order) {
    const c = order.customer;
    if (!c?.name) {
        customerEl.style.display = "none";
        return;
    }

    customerNameEl.textContent = c.name;

    const pretty = formatCustomerPhone(c.phone);
    customerPhoneEl.textContent = pretty || "—";
    // Mobilde dokununca arama başlasın
    customerPhoneEl.href = c.phoneIntl ? `tel:+${c.phoneIntl}` : "#";

    customerEl.style.display = "";
}

function renderOrder(order) {
    statusEl.style.display = "none";

    const tarih = order.createdAt?.toDate
        ? order.createdAt.toDate().toLocaleString("tr-TR")
        : "";
    const storeName = order.store?.name;
    metaEl.textContent =
        `Sipariş No: ${currentKey}${tarih ? " • " + tarih : ""}${storeName ? " • " + storeName : ""}`;

    renderStore(order);
    renderCustomer(order);

    const items = order.items || [];
    itemsEl.innerHTML = items.map((item, i) => {
        const media = item.imageUrl
            ? `<img class="order-item__img" src="${esc(item.imageUrl)}" alt="${esc(item.name)}">`
            : `<div class="order-item__img order-item__img--ph">${PLACEHOLDER}</div>`;
        const lineTotal = (Number(item.price) || 0) * item.qty;
        // Sepete eklenirken yapılan seçimler (renk vb.) — eski siparişlerde yok
        const sel = item.selectionsLabel || "";
        return `
            <div class="order-item">
                ${media}
                <div class="order-item__info">
                    <div class="order-item__name">${i + 1}. ${esc(item.name)}</div>
                    ${sel ? `<div class="order-item__sel">${esc(sel)}</div>` : ""}
                    <div class="order-item__meta">${item.qty} adet × ${formatPrice(item.price)} TL</div>
                </div>
                <div class="order-item__total">${formatPrice(lineTotal)} TL</div>
            </div>`;
    }).join("");

    // İndirim özeti — yalnızca indirimli siparişlerde. Eski siparişlerde
    // `discount` alanı hiç yoktur; o durumda tek satırlık toplam gösterilir.
    const discount = order.discount;
    if (discount?.amount > 0) {
        const subtotal = Number(order.subtotal) || (Number(order.total) + discount.amount);
        subtotalAmountEl.textContent = `${formatPrice(subtotal)} TL`;

        // Sepet geneli oran varsa yüzdeyi göster; yoksa indirim yalnızca
        // toptan (satır bazlı) kurallardan geliyordur.
        discountLabelEl.textContent = discount.percent
            ? `İndirim (%${discount.percent})`
            : (discount.label || "Toptan alış indirimi");
        discountAmountEl.textContent = `−${formatPrice(discount.amount)} TL`;

        // Satır bazlı toptan indirimleri tek tek listele
        const lines = Array.isArray(discount.lines) ? discount.lines : [];
        discountLinesEl.innerHTML = lines.map(l => `
            <div class="order-summary__row order-summary__row--sub">
                <span>${esc(l.name)} × ${l.qty} (%${l.percent})</span>
                <span>−${formatPrice(l.amount)} TL</span>
            </div>`).join("");

        summaryEl.style.display = "";
    } else {
        summaryEl.style.display = "none";
    }

    totalAmountEl.textContent = `${formatPrice(order.total)} TL`;
    totalEl.style.display = "flex";
    btnPdf.style.display = "inline-flex";
}

// ---- PDF indir ----
btnPdf.addEventListener("click", async () => {
    if (!currentOrder) return;
    const original = btnPdf.innerHTML;
    btnPdf.disabled = true;
    btnPdf.textContent = "PDF hazırlanıyor...";
    try {
        // pdf.js'i (jsPDF CDN) ilk PDF indirme anında yükle
        const { buildOrderPdf } = await import("./pdf.js");
        const { doc, fileName, corsBlocked } = await buildOrderPdf(currentOrder.items, {
            total: currentOrder.total,
            subtotal: currentOrder.subtotal,
            discount: currentOrder.discount || null,
            orderKey: currentKey,
            storeId: currentOrder.storeId || "",
            store: currentOrder.store || null,
            customer: currentOrder.customer || null
        });
        doc.save(fileName);

        // Görseller CORS yüzünden inemediyse sessiz kalma — sorunu görünür kıl
        if (corsBlocked) {
            showStatus(
                "PDF oluşturuldu, ancak ürün görselleri eklenemedi. " +
                "Firebase Storage için CORS ayarı yapılmalı (yöneticiye bildirin).",
                true
            );
        }
    } catch (err) {
        console.error("PDF üretilemedi:", err);
        alert("PDF oluşturulamadı: " + (err.message || ""));
    } finally {
        btnPdf.innerHTML = original;
        btnPdf.disabled = false;
    }
});

init();
