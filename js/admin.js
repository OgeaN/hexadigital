// ============================================================================
// Yönetim paneli — Google girişi + rol bazlı arayüz + CRUD.
//
// YETKİ MODELİ (gerçek zorlama firestore.rules / storage.rules'ta):
//   • MAĞAZA ADMİNİ → stores/{id}.adminEmails dizisi.
//       Kendi mağazasının ÜRÜNLERİNİ, İNDİRİMLERİNİ ve GÖRÜNÜMÜNÜ yönetir.
//       Mağaza açamaz/silemez, yönetici atayamaz, mağazayı yayından kaldıramaz.
//   • SÜPER ADMIN  → firebase-config.js ADMIN_EMAILS.
//       Yukarıdakilerin tümü + mağaza açma/silme, yönetici atama, araçlar.
//
// Buradaki kontroller YALNIZCA arayüz içindir; bir alanın gizlenmesi güvenlik
// sağlamaz. Kilitli alanlar (adminEmails, active) Security Rules'ta korunur.
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
    isValidSlug, buildStoreShopUrl
} from "./stores.js";
import { CATEGORIES, getCategory } from "./specs.js";
import {
    normalizeRules, getDiscountType, DISCOUNT_TYPES, DISCOUNT_TYPE_MIN_TOTAL
} from "./discount.js";
import { OPTION_PRESETS, getPreset, getOptions } from "./options.js";

const $ = id => document.getElementById(id);

// ---------- Kabuk ----------
const loadingEl = $("admin-loading");
const loginEl = $("admin-login");
const panelEl = $("admin-panel");
const loginError = $("login-error");
const btnSignin = $("btn-google-signin");
const btnSignout = $("btn-signout");
const adminEmailEl = $("admin-email");
const adminAvatarEl = $("admin-avatar");
const adminRoleEl = $("admin-role");
const btnViewStore = $("btn-view-store");
const navEl = $("admin-nav");
const navSuperEl = $("admin-nav-super");
const scopeRow = $("store-scope-row");
const storeSelect = $("store-select");

// ---------- Ürünler ----------
const productsView = $("products-view");
const productSearch = $("product-search");
const listEl = $("admin-list");
const listStatus = $("list-status");
const btnNewProduct = $("btn-new-product");
const productsScopeLabel = $("products-scope-label");

const form = $("product-form");
const formHeading = $("form-heading");
const editIdEl = $("edit-id");
const nameEl = $("p-name");
const descEl = $("p-desc");
const priceEl = $("p-price");
const visibleEl = $("p-visible");
const categoryEl = $("p-category");
const specSection = $("spec-section");
const specFieldsEl = $("p-spec-fields");
const hasOptionsEl = $("p-has-options");
const optionGroupsEl = $("p-option-groups");
const optionListEl = $("p-option-list");
const optionPresetEl = $("p-option-preset");
const btnAddOption = $("btn-add-option");
const imageFileEl = $("p-image-file");
const imageChosenEl = $("p-image-chosen");
const imageUrlsEl = $("p-image-urls");
const existingImagesRow = $("existing-images-row");
const existingImagesEl = $("existing-images");
const btnSave = $("btn-save");
const formStatus = $("form-status");

// ---------- İndirimler ----------
const discountForm = $("discount-form");
const discountRulesEl = $("s-discount-rules");
const btnAddDiscount = $("btn-add-discount");
const discountStatus = $("discount-status");
const discountsScopeLabel = $("discounts-scope-label");

// ---------- Mağaza görünümü ----------
const storefrontForm = $("storefront-form");
const sfNameEl = $("sf-name");
const sfTaglineEl = $("sf-tagline");
const sfWhatsappEl = $("sf-whatsapp");
const sfLogoFileEl = $("sf-logo-file");
const sfLogoChosenEl = $("sf-logo-chosen");
const sfLogoUrlsEl = $("sf-logo-urls");
const sfBannerFileEl = $("sf-banner-file");
const sfBannerChosenEl = $("sf-banner-chosen");
const sfBannerUrlsEl = $("sf-banner-urls");
const existingBannersRow = $("existing-banners-row");
const existingBannersEl = $("existing-banners");
const existingLogosRow = $("existing-logos-row");
const existingLogosEl = $("existing-logos");
const storefrontStatus = $("storefront-status");
const storefrontScopeLabel = $("storefront-scope-label");

// ---------- Mağazalar (süper admin) ----------
const storesView = $("stores-view");
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
const btnStoreSave = $("btn-store-save");
const btnNewStore = $("btn-new-store");
const storeFormStatus = $("store-form-status");
const storeListEl = $("store-list");
const storeListStatus = $("store-list-status");

// ---------- Araçlar ----------
const btnSeed = $("btn-seed");
const btnMigrate = $("btn-migrate");
const migrateStatus = $("migrate-status");

// ---------- Durum ----------
const SCOPE_KEY = "hexa_admin_store";

let currentEmail = "";
let superAdmin = false;
let myStores = [];
let activeStoreId = "";
let allProducts = [];        // seçili mağazanın ürünleri (arama bunun üstünde)

let editImages = [];
let editBanners = [];
let editLogos = [];
let editSpecs = {};
let editOptions = [];
let editDiscounts = [];

// ============================================================================
// Yardımcılar
// ============================================================================
function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
function formatPrice(n) { return Number(n).toLocaleString("tr-TR"); }

