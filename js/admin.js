// ============================================================================
// Admin paneli — Google girişi + allowlist kontrolü + ürün CRUD + görsel yükleme
// ============================================================================

import {
    GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
    collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
    serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
    ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

import { auth, db, storage, ADMIN_EMAILS, PRODUCTS_COLLECTION } from "./firebase-config.js";
import { getImages, coverImage } from "./images.js";

// ---------- DOM ----------
const $ = id => document.getElementById(id);

const loadingEl = $("admin-loading");
const loginEl = $("admin-login");
const panelEl = $("admin-panel");
const loginError = $("login-error");

const btnSignin = $("btn-google-signin");
const btnSignout = $("btn-signout");
const btnSeed = $("btn-seed");
const adminEmailEl = $("admin-email");

const form = $("product-form");
const formHeading = $("form-heading");
const editIdEl = $("edit-id");
const nameEl = $("p-name");
const descEl = $("p-desc");
const priceEl = $("p-price");
const visibleEl = $("p-visible");
const imageFileEl = $("p-image-file");
const imageUrlsEl = $("p-image-urls");
const existingImagesRow = $("existing-images-row");
const existingImagesEl = $("existing-images");
const btnSave = $("btn-save");
const btnCancel = $("btn-cancel");
const formStatus = $("form-status");

// Düzenleme sırasında korunan mevcut görseller (kullanıcı ×'le çıkarabilir)
let editImages = [];

const listEl = $("admin-list");
const listStatus = $("list-status");

// ---------- Yardımcılar ----------
function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
function formatPrice(n) { return Number(n).toLocaleString("tr-TR"); }

function show(el) { el.style.display = ""; }
function hide(el) { el.style.display = "none"; }

function setFormStatus(msg, isError = false) {
    formStatus.textContent = msg;
    formStatus.classList.toggle("error", isError);
    formStatus.style.display = msg ? "block" : "none";
}

// ---------- Auth durumu ----------
onAuthStateChanged(auth, async (user) => {
    hide(loadingEl);

    if (!user) {
        // Oturum yok → giriş ekranı
        show(loginEl);
        hide(panelEl);
        return;
    }

    // Allowlist kontrolü
    const email = (user.email || "").toLowerCase();
    const allowed = ADMIN_EMAILS.map(e => e.toLowerCase());

    if (allowed.length === 0) {
        // Allowlist hiç doldurulmamış → uyar
        await signOut(auth);
        show(loginEl);
        hide(panelEl);
        loginError.textContent =
            "Admin listesi (ADMIN_EMAILS) boş. Lütfen js/firebase-config.js içine yetkili mailinizi ekleyin.";
        show(loginError);
        return;
    }

    if (!allowed.includes(email)) {
        // Yetkisiz mail → çıkış
        await signOut(auth);
        show(loginEl);
        hide(panelEl);
        loginError.textContent = `"${user.email}" yetkili değil. Erişim reddedildi.`;
        show(loginError);
        return;
    }

    // Yetkili → paneli göster
    hide(loginEl);
    show(panelEl);
    adminEmailEl.textContent = user.email;
    loadProducts();
});

// ---------- Giriş / çıkış ----------
btnSignin.addEventListener("click", async () => {
    hide(loginError);
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // Sonrası onAuthStateChanged'de işlenir
    } catch (err) {
        console.error("Giriş hatası:", err);
        loginError.textContent = "Giriş yapılamadı: " + (err.message || err.code || "");
        show(loginError);
    }
});

btnSignout.addEventListener("click", () => signOut(auth));

