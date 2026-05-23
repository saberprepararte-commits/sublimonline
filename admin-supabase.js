let supabaseClient = null;
let products = [];
let editingProductId = null;
let pendingCsvProducts = [];
const selectedProductIds = new Set();
const ADMIN_PAGE_SIZE = 25;
let adminCurrentPage = 1;

const els = {
  loginForm: document.querySelector("#loginForm"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  loginError: document.querySelector("#loginError"),
  logoutButton: document.querySelector("#logoutButton"),
  adminWorkspace: document.querySelector("#adminWorkspace"),
  settingsForm: document.querySelector("#settingsForm"),
  storeName: document.querySelector("#storeName"),
  whatsappNumber: document.querySelector("#whatsappNumber"),
  storeTagline: document.querySelector("#storeTagline"),
  productForm: document.querySelector("#productForm"),
  formTitle: document.querySelector("#formTitle"),
  resetFormButton: document.querySelector("#resetFormButton"),
  productId: document.querySelector("#productId"),
  productName: document.querySelector("#productName"),
  productCategory: document.querySelector("#productCategory"),
  productPrice: document.querySelector("#productPrice"),
  productStatus: document.querySelector("#productStatus"),
  productImage: document.querySelector("#productImage"),
  productDescription: document.querySelector("#productDescription"),
  productFeatured: document.querySelector("#productFeatured"),
  downloadCsvTemplate: document.querySelector("#downloadCsvTemplate"),
  csvFileInput: document.querySelector("#csvFileInput"),
  importCsvButton: document.querySelector("#importCsvButton"),
  csvSummary: document.querySelector("#csvSummary"),
  csvPreview: document.querySelector("#csvPreview"),
  csvPreviewRows: document.querySelector("#csvPreviewRows"),
  adminProductSearch: document.querySelector("#adminProductSearch"),
  adminCategoryFilter: document.querySelector("#adminCategoryFilter"),
  adminStatusFilter: document.querySelector("#adminStatusFilter"),
  adminResultCount: document.querySelector("#adminResultCount"),
  adminPrevPage: document.querySelector("#adminPrevPage"),
  adminNextPage: document.querySelector("#adminNextPage"),
  adminPageLabel: document.querySelector("#adminPageLabel"),
  selectAllProducts: document.querySelector("#selectAllProducts"),
  deleteSelectedProducts: document.querySelector("#deleteSelectedProducts"),
  selectedProductsCount: document.querySelector("#selectedProductsCount"),
  adminProductRows: document.querySelector("#adminProductRows"),
  totalProducts: document.querySelector("#totalProducts"),
  totalFeatured: document.querySelector("#totalFeatured"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast")
};

init();

async function init() {
  const theme = localStorage.getItem("gallery-store-theme");
  if (theme === "dark") document.documentElement.classList.add("dark");

  supabaseClient = createSupabaseClient();
  bindEvents();
  refreshIcons();

  if (!supabaseClient) {
    showError("Falta configurar Supabase en supabase-config.js.");
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data.session) await showWorkspace();
}

function createSupabaseClient() {
  const config = window.SUBLIMO_SUPABASE;
  if (!config?.url || !config?.anonKey || !window.supabase) return null;
  return window.supabase.createClient(config.url, config.anonKey);
}

function bindEvents() {
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutButton.addEventListener("click", handleLogout);
  els.settingsForm.addEventListener("submit", handleSettingsSubmit);
  els.productForm.addEventListener("submit", handleProductSubmit);
  els.resetFormButton.addEventListener("click", resetProductForm);
  els.downloadCsvTemplate.addEventListener("click", downloadCsvTemplate);
  els.csvFileInput.addEventListener("change", handleCsvFile);
  els.importCsvButton.addEventListener("click", importCsvProducts);
  els.adminProductSearch.addEventListener("input", handleAdminFilterChange);
  els.adminCategoryFilter.addEventListener("change", handleAdminFilterChange);
  els.adminStatusFilter.addEventListener("change", handleAdminFilterChange);
  els.adminPrevPage.addEventListener("click", () => changeAdminPage(-1));
  els.adminNextPage.addEventListener("click", () => changeAdminPage(1));
  els.selectAllProducts.addEventListener("change", toggleSelectAllProducts);
  els.deleteSelectedProducts.addEventListener("click", deleteSelectedProducts);
  els.themeToggle.addEventListener("click", toggleTheme);
}

async function handleLogin(event) {
  event.preventDefault();
  els.loginError.hidden = true;

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: els.emailInput.value.trim(),
    password: els.passwordInput.value
  });

  if (error) {
    showError("No se pudo iniciar sesión. Revisa correo y contraseña.");
    return;
  }

  await showWorkspace();
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  products = [];
  renderProducts();
  els.loginForm.hidden = false;
  els.adminWorkspace.hidden = true;
  els.logoutButton.hidden = true;
  showToast("Sesión cerrada.");
}