function show(el) { if (el) el.style.display = ""; }
function hide(el) { if (el) el.style.display = "none"; }

function setStatus(el, msg, isError = false) {
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("error", isError);
    el.style.display = msg ? "block" : "none";
}
const setFormStatus = (m, e) => setStatus(formStatus, m, e);
const setStoreFormStatus = (m, e) => setStatus(storeFormStatus, m, e);
const setDiscountStatus = (m, e) => setStatus(discountStatus, m, e);
const setStorefrontStatus = (m, e) => setStatus(storefrontStatus, m, e);

/** Textarea'daki satırları temiz bir diziye çevirir. */
function linesToArray(value) {
    return String(value || "")
        .split(/[\n,]/)
        .map(s => s.trim())
        .filter(Boolean);
}

/** Seçilen dosyaların adını kullanıcıya gösterir. */
function wireFileLabel(inputEl, labelEl) {
    if (!inputEl || !labelEl) return;
    inputEl.addEventListener("change", () => {
        const files = Array.from(inputEl.files || []);
        labelEl.textContent = files.length
            ? files.map(f => f.name).join(", ")
            : "";
    });
}

/**
 * Dosyaları Storage'a yükleyip indirme URL'lerini döndürür.
 * @param {File[]} files
 * @param {string} pathPrefix  örn: "products/sam3d/img"
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

/** Küçük görsel önizleme + × ile kaldırma. */
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

/** Seçili mağazayı myStores içinden döndürür. */
function activeStore() {
    return myStores.find(s => s.id === activeStoreId) || null;
}

// ============================================================================
// Sekme yönlendirmesi
// ============================================================================
const panels = () => document.querySelectorAll("[data-panel]");

function switchTab(tab) {
    // Süper admine özel sekmeler yetkisiz kullanıcıda açılamaz.
    // (Arayüz koruması — gerçek engel Security Rules'ta.)
    if ((tab === "stores" || tab === "tools") && !superAdmin) return;

    panels().forEach(p => { p.hidden = p.dataset.panel !== tab; });
    navEl.querySelectorAll(".admin-nav__item").forEach(b =>
        b.classList.toggle("active", b.dataset.tab === tab));

    // Sekme değişince açık formlar kapansın — yarım kalmış düzenleme kafa karıştırır
    if (tab !== "products") closeProductForm();
    if (tab !== "stores") closeStoreForm();
}

navEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-nav__item");
    if (btn) switchTab(btn.dataset.tab);
});

// ============================================================================
// Auth
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
        loginError.textContent = `"${user.email}" yetkili değil. Erişim reddedildi.`;
        show(loginError);
        return;
    }

    hide(loginEl);
    show(panelEl);

    adminEmailEl.textContent = user.email;
    adminAvatarEl.textContent = (user.email || "?").charAt(0);
    adminRoleEl.textContent = superAdmin ? "Süper Admin" : "Mağaza Yöneticisi";
    adminRoleEl.classList.toggle("admin-role--super", superAdmin);

    // Süper admin bölümleri
    navSuperEl.hidden = !superAdmin;

    populateStoreSelect();
    if (superAdmin) loadStores();

    if (activeStoreId) {
        loadProducts();
        loadStorefront();
        loadDiscounts();
    } else {
        setStatus(listStatus,
            superAdmin
                ? "Henüz mağaza yok. 'Tüm Mağazalar' bölümünden ilk mağazayı oluşturun."
                : "Bu hesaba bağlı mağaza bulunamadı.");
    }
});

btnSignin.addEventListener("click", async () => {
    hide(loginError);
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
        console.error("Giriş hatası:", err);
        loginError.textContent = "Giriş yapılamadı: " + (err.message || err.code || "");
        show(loginError);
    }
});

btnSignout.addEventListener("click", () => signOut(auth));

// ============================================================================
// Mağaza kapsamı
// ============================================================================
function populateStoreSelect() {
    storeSelect.innerHTML = myStores
        .map(s => `<option value="${esc(s.id)}">${esc(s.name || s.id)}${s.active === false ? " (pasif)" : ""}</option>`)
        .join("");

    if (myStores.length === 0) {
        activeStoreId = "";
        scopeRow.hidden = true;
        return;
    }

    const saved = localStorage.getItem(SCOPE_KEY);
    activeStoreId = myStores.some(s => s.id === saved) ? saved : myStores[0].id;
    storeSelect.value = activeStoreId;

    // Tek mağazası olanda seçici gereksiz gürültü
    scopeRow.hidden = myStores.length === 1;

    syncScopeLabels();
}

/** Bölüm başlıklarına hangi mağazanın yönetildiğini yazar. */
function syncScopeLabels() {
    const s = activeStore();
    const name = s ? (s.name || s.id) : "—";

    if (productsScopeLabel) productsScopeLabel.textContent = `${name} mağazasının ürünleri`;
    if (discountsScopeLabel) discountsScopeLabel.textContent = `${name} için geçerli indirim kuralları`;
    if (storefrontScopeLabel) storefrontScopeLabel.textContent = `${name} — müşterinin gördüğü bilgiler`;

    if (btnViewStore) {
        if (s) {
            btnViewStore.href = buildStoreShopUrl(s.id);
            show(btnViewStore);
        } else {
            hide(btnViewStore);
        }
    }
}