// ---------- Ürünleri listele ----------
async function loadProducts() {
    listStatus.textContent = "Yükleniyor...";
    listStatus.style.display = "block";
    listEl.innerHTML = "";
    try {
        const q = query(collection(db, PRODUCTS_COLLECTION), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        if (snap.empty) {
            listStatus.textContent = "Henüz ürün yok. Yukarıdan ekleyin veya 'Örnek Verileri Yükle'yi kullanın.";
            return;
        }
        listStatus.style.display = "none";

        snap.forEach(d => renderRow({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error(err);
        // orderBy createdAt eski kayıtlarda olmayabilir → indekssiz tüm dokümanları çek (fallback)
        try {
            const snap = await getDocs(collection(db, PRODUCTS_COLLECTION));
            if (snap.empty) {
                listStatus.textContent = "Henüz ürün yok.";
                return;
            }
            listStatus.style.display = "none";
            snap.forEach(d => renderRow({ id: d.id, ...d.data() }));
        } catch (e2) {
            console.error(e2);
            listStatus.textContent = "Ürünler yüklenemedi: " + (e2.message || "");
            listStatus.classList.add("error");
        }
    }
}

function renderRow(p) {
    const row = document.createElement("div");
    row.className = "admin-row";
    const cover = coverImage(p);
    const imgCount = getImages(p).length;
    const img = cover
        ? `<img class="admin-row__img" src="${esc(cover)}" alt="">`
        : `<div class="admin-row__img"></div>`;
    const badge = p.visible
        ? `<span class="badge-visible">Görünür</span>`
        : `<span class="badge-hidden">Gizli</span>`;
    const imgBadge = imgCount > 1 ? ` <span class="badge-visible">${imgCount} görsel</span>` : "";

    row.innerHTML = `
        ${img}
        <div class="admin-row__info">
            <div class="admin-row__name">${esc(p.name)} ${badge}${imgBadge}</div>
            <div class="admin-row__meta">
                <span class="admin-row__price">${formatPrice(p.price)} TL</span>
                — ${esc(p.description || "")}
            </div>
        </div>
        <div class="admin-row__actions">
            <button class="btn btn--ghost btn-sm" data-toggle="${esc(p.id)}">
                ${p.visible ? "Gizle" : "Göster"}
            </button>
            <button class="btn btn--ghost btn-sm" data-edit="${esc(p.id)}">Düzenle</button>
            <button class="btn btn--danger btn-sm" data-delete="${esc(p.id)}">Sil</button>
        </div>`;

    // Veriyi butona iliştir (düzenleme için)
    row.querySelector("[data-edit]").addEventListener("click", () => startEdit(p));
    row.querySelector("[data-toggle]").addEventListener("click", () => toggleVisible(p));
    row.querySelector("[data-delete]").addEventListener("click", () => removeProduct(p));

    listEl.appendChild(row);
}

// ---------- Form: ekle / düzenle ----------
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btnSave.disabled = true;
    setFormStatus("Kaydediliyor...");

    try {
        // Görselleri topla: (1) düzenlemede korunan mevcutlar,
        // (2) URL textarea satırları, (3) yeni yüklenen dosyalar (Storage).
        const imageUrls = [...editImages];

        // (2) URL satırları
        imageUrlsEl.value.split("\n")
            .map(s => s.trim())
            .filter(Boolean)
            .forEach(u => imageUrls.push(u));

        // (3) Dosya yüklemeleri (birden fazla)
        const files = Array.from(imageFileEl.files || []);
        if (files.length) {
            setFormStatus(`Görseller yükleniyor (0/${files.length})...`);
            for (let i = 0; i < files.length; i++) {
                try {
                    const file = files[i];
                    const path = `products/${Date.now()}_${i}_${file.name}`;
                    const storageRef = ref(storage, path);
                    await uploadBytes(storageRef, file);
                    imageUrls.push(await getDownloadURL(storageRef));
                    setFormStatus(`Görseller yükleniyor (${i + 1}/${files.length})...`);
                } catch (upErr) {
                    console.error("Storage yükleme hatası:", upErr);
                    setFormStatus(
                        "Bir görsel Storage'a yüklenemedi. Storage açık mı kontrol edin " +
                        "veya URL alanını kullanın.", true);
                    btnSave.disabled = false;
                    return;
                }
            }
        }

        const data = {
            name: nameEl.value.trim(),
            description: descEl.value.trim(),
            price: Number(priceEl.value) || 0,
            currency: "TL",
            imageUrls: imageUrls,           // çoklu görsel
            imageUrl: imageUrls[0] || "",   // geriye dönük uyumluluk (kapak)
            visible: visibleEl.checked
        };

        const editId = editIdEl.value;
        if (editId) {
            await updateDoc(doc(db, PRODUCTS_COLLECTION, editId), data);
            setFormStatus("Ürün güncellendi ✓");
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, PRODUCTS_COLLECTION), data);
            setFormStatus("Ürün eklendi ✓");
        }

        resetForm();
        loadProducts();
    } catch (err) {
        console.error(err);
        setFormStatus("Kaydedilemedi: " + (err.message || ""), true);
    } finally {
        btnSave.disabled = false;
    }
});

