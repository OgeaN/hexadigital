// ============================================================================
// Ürün seçenekleri — müşteri sepete eklemeden ÖNCE seçim yapar (renk vb.).
//
// Ürün dokümanında `options` dizisi olarak tutulur:
//   [{ key: "color", label: "Renk", required: true, values: ["Siyah", "Beyaz"] }]
//
// Seçim yapıldıktan sonra sepet satırına `selections` olarak yazılır:
//   { color: "Siyah" }
//
// SEPET KİMLİĞİ: Aynı üründen farklı renk ayrı satır olmalıdır. Bu yüzden
// sepet satırının id'si ürün id'si DEĞİL, seçimlerle birleştirilmiş bir
// bileşik anahtardır (cartLineId). Aksi hâlde siyah vazo eklendikten sonra
// beyaz vazo eklemek yalnızca adedi artırırdı.
// ============================================================================

/** Ürün seçeneklerini temizlenmiş hâlde döndürür (bozuk kayıtlar elenir). */
export function getOptions(product) {
    const raw = Array.isArray(product?.options) ? product.options : [];

    return raw
        .map(o => ({
            key: String(o?.key || "").trim(),
            label: String(o?.label || "").trim(),
            required: o?.required !== false,          // varsayılan: zorunlu
            values: Array.isArray(o?.values)
                ? o.values.map(v => String(v).trim()).filter(Boolean)
                : []
        }))
        .filter(o => o.key && o.values.length);
}

/** Bu ürün sepete eklenmeden önce seçim gerektiriyor mu? */
export function hasOptions(product) {
    return getOptions(product).length > 0;
}

/**
 * Seçimleri doğrular.
 * @returns {{ok: boolean, missing: string[]}} eksik ZORUNLU seçeneklerin etiketleri
 */
export function validateSelections(product, selections = {}) {
    const missing = getOptions(product)
        .filter(o => o.required && !String(selections?.[o.key] || "").trim())
        .map(o => o.label || o.key);

    return { ok: missing.length === 0, missing };
}

/**
 * Sepet satırı kimliği: ürün id'si + seçimler.
 * Seçimsiz üründe düz ürün id'si döner — eski sepetlerle uyumlu kalır.
 */
export function cartLineId(productId, selections) {
    const entries = Object.entries(selections || {})
        .filter(([, v]) => String(v || "").trim())
        .sort(([a], [b]) => a.localeCompare(b));   // sıra bağımsız, kararlı anahtar

    if (!entries.length) return String(productId);

    const suffix = entries.map(([k, v]) => `${k}=${v}`).join("|");
    return `${productId}::${suffix}`;
}

/**
 * Seçimlerin tek satırlık okunur özeti: "Renk: Siyah • Boyut: L"
 * Sepette, sipariş detayında ve PDF'te aynı biçim kullanılır.
 */
export function selectionsLabel(selections, product) {
    const opts = getOptions(product);

    return Object.entries(selections || {})
        .filter(([, v]) => String(v || "").trim())
        .map(([k, v]) => {
            // Etiket üründen okunur; ürün elde yoksa (sipariş kaydı) anahtar kullanılır
            const label = opts.find(o => o.key === k)?.label || k;
            return `${label}: ${v}`;
        })
        .join(" • ");
}

// ----------------------------------------------------------------------------
// Admin tarafı — hazır seçenek şablonları
// ----------------------------------------------------------------------------

/**
 * Satıcının tek tıkla ekleyebileceği seçenek şablonları.
 * Değerler admin panelinde düzenlenebilir; bu yalnızca başlangıç listesidir.
 */
export const OPTION_PRESETS = [
    {
        key: "color",
        label: "Renk",
        values: [
            "Siyah", "Beyaz", "Gri", "Gümüş", "Kırmızı", "Turuncu", "Sarı",
            "Yeşil", "Mavi", "Lacivert", "Mor", "Pembe", "Kahverengi",
            "Bej", "Altın", "Şeffaf", "Doğal", "Fosforlu"
        ]
    },
    {
        key: "size",
        label: "Boyut",
        values: ["XS", "S", "M", "L", "XL", "XXL"]
    },
    {
        key: "material",
        label: "Malzeme",
        values: ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Reçine (Resin)"]
    }
];

/** Şablonu anahtarla döndürür (bulunamazsa null). */
export function getPreset(key) {
    return OPTION_PRESETS.find(p => p.key === key) || null;
}
