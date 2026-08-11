// ============================================================================
// Admin paneli — Google girişi + iki kademeli yetki + mağaza/ürün CRUD.
//
// YETKİ MODELİ:
//   • Süper admin  → js/firebase-config.js ADMIN_EMAILS. Mağaza açar/siler,
//                    mağazaya yönetici e-postası atar, tüm mağazaları yönetir.
//   • Mağaza admini → stores/{id}.adminEmails dizisi. YALNIZCA kendi mağazasının
//                    ürünlerini yönetir; mağaza açamaz, yönetici ekleyemez.
// Gerçek güvenlik Security Rules'ta; buradaki kontroller yalnızca arayüz içindir.
// ============================================================================

import {
    GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
    collection, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, doc,
    serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
    ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

import { auth, db, storage, PRODUCTS_COLLECTION } from "./firebase-config.js";
import { getImages, coverImage } from "./images.js";
import {
    STORES_COLLECTION, getAllStores, getStoresForEmail, isSuperAdmin,
    isValidSlug, storeBanner, storeLogo
} from "./stores.js";

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

// Sekmeler
const tabBtnProducts = $("tab-btn-products");
const tabBtnStores = $("tab-btn-stores");
const tabProducts = $("tab-products");
const tabStores = $("tab-stores");

// Mağaza kapsamı (ürünler sekmesi)
const storeSelect = $("store-select");

// Ürün formu
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

const listEl = $("admin-list");
const listStatus = $("list-status");

// Mağaza formu
const storeForm = $("store-form");
const storeFormHeading = $("store-form-heading");
const storeEditIdEl = $("store-edit-id");
const sSlugEl = $("s-slug");
const sNameEl = $("s-name");
const sTaglineEl = $("s-tagline");
const sWhatsappEl = $("s-whatsapp");
const sSortEl = $("s-sort");
const sActiveEl = $("s-active");
const sAdminEmailsEl = $("s-admin-emails");
const sBannerFileEl = $("s-banner-file");
const sBannerUrlsEl = $("s-banner-urls");
const existingBannersRow = $("existing-banners-row");
const existingBannersEl = $("existing-banners");
const sLogoFileEl = $("s-logo-file");
const sLogoUrlsEl = $("s-logo-urls");
const existingLogosRow = $("existing-logos-row");
const existingLogosEl = $("existing-logos");
const btnStoreSave = $("btn-store-save");
const btnStoreCancel = $("btn-store-cancel");
const storeFormStatus = $("store-form-status");

const storeListEl = $("store-list");
const storeListStatus = $("store-list-status");

const btnMigrate = $("btn-migrate");
const migrateStatus = $("migrate-status");

// ---------- Durum ----------
const SCOPE_KEY = "hexa_admin_store";

let currentEmail = "";
let superAdmin = false;
let myStores = [];            // bu kullanıcının yönetebildiği mağazalar
let activeStoreId = "";       // ürünler sekmesinin kapsamı

// Düzenleme sırasında korunan mevcut görseller (kullanıcı ×'le çıkarabilir)
let editImages = [];
let editBanners = [];
let editLogos = [];

// ---------- Yardımcılar ----------
function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
function formatPrice(n) { return Number(n).toLocaleString("tr-TR"); }

function show(el) { el.style.display = ""; }
function hide(el) { el.style.display = "none"; }

function setStatus(el, msg, isError = false) {
    el.textContent = msg;
    el.classList.toggle("error", isError);
    el.style.display = msg ? "block" : "none";
}
const setFormStatus = (msg, isError) => setStatus(formStatus, msg, isError);
const setStoreFormStatus = (msg, isError) => setStatus(storeFormStatus, msg, isError);

/** Textarea'daki satırları temiz bir diziye çevirir. */
function linesToArray(value) {
    return String(value || "")
        .split(/[\n,]/)
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Dosyaları Storage'a yükleyip indirme URL'lerini döndürür.
 * Ürün görseli / banner / logo üçlüsünde paylaşılır.
 * @param {File[]} files
 * @param {string} pathPrefix  örn: "products/sam3d" veya "stores/sam3d/banner"
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<string[]>}
 */
async function uploadImages(files, pathPrefix, onProgress) {
    const urls = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `${pathPrefix}_${Date.now()}_${i}_${file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        urls.push(await getDownloadURL(storageRef));
        if (onProgress) onProgress(i + 1, files.length);
    }
    return urls;
}

/** Küçük görsel önizleme + × ile kaldırma (ürün / banner / logo ortak). */
function renderThumbs(rowEl, containerEl, list, onChange) {
    if (!list.length) {
        hide(rowEl);
        containerEl.innerHTML = "";
        return;
    }
    show(rowEl);
    containerEl.innerHTML = list.map((url, i) => `
        <div class="img-thumb">
            <img src="${esc(url)}" alt="">
            <button type="button" class="img-thumb__del" data-rm="${i}" aria-label="Kaldır">×</button>
        </div>`).join("");
    containerEl.querySelectorAll("[data-rm]").forEach(b =>
        b.addEventListener("click", () => {
            list.splice(Number(b.dataset.rm), 1);
            onChange();
        }));
}

// ============================================================================
// Auth durumu
// ============================================================================
onAuthStateChanged(auth, async (user) => {
    hide(loadingEl);

    if (!user) {
        show(loginEl);
        hide(panelEl);
        return;
    }

    currentEmail = (user.email || "").toLowerCase();
    superAdmin = isSuperAdmin(currentEmail);

    // Bu kullanıcı hangi mağazaları yönetebiliyor?
    try {
        myStores = await getStoresForEmail(currentEmail);
    } catch (err) {
        console.error("Mağazalar okunamadı:", err);
        myStores = [];
    }

    // Ne süper admin ne de bir mağazanın yöneticisi → erişim yok
    if (!superAdmin && myStores.length === 0) {
        await signOut(auth);
        show(loginEl);
        hide(panelEl);
        loginError.textContent =
            `"${user.email}" yetkili değil. Erişim reddedildi.`;
        show(loginError);
        return;
    }

    hide(loginEl);
    show(panelEl);
    adminEmailEl.textContent = user.email + (superAdmin ? " (süper admin)" : "");

    // Mağazalar sekmesi + göç butonu yalnızca süper adminde
    tabBtnStores.hidden = !superAdmin;
    btnMigrate.hidden = !superAdmin;

    populateStoreSelect();

    if (superAdmin) loadStores();

    if (activeStoreId) {
        loadProducts();
    } else {
        // Süper admin henüz hiç mağaza açmamış
        setStatus(listStatus,
            "Önce 'Mağazalar' sekmesinden bir mağaza oluşturun.", false);
        show(listStatus);
    }
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

// ============================================================================
// Sekmeler
// ============================================================================
function switchTab(tab) {
    const isStores = tab === "stores";
    // Yetkisiz kullanıcı mağazalar sekmesine geçemez
    if (isStores && !superAdmin) return;

    tabProducts.hidden = isStores;
    tabStores.hidden = !isStores;
    tabBtnProducts.classList.toggle("active", !isStores);
    tabBtnStores.classList.toggle("active", isStores);
}

tabBtnProducts.addEventListener("click", () => switchTab("products"));
tabBtnStores.addEventListener("click", () => switchTab("stores"));

// ============================================================================
// Mağaza kapsamı (ürünler sekmesi)
// ============================================================================
function populateStoreSelect() {
    storeSelect.innerHTML = myStores
        .map(s => `<option value="${esc(s.id)}">${esc(s.name || s.id)}${s.active === false ? " (pasif)" : ""}</option>`)
        .join("");

    if (myStores.length === 0) {
        activeStoreId = "";
        storeSelect.disabled = true;
        return;
    }

    // Önceki seçim hâlâ geçerliyse onu koru
    const saved = localStorage.getItem(SCOPE_KEY);
    const valid = myStores.some(s => s.id === saved);
    activeStoreId = valid ? saved : myStores[0].id;

    storeSelect.value = activeStoreId;
    // Tek mağaza varsa seçici anlamsız — göster ama kilitle
    storeSelect.disabled = myStores.length === 1;
}

storeSelect.addEventListener("change", () => {
    activeStoreId = storeSelect.value;
    localStorage.setItem(SCOPE_KEY, activeStoreId);
    resetForm();
    loadProducts();
});

/** Seçili mağazayı myStores içinden döndürür. */
function activeStore() {
    return myStores.find(s => s.id === activeStoreId) || null;
}

// ============================================================================
// ÜRÜNLER — listele
// ============================================================================
async function loadProducts() {
    if (!activeStoreId) return;

    setStatus(listStatus, "Yükleniyor...");
    listEl.innerHTML = "";

    try {
        // Tek eşitlik filtresi → composite index gerekmez.
        // Sıralama JS'te yapılır (createdAt eski kayıtlarda olmayabilir).
        const q = query(
            collection(db, PRODUCTS_COLLECTION),
            where("storeId", "==", activeStoreId)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            setStatus(listStatus,
                "Bu mağazada henüz ürün yok. Yukarıdan ekleyin veya 'Örnek Verileri Yükle'yi kullanın.");
            return;
        }

        const products = [];
        snap.forEach(d => products.push({ id: d.id, ...d.data() }));

        // Yeniden eskiye
        products.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });

        hide(listStatus);
        products.forEach(renderRow);
    } catch (err) {
        console.error(err);
        setStatus(listStatus, "Ürünler yüklenemedi: " + (err.message || ""), true);
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

    row.querySelector("[data-edit]").addEventListener("click", () => startEdit(p));
    row.querySelector("[data-toggle]").addEventListener("click", () => toggleVisible(p));
    row.querySelector("[data-delete]").addEventListener("click", () => removeProduct(p));

    listEl.appendChild(row);
}

// ============================================================================
// ÜRÜNLER — ekle / düzenle
// ============================================================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!activeStoreId) {
        setFormStatus("Önce bir mağaza seçin.", true);
        return;
    }

    btnSave.disabled = true;
    setFormStatus("Kaydediliyor...");

    try {
        // Görselleri topla: (1) düzenlemede korunan mevcutlar,
        // (2) URL textarea satırları, (3) yeni yüklenen dosyalar (Storage).
        const imageUrls = [...editImages, ...linesToArray(imageUrlsEl.value)];

        const files = Array.from(imageFileEl.files || []);
        if (files.length) {
            setFormStatus(`Görseller yükleniyor (0/${files.length})...`);
            try {
                const uploaded = await uploadImages(
                    files,
                    `products/${activeStoreId}/img`,
                    (done, total) => setFormStatus(`Görseller yükleniyor (${done}/${total})...`)
                );
                imageUrls.push(...uploaded);
            } catch (upErr) {
                console.error("Storage yükleme hatası:", upErr);
                setFormStatus(
                    "Bir görsel Storage'a yüklenemedi. Storage açık mı kontrol edin " +
                    "veya URL alanını kullanın.", true);
                btnSave.disabled = false;
                return;
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
            // storeId güncellemede ASLA değişmez (kurallar da reddeder)
            await updateDoc(doc(db, PRODUCTS_COLLECTION, editId), data);
            setFormStatus("Ürün güncellendi ✓");
        } else {
            data.storeId = activeStoreId;
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

function renderExistingImages() {
    renderThumbs(existingImagesRow, existingImagesEl, editImages, renderExistingImages);
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
    setFormStatus("");
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
    if (!activeStoreId) { alert("Önce bir mağaza seçin."); return; }
    const store = activeStore();
    if (!confirm(`Örnek ürünler "${store?.name || activeStoreId}" mağazasına eklenecek. Devam edilsin mi?`)) return;

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
                imageUrls: p.imageUrl ? [p.imageUrl] : [],
                imageUrl: p.imageUrl || "",
                visible: p.visible !== false,
                storeId: activeStoreId,
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

// ============================================================================
// MAĞAZALAR — listele (yalnızca süper admin)
// ============================================================================
async function loadStores() {
    setStatus(storeListStatus, "Yükleniyor...");
    storeListEl.innerHTML = "";

    try {
        const stores = await getAllStores();

        if (stores.length === 0) {
            setStatus(storeListStatus, "Henüz mağaza yok. Yukarıdan ekleyin.");
            return;
        }

        hide(storeListStatus);
        stores.forEach(renderStoreRow);
    } catch (err) {
        console.error(err);
        setStatus(storeListStatus, "Mağazalar yüklenemedi: " + (err.message || ""), true);
    }
}

function renderStoreRow(s) {
    const row = document.createElement("div");
    row.className = "admin-row";

    const cover = storeBanner(s) || storeLogo(s);
    const img = cover
        ? `<img class="admin-row__img" src="${esc(cover)}" alt="">`
        : `<div class="admin-row__img"></div>`;
    const badge = s.active
        ? `<span class="badge-visible">Aktif</span>`
        : `<span class="badge-hidden">Pasif</span>`;
    const admins = Array.isArray(s.adminEmails) ? s.adminEmails : [];
    const adminBadge = admins.length
        ? ` <span class="badge-visible">${admins.length} yönetici</span>`
        : "";

    row.innerHTML = `
        ${img}
        <div class="admin-row__info">
            <div class="admin-row__name">${esc(s.name || s.id)} ${badge}${adminBadge}</div>
            <div class="admin-row__meta">
                <span class="admin-row__price">${esc(s.id)}</span>
                — WhatsApp: ${esc(s.whatsapp || "—")}
                ${admins.length ? "<br>" + esc(admins.join(", ")) : ""}
            </div>
        </div>
        <div class="admin-row__actions">
            <button class="btn btn--ghost btn-sm" data-toggle="${esc(s.id)}">
                ${s.active ? "Pasifleştir" : "Aktifleştir"}
            </button>
            <a class="btn btn--ghost btn-sm" href="shop.html?store=${encodeURIComponent(s.id)}" target="_blank">Görüntüle</a>
            <button class="btn btn--ghost btn-sm" data-edit="${esc(s.id)}">Düzenle</button>
            <button class="btn btn--danger btn-sm" data-delete="${esc(s.id)}">Sil</button>
        </div>`;

    row.querySelector("[data-edit]").addEventListener("click", () => startStoreEdit(s));
    row.querySelector("[data-toggle]").addEventListener("click", () => toggleStoreActive(s));
    row.querySelector("[data-delete]").addEventListener("click", () => removeStore(s));

    storeListEl.appendChild(row);
}

// ============================================================================
// MAĞAZALAR — ekle / düzenle
// ============================================================================
storeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    btnStoreSave.disabled = true;
    setStoreFormStatus("Kaydediliyor...");

    try {
        const editId = storeEditIdEl.value;
        const slug = editId || sSlugEl.value.trim().toLowerCase();

        if (!isValidSlug(slug)) {
            setStoreFormStatus(
                "Mağaza kodu geçersiz. Küçük harf/rakamla başlamalı; yalnız küçük harf, " +
                "rakam ve tire içerebilir (2-31 karakter).", true);
            btnStoreSave.disabled = false;
            return;
        }

        // Yeni kayıtta teklik kontrolü
        if (!editId) {
            const existing = await getDoc(doc(db, STORES_COLLECTION, slug));
            if (existing.exists()) {
                setStoreFormStatus(`"${slug}" kodu zaten kullanılıyor. Başka bir kod seçin.`, true);
                btnStoreSave.disabled = false;
                return;
            }
        }

        const whatsapp = sWhatsappEl.value.replace(/\D/g, "");
        if (!whatsapp) {
            setStoreFormStatus("WhatsApp numarası gerekli (yalnız rakam).", true);
            btnStoreSave.disabled = false;
            return;
        }

        // ---- Banner görselleri ----
        const bannerUrls = [...editBanners, ...linesToArray(sBannerUrlsEl.value)];
        const bannerFiles = Array.from(sBannerFileEl.files || []);
        // ---- Logo görselleri ----
        const logoUrls = [...editLogos, ...linesToArray(sLogoUrlsEl.value)];
        const logoFiles = Array.from(sLogoFileEl.files || []);

        try {
            if (bannerFiles.length) {
                setStoreFormStatus(`Banner yükleniyor (0/${bannerFiles.length})...`);
                bannerUrls.push(...await uploadImages(
                    bannerFiles, `stores/${slug}/banner`,
                    (d, t) => setStoreFormStatus(`Banner yükleniyor (${d}/${t})...`)
                ));
            }
            if (logoFiles.length) {
                setStoreFormStatus(`Logo yükleniyor (0/${logoFiles.length})...`);
                logoUrls.push(...await uploadImages(
                    logoFiles, `stores/${slug}/logo`,
                    (d, t) => setStoreFormStatus(`Logo yükleniyor (${d}/${t})...`)
                ));
            }
        } catch (upErr) {
            console.error("Storage yükleme hatası:", upErr);
            setStoreFormStatus(
                "Görsel Storage'a yüklenemedi. Storage açık mı kontrol edin " +
                "veya URL alanını kullanın.", true);
            btnStoreSave.disabled = false;
            return;
        }

        // Yönetici e-postaları: küçük harf + tekilleştir
        const adminEmails = [...new Set(
            linesToArray(sAdminEmailsEl.value)
                .map(s => s.toLowerCase())
                .filter(s => s.includes("@"))
        )];

        const data = {
            name: sNameEl.value.trim(),
            tagline: sTaglineEl.value.trim(),
            whatsapp: whatsapp,
            bannerUrls: bannerUrls,
            bannerUrl: bannerUrls[0] || "",
            logoUrls: logoUrls,
            logoUrl: logoUrls[0] || "",
            adminEmails: adminEmails,
            active: sActiveEl.checked,
            sortOrder: Number(sSortEl.value) || 0,
            updatedAt: serverTimestamp()
        };

        if (editId) {
            await updateDoc(doc(db, STORES_COLLECTION, editId), data);
            setStoreFormStatus("Mağaza güncellendi ✓");
        } else {
            // Doküman ID'sini biz belirliyoruz (slug) → addDoc değil setDoc
            data.createdAt = serverTimestamp();
            await setDoc(doc(db, STORES_COLLECTION, slug), data);
            setStoreFormStatus("Mağaza oluşturuldu ✓");
        }

        resetStoreForm();
        await loadStores();

        // Kapsam seçicisini tazele (yeni mağaza hemen seçilebilsin)
        myStores = await getStoresForEmail(currentEmail);
        const previous = activeStoreId;
        populateStoreSelect();
        if (previous && myStores.some(s => s.id === previous)) {
            activeStoreId = previous;
            storeSelect.value = previous;
        }
    } catch (err) {
        console.error(err);
        setStoreFormStatus("Kaydedilemedi: " + (err.message || ""), true);
    } finally {
        btnStoreSave.disabled = false;
    }
});

function startStoreEdit(s) {
    storeEditIdEl.value = s.id;
    sSlugEl.value = s.id;
    sSlugEl.disabled = true;      // slug değişimi ürünleri öksüz bırakır
    sNameEl.value = s.name || "";
    sTaglineEl.value = s.tagline || "";
    sWhatsappEl.value = s.whatsapp || "";
    sSortEl.value = s.sortOrder ?? 0;
    sActiveEl.checked = s.active !== false;
    sAdminEmailsEl.value = (Array.isArray(s.adminEmails) ? s.adminEmails : []).join("\n");

    sBannerUrlsEl.value = "";
    sBannerFileEl.value = "";
    sLogoUrlsEl.value = "";
    sLogoFileEl.value = "";
    editBanners = getImages({ imageUrls: s.bannerUrls, imageUrl: s.bannerUrl });
    editLogos = getImages({ imageUrls: s.logoUrls, imageUrl: s.logoUrl });
    renderExistingBanners();
    renderExistingLogos();

    storeFormHeading.textContent = "Mağazayı Düzenle";
    btnStoreSave.textContent = "Güncelle";
    show(btnStoreCancel);
    setStoreFormStatus("");
    storeForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderExistingBanners() {
    renderThumbs(existingBannersRow, existingBannersEl, editBanners, renderExistingBanners);
}
function renderExistingLogos() {
    renderThumbs(existingLogosRow, existingLogosEl, editLogos, renderExistingLogos);
}

btnStoreCancel.addEventListener("click", resetStoreForm);

function resetStoreForm() {
    storeForm.reset();
    storeEditIdEl.value = "";
    sSlugEl.disabled = false;
    sActiveEl.checked = true;
    sSortEl.value = 0;
    editBanners = [];
    editLogos = [];
    renderExistingBanners();
    renderExistingLogos();
    storeFormHeading.textContent = "Yeni Mağaza Ekle";
    btnStoreSave.textContent = "Kaydet";
    hide(btnStoreCancel);
    setStoreFormStatus("");
}

// ---------- Mağaza aktif/pasif + silme ----------
async function toggleStoreActive(s) {
    try {
        await updateDoc(doc(db, STORES_COLLECTION, s.id), {
            active: !s.active,
            updatedAt: serverTimestamp()
        });
        loadStores();
    } catch (err) {
        alert("Güncellenemedi: " + (err.message || ""));
    }
}

async function removeStore(s) {
    if (!confirm(`"${s.name || s.id}" mağazası silinsin mi?`)) return;
    if (!confirm(
        "DİKKAT: Bu mağazanın ÜRÜNLERİ otomatik silinmez; erişilemez hâle gelir.\n\n" +
        "Sadece gizlemek istiyorsanız 'Pasifleştir' kullanın.\n\nSilme işlemine devam edilsin mi?"
    )) return;

    try {
        await deleteDoc(doc(db, STORES_COLLECTION, s.id));
        await loadStores();
        myStores = await getStoresForEmail(currentEmail);
        populateStoreSelect();
        loadProducts();
    } catch (err) {
        alert("Silinemedi: " + (err.message || ""));
    }
}

// ============================================================================
// Tek seferlik göç: mağazasız ürünleri tüm aktif mağazalara kopyala
// ============================================================================
btnMigrate.addEventListener("click", async () => {
    if (!superAdmin) return;

    const stores = (await getAllStores()).filter(s => s.active !== false);
    if (stores.length === 0) {
        setStatus(migrateStatus, "Önce en az bir aktif mağaza oluşturun.", true);
        return;
    }

    if (!confirm(
        `Mağazası olmayan ürünler şu mağazalara kopyalanacak:\n\n` +
        stores.map(s => "• " + (s.name || s.id)).join("\n") +
        "\n\nDevam edilsin mi?"
    )) return;

    btnMigrate.disabled = true;
    setStatus(migrateStatus, "Ürünler okunuyor...");

    try {
        const snap = await getDocs(collection(db, PRODUCTS_COLLECTION));

        const legacy = [];                 // storeId'si olmayanlar
        const migratedByStore = new Map(); // storeId -> Set(migratedFrom)

        snap.forEach(d => {
            const data = d.data();
            if (!data.storeId) {
                legacy.push({ id: d.id, ...data });
                return;
            }
            if (data.migratedFrom) {
                if (!migratedByStore.has(data.storeId)) {
                    migratedByStore.set(data.storeId, new Set());
                }
                migratedByStore.get(data.storeId).add(data.migratedFrom);
            }
        });

        if (legacy.length === 0) {
            setStatus(migrateStatus, "Kopyalanacak mağazasız ürün bulunamadı.");
            btnMigrate.disabled = false;
            return;
        }

        let copied = 0;
        let skipped = 0;

        for (const store of stores) {
            const done = migratedByStore.get(store.id) || new Set();
            for (const p of legacy) {
                if (done.has(p.id)) { skipped++; continue; }

                setStatus(migrateStatus,
                    `Kopyalanıyor: ${store.name || store.id} — ${p.name || p.id}...`);

                const images = getImages(p);
                await addDoc(collection(db, PRODUCTS_COLLECTION), {
                    name: p.name || "",
                    description: p.description || "",
                    price: Number(p.price) || 0,
                    currency: p.currency || "TL",
                    imageUrls: images,
                    imageUrl: images[0] || "",
                    visible: p.visible !== false,
                    storeId: store.id,
                    migratedFrom: p.id,
                    createdAt: serverTimestamp()
                });
                copied++;
            }
        }

        setStatus(migrateStatus,
            `Tamamlandı: ${legacy.length} kaynak ürün, ${stores.length} mağaza. ` +
            `${copied} kopya oluşturuldu` +
            (skipped ? `, ${skipped} tanesi zaten vardı (atlandı).` : ".") +
            " Eski kayıtlar silinmedi.");

        loadProducts();
    } catch (err) {
        console.error(err);
        setStatus(migrateStatus, "Göç başarısız: " + (err.message || ""), true);
    } finally {
        btnMigrate.disabled = false;
    }
});