function startEdit(p) {
    editIdEl.value = p.id;
    nameEl.value = p.name || "";
    descEl.value = p.description || "";
    priceEl.value = p.price ?? "";
    visibleEl.checked = !!p.visible;
    imageUrlsEl.value = "";
    imageFileEl.value = "";
    editImages = getImages(p);   // mevcut görseller (çoklu/tekil hepsi)
    renderExistingImages();
    formHeading.textContent = "Ürünü Düzenle";
    btnSave.textContent = "Güncelle";
    show(btnCancel);
    setFormStatus("");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Düzenlemedeki mevcut görselleri küçük önizleme + sil (×) olarak göster
function renderExistingImages() {
    if (!editImages.length) {
        hide(existingImagesRow);
        existingImagesEl.innerHTML = "";
        return;
    }
    show(existingImagesRow);
    existingImagesEl.innerHTML = editImages.map((url, i) => `
        <div class="img-thumb">
            <img src="${esc(url)}" alt="">
            <button type="button" class="img-thumb__del" data-rm="${i}" aria-label="Kaldır">×</button>
        </div>`).join("");
    existingImagesEl.querySelectorAll("[data-rm]").forEach(b =>
        b.addEventListener("click", () => {
            editImages.splice(Number(b.dataset.rm), 1);
            renderExistingImages();
        }));
}

btnCancel.addEventListener("click", resetForm);

function resetForm() {
    form.reset();
    editIdEl.value = "";
    visibleEl.checked = true;
    editImages = [];
    renderExistingImages();
    formHeading.textContent = "Yeni Ürün Ekle";
    btnSave.textContent = "Kaydet";
    hide(btnCancel);
}

// ---------- Görünürlük / silme ----------
async function toggleVisible(p) {
    try {
        await updateDoc(doc(db, PRODUCTS_COLLECTION, p.id), { visible: !p.visible });
        loadProducts();
    } catch (err) {
        alert("Güncellenemedi: " + (err.message || ""));
    }
}

async function removeProduct(p) {
    if (!confirm(`"${p.name}" silinsin mi?`)) return;
    try {
        await deleteDoc(doc(db, PRODUCTS_COLLECTION, p.id));
        loadProducts();
    } catch (err) {
        alert("Silinemedi: " + (err.message || ""));
    }
}

// ---------- Örnek verileri yükle ----------
btnSeed.addEventListener("click", async () => {
    if (!confirm("Örnek ürünler Firestore'a eklenecek. Devam edilsin mi?")) return;
    btnSeed.disabled = true;
    try {
        const res = await fetch("data/dummy-products.json");
        const products = await res.json();
        for (const p of products) {
            await addDoc(collection(db, PRODUCTS_COLLECTION), {
                name: p.name,
                description: p.description || "",
                price: Number(p.price) || 0,
                currency: p.currency || "TL",
                imageUrl: p.imageUrl || "",
                visible: p.visible !== false,
                createdAt: serverTimestamp()
            });
        }
        alert(`${products.length} örnek ürün eklendi.`);
        loadProducts();
    } catch (err) {
        console.error(err);
        alert("Örnek veriler yüklenemedi: " + (err.message || ""));
    } finally {
        btnSeed.disabled = false;
    }
});