async function showWorkspace() {
  els.loginForm.hidden = true;
  els.adminWorkspace.hidden = false;
  els.logoutButton.hidden = false;
  await loadSettings();
  await loadProducts();
  showToast("Acceso concedido.");
}

async function loadSettings() {
  const { data, error } = await supabaseClient
    .from("store_settings")
    .select("name,tagline,whatsapp")
    .eq("id", "main")
    .maybeSingle();

  const settings = error || !data
    ? { name: "Sublimo Shop", tagline: "Productos seleccionados", whatsapp: "3126611414" }
    : data;

  els.storeName.value = settings.name || "Sublimo Shop";
  els.storeTagline.value = settings.tagline || "Productos seleccionados";
  els.whatsappNumber.value = stripColombiaPrefix(settings.whatsapp || "3126611414");
}

async function handleSettingsSubmit(event) {
  event.preventDefault();

  const payload = {
    id: "main",
    name: els.storeName.value.trim(),
    tagline: els.storeTagline.value.trim(),
    whatsapp: normalizePhone(els.whatsappNumber.value),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from("store_settings")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    showError("No se pudieron guardar los datos de la tienda. Revisa que hayas ejecutado el SQL actualizado.");
    return;
  }

  els.whatsappNumber.value = stripColombiaPrefix(payload.whatsapp);
  showToast("Datos de tienda actualizados.");
}

async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("products")
    .select("id,name,category,price,status,image,description,featured,sort_order,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    showError("No se pudieron cargar los productos.");
    return;
  }

  products = data || [];
  selectedProductIds.clear();
  renderProducts();
}

function renderProducts() {
  els.totalProducts.textContent = products.length;
  els.totalFeatured.textContent = products.filter((product) => product.featured).length;
  renderAdminCategoryOptions();

  const filteredProducts = getFilteredAdminProducts();
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ADMIN_PAGE_SIZE));
  adminCurrentPage = Math.min(adminCurrentPage, totalPages);
  const startIndex = (adminCurrentPage - 1) * ADMIN_PAGE_SIZE;
  const pageProducts = filteredProducts.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);

  els.adminResultCount.textContent = `${filteredProducts.length} producto${filteredProducts.length === 1 ? "" : "s"} encontrados`;
  els.adminPageLabel.textContent = `P\u00e1gina ${adminCurrentPage} de ${totalPages}`;
  els.adminPrevPage.disabled = adminCurrentPage <= 1;
  els.adminNextPage.disabled = adminCurrentPage >= totalPages;
  els.adminProductRows.innerHTML = "";

  if (!pageProducts.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5" class="empty-table-cell">No hay productos con estos filtros.</td>`;
    els.adminProductRows.append(row);
    updateBulkActions();
    refreshIcons();
    return;
  }

  pageProducts.forEach((product) => {
    const row = document.createElement("tr");
    const checked = selectedProductIds.has(product.id) ? "checked" : "";
    row.innerHTML = `
      <td class="select-column">
        <input class="row-checkbox" type="checkbox" data-select-product="${product.id}" aria-label="Seleccionar ${escapeAttribute(product.name)}" ${checked} />
      </td>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.category)}</td>
      <td>${escapeHtml(formatPrice(product.price))}</td>
      <td>
        <div class="row-actions">
          <button class="icon-button" type="button" data-edit="${product.id}" aria-label="Editar ${escapeAttribute(product.name)}" title="Editar">
            <span data-icon="pencil"></span>
          </button>
          <button class="icon-button" type="button" data-delete="${product.id}" aria-label="Eliminar ${escapeAttribute(product.name)}" title="Eliminar">
            <span data-icon="trash-2"></span>
          </button>
        </div>
      </td>
    `;
    els.adminProductRows.append(row);
  });

  els.adminProductRows.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editProduct(button.dataset.edit));
  });
  els.adminProductRows.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.delete));
  });
  els.adminProductRows.querySelectorAll("[data-select-product]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => toggleProductSelection(checkbox.dataset.selectProduct, checkbox.checked));
  });

  updateBulkActions();
  refreshIcons();
}