storeSelect.addEventListener("change", () => {
    activeStoreId = storeSelect.value;
    localStorage.setItem(SCOPE_KEY, activeStoreId);
    closeProductForm();
    syncScopeLabels();
    loadProducts();
    loadStorefront();
    loadDiscounts();
});

// ============================================================================
// ÜRÜNLER — liste
// ============================================================================
async function loadProducts() {
    if (!activeStoreId) return;

    setStatus(listStatus, "Yükleniyor...");
    listEl.innerHTML = "";

    try {
        const q = query(
            collection(db, PRODUCTS_COLLECTION),
            where("storeId", "==", activeStoreId)
        );
        const snap = await getDocs(q);

        allProducts = [];
        snap.forEach(d => allProducts.push({ id: d.id, ...d.data() }));

        allProducts.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });

        setNavCount("nav-count-products", allProducts.length);
        renderProductList();
    } catch (err) {
        console.error(err);
        setStatus(listStatus, "Ürünler yüklenemedi: " + (err.message || ""), true);
    }
}

function setNavCount(id, n) {
    const el = $(id);
    if (el) el.textContent = n > 0 ? n : "";
}

/** Arama filtresini uygulayıp listeyi basar. */
function renderProductList() {
    const q = String(productSearch?.value || "").toLocaleLowerCase("tr").trim();
    const list = q
        ? allProducts.filter(p =>
            String(p.name || "").toLocaleLowerCase("tr").includes(q) ||
            String(p.description || "").toLocaleLowerCase("tr").includes(q))
        : allProducts;

    listEl.innerHTML = "";

    if (list.length === 0) {
        hide(listStatus);
        listEl.innerHTML = q
            ? `<div class="admin-empty"><h4>Sonuç yok</h4>
                 <p>"${esc(productSearch.value)}" ile eşleşen ürün bulunamadı.</p></div>`
            : `<div class="admin-empty"><h4>Henüz ürün yok</h4>
                 <p>İlk ürününüzü ekleyerek mağazanızı doldurun.</p>
                 <button type="button" class="btn btn--primary" data-empty-new>+ Yeni Ürün</button></div>`;
        listEl.querySelector("[data-empty-new]")?.addEventListener("click", openNewProduct);
        return;
    }

    hide(listStatus);
    list.forEach(renderRow);
}

