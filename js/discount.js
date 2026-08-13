// ============================================================================
// Mağaza indirimleri — koşullu, yüzdelik indirim kuralları.
//
// Mağaza dokümanında `discountRules` dizisi olarak tutulur:
//   [{ type: "min-total",     minTotal: 2000, percent: 10 },
//    { type: "min-qty",       minQty: 10,     percent: 15 },
//    { type: "min-item-qty",  minQty: 10,     percent: 20 },
//    { type: "min-lines",     minLines: 3,    percent: 5  }]
//
// KOŞUL TÜRLERİ:
//   min-total     → sepet TUTARI eşiği (2000 TL üzeri %10)
//   min-qty       → sepetteki TOPLAM ADET eşiği (karışık 10 ürün %15)
//   min-item-qty  → AYNI üründen adet eşiği (toptan alış: aynı üründen 10+ %20)
//   min-lines     → sepetteki FARKLI ÜRÜN sayısı eşiği (3 çeşit alana %5)
//
// UYGULAMA KURALI: Koşulu sağlayan kurallar arasından EN YÜKSEK yüzdeli olan
// seçilir; kurallar birbirine EKLENMEZ. Böylece kademeli indirim yazılabilir
// (2000→%10, 5000→%15) ve müşteri her zaman hak ettiği en iyi oranı alır.
//
// KAPSAM: min-total / min-qty / min-lines sepetin TAMAMINA uygulanır.
// min-item-qty ise YALNIZCA eşiği aşan ürün satırlarına uygulanır — "aynı
// üründen 10 alana %20" kuralı, sepetteki tek bir kalemden alınan diğer
// ürünleri de indirime sokmamalı.
// ============================================================================

export const DISCOUNT_TYPE_MIN_TOTAL = "min-total";
export const DISCOUNT_TYPE_MIN_QTY = "min-qty";
export const DISCOUNT_TYPE_MIN_ITEM_QTY = "min-item-qty";
export const DISCOUNT_TYPE_MIN_LINES = "min-lines";

/**
 * Koşul türlerinin tanımı — admin formu ve etiketler buradan üretilir.
 * Yeni tür eklemek için: buraya bir giriş + matches() içine bir dal.
 */
export const DISCOUNT_TYPES = [
    {
        id: DISCOUNT_TYPE_MIN_TOTAL,
        label: "Sepet tutarı",
        // Eşik alanının adı ve arayüzdeki gösterimi
        field: "minTotal",
        unit: "TL",
        lead: "Sepet tutarı",
        tail: "TL ve üzeriyse",
        hint: "Sepetin toplam tutarı eşiği aşarsa tüm sepete uygulanır.",
        placeholder: "2000"
    },
    {
        id: DISCOUNT_TYPE_MIN_QTY,
        label: "Toplam ürün adedi",
        field: "minQty",
        unit: "adet",
        lead: "Sepetteki toplam",
        tail: "adet ve üzeriyse",
        hint: "Sepetteki tüm ürünlerin adet toplamı eşiği aşarsa tüm sepete uygulanır.",
        placeholder: "10"
    },
    {
        id: DISCOUNT_TYPE_MIN_ITEM_QTY,
        label: "Aynı üründen adet (toptan)",
        field: "minQty",
        unit: "adet",
        lead: "Aynı üründen",
        tail: "adet ve üzeriyse",
        hint: "Toptan alış: yalnızca eşiği aşan ürün satırlarına uygulanır, sepetin tamamına değil.",
        placeholder: "10"
    },
    {
        id: DISCOUNT_TYPE_MIN_LINES,
        label: "Farklı ürün çeşidi",
        field: "minLines",
        unit: "çeşit",
        lead: "Sepette",
        tail: "farklı ürün varsa",
        hint: "Sepetteki birbirinden farklı ürün sayısı eşiği aşarsa tüm sepete uygulanır.",
        placeholder: "3"
    }
];

/** Tür tanımını id ile döndürür (bilinmeyen → null). */
export function getDiscountType(id) {
    return DISCOUNT_TYPES.find(t => t.id === id) || null;
}

/** Bu tür sepetin tamamına mı uygulanır? (min-item-qty yalnız kendi satırına) */
function isCartWide(type) {
    return type !== DISCOUNT_TYPE_MIN_ITEM_QTY;
}

/**
 * Mağaza dokümanındaki ham kuralları temizler: geçersizleri eler,
 * sayıya çevirir, eşiğe göre sıralar.
 * Eski kayıtlarda `type` yoktur → min-total sayılır (geriye dönük uyumluluk).
 */