function renderAdminCategoryOptions() {
  const currentValue = els.adminCategoryFilter.value || "Todas";
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  els.adminCategoryFilter.innerHTML = `<option value="Todas">Todas</option>`;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.adminCategoryFilter.append(option);
  });
  els.adminCategoryFilter.value = categories.includes(currentValue) ? currentValue : "Todas";
}

function getFilteredAdminProducts() {
  const searchTerm = normalizeSearch(els.adminProductSearch.value);
  const category = els.adminCategoryFilter.value;
  const status = els.adminStatusFilter.value;

  return products.filter((product) => {
    const matchesSearch = !searchTerm || normalizeSearch(`${product.name} ${product.description} ${product.category}`).includes(searchTerm);
    const matchesCategory = category === "Todas" || product.category === category;
    const matchesStatus = status === "Todos" || product.status === status;
    return matchesSearch && matchesCategory && matchesStatus;
  });
}

function getCurrentAdminPageProducts() {
  const filteredProducts = getFilteredAdminProducts();
  const startIndex = (adminCurrentPage - 1) * ADMIN_PAGE_SIZE;
  return filteredProducts.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);
}

function handleAdminFilterChange() {
  adminCurrentPage = 1;
  renderProducts();
}

function changeAdminPage(direction) {
  const totalPages = Math.max(1, Math.ceil(getFilteredAdminProducts().length / ADMIN_PAGE_SIZE));
  adminCurrentPage = Math.min(Math.max(1, adminCurrentPage + direction), totalPages);
  renderProducts();
}

async function handleProductSubmit(event) {
  event.preventDefault();

  const wasEditing = Boolean(editingProductId);
  const currentProduct = products.find((product) => product.id === editingProductId);
  const payload = {
    name: els.productName.value.trim(),
    category: els.productCategory.value.trim(),
    price: formatPrice(els.productPrice.value),
    status: els.productStatus.value,
    image: normalizeImageUrl(els.productImage.value),
    description: els.productDescription.value.trim(),
    featured: els.productFeatured.checked,
    sort_order: currentProduct?.sort_order ?? 0
  };

  const request = editingProductId
    ? supabaseClient.from("products").update(payload).eq("id", editingProductId)
    : supabaseClient.from("products").insert(payload);

  const { error } = await request;
  if (error) {
    showError("No se pudo guardar. Verifica que tu usuario sea administrador.");
    return;
  }

  resetProductForm();
  await loadProducts();
  showToast(wasEditing ? "Producto actualizado." : "Producto agregado.");
}

function editProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;

  editingProductId = product.id;
  els.formTitle.textContent = "Editar producto";
  els.productName.value = product.name;
  els.productCategory.value = product.category;
  els.productPrice.value = product.price;
  els.productStatus.value = product.status;
  els.productImage.value = product.image;
  els.productDescription.value = product.description;
  els.productFeatured.checked = product.featured;
  els.productName.focus();
}

async function deleteProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product || !confirm(`Eliminar "${product.name}"?`)) return;

  const { error } = await supabaseClient.from("products").delete().eq("id", productId);
  if (error) {
    showError("No se pudo eliminar. Verifica que tu usuario sea administrador.");
    return;
  }

  await loadProducts();
  showToast("Producto eliminado.");
}

