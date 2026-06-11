// ============================================================================
// Sipariş PDF'i üretimi — jsPDF (ESM CDN). Sepeti ürün görselleriyle birlikte
// tek sayfalık (gerekirse çok sayfalı) bir liste PDF'ine çevirir.
// ============================================================================

// esm.sh, jsPDF'in iç bağımlılıklarını (@babel/runtime vb.) otomatik çözer;
// jsdelivr'deki ham jspdf.es.min.js çıplak (bare) import içerdiği için tarayıcıda çalışmaz.
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

// Marka rengi (variables.css --color-primary)
const BRAND = [159, 238, 28];
const DARK = [14, 17, 13];
const GRAY = [120, 120, 120];

function formatPrice(n) {
    return Number(n).toLocaleString("tr-TR");
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
 * Verilen öğelerden sipariş PDF'i üretir.
 * @param {Array<{name:string, price:number, qty:number, imageUrl?:string}>} items
 * @param {object} [opts] - { total, orderKey }
 * @returns {Promise<{blob: Blob, doc: jsPDF, fileName: string}>}
 */
export async function buildOrderPdf(items, opts = {}) {
    const cart = Array.isArray(items) ? items : [];
    const total = typeof opts.total === "number"
        ? opts.total
        : cart.reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    // ---- Başlık ----
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(...BRAND);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Hexadigital", margin, 14);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Siparis Listesi", margin, 22);

    const tarih = new Date().toLocaleString("tr-TR");
    doc.setFontSize(9);
    if (opts.orderKey) {
        doc.text(`Siparis No: ${opts.orderKey}`, pageW - margin, 14, { align: "right" });
    }
    doc.text(tarih, pageW - margin, 22, { align: "right" });

    y = 38;

    // ---- Ürün satırları ----
    const rowH = 22;       // her satırın yüksekliği
    const imgSize = 18;    // görsel kutusu kenarı

    // Görselleri paralel hazırla (sadece görseli olanlar)
    const images = await Promise.all(
        cart.map(item => item.imageUrl ? fetchImageAsDataUrl(item.imageUrl) : Promise.resolve(null))
    );

    doc.setTextColor(...DARK);

    for (let i = 0; i < cart.length; i++) {
        const item = cart[i];

        // Sayfa taşarsa yeni sayfa
        if (y + rowH > pageH - 30) {
            doc.addPage();
            y = margin;
        }

        // İnce ayraç çizgisi
        doc.setDrawColor(230, 230, 230);
        doc.line(margin, y - 2, pageW - margin, y - 2);

        // Görsel (varsa ve gömülebildiyse)
        const dataUrl = images[i];
        const fmt = dataUrl ? imageFormat(dataUrl) : null;
        let textX = margin;
        if (dataUrl && fmt) {
            try {
                doc.addImage(dataUrl, fmt, margin, y, imgSize, imgSize);
                textX = margin + imgSize + 5;
            } catch {
                textX = margin; // gömme başarısızsa görselsiz devam
            }
        } else {
            textX = margin;
        }

        // Ürün adı
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...DARK);
        doc.text(`${i + 1}. ${item.name}`, textX, y + 6);

        // Adet x birim fiyat
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...GRAY);
        doc.text(`${item.qty} adet x ${formatPrice(item.price)} TL`, textX, y + 13);

        // Satır toplamı (sağda)
        const lineTotal = item.price * item.qty;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...DARK);
        doc.text(`${formatPrice(lineTotal)} TL`, pageW - margin, y + 9, { align: "right" });

        y += rowH;
    }

    // ---- Toplam ----
    if (y + 20 > pageH - 20) { doc.addPage(); y = margin; }
    doc.setDrawColor(...DARK);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...DARK);
    doc.text("Toplam", margin, y);
    doc.text(`${formatPrice(total)} TL`, pageW - margin, y, { align: "right" });

    // ---- Alt bilgi ----
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text("Bu liste Hexadigital web sitesi uzerinden otomatik olusturulmustur.",
        margin, pageH - 10);

    const fileName = `hexadigital-siparis-${Date.now()}.pdf`;
    const blob = doc.output("blob");
    return { blob, doc, fileName };
}
