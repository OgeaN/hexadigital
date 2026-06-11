// ============================================================================
// Görsel yardımcıları — çoklu görsel desteği (geriye dönük uyumlu).
// Eski ürünlerde tekil `imageUrl`, yenilerde `imageUrls` dizisi olabilir.
// ============================================================================

/**
 * Bir ürün/sipariş öğesinin görsellerini her zaman bir DİZİ olarak döndürür.
 * Öncelik: imageUrls (dizi) → imageUrl (tekil). Boşları eler.
 * @returns {string[]}
 */
export function getImages(obj) {
    if (!obj) return [];
    let list = [];
    if (Array.isArray(obj.imageUrls)) {
        list = obj.imageUrls;
    } else if (obj.imageUrl) {
        list = [obj.imageUrl];
    }
    return list.map(s => (s || "").trim()).filter(Boolean);
}

/** İlk (kapak) görseli döndürür, yoksa boş string. */
export function coverImage(obj) {
    return getImages(obj)[0] || "";
}