export function normalizeRules(store) {
    const raw = Array.isArray(store?.discountRules) ? store.discountRules : [];

    return raw
        .map(r => {
            const type = r?.type || DISCOUNT_TYPE_MIN_TOTAL;
            const def = getDiscountType(type);
            if (!def) return null;

            // Eşik, türün kendi alanından okunur; eski min-total kayıtları
            // `minTotal` taşıdığı için o alan doğrudan eşleşir.
            const threshold = Number(r?.[def.field]) || 0;
            const percent = Number(r?.percent) || 0;

            return { type, threshold, percent, [def.field]: threshold };
        })
        .filter(r =>
            r &&
            r.percent > 0 && r.percent <= 100 &&
            r.threshold >= 0
        )
        .sort((a, b) => a.threshold - b.threshold);
}

/** Sepet dizisinden ölçüleri çıkarır. */
function cartMetrics(items) {
    const list = Array.isArray(items) ? items : [];
    let total = 0;
    let qty = 0;
    for (const i of list) {
        total += (Number(i.price) || 0) * (Number(i.qty) || 0);
        qty += Number(i.qty) || 0;
    }
    return { total, qty, lines: list.length };
}

/** Kural, verilen sepet ölçüleriyle sağlanıyor mu? (sepet geneli kurallar) */
function matches(rule, m) {
    switch (rule.type) {
        case DISCOUNT_TYPE_MIN_TOTAL: return m.total >= rule.threshold;
        case DISCOUNT_TYPE_MIN_QTY:   return m.qty >= rule.threshold;
        case DISCOUNT_TYPE_MIN_LINES: return m.lines >= rule.threshold;
        default: return false;
    }
}

/**
 * Sepet için geçerli indirimi hesaplar.
 *
 * @param {Array<{price:number, qty:number}>|number} cart
 *        Sepet dizisi. Geriye dönük uyumluluk için SAYI da kabul edilir
 *        (yalnız tutar bilinir → sadece min-total kuralları çalışır).
 * @param {object} store  mağaza dokümanı
 * @returns {{
 *   subtotal:number, discount:number, total:number, percent:number,
 *   rule:object|null, lines:Array, next:object|null, missing:number,
 *   nextLabel:string
 * }}
 *   percent → sepet geneli oran (satır bazlı indirimde 0 olabilir)
 *   lines   → satır bazlı indirim uygulanan kalemler
 */
export function computeDiscount(cart, store) {
    // Sayı geldiyse tek kalemlik sanal sepet gibi davran (eski çağrılar)
    const numeric = typeof cart === "number";
    const items = numeric ? [] : (Array.isArray(cart) ? cart : []);
    const m = numeric
        ? { total: Number(cart) || 0, qty: 0, lines: 0 }
        : cartMetrics(items);

    const rules = normalizeRules(store);
    const subtotal = m.total;

    // ---- 1) Sepet geneli kurallar: en yüksek yüzde kazanır ----
    let best = null;
    for (const r of rules) {
        if (isCartWide(r.type) && matches(r, m) && (!best || r.percent > best.percent)) {
            best = r;
        }
    }
    const cartPercent = best ? best.percent : 0;

    // ---- 2) Satır bazlı kurallar (toptan): her kaleme kendi en iyi oranı ----
    // Satır, sepet geneli orandan daha iyi bir oran yakalarsa onu kullanır.
    //
    // ADET, VARYANT DEĞİL ÜRÜN BAZINDA sayılır: 6 siyah + 4 beyaz vazo,
    // "aynı üründen 10 adet" kuralını karşılar ve indirim her iki satıra da
    // uygulanır. Renk seçimi toptan alışı bölmemeli.
    const itemRules = rules.filter(r => r.type === DISCOUNT_TYPE_MIN_ITEM_QTY);
    const qtyByProduct = new Map();
    for (const item of items) {
        const pid = item.productId || item.id;
        qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + (Number(item.qty) || 0));
    }

    const lines = [];
    let discount = 0;

    for (const item of items) {
        const qty = Number(item.qty) || 0;
        const lineTotal = (Number(item.price) || 0) * qty;
        // Eşik karşılaştırması ürünün TÜM varyantlarının toplamıyla yapılır
        const productQty = qtyByProduct.get(item.productId || item.id) || qty;

        let linePercent = cartPercent;
        let lineRule = best;
        for (const r of itemRules) {
            if (productQty >= r.threshold && r.percent > linePercent) {
                linePercent = r.percent;
                lineRule = r;
            }
        }

        const amount = Math.round(lineTotal * linePercent / 100);
        discount += amount;

        if (amount > 0 && lineRule?.type === DISCOUNT_TYPE_MIN_ITEM_QTY) {
            lines.push({
                id: item.id || "",
                name: item.name || "",
                qty,
                percent: linePercent,
                amount
            });
        }
    }

    // Sayı olarak çağrıldıysa satır döngüsü çalışmaz — sepet oranını uygula
    if (numeric) discount = Math.round(subtotal * cartPercent / 100);

    // ---- 3) Bir sonraki kademe (teşvik mesajı) ----
    const next = findNext(rules, m, cartPercent, items);

    return {
        subtotal,
        discount,
        total: subtotal - discount,
        percent: cartPercent,
        rule: best,
        lines,
        next: next?.rule || null,
        missing: next?.missing || 0,
        nextLabel: next?.label || ""
    };
}

