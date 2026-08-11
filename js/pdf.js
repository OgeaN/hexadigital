// ============================================================================
// Sipariş PDF'i üretimi — jsPDF (ESM CDN). Siparişi ürün görselleriyle birlikte
// tek sayfalık (gerekirse çok sayfalı) bir liste PDF'ine çevirir.
// Başlıkta siparişin verildiği mağazanın logosu, adı ve WhatsApp numarası yer alır.
// ============================================================================

// esm.sh, jsPDF'in iç bağımlılıklarını (@babel/runtime vb.) otomatik çözer;
// jsdelivr'deki ham jspdf.es.min.js çıplak (bare) import içerdiği için tarayıcıda çalışmaz.
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

// Gömülü Türkçe destekli font (helvetica ş/ğ/ı/İ gösteremez).
// Bu modüller yalnızca pdf.js yüklendiğinde iner — pdf.js zaten tembel yüklenir.
import { ROBOTO_REGULAR_B64 } from "./fonts/Roboto-Regular-normal.js";
import { ROBOTO_BOLD_B64 } from "./fonts/Roboto-Bold-normal.js";

// Marka rengi (variables.css --color-primary)
const BRAND = [159, 238, 28];
const DARK = [14, 17, 13];
const GRAY = [120, 120, 120];

// Yerleşim (mm, A4 = 210 × 297)
const MARGIN = 15;
const HEADER_H = 34;   // başlık bandı yüksekliği
const ROW_H = 30;      // ürün satırı yüksekliği
const BOX = 26;        // görsel kutusu (kare); görsel oranı korunarak içine sığdırılır
const LOGO_BOX = 22;   // başlıktaki mağaza logosu kutusu

function formatPrice(n) {
    return Number(n).toLocaleString("tr-TR");
}

/** "905354101826" → "+90 535 410 18 26" */
function formatPhone(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("90")) {
        return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
    }
    return d ? "+" + d : "";
}

/**
 * Bir görsel URL'sini base64 data URL'ine çevirir (PDF'e gömmek için).
 * CORS engeli veya yükleme hatası olursa null döner (o ürün görselsiz konur).
 */
async function fetchImageAsDataUrl(url) {
    try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) return null;
        const blob = await res.blob();
        // Sadece görseller
        if (!blob.type.startsWith("image/")) return null;
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

// data URL'inden jsPDF format adını çıkar (JPEG/PNG)
function imageFormat(dataUrl) {
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return null; // jsPDF gif/svg gömemez
}

/**
 * Türkçe destekli fontu belgeye kaydeder.
 * Başarısız olursa helvetica'ya düşer (PDF üretimi patlamasın).
 * @returns {string} kullanılacak font ailesi adı
 */
function registerFont(doc) {
    try {
        doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_REGULAR_B64);
        doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
        doc.addFileToVFS("Roboto-Bold.ttf", ROBOTO_BOLD_B64);
        doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
        doc.setFont("Roboto", "normal");
        return "Roboto";
    } catch (err) {
        console.warn("Türkçe font yüklenemedi, helvetica'ya düşülüyor:", err);
        return "helvetica";
    }
}

/**
 * Görseli, oranını koruyarak verilen kutuya ortalayarak yerleştirir.
 * @returns {boolean} yerleştirilebildi mi
 */
function drawImageFitted(doc, dataUrl, fmt, boxX, boxY, boxW, boxH) {
    try {
        let w = boxW, h = boxH;
        try {
            const props = doc.getImageProperties(dataUrl);
            if (props?.width > 0 && props?.height > 0) {
                const scale = Math.min(boxW / props.width, boxH / props.height);
                w = props.width * scale;
                h = props.height * scale;
            }
        } catch {
            // Oran okunamadı → kutuyu doldur (eski davranış)
        }
        doc.addImage(dataUrl, fmt, boxX + (boxW - w) / 2, boxY + (boxH - h) / 2, w, h);
        return true;
    } catch {
        return false;
    }
}

/**
 * Verilen öğelerden sipariş PDF'i üretir.
 * @param {Array<{name:string, price:number, qty:number, imageUrl?:string}>} items
 * @param {object} [opts] - { total, orderKey, storeId, store: {name, whatsapp, logoUrl} }
 * @returns {Promise<{blob: Blob, doc: jsPDF, fileName: string}>}
 */