productSearch?.addEventListener("input", renderProductList);

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
    const optBadge = getOptions(p).length ? ` <span class="badge-visible">seçimli</span>` : "";

    row.innerHTML = `
        ${img}
        <div class="admin-row__info">
            <div class="admin-row__name">${esc(p.name)} ${badge}${imgBadge}${optBadge}</div>
            <div class="admin-row__meta">
                <span class="admin-row__price">${formatPrice(p.price)} TL</span>
                ${p.description ? " — " + esc(p.description) : ""}
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
// ÜRÜNLER — form açma/kapama
// ============================================================================
function openNewProduct() {
    resetForm();
    formHeading.textContent = "Yeni Ürün";
    btnSave.textContent = "Kaydet";
    hide(productsView);
    show(form);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    nameEl.focus();
}

function closeProductForm() {
    if (!form) return;
    hide(form);
    show(productsView);
    resetForm();
}

btnNewProduct.addEventListener("click", openNewProduct);
$("btn-cancel").addEventListener("click", closeProductForm);
$("btn-cancel-2").addEventListener("click", closeProductForm);

// ============================================================================
// Kategori + kategoriye özel bilgiler
// ============================================================================
function populateCategorySelect() {
    categoryEl.innerHTML =
        `<option value="">Kategorisiz</option>` +
        CATEGORIES.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
}

function renderSpecFields(values = {}) {
    const cat = getCategory(categoryEl.value);

    if (!cat) {
        specFieldsEl.innerHTML = "";
        hide(specSection);
        return;
    }

    show(specSection);
    specFieldsEl.innerHTML = `
        <div class="form-grid">
            ${cat.fields.map(f => `
                <div class="form-row">
                    <label for="spec-${esc(f.key)}">
                        ${esc(f.label)}${f.unit ? ` <span class="spec-unit">(${esc(f.unit)})</span>` : ""}
                    </label>
                    ${specInputHtml(f, values[f.key])}
                </div>`).join("")}
        </div>`;
}

function specInputHtml(f, value) {
    const v = value === undefined || value === null ? "" : String(value);
    const id = `spec-${esc(f.key)}`;

    if (f.type === "select") {
        // Sayısal seçenekler sayı olarak saklanır: kayıtta 1 duran değer
        // "1.0" seçeneğiyle metin olarak eşleşmez → sayısalsa sayı karşılaştır.
        const same = (o) => {
            if (String(o) === v) return true;
            const a = Number(o), b = Number(v);
            return v !== "" && !isNaN(a) && !isNaN(b) && a === b;
        };
        const opts = (f.options || []).map(o =>
            `<option value="${esc(o)}"${same(o) ? " selected" : ""}>${esc(o)}</option>`
        ).join("");
        return `<select id="${id}" data-spec="${esc(f.key)}">
                    <option value="">${esc(f.placeholder || "Seçiniz")}</option>${opts}
                </select>`;
    }

    const attrs = [
        `type="${f.type === "number" ? "number" : "text"}"`,
        `id="${id}"`,
        `data-spec="${esc(f.key)}"`,
        `value="${esc(v)}"`,
        f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "",
        f.step ? `step="${esc(f.step)}"` : "",
        f.min !== undefined ? `min="${esc(f.min)}"` : "",
        f.max !== undefined ? `max="${esc(f.max)}"` : ""
    ].filter(Boolean).join(" ");

    return `<input ${attrs}>`;
}

/** Formdaki spec alanlarını okur. BOŞ alanlar nesneye HİÇ yazılmaz. */
function collectSpecs() {
    const cat = getCategory(categoryEl.value);
    const out = {};

    specFieldsEl.querySelectorAll("[data-spec]").forEach(el => {
        const key = el.dataset.spec;
        const val = String(el.value || "").trim();
        if (!val) return;

        // Tipe ŞEMADAN bakılır: birimli <select>'lerde el.type "select-one"
        // döner ve DOM'a bakan bir kontrol bunları kaçırır.
        const field = cat?.fields.find(f => f.key === key);
        const numeric = (field?.type === "number" || !!field?.unit) && !isNaN(Number(val));

        out[key] = numeric ? Number(val) : val;
    });

    return out;
}

populateCategorySelect();
categoryEl.addEventListener("change", () => renderSpecFields(editSpecs));

// ============================================================================
// Seçimli ürün
// ============================================================================
function populatePresetSelect() {
    optionPresetEl.innerHTML =
        `<option value="">Hazır seçenek...</option>` +
        OPTION_PRESETS.map(p => `<option value="${esc(p.key)}">${esc(p.label)}</option>`).join("") +
        `<option value="__custom">Özel seçenek (boş)</option>`;
}

function syncOptionsVisibility() {
    if (hasOptionsEl.checked) {
        show(optionGroupsEl);
        if (!editOptions.length) addOptionGroup("color");
    } else {
        hide(optionGroupsEl);
    }
}

function addOptionGroup(presetKey) {
    const preset = presetKey && presetKey !== "__custom" ? getPreset(presetKey) : null;
    editOptions.push({
        key: preset?.key || "",
        label: preset?.label || "",
        required: true,
        values: preset ? [...preset.values] : []
    });
    renderOptionGroups();
}

function renderOptionGroups() {
    if (!editOptions.length) {
        optionListEl.innerHTML = `<p class="form-hint">Henüz seçenek yok. Aşağıdan ekleyin.</p>`;
        return;
    }

    optionListEl.innerHTML = editOptions.map((o, i) => `
        <div class="option-group">
            <div class="form-grid">
                <div class="form-row">
                    <label>Seçenek Adı <small class="muted">— müşteri görür</small></label>
                    <input type="text" data-og-label="${i}" value="${esc(o.label)}" placeholder="Renk">
                </div>
                <div class="form-row">
                    <label>Anahtar <small class="muted">— teknik</small></label>
                    <input type="text" data-og-key="${i}" value="${esc(o.key)}" placeholder="color">
                </div>
            </div>
            <div class="form-row">
                <label>Değerler <small class="muted">— her satıra bir adet</small></label>
                <textarea data-og-values="${i}" rows="4"
                          placeholder="Siyah&#10;Beyaz&#10;Kırmızı">${esc(o.values.join("\n"))}</textarea>
            </div>
            <div class="option-group__foot">
                <label class="form-check" style="margin:0;">
                    <input type="checkbox" data-og-req="${i}" ${o.required ? "checked" : ""}>
                    Zorunlu
                </label>
                <button type="button" class="btn btn--danger btn-sm" data-og-del="${i}">Sil</button>
            </div>
        </div>`).join("");

    optionListEl.querySelectorAll("[data-og-label]").forEach(el =>
        el.addEventListener("input", () => {
            const i = Number(el.dataset.ogLabel);
            editOptions[i].label = el.value;
            // Anahtar boşsa etiketten türet ("Renk" → "renk")
            const keyEl = optionListEl.querySelector(`[data-og-key="${i}"]`);
            if (keyEl && !editOptions[i].key.trim()) {
                const auto = slugifyKey(el.value);
                editOptions[i].key = auto;
                keyEl.value = auto;
            }
        }));

    optionListEl.querySelectorAll("[data-og-key]").forEach(el =>
        el.addEventListener("input", () => {
            editOptions[Number(el.dataset.ogKey)].key = el.value;
        }));

    optionListEl.querySelectorAll("[data-og-values]").forEach(el =>
        el.addEventListener("input", () => {
            editOptions[Number(el.dataset.ogValues)].values = linesToArray(el.value);
        }));

    optionListEl.querySelectorAll("[data-og-req]").forEach(el =>
        el.addEventListener("change", () => {
            editOptions[Number(el.dataset.ogReq)].required = el.checked;
        }));

    optionListEl.querySelectorAll("[data-og-del]").forEach(el =>
        el.addEventListener("click", () => {
            editOptions.splice(Number(el.dataset.ogDel), 1);
            renderOptionGroups();
        }));
}

/** "Renk" → "renk"; Türkçe harfleri sadeleştirir. */
function slugifyKey(text) {
    const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
    return String(text || "")
        .toLocaleLowerCase("tr")
        .replace(/[çğıöşü]/g, c => map[c] || c)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function collectOptions() {
    if (!hasOptionsEl.checked) return { options: [], dropped: 0 };

    const seen = new Set();
    const options = [];
    let dropped = 0;

    editOptions.forEach(o => {
        const key = slugifyKey(o.key || o.label);
        const values = (o.values || []).map(v => String(v).trim()).filter(Boolean);

        if (!key || !values.length || seen.has(key)) { dropped++; return; }

        seen.add(key);
        options.push({
            key,
            label: String(o.label || key).trim(),
            required: o.required !== false,
            values
        });
    });

    return { options, dropped };
}

populatePresetSelect();
renderOptionGroups();
hasOptionsEl.addEventListener("change", syncOptionsVisibility);
btnAddOption.addEventListener("click", () => {
    addOptionGroup(optionPresetEl.value);
    optionPresetEl.value = "";
});

wireFileLabel(imageFileEl, imageChosenEl);
wireFileLabel(sfLogoFileEl, sfLogoChosenEl);
wireFileLabel(sfBannerFileEl, sfBannerChosenEl);

// ============================================================================
// ÜRÜNLER — kaydet
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
        const imageUrls = [...editImages, ...linesToArray(imageUrlsEl.value)];
        const optionResult = collectOptions();

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
                    "Görsel yüklenemedi. Dosya 5 MB'ı aşmamalı ve görsel olmalı. " +
                    "Alternatif olarak URL alanını kullanabilirsiniz.", true);
                btnSave.disabled = false;
                return;
            }
        }

        const data = {
            name: nameEl.value.trim(),
            description: descEl.value.trim(),
            price: Number(priceEl.value) || 0,
            currency: "TL",
            imageUrls,
            imageUrl: imageUrls[0] || "",
            visible: visibleEl.checked,
            // Kategori kaldırıldıysa specs de temizlenir
            category: categoryEl.value || "",
            specs: categoryEl.value ? collectSpecs() : {},
            options: optionResult.options
        };

        const warn = optionResult.dropped
            ? ` (${optionResult.dropped} eksik seçenek grubu kaydedilmedi)`
            : "";

        const editId = editIdEl.value;
        if (editId) {
            // storeId güncellemede ASLA değişmez (kurallar da reddeder)
            await updateDoc(doc(db, PRODUCTS_COLLECTION, editId), data);
        } else {
            data.storeId = activeStoreId;
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, PRODUCTS_COLLECTION), data);
        }

        closeProductForm();
        await loadProducts();
        setStatus(listStatus, (editId ? "Ürün güncellendi ✓" : "Ürün eklendi ✓") + warn, !!optionResult.dropped);
        setTimeout(() => hide(listStatus), 3000);
    } catch (err) {
        console.error(err);
        setFormStatus("Kaydedilemedi: " + (err.message || ""), true);
    } finally {
        btnSave.disabled = false;
    }
});

function startEdit(p) {
    resetForm();

    editIdEl.value = p.id;
    nameEl.value = p.name || "";
    descEl.value = p.description || "";
    priceEl.value = p.price ?? "";
    visibleEl.checked = !!p.visible;

    categoryEl.value = p.category || "";
    editSpecs = (p.specs && typeof p.specs === "object") ? { ...p.specs } : {};
    renderSpecFields(editSpecs);

    editOptions = getOptions(p).map(o => ({ ...o, values: [...o.values] }));
    hasOptionsEl.checked = editOptions.length > 0;
    renderOptionGroups();
    // syncOptionsVisibility boş listede otomatik renk ekler; düzenlemede
    // ürünün gerçek durumu korunmalı → görünürlüğü doğrudan ayarla
    optionGroupsEl.style.display = hasOptionsEl.checked ? "" : "none";

    editImages = getImages(p);
    renderExistingImages();

    formHeading.textContent = "Ürünü Düzenle";
    btnSave.textContent = "Güncelle";

    hide(productsView);
    show(form);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderExistingImages() {
    renderThumbs(existingImagesRow, existingImagesEl, editImages, renderExistingImages);
}

function resetForm() {
    form.reset();
    editIdEl.value = "";
    visibleEl.checked = true;

    categoryEl.value = "";
    editSpecs = {};
    renderSpecFields();

    editOptions = [];
    hasOptionsEl.checked = false;
    renderOptionGroups();
    hide(optionGroupsEl);

    editImages = [];
    renderExistingImages();
    imageChosenEl.textContent = "";
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
    if (!confirm(`"${p.name}" silinsin mi?\n\nBu işlem geri alınamaz.`)) return;
    try {
        await deleteDoc(doc(db, PRODUCTS_COLLECTION, p.id));
        loadProducts();
    } catch (err) {
        alert("Silinemedi: " + (err.message || ""));
    }
}

// ============================================================================
// İNDİRİMLER — mağaza admini de yönetir
// ============================================================================
function loadDiscounts() {
    const s = activeStore();
    editDiscounts = s ? normalizeRules(s) : [];
    renderDiscountRules();
    setNavCount("nav-count-discounts", editDiscounts.length);
    setDiscountStatus("");
}

function renderDiscountRules() {
    if (!editDiscounts.length) {
        discountRulesEl.innerHTML = `
            <div class="admin-empty">
                <h4>İndirim kuralı yok</h4>
                <p>Müşterileri daha fazla almaya teşvik etmek için bir kural ekleyin.</p>
            </div>`;
        return;
    }

    discountRulesEl.innerHTML = editDiscounts.map((r, i) => {
        const def = getDiscountType(r.type) || DISCOUNT_TYPES[0];
        return `
        <div class="discount-rule">
            <div class="discount-rule__main">
                <select data-dr-type="${i}" class="discount-rule__type">
                    ${DISCOUNT_TYPES.map(t =>
                        `<option value="${esc(t.id)}"${t.id === r.type ? " selected" : ""}>${esc(t.label)}</option>`
                    ).join("")}
                </select>
                <span class="discount-rule__lead">${esc(def.lead)}</span>
                <input type="number" min="0" step="1" data-dr-val="${i}"
                       value="${esc(r.threshold)}" placeholder="${esc(def.placeholder)}">
                <span class="discount-rule__sep">${esc(def.tail)}</span>
                <input type="number" min="1" max="100" step="1" data-dr-pct="${i}"
                       value="${esc(r.percent)}" placeholder="10">
                <span class="discount-rule__sep">% indirim</span>
                <button type="button" class="btn btn--danger btn-sm" data-dr-del="${i}">Sil</button>
            </div>
            <p class="form-hint discount-rule__hint">${esc(def.hint)}</p>
        </div>`;
    }).join("");

    discountRulesEl.querySelectorAll("[data-dr-type]").forEach(el =>
        el.addEventListener("change", () => {
            // Tür değişince etiket/ipucu da değişmeli → yeniden çiz
            editDiscounts[Number(el.dataset.drType)].type = el.value;
            renderDiscountRules();
        }));
    discountRulesEl.querySelectorAll("[data-dr-val]").forEach(el =>
        el.addEventListener("input", () => {
            editDiscounts[Number(el.dataset.drVal)].threshold = el.value;
        }));
    discountRulesEl.querySelectorAll("[data-dr-pct]").forEach(el =>
        el.addEventListener("input", () => {
            editDiscounts[Number(el.dataset.drPct)].percent = el.value;
        }));
    discountRulesEl.querySelectorAll("[data-dr-del]").forEach(el =>
        el.addEventListener("click", () => {
            editDiscounts.splice(Number(el.dataset.drDel), 1);
            renderDiscountRules();
        }));
}

btnAddDiscount.addEventListener("click", () => {
    editDiscounts.push({ type: DISCOUNT_TYPE_MIN_TOTAL, threshold: "", percent: "" });
    renderDiscountRules();
});

/**
 * Kaydedilecek kural dizisi. Geçersiz satırlar elenir; aynı tür+eşik
 * iki kez yazılmışsa en yüksek yüzdeli kalır.
 */
function collectDiscountRules() {
    const seen = new Map();
    let dropped = 0;

    editDiscounts.forEach(r => {
        const def = getDiscountType(r.type);
        const threshold = Number(r.threshold);
        const percent = Number(r.percent);

        if (!def ||
            !Number.isFinite(threshold) || threshold < 0 ||
            !Number.isFinite(percent) || percent <= 0 || percent > 100) {
            dropped++;
            return;
        }

        const key = `${r.type}:${threshold}`;
        const prev = seen.get(key);
        if (prev && prev.percent >= percent) return;

        seen.set(key, { type: r.type, [def.field]: threshold, percent });
    });

    return { rules: [...seen.values()], dropped };
}

discountForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeStoreId) return;

    const btn = $("btn-save-discounts");
    btn.disabled = true;
    setDiscountStatus("Kaydediliyor...");

    try {
        const { rules, dropped } = collectDiscountRules();

        // Mağaza admini adminEmails/active alanlarına DOKUNMAZ — kurallar da
        // buna izin vermez. Yalnızca discountRules gönderilir.
        await updateDoc(doc(db, STORES_COLLECTION, activeStoreId), {
            discountRules: rules,
            updatedAt: serverTimestamp()
        });

        // Yerel kopyayı tazele ki sekme değişince eski hâli görünmesin
        const s = activeStore();
        if (s) s.discountRules = rules;

        editDiscounts = normalizeRules({ discountRules: rules });
        renderDiscountRules();
        setNavCount("nav-count-discounts", rules.length);

        setDiscountStatus(
            "İndirimler kaydedildi ✓" +
            (dropped ? ` (${dropped} eksik kural kaydedilmedi)` : ""),
            !!dropped
        );
    } catch (err) {
        console.error(err);
        setDiscountStatus("Kaydedilemedi: " + (err.message || ""), true);
    } finally {
        btn.disabled = false;
    }
});

// ============================================================================
// MAĞAZA GÖRÜNÜMÜ — mağaza admini kendi mağazasını düzenler
// ============================================================================
function loadStorefront() {
    const s = activeStore();
    if (!s) return;

    sfNameEl.value = s.name || "";
    sfTaglineEl.value = s.tagline || "";
    sfWhatsappEl.value = s.whatsapp || "";
    sfLogoUrlsEl.value = "";
    sfBannerUrlsEl.value = "";
    sfLogoFileEl.value = "";
    sfBannerFileEl.value = "";
    sfLogoChosenEl.textContent = "";
    sfBannerChosenEl.textContent = "";

    editBanners = getImages({ imageUrls: s.bannerUrls, imageUrl: s.bannerUrl });
    editLogos = getImages({ imageUrls: s.logoUrls, imageUrl: s.logoUrl });
    renderExistingBanners();
    renderExistingLogos();

    setStorefrontStatus("");
}

function renderExistingBanners() {
    renderThumbs(existingBannersRow, existingBannersEl, editBanners, renderExistingBanners);
}
function renderExistingLogos() {
    renderThumbs(existingLogosRow, existingLogosEl, editLogos, renderExistingLogos);
}

storefrontForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeStoreId) return;

    const btn = $("btn-storefront-save");
    btn.disabled = true;
    setStorefrontStatus("Kaydediliyor...");

    try {
        const whatsapp = sfWhatsappEl.value.replace(/\D/g, "");
        if (!whatsapp) {
            setStorefrontStatus("WhatsApp numarası gerekli (yalnız rakam).", true);
            btn.disabled = false;
            return;
        }

        const logoUrls = [...editLogos, ...linesToArray(sfLogoUrlsEl.value)];
        const bannerUrls = [...editBanners, ...linesToArray(sfBannerUrlsEl.value)];

        try {
            const logoFiles = Array.from(sfLogoFileEl.files || []);
            if (logoFiles.length) {
                setStorefrontStatus("Logo yükleniyor...");
                logoUrls.push(...await uploadImages(logoFiles, `stores/${activeStoreId}/logo`));
            }
            const bannerFiles = Array.from(sfBannerFileEl.files || []);
            if (bannerFiles.length) {
                setStorefrontStatus("Banner yükleniyor...");
                bannerUrls.push(...await uploadImages(bannerFiles, `stores/${activeStoreId}/banner`));
            }
        } catch (upErr) {
            console.error("Storage yükleme hatası:", upErr);
            setStorefrontStatus(
                "Görsel yüklenemedi. Dosya 5 MB'ı aşmamalı ve görsel olmalı.", true);
            btn.disabled = false;
            return;
        }

        // DİKKAT: adminEmails / active BURADA GÖNDERİLMEZ. Mağaza admini bu
        // alanlara dokunamaz (Security Rules reddeder); süper admin de bunları
        // "Tüm Mağazalar" formundan yönetir.
        const data = {
            name: sfNameEl.value.trim(),
            tagline: sfTaglineEl.value.trim(),
            whatsapp,
            logoUrls,
            logoUrl: logoUrls[0] || "",
            bannerUrls,
            bannerUrl: bannerUrls[0] || "",
            updatedAt: serverTimestamp()
        };

        await updateDoc(doc(db, STORES_COLLECTION, activeStoreId), data);

        // Yerel kopyayı tazele
        const s = activeStore();
        if (s) Object.assign(s, data);

        loadStorefront();
        populateStoreSelect();      // ad değiştiyse seçici de güncellensin
        storeSelect.value = activeStoreId;
        setStorefrontStatus("Mağaza bilgileri kaydedildi ✓");
        if (superAdmin) loadStores();
    } catch (err) {
        console.error(err);
        setStorefrontStatus("Kaydedilemedi: " + (err.message || ""), true);
    } finally {
        btn.disabled = false;
    }
});

// ============================================================================
// TÜM MAĞAZALAR — yalnızca süper admin
// ============================================================================
async function loadStores() {
    if (!superAdmin) return;

    setStatus(storeListStatus, "Yükleniyor...");
    storeListEl.innerHTML = "";

    try {
        const stores = await getAllStores();
        setNavCount("nav-count-stores", stores.length);

        if (stores.length === 0) {
            hide(storeListStatus);
            storeListEl.innerHTML = `
                <div class="admin-empty">
                    <h4>Henüz mağaza yok</h4>
                    <p>İlk mağazayı oluşturarak başlayın.</p>
                </div>`;
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

    const cover = getImages({ imageUrls: s.bannerUrls, imageUrl: s.bannerUrl })[0]
               || getImages({ imageUrls: s.logoUrls, imageUrl: s.logoUrl })[0];
    const img = cover
        ? `<img class="admin-row__img" src="${esc(cover)}" alt="">`
        : `<div class="admin-row__img"></div>`;

    const badge = s.active
        ? `<span class="badge-visible">Yayında</span>`
        : `<span class="badge-hidden">Pasif</span>`;
    const admins = Array.isArray(s.adminEmails) ? s.adminEmails : [];
    const adminBadge = admins.length
        ? ` <span class="badge-visible">${admins.length} yönetici</span>`
        : ` <span class="badge-hidden">yönetici yok</span>`;
    const discounts = normalizeRules(s);
    const discountBadge = discounts.length
        ? ` <span class="badge-visible">${discounts.length} indirim</span>`
        : "";

    row.innerHTML = `
        ${img}
        <div class="admin-row__info">
            <div class="admin-row__name">${esc(s.name || s.id)} ${badge}${adminBadge}${discountBadge}</div>
            <div class="admin-row__meta">
                <span class="admin-row__price">${esc(s.id)}</span>
                — WhatsApp: ${esc(s.whatsapp || "—")}
                ${admins.length ? "<br>" + esc(admins.join(", ")) : ""}
            </div>
        </div>
        <div class="admin-row__actions">
            <button class="btn btn--ghost btn-sm" data-toggle="${esc(s.id)}">
                ${s.active ? "Yayından Kaldır" : "Yayınla"}
            </button>
            <a class="btn btn--ghost btn-sm" href="${esc(buildStoreShopUrl(s.id))}" target="_blank"
               rel="noopener">Gör</a>
            <button class="btn btn--ghost btn-sm" data-edit="${esc(s.id)}">Düzenle</button>
            <button class="btn btn--danger btn-sm" data-delete="${esc(s.id)}">Sil</button>
        </div>`;

    row.querySelector("[data-edit]").addEventListener("click", () => startStoreEdit(s));
    row.querySelector("[data-toggle]").addEventListener("click", () => toggleStoreActive(s));
    row.querySelector("[data-delete]").addEventListener("click", () => removeStore(s));

    storeListEl.appendChild(row);
}

function openNewStore() {
    resetStoreForm();
    storeFormHeading.textContent = "Yeni Mağaza";
    btnStoreSave.textContent = "Oluştur";
    hide(storesView);
    show(storeForm);
    storeForm.scrollIntoView({ behavior: "smooth", block: "start" });
    sSlugEl.focus();
}

function closeStoreForm() {
    if (!storeForm) return;
    hide(storeForm);
    show(storesView);
    resetStoreForm();
}

btnNewStore.addEventListener("click", openNewStore);
$("btn-store-cancel").addEventListener("click", closeStoreForm);
$("btn-store-cancel-2").addEventListener("click", closeStoreForm);

storeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!superAdmin) return;   // arayüz koruması; asıl engel Security Rules

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

        if (!editId) {
            const existing = await getDoc(doc(db, STORES_COLLECTION, slug));
            if (existing.exists()) {
                setStoreFormStatus(`"${slug}" kodu zaten kullanılıyor.`, true);
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

        const adminEmails = [...new Set(
            linesToArray(sAdminEmailsEl.value)
                .map(s => s.toLowerCase())
                .filter(s => s.includes("@"))
        )];

        // Bu form YALNIZCA kimlik + yetki alanlarını yönetir. Logo/banner ve
        // indirimler "Mağaza Görünümü" / "İndirimler" bölümlerinden düzenlenir;
        // burada gönderilmedikleri için mevcut değerleri korunur.
        const data = {
            name: sNameEl.value.trim(),
            tagline: sTaglineEl.value.trim(),
            whatsapp,
            adminEmails,
            active: sActiveEl.checked,
            sortOrder: Number(sSortEl.value) || 0,
            updatedAt: serverTimestamp()
        };

        let msg;
        if (editId) {
            await updateDoc(doc(db, STORES_COLLECTION, editId), data);
            msg = "Mağaza güncellendi ✓";
        } else {
            // Yeni mağazada boş görsel/indirim alanları oluşturulur
            data.createdAt = serverTimestamp();
            data.logoUrls = [];
            data.logoUrl = "";
            data.bannerUrls = [];
            data.bannerUrl = "";
            data.discountRules = [];
            await setDoc(doc(db, STORES_COLLECTION, slug), data);
            msg = "Mağaza oluşturuldu ✓";
        }

        closeStoreForm();
        await loadStores();
        setStatus(storeListStatus, msg);
        setTimeout(() => hide(storeListStatus), 3000);

        // Kapsam seçicisini tazele
        myStores = await getStoresForEmail(currentEmail);
        const previous = activeStoreId;
        populateStoreSelect();
        if (previous && myStores.some(s => s.id === previous)) {
            activeStoreId = previous;
            storeSelect.value = previous;
        }
        syncScopeLabels();
    } catch (err) {
        console.error(err);
        setStoreFormStatus("Kaydedilemedi: " + (err.message || ""), true);
    } finally {
        btnStoreSave.disabled = false;
    }
});

function startStoreEdit(s) {
    resetStoreForm();

    storeEditIdEl.value = s.id;
    sSlugEl.value = s.id;
    sSlugEl.disabled = true;      // slug değişimi ürünleri öksüz bırakır
    sNameEl.value = s.name || "";
    sTaglineEl.value = s.tagline || "";
    sWhatsappEl.value = s.whatsapp || "";
    sSortEl.value = s.sortOrder ?? 0;
    sActiveEl.checked = s.active !== false;
    sAdminEmailsEl.value = (Array.isArray(s.adminEmails) ? s.adminEmails : []).join("\n");

    storeFormHeading.textContent = "Mağazayı Düzenle";
    btnStoreSave.textContent = "Güncelle";

    hide(storesView);
    show(storeForm);
    storeForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetStoreForm() {
    storeForm.reset();
    storeEditIdEl.value = "";
    sSlugEl.disabled = false;
    sActiveEl.checked = true;
    sSortEl.value = 0;
    setStoreFormStatus("");
}

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
        "Sadece gizlemek istiyorsanız 'Yayından Kaldır' kullanın.\n\nSilme işlemine devam edilsin mi?"
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
// ARAÇLAR — yalnızca süper admin
// ============================================================================
btnSeed.addEventListener("click", async () => {
    if (!superAdmin) return;
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

        const legacy = [];
        const migratedByStore = new Map();

        snap.forEach(d => {
            const data = d.data();
            if (!data.storeId) { legacy.push({ id: d.id, ...data }); return; }
            if (data.migratedFrom) {
                if (!migratedByStore.has(data.storeId)) migratedByStore.set(data.storeId, new Set());
                migratedByStore.get(data.storeId).add(data.migratedFrom);
            }
        });

        if (legacy.length === 0) {
            setStatus(migrateStatus, "Kopyalanacak mağazasız ürün bulunamadı.");
            btnMigrate.disabled = false;
            return;
        }

        let copied = 0, skipped = 0;

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
