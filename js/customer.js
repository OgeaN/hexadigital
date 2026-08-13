// ============================================================================
// Sipariş sahibi bilgileri — ad soyad + telefon.
//
// Satıcının müşteriye ulaşabilmesi için siparişe yazılır; sipariş detay
// sayfasında ve PDF'te gösterilir. Sipariş tarihsel bir kayıt olduğu için
// bilgiler siparişe DENORMALIZE edilir.
//
// Bilgiler tarayıcıda hatırlanır (localStorage): aynı kişi tekrar sipariş
// verirken formu yeniden doldurmasın.
// ============================================================================

const STORAGE_KEY = "hexa_customer";

/** Telefonu yalnız rakamlara indirger. */
export function digitsOnly(phone) {
    return String(phone || "").replace(/\D/g, "");
}

/**
 * Türkiye cep telefonu doğrulaması.
 * Kabul edilen biçimler: 05xxxxxxxxx (11), 5xxxxxxxxx (10), 905xxxxxxxxx (12).
 * @returns {string} normalize edilmiş "5xxxxxxxxx" veya "" (geçersiz)
 */
export function normalizePhone(phone) {
    let d = digitsOnly(phone);

    if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);

    // Cep numaraları 5 ile başlar ve 10 hanedir
    return (d.length === 10 && d.startsWith("5")) ? d : "";
}

/** "5354101826" → "0535 410 18 26" (gösterim için) */
export function formatPhone(phone) {
    const d = normalizePhone(phone);
    if (!d) return String(phone || "");
    return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

/** WhatsApp/tel bağlantısı için uluslararası biçim: "905354101826" */
export function internationalPhone(phone) {
    const d = normalizePhone(phone);
    return d ? "90" + d : "";
}

/**
 * Formdaki bilgileri doğrular.
 * @returns {{ok: boolean, error: string, customer: {name, phone, phoneIntl}|null}}
 */
export function validateCustomer(name, phone) {
    const cleanName = String(name || "").trim().replace(/\s+/g, " ");

    if (cleanName.length < 3) {
        return { ok: false, error: "Lütfen ad ve soyadınızı yazın.", customer: null };
    }
    if (!cleanName.includes(" ")) {
        return { ok: false, error: "Lütfen hem adınızı hem soyadınızı yazın.", customer: null };
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
        return {
            ok: false,
            error: "Telefon numarası geçersiz. Örnek: 0555 555 55 55",
            customer: null
        };
    }

    return {
        ok: true,
        error: "",
        customer: {
            name: cleanName.slice(0, 80),
            phone: normalized,                        // "5354101826"
            phoneIntl: "90" + normalized              // wa.me / tel: için
        }
    };
}

// ----------------------------------------------------------------------------
// Hatırlama — aynı kişi her seferinde yeniden yazmasın
// ----------------------------------------------------------------------------

export function saveCustomer(customer) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            name: customer.name,
            phone: customer.phone
        }));
    } catch {
        // Depolama kapalıysa (gizli sekme vb.) sessizce geç — akış bozulmasın
    }
}

export function loadCustomer() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== "object") return null;
        return { name: String(parsed.name || ""), phone: String(parsed.phone || "") };
    } catch {
        return null;
    }
}
