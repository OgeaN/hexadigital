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
 * Dosyanın GERÇEK türünü ilk baytlarından (magic number) tespit eder.
 * Sunucunun Content-Type başlığına güvenilmez: Firebase Storage'a metadata'sız
 * yüklenen dosyalar "application/octet-stream" döner ve başlığa bakan bir
 * kontrol bu görselleri geçerli olmalarına rağmen eler.
 * @returns {string|null} jsPDF format adı (PNG/JPEG/WEBP/GIF/BMP) veya null
 */
function sniffImageFormat(bytes) {
    const b = bytes;
    if (b.length < 12) return null;
    // PNG: 89 50 4E 47
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "PNG";
    // JPEG: FF D8 FF
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "JPEG";
    // GIF: "GIF8"
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "GIF";
    // BMP: "BM"
    if (b[0] === 0x42 && b[1] === 0x4D) return "BMP";
    // WEBP: "RIFF" .... "WEBP"
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "WEBP";
    return null;   // SVG ve diğerleri jsPDF'e gömülemez
}

/** Uint8Array → base64 (büyük dizilerde stack taşmasın diye parça parça) */
function bytesToBase64(bytes) {
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

/**
 * Bir görsel URL'sini PDF'e gömülebilir hâle getirir.
 * @returns {Promise<{dataUrl:string, fmt:string}|null>} başarısızsa null
 */
async function fetchImageAsDataUrl(url) {
    if (!url) return null;

    // data: URI ise doğrudan baytlara çevir (ağ isteği gereksiz)
    if (url.startsWith("data:")) {
        try {
            const b64 = url.split(",")[1] || "";
            const bin = atob(b64);
            const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
            const fmt = sniffImageFormat(bytes);
            return fmt ? { dataUrl: url, fmt } : null;
        } catch {
            return null;
        }
    }

    try {
        const res = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!res.ok) {
            console.warn(`PDF görseli alınamadı (HTTP ${res.status}):`, url);
            return null;
        }

        const bytes = new Uint8Array(await res.arrayBuffer());
        const fmt = sniffImageFormat(bytes);
        if (!fmt) {
            console.warn("PDF'e gömülemeyen görsel biçimi (SVG olabilir):", url);
            return null;
        }

        const mime = fmt === "JPEG" ? "jpeg" : fmt.toLowerCase();
        return { dataUrl: `data:image/${mime};base64,${bytesToBase64(bytes)}`, fmt };
    } catch (err) {
        // Genellikle CORS: sunucu Access-Control-Allow-Origin göndermiyor
        console.warn("PDF görseli indirilemedi (CORS olabilir):", url, err.message);
        return null;
    }
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
 * @param {object} img  { dataUrl, fmt }
 * @returns {boolean} yerleştirilebildi mi
 */
function drawImageFitted(doc, img, boxX, boxY, boxW, boxH) {
    if (!img?.dataUrl || !img?.fmt) return false;
    try {
        let w = boxW, h = boxH;
        try {
            const props = doc.getImageProperties(img.dataUrl);
            if (props?.width > 0 && props?.height > 0) {
                const scale = Math.min(boxW / props.width, boxH / props.height);
                w = props.width * scale;
                h = props.height * scale;
            }
        } catch {
            // Oran okunamadı → kutuyu doldur (eski davranış)
        }
        doc.addImage(img.dataUrl, img.fmt, boxX + (boxW - w) / 2, boxY + (boxH - h) / 2, w, h);
        return true;
    } catch (err) {
        console.warn("Görsel PDF'e gömülemedi:", err.message);
        return false;
    }
}

/**
 * Görseli kutuyu TAM DOLDURACAK şekilde yerleştirir (CSS `object-fit: cover`).
 * Taşan kısımlar kırpılır; kutuda boşluk kalmaz.
 * @param {object} img { dataUrl, fmt }
 */
function drawImageCover(doc, img, boxX, boxY, boxW, boxH) {
    if (!img?.dataUrl || !img?.fmt) return false;
    try {
        let w = boxW, h = boxH, ox = boxX, oy = boxY;
        try {
            const props = doc.getImageProperties(img.dataUrl);
            if (props?.width > 0 && props?.height > 0) {
                // min yerine MAX: kutu tamamen dolsun
                const scale = Math.max(boxW / props.width, boxH / props.height);
                w = props.width * scale;
                h = props.height * scale;
                ox = boxX - (w - boxW) / 2;   // taşan kısmı ortala
                oy = boxY - (h - boxH) / 2;
            }
        } catch {
            // Oran okunamadı → kutuyu doğrudan doldur
        }

        // Kutu dışına taşan kısmı kırp.
        // jsPDF'te sıra: rect(...,null) → clip() → discardPath().
        // rect'e stil verilmezse çizgi basılmaz, yalnızca kırpma yolu olur.
        doc.saveGraphicsState();
        doc.rect(boxX, boxY, boxW, boxH, null);
        doc.clip();
        doc.discardPath();
        doc.addImage(img.dataUrl, img.fmt, ox, oy, w, h);
        doc.restoreGraphicsState();
        return true;
    } catch (err) {
        // Kırpma desteklenmiyorsa oranı koruyarak sığdırmaya düş
        console.warn("Logo kırpılamadı, sığdırma moduna düşülüyor:", err.message);
        return drawImageFitted(doc, img, boxX, boxY, boxW, boxH);
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
    // Logo için logoUrl/logoUrls'in ikisi de desteklenir (eski siparişler).
    const logoSrc = store?.logoUrl || store?.logoUrls?.[0] || "";
    const [logoData, ...images] = await Promise.all([
        fetchImageAsDataUrl(logoSrc),
        ...cart.map(item => fetchImageAsDataUrl(item.imageUrl))
    ]);

    // ---- Başlık ----
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageW, HEADER_H, "F");

    // Mağaza logosu — bantta dikey ortalanmış, kutuyu TAM DOLDURUR.
    // Sitedeki `object-fit: cover` ile aynı davranış: logonun kendi arka planı
    // olduğunda beyaz bir panel "kutu içinde kutu" görüntüsü yaratıyordu.
    let textX = MARGIN;
    if (logoData) {
        const boxY = (HEADER_H - LOGO_BOX) / 2;
        if (drawImageCover(doc, logoData, MARGIN, boxY, LOGO_BOX, LOGO_BOX)) {
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
        drawImageFitted(doc, images[i], MARGIN, y, BOX, BOX);

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