function toggleProductSelection(productId, checked) {
  if (checked) {
    selectedProductIds.add(productId);
  } else {
    selectedProductIds.delete(productId);
  }
  updateBulkActions();
}

function toggleSelectAllProducts() {
  const pageProducts = getCurrentAdminPageProducts();
  if (els.selectAllProducts.checked) {
    pageProducts.forEach((product) => selectedProductIds.add(product.id));
  } else {
    pageProducts.forEach((product) => selectedProductIds.delete(product.id));
  }

  els.adminProductRows.querySelectorAll("[data-select-product]").forEach((checkbox) => {
    checkbox.checked = selectedProductIds.has(checkbox.dataset.selectProduct);
  });
  updateBulkActions();
}

function updateBulkActions() {
  const selectedCount = selectedProductIds.size;
  const pageProducts = getCurrentAdminPageProducts();
  const pageSelectedCount = pageProducts.filter((product) => selectedProductIds.has(product.id)).length;
  els.deleteSelectedProducts.disabled = selectedCount === 0;
  els.selectedProductsCount.textContent = `${selectedCount} seleccionado${selectedCount === 1 ? "" : "s"}`;
  els.selectAllProducts.checked = pageProducts.length > 0 && pageSelectedCount === pageProducts.length;
  els.selectAllProducts.indeterminate = pageSelectedCount > 0 && pageSelectedCount < pageProducts.length;
}

async function deleteSelectedProducts() {
  const ids = [...selectedProductIds];
  if (!ids.length) return;

  const label = ids.length === 1 ? "este producto seleccionado" : `estos ${ids.length} productos seleccionados`;
  if (!confirm(`Eliminar ${label}? Esta acci\u00f3n no se puede deshacer.`)) return;

  els.deleteSelectedProducts.disabled = true;
  const { error } = await supabaseClient.from("products").delete().in("id", ids);
  if (error) {
    showError("No se pudieron eliminar los productos seleccionados. Verifica que tu usuario sea administrador.");
    updateBulkActions();
    return;
  }

  selectedProductIds.clear();
  await loadProducts();
  showToast(ids.length === 1 ? "Producto eliminado." : "Productos eliminados.");
}

function resetProductForm() {
  editingProductId = null;
  els.formTitle.textContent = "Agregar producto";
  els.productForm.reset();
  els.productStatus.value = "Disponible";
}

function downloadCsvTemplate() {
  const templateLink = document.createElement("a");
  templateLink.href = "plantilla-productos-sublimo.xlsx";
  templateLink.download = "plantilla-productos-sublimo.xlsx";
  templateLink.click();
}

async function handleCsvFile(event) {
  const file = event.target.files?.[0];
  pendingCsvProducts = [];
  els.importCsvButton.disabled = true;
  els.csvPreview.hidden = true;
  els.csvPreviewRows.innerHTML = "";

  if (!file) {
    els.csvSummary.textContent = "Sin archivo seleccionado.";
    return;
  }

  try {
    const { products: parsedProducts, errors } = await parseProductsFile(file);
    pendingCsvProducts = parsedProducts;
    renderCsvPreview(parsedProducts);

    if (errors.length) {
      els.csvSummary.textContent = `${parsedProducts.length} productos listos. ${errors.length} filas con error: ${errors.slice(0, 3).join(" | ")}`;
    } else {
      els.csvSummary.textContent = `${parsedProducts.length} productos listos para importar.`;
    }

    els.importCsvButton.disabled = parsedProducts.length === 0;
  } catch (error) {
    els.csvSummary.textContent = "No se pudo leer el archivo. Revisa la plantilla e intenta de nuevo.";
    console.warn(error);
  }
}

