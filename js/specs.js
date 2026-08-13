// ============================================================================
// Ürün kategorileri ve kategoriye özel özellik (spec) şemaları.
//
// Bir ürünün özellikleri iki alanda tutulur:
//   category : "3d-printing" gibi bir kategori anahtarı ("" = kategorisiz)
//   specs    : { alanAnahtarı: değer } — YALNIZCA dolu alanlar yazılır
//
// Yeni kategori eklemek için CATEGORIES dizisine yeni bir giriş yazmak yeterli;
// admin formu ve ürün popup'ı bu şemadan otomatik üretilir.
//
// Alan tipleri:
//   text   → serbest metin
//   number → sayı (unit ile birlikte "220 g" gibi gösterilir)
//   select → options dizisinden seçim
// ============================================================================

export const CATEGORIES = [
    {
        id: "3d-printing",
        name: "3D Baskı",
        fields: [
            {
                key: "material",
                label: "Malzeme Türü",
                type: "select",
                options: ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Reçine (Resin)", "Naylon (PA)"],
                placeholder: "Seçiniz"
            },
            {
                key: "color",
                label: "Renk",
                type: "select",
                options: [
                    "Siyah", "Beyaz", "Gri", "Gümüş", "Kırmızı", "Turuncu", "Sarı",
                    "Yeşil", "Mavi", "Lacivert", "Mor", "Pembe", "Kahverengi",
                    "Bej", "Altın", "Şeffaf", "Doğal", "Fosforlu", "Çok Renkli"
                ],
                placeholder: "Seçiniz"
            },
            { key: "weight",      label: "Gramaj",          type: "number", unit: "g",  placeholder: "220", step: "1", min: "0" },
            { key: "dimensions",  label: "Ölçüler (E×B×Y)", type: "text",   placeholder: "Örn: 120 × 80 × 45 mm" },
            {
                key: "layerHeight",
                label: "Katman Yüksekliği",
                type: "select",
                unit: "mm",
                options: ["0.05", "0.08", "0.1", "0.12", "0.15", "0.16", "0.2", "0.24", "0.28", "0.3", "0.32"],
                placeholder: "Seçiniz"
            },
            {
                key: "infill",
                label: "Dolgu Oranı",
                type: "select",
                unit: "%",
                options: ["0", "5", "10", "15", "20", "25", "30", "40", "50", "60", "75", "80", "100"],
                placeholder: "Seçiniz"
            },
            {
                key: "nozzle",
                label: "Nozzle Çapı",
                type: "select",
                unit: "mm",
                options: ["0.2", "0.25", "0.3", "0.4", "0.5", "0.6", "0.8", "1.0"],
                placeholder: "Seçiniz"
            },
            {
                key: "quality",
                label: "Baskı Kalitesi",
                type: "select",
                options: ["Taslak", "Standart", "Yüksek", "Ultra Detay"],
                placeholder: "Seçiniz"
            },
            { key: "printTime",   label: "Baskı Süresi",    type: "text",   placeholder: "Örn: 4 sa 30 dk" },
            {
                key: "postProcess",
                label: "Yüzey İşlemi",
                type: "select",
                options: [
                    "Yok (Ham Baskı)", "Zımpara", "Zımpara + Astar", "Boyalı",
                    "Vernikli", "Kimyasal Parlatma", "Epoksi Kaplama"
                ],
                placeholder: "Seçiniz"
            }
        ]
    }
];

/** Kategori anahtarından şema döndürür. Bilinmeyen/boş anahtar → null. */
export function getCategory(id) {
    if (!id) return null;
    return CATEGORIES.find(c => c.id === id) || null;
}

/** Kategori adı (listede yoksa anahtarın kendisi). */
export function categoryName(id) {
    return getCategory(id)?.name || id || "";
}

/** Değeri birimiyle birleştirir. Türkçede yüzde işareti sayının ÖNÜNE gelir. */
function formatValue(raw, unit) {
    const v = String(raw);
    if (!unit) return v;
    return unit === "%" ? `%${v}` : `${v} ${unit}`;
}

/**
 * Bir ürünün özelliklerini gösterime hazır satırlara çevirir.
 * Şemada tanımlı sırayı korur; boş alanlar atlanır.
 * Şemada olmayan ama üründe duran anahtarlar da (kategori sonradan değişmişse)
 * ham hâlleriyle sona eklenir — veri sessizce kaybolmasın.
 * @returns {Array<{label: string, value: string}>}
 */
export function specRows(product) {
    const specs = product?.specs;
    if (!specs || typeof specs !== "object") return [];

    const cat = getCategory(product.category);
    const rows = [];
    const used = new Set();

    (cat?.fields || []).forEach(f => {
        const raw = specs[f.key];
        if (raw === undefined || raw === null || raw === "") return;
        used.add(f.key);
        rows.push({ label: f.label, value: formatValue(raw, f.unit) });
    });

    Object.keys(specs).forEach(k => {
        if (used.has(k)) return;
        const raw = specs[k];
        if (raw === undefined || raw === null || raw === "") return;
        rows.push({ label: k, value: String(raw) });
    });

    return rows;
}

/** Üründe gösterilecek en az bir özellik var mı? */
export function hasSpecs(product) {
    return specRows(product).length > 0;
}