/**
 * Müşteriyi bir üst kademeye çeken en yakın kuralı bulur.
 * "X TL daha ekleyin" / "2 adet daha ekleyin" gibi mesajlar buradan üretilir.
 */
function findNext(rules, m, currentPercent, items) {
    // Boş sepette teşvik anlamsız ("3 farklı ürün ekleyin" gibi)
    if (!m.total && !m.qty && !m.lines) return null;

    let best = null;

    for (const r of rules) {
        if (r.percent <= currentPercent) continue;

        let missing = 0;
        let label = "";

        if (r.type === DISCOUNT_TYPE_MIN_TOTAL) {
            if (m.total >= r.threshold) continue;
            missing = r.threshold - m.total;
            label = `${missing.toLocaleString("tr-TR")} TL daha ekleyin, %${r.percent} indirim kazanın!`;
        } else if (r.type === DISCOUNT_TYPE_MIN_QTY) {
            if (m.qty >= r.threshold) continue;
            missing = r.threshold - m.qty;
            label = `${missing} adet daha ekleyin, %${r.percent} indirim kazanın!`;
        } else if (r.type === DISCOUNT_TYPE_MIN_LINES) {
            if (m.lines >= r.threshold) continue;
            missing = r.threshold - m.lines;
            label = `${missing} farklı ürün daha ekleyin, %${r.percent} indirim kazanın!`;
        } else if (r.type === DISCOUNT_TYPE_MIN_ITEM_QTY) {
            // Eşiğe EN YAKIN ürünü göster — "3 adet daha" gibi somut bir hedef.
            // Adet ürün bazında toplanır (indirim hesabıyla aynı kural).
            const byProduct = new Map();
            for (const it of items) {
                const pid = it.productId || it.id;
                const prev = byProduct.get(pid);
                const qty = (prev?.qty || 0) + (Number(it.qty) || 0);
                byProduct.set(pid, { qty, name: prev?.name || it.name });
            }

            let closest = null;
            for (const { qty, name } of byProduct.values()) {
                if (qty >= r.threshold) continue;
                const need = r.threshold - qty;
                if (!closest || need < closest.need) closest = { need, name };
            }
            if (!closest) continue;
            missing = closest.need;
            label = `"${closest.name}" ürününden ${missing} adet daha alın, o üründe %${r.percent} indirim kazanın!`;
        } else {
            continue;
        }

        // En kolay ulaşılabilir kademeyi öner (en az eksik olan)
        if (!best || missing < best.missing) best = { rule: r, missing, label };
    }

    return best;
}

/** Kuralın insan okunur özeti: "2.000 TL üzeri %10 indirim" */
export function ruleLabel(rule) {
    const def = getDiscountType(rule?.type || DISCOUNT_TYPE_MIN_TOTAL);
    const pct = Number(rule?.percent) || 0;
    const val = Number(rule?.threshold ?? rule?.[def?.field]) || 0;

    if (!def) return `%${pct} indirim`;

    switch (def.id) {
        case DISCOUNT_TYPE_MIN_TOTAL:
            return `${val.toLocaleString("tr-TR")} TL üzeri %${pct} indirim`;
        case DISCOUNT_TYPE_MIN_QTY:
            return `Toplam ${val} adet ve üzeri %${pct} indirim`;
        case DISCOUNT_TYPE_MIN_ITEM_QTY:
            return `Aynı üründen ${val} adet ve üzeri %${pct} indirim`;
        case DISCOUNT_TYPE_MIN_LINES:
            return `${val} farklı ürün alana %${pct} indirim`;
        default:
            return `%${pct} indirim`;
    }
}

/**
 * Siparişe yazılacak indirim anlık görüntüsü. Sipariş tarihsel bir kayıttır:
 * mağaza kuralları sonradan değişse bile sipariş aynı kalmalı.
 * İndirim yoksa null döner — eski siparişlerle aynı şekil.
 */
export function discountSnapshot(cart, store) {
    const d = computeDiscount(cart, store);
    if (!d.discount) return null;

    return {
        // Sepet geneli kural (varsa) — eski alan adları korunur
        type: d.rule?.type || DISCOUNT_TYPE_MIN_ITEM_QTY,
        percent: d.percent,
        minTotal: d.rule?.type === DISCOUNT_TYPE_MIN_TOTAL ? d.rule.threshold : 0,
        threshold: d.rule?.threshold || 0,
        amount: d.discount,
        // Satır bazlı (toptan) indirimler — sipariş detayında ve PDF'te listelenir
        lines: d.lines,
        // Hazır etiket: gösterim tarafı kural mantığını tekrar bilmek zorunda kalmasın
        label: d.rule ? ruleLabel(d.rule) : "Toptan alış indirimi"
    };
}