async function importCsvProducts() {
  if (!pendingCsvProducts.length) return;

  els.importCsvButton.disabled = true;
  const chunkSize = 100;
  for (let index = 0; index < pendingCsvProducts.length; index += chunkSize) {
    const chunk = pendingCsvProducts.slice(index, index + chunkSize);
    const { error } = await supabaseClient.from("products").insert(chunk);
    if (error) {
      els.importCsvButton.disabled = false;
      showError("No se pudo importar el archivo. Verifica que tu usuario sea administrador.");
      return;
    }
  }

  const importedCount = pendingCsvProducts.length;
  pendingCsvProducts = [];
  els.csvFileInput.value = "";
  els.csvPreview.hidden = true;
  els.csvSummary.textContent = `${importedCount} productos importados correctamente.`;
  await loadProducts();
  showToast("Productos importados.");
}

async function parseProductsFile(file) {
  const fileName = file.name.toLowerCase();
  const spreadsheet = getSpreadsheetApi();
  if ((fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) && spreadsheet) {
    const buffer = await file.arrayBuffer();
    const workbook = spreadsheet.read(buffer, { type: "array" });
    const attempts = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = spreadsheet.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      return parseProductsRows(rows);
    });
    const validAttempt = attempts.find((attempt) => attempt.products.length);
    if (validAttempt) return validAttempt;
    return attempts[0] || { products: [], errors: ["El archivo no tiene hojas para leer."] };
  }

  const text = await file.text();
  return parseProductsCsv(text);
}

function getSpreadsheetApi() {
  if (typeof XLSX !== "undefined") return XLSX;
  if (typeof window !== "undefined" && window.XLSX) return window.XLSX;
  return null;
}

function parseProductsCsv(text) {
  const rows = parseCsvRows(text);
  return parseProductsRows(rows);
}

function parseProductsRows(rows) {
  const errors = [];
  if (rows.length < 2) return { products: [], errors: ["El archivo no tiene filas de productos."] };

  const headerInfo = findHeaderRow(rows) || inferTemplateColumns(rows);
  if (!headerInfo) {
    return {
      products: [],
      errors: ["No encontré los encabezados. Usa columnas: producto, categoria, precio, estado, imagen, detalle, destacado."]
    };
  }

  const { headers, headerIndex } = headerInfo;
  const products = [];

  rows.slice(headerIndex + 1).forEach((row, index) => {
    if (row.every((cell) => !String(cell).trim())) return;

    const item = {};
    headers.forEach((header, columnIndex) => {
      if (header) item[header] = String(row[columnIndex] || "").trim();
    });

    const rowNumber = headerIndex + index + 2;
    const missing = [];
    if (!item.name) missing.push("producto");
    if (!item.category) missing.push("categoria");
    if (!item.price) missing.push("precio");
    if (!item.image) missing.push("imagen");
    if (!item.description) missing.push("detalle");

    if (missing.length) {
      errors.push(`fila ${rowNumber}: falta ${missing.join(", ")}`);
      return;
    }

    products.push({
      name: item.name,
      category: item.category,
      price: formatPrice(item.price),
      status: normalizeStatus(item.status),
      image: normalizeImageUrl(item.image),
      description: item.description,
      featured: parseBoolean(item.featured),
      sort_order: 0
    });
  });

  return { products, errors };
}

function findHeaderRow(rows) {
  const requiredHeaders = ["name", "category", "price", "image", "description"];
  const maxRowsToScan = Math.min(rows.length, 12);

  for (let rowIndex = 0; rowIndex < maxRowsToScan; rowIndex++) {
    const headers = rows[rowIndex].map(normalizeHeader);
    const headerSet = new Set(headers.filter(Boolean));
    const score = requiredHeaders.filter((header) => headerSet.has(header)).length;
    if (score >= 4) return { headers, headerIndex: rowIndex };
  }

  return null;
}

function inferTemplateColumns(rows) {
  const firstDataRow = rows.find((row) => row.some((cell) => String(cell).trim()));
  if (!firstDataRow || firstDataRow.length < 6) return null;

  return {
    headers: ["name", "category", "price", "status", "image", "description", "featured"],
    headerIndex: -1
  };
}