export async function buildOrderPdf(items, opts = {}) {
    const cart = Array.isArray(items) ? items : [];
    const total = typeof opts.total === "number"
        ? opts.total
        : cart.reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);

    // Bu değişiklikten önce yazılmış siparişlerde `store` yoktur → Hexadigital'e düş
    const store = opts.store || null;
    const storeName = store?.name || "Hexadigital";
    const phone = formatPhone(store?.whatsapp);

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const FONT = registerFont(doc);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Görselleri paralel hazırla: [mağaza logosu, ...ürün görselleri]
    const [logoData, ...images] = await Promise.all([
        store?.logoUrl ? fetchImageAsDataUrl(store.logoUrl) : Promise.resolve(null),
        ...cart.map(item => item.imageUrl ? fetchImageAsDataUrl(item.imageUrl) : Promise.resolve(null))
    ]);

    // ---- Başlık ----
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageW, HEADER_H, "F");

    // Mağaza logosu (varsa ve gömülebildiyse)
    let textX = MARGIN;
    const logoFmt = logoData ? imageFormat(logoData) : null;
    if (logoData && logoFmt) {
        if (drawImageFitted(doc, logoData, logoFmt, MARGIN, 6, LOGO_BOX, LOGO_BOX)) {
            textX = MARGIN + LOGO_BOX + 6;
        }
    }

    doc.setTextColor(...BRAND);
    doc.setFont(FONT, "bold");
    doc.setFontSize(18);
    doc.text(storeName, textX, 15);

    doc.setTextColor(255, 255, 255);
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.text("Sipariş Listesi", textX, 22);

    if (phone) {
        doc.setFontSize(9);
        doc.setTextColor(...GRAY);
        doc.text(`WhatsApp: ${phone}`, textX, 28);
    }

    // Sağ üst: sipariş no + tarih
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    if (opts.orderKey) {
        doc.text(`Sipariş No: ${opts.orderKey}`, pageW - MARGIN, 15, { align: "right" });
    }
    doc.text(new Date().toLocaleString("tr-TR"), pageW - MARGIN, 22, { align: "right" });

    let y = HEADER_H + 10;

    // ---- Ürün satırları ----
    doc.setTextColor(...DARK);

    for (let i = 0; i < cart.length; i++) {
        const item = cart[i];

        // Sayfa taşarsa yeni sayfa
        if (y + ROW_H > pageH - HEADER_H) {
            doc.addPage();
            y = MARGIN;
        }

        // İnce ayraç çizgisi
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        doc.line(MARGIN, y - 2, pageW - MARGIN, y - 2);

        // Görsel — oranı korunarak kutuya ortalanır.
        // Metin girintisi görselden BAĞIMSIZ sabittir: bazı ürünlerde görsel
        // olmayınca liste tırtıklı görünmesin diye.
        const itemX = MARGIN + BOX + 6;
        const dataUrl = images[i];
        const fmt = dataUrl ? imageFormat(dataUrl) : null;
        if (dataUrl && fmt) {
            drawImageFitted(doc, dataUrl, fmt, MARGIN, y, BOX, BOX);
        }

        // Ürün adı
        doc.setFont(FONT, "bold");
        doc.setFontSize(12);
        doc.setTextColor(...DARK);
        doc.text(`${i + 1}. ${item.name}`, itemX, y + 8);

        // Adet x birim fiyat
        doc.setFont(FONT, "normal");
        doc.setFontSize(10);
        doc.setTextColor(...GRAY);
        doc.text(`${item.qty} adet × ${formatPrice(item.price)} TL`, itemX, y + 16);

        // Satır toplamı (sağda)
        const lineTotal = (Number(item.price) || 0) * item.qty;
        doc.setFont(FONT, "bold");
        doc.setFontSize(12);
        doc.setTextColor(...DARK);
        doc.text(`${formatPrice(lineTotal)} TL`, pageW - MARGIN, y + 12, { align: "right" });

        y += ROW_H;
    }

    // ---- Toplam ----
    if (y + 20 > pageH - 20) { doc.addPage(); y = MARGIN; }
    doc.setDrawColor(...DARK);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, pageW - MARGIN, y);
    y += 10;
    doc.setFont(FONT, "bold");
    doc.setFontSize(14);
    doc.setTextColor(...DARK);
    doc.text("Toplam", MARGIN, y);
    doc.text(`${formatPrice(total)} TL`, pageW - MARGIN, y, { align: "right" });

    // ---- Alt bilgi ----
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Bu liste ${storeName} web sitesi üzerinden otomatik oluşturulmuştur.`,
        MARGIN, pageH - 10);

    const slug = opts.storeId || "hexadigital";
    const fileName = `${slug}-siparis-${Date.now()}.pdf`;
    const blob = doc.output("blob");
    return { blob, doc, fileName };
}