function parseCsvRows(text) {
  const cleanText = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delimiter = detectDelimiter(cleanText);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < cleanText.length; index++) {
    const char = cleanText[index];
    const next = cleanText[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !quoted) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function normalizeHeader(value) {
  const header = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const map = {
    producto: "name",
    nombre: "name",
    name: "name",
    categoria: "category",
    category: "category",
    precio: "price",
    price: "price",
    estado: "status",
    status: "status",
    imagen: "image",
    image: "image",
    url: "image",
    detalle: "description",
    descripcion: "description",
    description: "description",
    destacado: "featured",
    featured: "featured"
  };
  return map[header] || "";
}

function normalizeStatus(value) {
  const status = String(value || "Disponible").trim();
  const validStatuses = ["Disponible", "Por encargo", "Agotado"];
  return validStatuses.includes(status) ? status : "Disponible";
}

function parseBoolean(value) {
  return ["si", "s\u00ed", "true", "1", "x", "destacado", "yes"].includes(String(value || "").trim().toLowerCase());
}

function renderCsvPreview(items) {
  els.csvPreviewRows.innerHTML = "";
  items.slice(0, 5).forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.price)}</td>
      <td>${escapeHtml(item.status)}</td>
    `;
    els.csvPreviewRows.append(row);
  });
  els.csvPreview.hidden = items.length === 0;
}

function toCsvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
  localStorage.setItem("gallery-store-theme", theme);
}

function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits;
}

function stripColombiaPrefix(value) {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) return digits.slice(2);
  return digits;
}

function formatPrice(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return String(value || "");
  return `$${Number(digits).toLocaleString("es-CO")}`;
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";

  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  if (driveMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w1200`;
  }

  return url;
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function showError(message) {
  els.loginError.textContent = message;
  els.loginError.hidden = false;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2400);
}

function refreshIcons() {
  document.querySelectorAll("[data-icon]").forEach((icon) => {
    const name = icon.dataset.icon;
    const svg = ICONS[name];
    if (!svg) return;
    icon.innerHTML = svg;
    icon.setAttribute("aria-hidden", "true");
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

const ICONS = {
  "chevron-left": '<svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  "chevron-right": '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  "lock": '<svg viewBox="0 0 24 24" fill="none"><path d="M7 10V8a5 5 0 0 1 10 0v2" stroke="currentColor" stroke-linecap="round"/><path d="M6 10h12v10H6V10Z" stroke="currentColor" stroke-linejoin="round"/><path d="M12 14v2" stroke="currentColor" stroke-linecap="round"/></svg>',
  "log-out": '<svg viewBox="0 0 24 24" fill="none"><path d="M10 5H6v14h4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 8l4 4-4 4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 12H9" stroke="currentColor" stroke-linecap="round"/></svg>',
  "download": '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v11M8 11l4 4 4-4M5 20h14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  "moon": '<svg viewBox="0 0 24 24" fill="none"><path d="M20 14.2A7.6 7.6 0 0 1 9.8 4a8.1 8.1 0 1 0 10.2 10.2Z" stroke="currentColor" stroke-linejoin="round"/></svg>',
  "pencil": '<svg viewBox="0 0 24 24" fill="none"><path d="M4 16.8V20h3.2L18.6 8.6l-3.2-3.2L4 16.8Z" stroke="currentColor" stroke-linejoin="round"/><path d="M14.4 6.4l3.2 3.2" stroke="currentColor" stroke-linecap="round"/></svg>',
  "plus": '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-linecap="round"/></svg>',
  "save": '<svg viewBox="0 0 24 24" fill="none"><path d="M5 4h11l3 3v13H5V4Z" stroke="currentColor" stroke-linejoin="round"/><path d="M8 4v6h7V4M8 20v-6h8v6" stroke="currentColor" stroke-linejoin="round"/></svg>',
  "trash-2": '<svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 13h8l1-13" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  "upload": '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20V9M8 13l4-4 4 4M5 4h14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  "x": '<svg viewBox="0 0 24 24" fill="none"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-linecap="round"/></svg>'
};
