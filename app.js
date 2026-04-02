const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const STORAGE = {
  ingredients: "essencia_multi_ingredients_v1",
  cbrc: "essencia_multi_cbrc_v1",
  lp: "essencia_multi_lp_v1",
  recipes: "essencia_multi_recipes_v1"
};

const state = {
  ingredients: [],
  cbrc: [],
  lp: [],
  recipes: [],
  selectedIngredientId: null,
  selectedCBRCId: null,
  selectedLPId: null,
  selectedRecipeId: null,
  searchIngredient: "",
  searchCBRC: "",
  searchLP: "",
  searchRecipe: "",
  searchPicker: "",
  pickerContext: null,
  pickerIngredient: null,
  deleteContext: null,
  toastTimer: null
};

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function safe(value) {
  return (value ?? "").toString().trim();
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function money(value) {
  return `$${toNumber(value).toFixed(2)}`;
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function showToast(message = "Listo") {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function readStorage(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveAll(silent = false) {
  localStorage.setItem(STORAGE.ingredients, JSON.stringify(state.ingredients));
  localStorage.setItem(STORAGE.cbrc, JSON.stringify(state.cbrc));
  localStorage.setItem(STORAGE.lp, JSON.stringify(state.lp));
  localStorage.setItem(STORAGE.recipes, JSON.stringify(state.recipes));
  if (!silent) showToast("Cambios guardados ✅");
}

function createEmptyIngredient() {
  return {
    id: uid("ing"),
    name: "Nuevo ingrediente",
    category: "base",
    presentation: 0,
    unit: "",
    price: 0,
    notes: ""
  };
}

function createEmptyCBRC() {
  return {
    id: uid("cbrc"),
    name: "Nuevo Costos RyC",
    type: "relleno",
    yieldAmount: 0,
    yieldUnit: "gr",
    notes: "",
    items: []
  };
}

function createEmptyLP() {
  return {
    id: uid("lp"),
    name: "",
    size: "",
    rellenoCBRCId: "",
    rellenoQty: 0,
    coberturaCBRCId: "",
    coberturaQty: 0,
    notes: ""
  };
}

function createEmptyRecipe() {
  return {
    id: uid("recipe"),
    name: "Nueva receta",
    size: "",
    category: "tortas",
    portions: 0,
    labor: 0,
    delivery: 0,
    margin: 30,
    notes: "",
    rellenoCBRCId: "",
    rellenoQty: 0,
    coberturaCBRCId: "",
    coberturaQty: 0,
    manualTopper: 0,
    baseRows: [],
    decorRows: [],
    presentRows: []
  };
}

function ensureRecipe(recipe) {
  if (!Array.isArray(recipe.baseRows)) recipe.baseRows = [];
  if (!Array.isArray(recipe.decorRows)) recipe.decorRows = [];
  if (!Array.isArray(recipe.presentRows)) recipe.presentRows = [];
  if (typeof recipe.manualTopper === "undefined") recipe.manualTopper = 0;
  if (typeof recipe.margin === "undefined") recipe.margin = 30;
  return recipe;
}

function getSelectedIngredient() {
  return state.ingredients.find((x) => x.id === state.selectedIngredientId) || null;
}

function getSelectedCBRC() {
  return state.cbrc.find((x) => x.id === state.selectedCBRCId) || null;
}

function getSelectedLP() {
  return state.lp.find((x) => x.id === state.selectedLPId) || null;
}

function getSelectedRecipe() {
  return state.recipes.find((x) => x.id === state.selectedRecipeId) || null;
}

function getCBRCById(id) {
  return state.cbrc.find((x) => x.id === id) || null;
}

function calcRowCost(row) {
  const presentation = toNumber(row.presentation);
  const price = toNumber(row.price);
  const qty = toNumber(row.qty);
  if (presentation <= 0 || price <= 0 || qty <= 0) return 0;
  return (qty / presentation) * price;
}

function calcRowsTotal(rows = []) {
  return rows.reduce((acc, row) => acc + calcRowCost(row), 0);
}

function calcCBRCTotal(cbrc) {
  return calcRowsTotal(cbrc.items || []);
}

function calcCBRCUnitCost(cbrc) {
  const total = calcCBRCTotal(cbrc);
  const yieldAmount = toNumber(cbrc.yieldAmount);
  if (yieldAmount <= 0 || total <= 0) return 0;
  return total / yieldAmount;
}

function calcLPPartCost(cbrcId, qty) {
  const cbrc = getCBRCById(cbrcId);
  if (!cbrc) return 0;
  return calcCBRCUnitCost(cbrc) * toNumber(qty);
}

function calcLPTotal(lp) {
  return calcLPPartCost(lp.rellenoCBRCId, lp.rellenoQty) +
         calcLPPartCost(lp.coberturaCBRCId, lp.coberturaQty);
}

function calcRecipeTotals(recipe) {
  const base = calcRowsTotal(recipe.baseRows);
  const relleno = calcLPPartCost(recipe.rellenoCBRCId, recipe.rellenoQty);
  const cobertura = calcLPPartCost(recipe.coberturaCBRCId, recipe.coberturaQty);
  const decor = calcRowsTotal(recipe.decorRows) + toNumber(recipe.manualTopper);
  const present = calcRowsTotal(recipe.presentRows);
  const materials = base + relleno + cobertura + decor + present;
  const labor = toNumber(recipe.labor);
  const delivery = toNumber(recipe.delivery);
  const original = materials + labor + delivery;
  const final = original * (1 + toNumber(recipe.margin) / 100);
  const perServing = toNumber(recipe.portions) > 0 ? final / toNumber(recipe.portions) : 0;
  return { base, relleno, cobertura, decor, present, materials, labor, delivery, original, final, perServing };
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

/* =========================
   MODAL DE CONFIRMACIÓN PERSONALIZADO
   ========================= */

let confirmCallback = null;

function showCustomConfirm(title, message, callback) {
  const modal = $("#customConfirmModal");
  const titleEl = $("#customConfirmTitle");
  const messageEl = $("#customConfirmMessage");
  const btnOk = $("#customConfirmOk");
  const btnCancel = $("#customConfirmCancel");
  
  if (!modal) {
    if (confirm(`${title}\n\n${message}`)) {
      callback();
    }
    return;
  }
  
  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmCallback = callback;
  
  modal.classList.add("show");
  
  const handleOk = () => {
    modal.classList.remove("show");
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
    cleanup();
  };
  
  const handleCancel = () => {
    modal.classList.remove("show");
    confirmCallback = null;
    cleanup();
  };
  
  const cleanup = () => {
    btnOk?.removeEventListener("click", handleOk);
    btnCancel?.removeEventListener("click", handleCancel);
    modal.removeEventListener("click", handleOutside);
  };
  
  btnOk?.addEventListener("click", handleOk);
  btnCancel?.addEventListener("click", handleCancel);
  
  const handleOutside = (e) => {
    if (e.target === modal) {
      handleCancel();
    }
  };
  modal.addEventListener("click", handleOutside, { once: true });
}

function requestDelete(type, id, label) {
  showCustomConfirm(
    "¿Estás seguro que deseas eliminarlo?",
    "Esta acción no se puede deshacer",
    () => {
      state.deleteContext = { type, id };
      confirmDelete();
    }
  );
}

function confirmDelete() {
  const ctx = state.deleteContext;
  if (!ctx) return;

  if (ctx.type === "cbrc") {
    const usedInLP = state.lp.some((x) => x.rellenoCBRCId === ctx.id || x.coberturaCBRCId === ctx.id);
    const usedInRecipes = state.recipes.some((x) => x.rellenoCBRCId === ctx.id || x.coberturaCBRCId === ctx.id);
    if (usedInLP || usedInRecipes) {
      showCustomConfirm(
        "⚠️ No se puede eliminar",
        "Este Costos RyC ya está usado en Lista de Precios o Recetas.",
        () => {}
      );
      state.deleteContext = null;
      return;
    }
    state.cbrc = state.cbrc.filter((x) => x.id !== ctx.id);
    if (!state.cbrc.length) state.cbrc = [createEmptyCBRC()];
    state.selectedCBRCId = state.cbrc[0]?.id || null;
  }

  if (ctx.type === "lp") {
    state.lp = state.lp.filter((x) => x.id !== ctx.id);
    state.selectedLPId = state.lp[0]?.id || null;
  }

  if (ctx.type === "recipe") {
    state.recipes = state.recipes.filter((x) => x.id !== ctx.id);
    if (!state.recipes.length) state.recipes = [createEmptyRecipe()];
    state.selectedRecipeId = state.recipes[0]?.id || null;
  }

  if (ctx.type === "ingredient") {
    state.ingredients = state.ingredients.filter((x) => x.id !== ctx.id);
    state.selectedIngredientId = null;
    clearIngredientForm();
  }

  saveAll(true);
  state.deleteContext = null;
  renderPage();
  showToast("Elemento eliminado ✅");
}

function syncIngredientSnapshots(item) {
  state.cbrc.forEach((cbrc) => {
    cbrc.items.forEach((row) => {
      if (row.ingredientId === item.id) {
        row.name = item.name;
        row.presentation = item.presentation;
        row.unit = item.unit;
        row.price = item.price;
      }
    });
  });
  state.recipes.forEach((recipe) => {
    [recipe.baseRows, recipe.decorRows, recipe.presentRows].forEach((rows) => {
      rows.forEach((row) => {
        if (row.ingredientId === item.id) {
          row.name = item.name;
          row.presentation = item.presentation;
          row.unit = item.unit;
          row.price = item.price;
        }
      });
    });
  });
}

// ✅ FIX: Agregada la clave "data": con comillas
function buildBackupPayload() {
  return {
    app: "Essencia Bakery",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      ingredients: state.ingredients,
      cbrc: state.cbrc,
      lp: state.lp,
      recipes: state.recipes
    }
  };
}

function downloadTextFile(filename, content, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBackup() {
  try {
    const payload = buildBackupPayload();
    const date = new Date();
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      "-",
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0")
    ].join("");
    downloadTextFile(
      `essencia-respaldo-${stamp}.json`,
      JSON.stringify(payload, null, 2)
    );
    showToast("Respaldo exportado ✅");
  } catch (err) {
    console.error(err);
    alert("No pude exportar el respaldo: " + err.message);
  }
}

function applyBackupData(parsed) {
  const source = parsed?.data ? parsed.data : parsed;
  if (!source || typeof source !== "object") {
    throw new Error("Formato inválido");
  }
  const ingredients = Array.isArray(source.ingredients) ? source.ingredients : [];
  const cbrc = Array.isArray(source.cbrc) ? source.cbrc : [];
  const lp = Array.isArray(source.lp) ? source.lp : [];
  const recipes = Array.isArray(source.recipes) ? source.recipes.map(ensureRecipe) : [];
  state.ingredients = ingredients;
  state.cbrc = cbrc.length ? cbrc : [createEmptyCBRC()];
  state.lp = lp;
  state.recipes = recipes.length ? recipes : [createEmptyRecipe()];
  state.selectedIngredientId = null;
  state.selectedCBRCId = state.cbrc[0]?.id || null;
  state.selectedLPId = state.lp[0]?.id || null;
  state.selectedRecipeId = state.recipes[0]?.id || null;
  saveAll(true);
  renderPage();
}

function importBackupFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      applyBackupData(parsed);
      showToast("Respaldo importado ✅");
    } catch {
      alert("El archivo no es válido o está dañado.");
    }
  };
  reader.onerror = () => {
    alert("No pude leer el archivo.");
  };
  reader.readAsText(file, "utf-8");
}

function renderIngredientList() {
  const list = $("#ingredientList");
  if (!list) return;
  list.innerHTML = "";
  const filtered = state.ingredients.filter((item) =>
    safe(item.name).toLowerCase().includes(state.searchIngredient.toLowerCase())
  );
  if (!filtered.length) {
    list.innerHTML = `<div class="emptyState">No hay ingredientes registrados todavía.</div>`;
    return;
  }
  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = `entityCard ${item.id === state.selectedIngredientId ? "active" : ""}`;
    card.innerHTML = `
      <div class="entityCardTop">
        <div>
          <h3>${safe(item.name)}</h3>
          <div class="entityMeta">${toNumber(item.presentation)} ${safe(item.unit)} · ${money(item.price)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="tag">${item.category === "base" ? "materiales" : safe(item.category)}</span>
          <button class="iconBtn iconBtnDanger" type="button" 
            data-delete-ing-id="${item.id}" 
            style="padding:4px 8px; font-size:12px; margin-left:8px; cursor:pointer;"
            title="Eliminar ingrediente">
            🗑️
          </button>
        </div>
      </div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-delete-ing-id]")) return;
      state.selectedIngredientId = item.id;
      fillIngredientForm(item);
      renderIngredientList();
    });
    list.appendChild(card);
  });
}

function fillIngredientForm(item) {
  if (!$("#ingredientFormTitle")) return;
  $("#ingredientFormTitle").textContent = "Editar ingrediente";
  $("#ingredientName").value = item.name;
  $("#ingredientCategory").value = item.category;
  $("#ingredientPresentation").value = item.presentation;
  $("#ingredientUnit").value = item.unit;
  $("#ingredientPrice").value = item.price;
  $("#ingredientNotes").value = item.notes || "";
  $("#btnDeleteIngredient")?.classList.remove("hidden");
}

function clearIngredientForm() {
  state.selectedIngredientId = null;
  if ($("#ingredientFormTitle")) $("#ingredientFormTitle").textContent = "Nuevo ingrediente";
  if ($("#ingredientName")) $("#ingredientName").value = "";
  if ($("#ingredientCategory")) $("#ingredientCategory").value = "base";
  if ($("#ingredientPresentation")) $("#ingredientPresentation").value = "";
  if ($("#ingredientUnit")) $("#ingredientUnit").value = "";
  if ($("#ingredientPrice")) $("#ingredientPrice").value = "";
  if ($("#ingredientNotes")) $("#ingredientNotes").value = "";
  $("#btnDeleteIngredient")?.classList.add("hidden");
  renderIngredientList();
}

function saveIngredient() {
  const payload = {
    id: state.selectedIngredientId || uid("ing"),
    name: safe($("#ingredientName")?.value),
    category: safe($("#ingredientCategory")?.value),
    presentation: toNumber($("#ingredientPresentation")?.value),
    unit: safe($("#ingredientUnit")?.value),
    price: toNumber($("#ingredientPrice")?.value),
    notes: safe($("#ingredientNotes")?.value)
  };
  if (!payload.name || payload.presentation <= 0 || !payload.unit || payload.price <= 0) {
    alert("Completa bien todos los campos del ingrediente.");
    return;
  }
  const exists = state.ingredients.findIndex((x) => x.id === payload.id);
  if (exists >= 0) {
    state.ingredients[exists] = payload;
    syncIngredientSnapshots(payload);
    showToast("Ingrediente actualizado ✅");
  } else {
    state.ingredients.unshift(payload);
    showToast("Ingrediente guardado ✅");
  }
  saveAll(true);
  renderPage();
  clearIngredientForm();
}

function removeIngredient() {
  const item = getSelectedIngredient();
  if (!item) {
    showToast("Selecciona un ingrediente primero ⚠️");
    return;
  }
  const usedInCBRC = state.cbrc.some((cbrc) => cbrc.items.some((row) => row.ingredientId === item.id));
  const usedInRecipes = state.recipes.some((recipe) =>
    [...recipe.baseRows, ...recipe.decorRows, ...recipe.presentRows].some((row) => row.ingredientId === item.id)
  );
  if (usedInCBRC || usedInRecipes) {
    showCustomConfirm(
      "⚠️ No se puede eliminar",
      "Este ingrediente ya está usado en Costos RyC o Recetas.",
      () => {}
    );
    return;
  }
  requestDelete("ingredient", item.id, item.name);
}

function renderCBRCList() {
  const list = $("#cbrcList");
  if (!list) return;
  list.innerHTML = "";
  const filtered = state.cbrc.filter((item) =>
    safe(item.name).toLowerCase().includes(state.searchCBRC.toLowerCase())
  );
  if (!filtered.length) {
    list.innerHTML = `<div class="emptyState">No hay recetas de Costos RyC todavía.</div>`;
    return;
  }
  filtered.forEach((item) => {
    const total = calcCBRCTotal(item);
    const card = document.createElement("article");
    card.className = `entityCard ${item.id === state.selectedCBRCId ? "active" : ""}`;
    card.innerHTML = `
      <div class="entityCardTop">
        <div>
          <h3>${safe(item.name)}</h3>
          <div class="entityMeta">${toNumber(item.yieldAmount)} ${safe(item.yieldUnit)} · ${money(total)}</div>
        </div>
        <span class="tag">${safe(item.type)}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      state.selectedCBRCId = item.id;
      renderCBRCEditor();
    });
    list.appendChild(card);
  });
}

function renderMobileRows(containerId, rows, sectionType) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.classList.remove("hidden");
  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = `<div class="emptyState">No hay ingredientes en esta sección.</div>`;
    return;
  }
  rows.forEach((row, index) => {
    const el = document.createElement("article");
    el.className = "mobileRowCard";
    el.innerHTML = `
      <div class="mobileRowTitle">${safe(row.name)}</div>
      <div class="mobileRowMeta">
        <div class="mobileRowMetaItem"><span>Presentación</span>${toNumber(row.presentation)}</div>
        <div class="mobileRowMetaItem"><span>Unidad</span>${safe(row.unit)}</div>
        <div class="mobileRowMetaItem"><span>Precio base</span>${money(row.price)}</div>
        <div class="mobileRowMetaItem"><span>Cantidad usada</span>
          <input class="rowQtyInput" type="number" min="0" step="0.01" value="${toNumber(row.qty)}" data-mobile-section="${sectionType}" data-mobile-index="${index}">
        </div>
        <div class="mobileRowMetaItem"><span>Costo</span>${money(calcRowCost(row))}</div>
      </div>
      <div class="mobileRowActions">
        <button class="iconBtn iconBtnDanger" type="button" data-mobile-remove-section="${sectionType}" data-mobile-remove-index="${index}">Eliminar</button>
      </div>
    `;
    container.appendChild(el);
  });
}

function renderCBRCEditor() {
  const cbrc = getSelectedCBRC();
  if (!cbrc) return;
  if ($("#cbrcName")) $("#cbrcName").value = cbrc.name || "";
  if ($("#cbrcType")) $("#cbrcType").value = cbrc.type || "relleno";
  if ($("#cbrcYield")) $("#cbrcYield").value = cbrc.yieldAmount || "";
  if ($("#cbrcYieldUnit")) $("#cbrcYieldUnit").value = cbrc.yieldUnit || "";
  if ($("#cbrcNotes")) $("#cbrcNotes").value = cbrc.notes || "";
  const tbody = $("#cbrcItemsBody");
  if (tbody) {
    tbody.innerHTML = "";
    if (!cbrc.items.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="emptyState">No hay ingredientes en este Costos RyC.</div></td></tr>`;
    } else {
      cbrc.items.forEach((row, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${safe(row.name)}</td>
          <td>${toNumber(row.presentation)}</td>
          <td>${safe(row.unit)}</td>
          <td>${money(row.price)}</td>
          <td><input class="rowQtyInput" type="number" min="0" step="0.01" value="${toNumber(row.qty)}" data-cbrc-row="${index}" /></td>
          <td><span class="rowCost">${money(calcRowCost(row))}</span></td>
          <td><button class="iconBtn iconBtnDanger" type="button" data-remove-cbrc-row="${index}">✕</button></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
  renderMobileRows("cbrcItemsCards", cbrc.items, "cbrc");
  const total = calcCBRCTotal(cbrc);
  const perUnit = calcCBRCUnitCost(cbrc);
  if ($("#cbrcSubtotal")) $("#cbrcSubtotal").textContent = money(total);
  if ($("#sumCBRCYield")) $("#sumCBRCYield").textContent = `${toNumber(cbrc.yieldAmount)} ${safe(cbrc.yieldUnit)}`;
  if ($("#sumCBRCTotal")) $("#sumCBRCTotal").textContent = money(total);
  if ($("#sumCBRCPerUnit")) $("#sumCBRCPerUnit").textContent = money(perUnit);
  renderCBRCList();
}

function updateSelectedCBRCFromFields() {
  const cbrc = getSelectedCBRC();
  if (!cbrc) return;
  cbrc.name = safe($("#cbrcName")?.value);
  cbrc.type = safe($("#cbrcType")?.value);
  cbrc.yieldAmount = toNumber($("#cbrcYield")?.value);
  cbrc.yieldUnit = safe($("#cbrcYieldUnit")?.value);
  cbrc.notes = safe($("#cbrcNotes")?.value);
  saveAll(true);
  renderCBRCEditor();
}

function createCBRC() {
  const item = createEmptyCBRC();
  state.cbrc.unshift(item);
  state.selectedCBRCId = item.id;
  saveAll(true);
  renderPage();
  showToast("Costos RyC creado ✅");
}

function duplicateCBRC() {
  const cbrc = getSelectedCBRC();
  if (!cbrc) return;
  const copy = clone(cbrc);
  copy.id = uid("cbrc");
  copy.name = `${safe(cbrc.name)} (copia)`;
  state.cbrc.unshift(copy);
  state.selectedCBRCId = copy.id;
  saveAll(true);
  renderPage();
  showToast("Costos RyC duplicado ✅");
}

function getCBRCOptionsByType(type, selectedId = "") {
  const items = state.cbrc.filter((x) => x.type === type);
  const placeholder = type === "relleno" ? "Seleccionar relleno" : "Seleccionar cobertura";
  return `
    <option value="">-- ${placeholder} --</option>
    ${items.map((item) => `
      <option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${safe(item.name)}</option>
    `).join("")}
  `;
}

function getLPFilteredItems() {
  const search = state.searchLP.toLowerCase();
  return state.lp.filter((item) => {
    const rellenoName = safe(getCBRCById(item.rellenoCBRCId)?.name);
    const coberturaName = safe(getCBRCById(item.coberturaCBRCId)?.name);
    return [
      safe(item.name),
      safe(item.size),
      rellenoName,
      coberturaName
    ].join(" ").toLowerCase().includes(search);
  });
}

function updateLPMobileTitle(lpId) {
  const lp = state.lp.find((x) => x.id === lpId);
  if (!lp) return;
  const title = document.querySelector(`#lpMobileCards [data-lp-card-id="${lpId}"] .mobileRowTitle`);
  if (title) title.textContent = safe(lp.name) || "Nueva fila";
}

function renderLPSummary(items = state.lp) {
  const countEl = $("#lpSummaryCount");
  const totalEl = $("#lpSummaryGrandTotal");
  if (countEl) countEl.textContent = items.length;
  if (totalEl) {
    const grandTotal = items.reduce((acc, item) => acc + calcLPTotal(item), 0);
    totalEl.textContent = money(grandTotal);
  }
  const selected = state.lp[0] || null;
  const relleno = selected ? calcLPPartCost(selected.rellenoCBRCId, selected.rellenoQty) : 0;
  const cobertura = selected ? calcLPPartCost(selected.coberturaCBRCId, selected.coberturaQty) : 0;
  const total = relleno + cobertura;
  if ($("#sumLPSize")) $("#sumLPSize").textContent = safe(selected?.size) || "-";
  if ($("#sumLPRelleno")) $("#sumLPRelleno").textContent = money(relleno);
  if ($("#sumLPCobertura")) $("#sumLPCobertura").textContent = money(cobertura);
  if ($("#sumLPFinal")) $("#sumLPFinal").textContent = money(total);
  if ($("#lpCostRelleno")) $("#lpCostRelleno").textContent = money(relleno);
  if ($("#lpCostCobertura")) $("#lpCostCobertura").textContent = money(cobertura);
  if ($("#lpCostTotal")) $("#lpCostTotal").textContent = money(total);
}

function renderLPTable() {
  const tbody = $("#lpTableBody");
  const mobile = $("#lpMobileCards");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (mobile) mobile.innerHTML = "";
  const filtered = getLPFilteredItems();
  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="emptyState">No hay filas en Lista de Precios.</div>
        </td>
      </tr>
    `;
    if (mobile) {
      mobile.innerHTML = `<div class="emptyState">No hay filas en Lista de Precios.</div>`;
    }
    renderLPSummary(filtered);
    return;
  }
  filtered.forEach((item) => {
    const rellenoCost = calcLPPartCost(item.rellenoCBRCId, item.rellenoQty);
    const coberturaCost = calcLPPartCost(item.coberturaCBRCId, item.coberturaQty);
    const total = rellenoCost + coberturaCost;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <input type="text" placeholder="Nombre" value="${safe(item.name)}" data-lp-id="${item.id}" data-lp-field="name" />
      </td>
      <td>
        <input type="text" placeholder="Ej: 26 cm" value="${safe(item.size)}" data-lp-id="${item.id}" data-lp-field="size" />
      </td>
      <td>
        <select data-lp-id="${item.id}" data-lp-field="rellenoCBRCId">
          ${getCBRCOptionsByType("relleno", item.rellenoCBRCId)}
        </select>
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${toNumber(item.rellenoQty)}" data-lp-id="${item.id}" data-lp-field="rellenoQty" />
      </td>
      <td class="lpCellCost">${money(rellenoCost)}</td>
      <td>
        <select data-lp-id="${item.id}" data-lp-field="coberturaCBRCId">
          ${getCBRCOptionsByType("cobertura", item.coberturaCBRCId)}
        </select>
      </td>
      <td>
        <input type="number" min="0" step="0.01" value="${toNumber(item.coberturaQty)}" data-lp-id="${item.id}" data-lp-field="coberturaQty" />
      </td>
      <td class="lpCellCost">${money(coberturaCost)}</td>
      <td class="lpCellCost">${money(total)}</td>
      <td>
        <button class="lpDeleteBtn" type="button" data-delete-lp-id="${item.id}">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
    if (mobile) {
      const card = document.createElement("article");
      card.className = "mobileRowCard";
      card.setAttribute("data-lp-card-id", item.id);
      card.innerHTML = `
        <div class="mobileRowTitle">${safe(item.name) || "Nueva fila"}</div>
        <div class="mobileRowMeta">
          <div class="mobileRowMetaItem" style="grid-column:1 / -1;">
            <span>Nombre</span>
            <input type="text" placeholder="Ej: Torta 26 cm" value="${safe(item.name)}" data-lp-id="${item.id}" data-lp-field="name" />
          </div>
          <div class="mobileRowMetaItem">
            <span>Tamaño</span>
            <input type="text" placeholder="Ej: 26 cm" value="${safe(item.size)}" data-lp-id="${item.id}" data-lp-field="size" />
          </div>
          <div class="mobileRowMetaItem">
            <span>Relleno</span>
            <select data-lp-id="${item.id}" data-lp-field="rellenoCBRCId">
              ${getCBRCOptionsByType("relleno", item.rellenoCBRCId)}
            </select>
          </div>
          <div class="mobileRowMetaItem">
            <span>Cant. relleno</span>
            <input type="number" min="0" step="0.01" value="${toNumber(item.rellenoQty)}" data-lp-id="${item.id}" data-lp-field="rellenoQty" />
          </div>
          <div class="mobileRowMetaItem">
            <span>Costo relleno</span>
            <b>${money(rellenoCost)}</b>
          </div>
          <div class="mobileRowMetaItem">
            <span>Cobertura</span>
            <select data-lp-id="${item.id}" data-lp-field="coberturaCBRCId">
              ${getCBRCOptionsByType("cobertura", item.coberturaCBRCId)}
            </select>
          </div>
          <div class="mobileRowMetaItem">
            <span>Cant. cobertura</span>
            <input type="number" min="0" step="0.01" value="${toNumber(item.coberturaQty)}" data-lp-id="${item.id}" data-lp-field="coberturaQty" />
          </div>
          <div class="mobileRowMetaItem">
            <span>Costo cobertura</span>
            <b>${money(coberturaCost)}</b>
          </div>
          <div class="mobileRowMetaItem" style="grid-column:1 / -1;">
            <span>Total</span>
            <b>${money(total)}</b>
          </div>
        </div>
        <div class="mobileRowActions">
          <button class="iconBtn iconBtnDanger" type="button" data-delete-lp-id="${item.id}">Eliminar</button>
        </div>
      `;
      mobile.appendChild(card);
    }
  });
  renderLPSummary(filtered);
}

function updateLPField(lpId, field, value) {
  const lp = state.lp.find((x) => x.id === lpId);
  if (!lp) return;
  if (field === "rellenoQty" || field === "coberturaQty") {
    lp[field] = toNumber(value);
  } else {
    lp[field] = value;
  }
  saveAll(true);
  if (field === "name") {
    updateLPMobileTitle(lpId);
  }
  renderLPSummary(getLPFilteredItems());
}

function createLP() {
  const item = createEmptyLP();
  item.name = "";
  item.size = "";
  state.lp.unshift(item);
  state.selectedLPId = item.id;
  saveAll(true);
  renderLPTable();
  showToast("Fila añadida ✅");
}

function duplicateLP() {
  const lp = getSelectedLP();
  if (!lp) return;
  const copy = clone(lp);
  copy.id = uid("lp");
  copy.name = `${safe(lp.name)} (copia)`;
  state.lp.unshift(copy);
  state.selectedLPId = copy.id;
  saveAll(true);
  renderLPTable();
  showToast("Lista de Precios duplicada ✅");
}

function renderRecipeCBRCOptions() {
  const rellenoSelect = $("#recipeRellenoCBRC");
  const coberturaSelect = $("#recipeCoberturaCBRC");
  if (!rellenoSelect || !coberturaSelect) return;
  rellenoSelect.innerHTML = `<option value="">-- Seleccionar relleno --</option>`;
  coberturaSelect.innerHTML = `<option value="">-- Seleccionar cobertura --</option>`;
  state.cbrc.filter((x) => x.type === "relleno").forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    rellenoSelect.appendChild(option);
  });
  state.cbrc.filter((x) => x.type === "cobertura").forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    coberturaSelect.appendChild(option);
  });
}

function renderRecipeList() {
  const list = $("#recipeList");
  if (!list) return;
  list.innerHTML = "";
  const filtered = state.recipes.filter((item) =>
    safe(item.name).toLowerCase().includes(state.searchRecipe.toLowerCase())
  );
  if (!filtered.length) {
    list.innerHTML = `<div class="emptyState">No hay recetas todavía.</div>`;
    return;
  }
  filtered.forEach((item) => {
    const totals = calcRecipeTotals(item);
    const card = document.createElement("article");
    card.className = `entityCard ${item.id === state.selectedRecipeId ? "active" : ""}`;
    card.innerHTML = `
      <div class="entityCardTop">
        <div>
          <h3>${safe(item.name)}</h3>
          <div class="entityMeta">${safe(item.size)} · ${toNumber(item.portions)} porciones · ${money(totals.final)}</div>
        </div>
        <span class="tag">${safe(item.category)}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      state.selectedRecipeId = item.id;
      renderRecipeEditor();
    });
    list.appendChild(card);
  });
}

function renderSimpleRecipeRows(rows, tbodyId, sectionName, cardsId) {
  const tbody = document.getElementById(tbodyId);
  if (tbody) {
    tbody.innerHTML = "";
    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="emptyState">No hay ingredientes en esta sección.</div>
          </td>
        </tr>
      `;
    } else {
      rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${safe(row.name)}</td>
          <td>${toNumber(row.presentation)}</td>
          <td>${safe(row.unit)}</td>
          <td>${money(row.price)}</td>
          <td>
            <input class="rowQtyInput" type="number" min="0" step="0.01" value="${toNumber(row.qty)}" data-recipe-row-section="${sectionName}" data-recipe-row-index="${index}">
          </td>
          <td><span class="rowCost">${money(calcRowCost(row))}</span></td>
          <td><button class="iconBtn iconBtnDanger" type="button" data-remove-recipe-row-section="${sectionName}" data-remove-recipe-row-index="${index}">✕</button></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
  renderMobileRows(cardsId, rows, sectionName);
}

function renderRecipeEditor() {
  const recipe = getSelectedRecipe();
  if (!recipe) return;
  renderRecipeCBRCOptions();
  if ($("#recipeName")) $("#recipeName").value = recipe.name || "";
  if ($("#recipeSize")) $("#recipeSize").value = recipe.size || "";
  if ($("#recipeCategory")) $("#recipeCategory").value = recipe.category || "tortas";
  if ($("#recipeServings")) $("#recipeServings").value = recipe.portions || "";
  if ($("#recipeLabor")) $("#recipeLabor").value = recipe.labor || "";
  if ($("#recipeDelivery")) $("#recipeDelivery").value = recipe.delivery || "";
  if ($("#recipeMargin")) $("#recipeMargin").value = recipe.margin || "";
  if ($("#recipeNotes")) $("#recipeNotes").value = recipe.notes || "";
  if ($("#recipeRellenoCBRC")) $("#recipeRellenoCBRC").value = recipe.rellenoCBRCId || "";
  if ($("#recipeRellenoQty")) $("#recipeRellenoQty").value = recipe.rellenoQty || "";
  if ($("#recipeCoberturaCBRC")) $("#recipeCoberturaCBRC").value = recipe.coberturaCBRCId || "";
  if ($("#recipeCoberturaQty")) $("#recipeCoberturaQty").value = recipe.coberturaQty || "";
  if ($("#manualTopperPrice")) $("#manualTopperPrice").value = recipe.manualTopper || "";
  const relleno = getCBRCById(recipe.rellenoCBRCId);
  const cobertura = getCBRCById(recipe.coberturaCBRCId);
  if ($("#recipeRellenoMeta")) {
    $("#recipeRellenoMeta").textContent = relleno
      ? `${safe(relleno.name)} · ${toNumber(recipe.rellenoQty)} ${safe(relleno.yieldUnit)} · ${money(calcLPPartCost(recipe.rellenoCBRCId, recipe.rellenoQty))}`
      : "No hay relleno seleccionado.";
  }
  if ($("#recipeCoberturaMeta")) {
    $("#recipeCoberturaMeta").textContent = cobertura
      ? `${safe(cobertura.name)} · ${toNumber(recipe.coberturaQty)} ${safe(cobertura.yieldUnit)} · ${money(calcLPPartCost(recipe.coberturaCBRCId, recipe.coberturaQty))}`
      : "No hay cobertura seleccionada.";
  }
  renderSimpleRecipeRows(recipe.baseRows, "recipeBaseBody", "baseRows", "recipeBaseCards");
  renderSimpleRecipeRows(recipe.decorRows, "recipeDecorBody", "decorRows", "recipeDecorCards");
  renderSimpleRecipeRows(recipe.presentRows, "recipePresentBody", "presentRows", "recipePresentCards");
  const totals = calcRecipeTotals(recipe);
  if ($("#recipeSubtotalBase")) $("#recipeSubtotalBase").textContent = money(totals.base);
  if ($("#recipeSubtotalRelleno")) $("#recipeSubtotalRelleno").textContent = money(totals.relleno);
  if ($("#recipeSubtotalCobertura")) $("#recipeSubtotalCobertura").textContent = money(totals.cobertura);
  if ($("#recipeSubtotalDecor")) $("#recipeSubtotalDecor").textContent = money(totals.decor);
  if ($("#recipeSubtotalPresent")) $("#recipeSubtotalPresent").textContent = money(totals.present);
  if ($("#sumRecipeBase")) $("#sumRecipeBase").textContent = money(totals.base);
  if ($("#sumRecipeRelleno")) $("#sumRecipeRelleno").textContent = money(totals.relleno);
  if ($("#sumRecipeCobertura")) $("#sumRecipeCobertura").textContent = money(totals.cobertura);
  if ($("#sumRecipeDecor")) $("#sumRecipeDecor").textContent = money(totals.decor);
  if ($("#sumRecipePresent")) $("#sumRecipePresent").textContent = money(totals.present);
  if ($("#sumRecipeMaterials")) $("#sumRecipeMaterials").textContent = money(totals.materials);
  if ($("#sumRecipeLabor")) $("#sumRecipeLabor").textContent = money(totals.labor);
  if ($("#sumRecipeDelivery")) $("#sumRecipeDelivery").textContent = money(totals.delivery);
  if ($("#sumRecipeOriginal")) $("#sumRecipeOriginal").textContent = money(totals.original);
  if ($("#sumRecipeFinal")) $("#sumRecipeFinal").textContent = money(totals.final);
  if ($("#sumRecipePerServing")) $("#sumRecipePerServing").textContent = money(totals.perServing);
  renderRecipeList();
}

function updateSelectedRecipeFromFields() {
  const recipe = getSelectedRecipe();
  if (!recipe) return;
  recipe.name = safe($("#recipeName")?.value);
  recipe.size = safe($("#recipeSize")?.value);
  recipe.category = safe($("#recipeCategory")?.value);
  recipe.portions = toNumber($("#recipeServings")?.value);
  recipe.labor = toNumber($("#recipeLabor")?.value);
  recipe.delivery = toNumber($("#recipeDelivery")?.value);
  recipe.margin = toNumber($("#recipeMargin")?.value);
  recipe.notes = safe($("#recipeNotes")?.value);
  recipe.rellenoCBRCId = safe($("#recipeRellenoCBRC")?.value);
  recipe.rellenoQty = toNumber($("#recipeRellenoQty")?.value);
  recipe.coberturaCBRCId = safe($("#recipeCoberturaCBRC")?.value);
  recipe.coberturaQty = toNumber($("#recipeCoberturaQty")?.value);
  recipe.manualTopper = toNumber($("#manualTopperPrice")?.value);
  saveAll(true);
  renderRecipeEditor();
}

function createRecipe() {
  const item = createEmptyRecipe();
  state.recipes.unshift(item);
  state.selectedRecipeId = item.id;
  saveAll(true);
  renderPage();
  showToast("Receta creada ✅");
}

function duplicateRecipe() {
  const recipe = getSelectedRecipe();
  if (!recipe) return;
  const copy = clone(recipe);
  copy.id = uid("recipe");
  copy.name = `${safe(recipe.name)} (copia)`;
  state.recipes.unshift(copy);
  state.selectedRecipeId = copy.id;
  saveAll(true);
  renderPage();
  showToast("Receta duplicada ✅");
}

function openIngredientPicker(context) {
  state.pickerContext = context;
  state.pickerIngredient = null;
  state.searchPicker = "";
  const pickerSearch = $("#pickerSearch");
  if (pickerSearch) pickerSearch.value = "";
  const pickerTitle = $("#pickerTitle");
  if (pickerTitle) pickerTitle.textContent = "Elegir ingrediente";
  renderPickerList();
  openModal("pickerModal");
}

function renderPickerList() {
  const list = $("#pickerList");
  if (!list) return;
  list.innerHTML = "";
  let filtered = state.ingredients.filter((item) =>
    safe(item.name).toLowerCase().includes(state.searchPicker.toLowerCase())
  );
  if (state.pickerContext === "base") {
    filtered = filtered.filter((x) => x.category === "base" || x.category === "otros");
  }
  if (state.pickerContext === "decor") {
    filtered = filtered.filter((x) => x.category === "decoracion" || x.category === "otros");
  }
  if (state.pickerContext === "present") {
    filtered = filtered.filter((x) => x.category === "presentacion" || x.category === "otros");
  }
  if (state.pickerContext === "cbrc") {
    filtered = state.ingredients.filter((item) =>
      safe(item.name).toLowerCase().includes(state.searchPicker.toLowerCase())
    );
  }
  if (!filtered.length) {
    list.innerHTML = `<div class="emptyState">No encontré ingredientes.</div>`;
    return;
  }
  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = "entityCard";
    card.innerHTML = `
      <div class="entityCardTop">
        <div>
          <h3>${safe(item.name)}</h3>
          <div class="entityMeta">${toNumber(item.presentation)} ${safe(item.unit)} · ${money(item.price)}</div>
        </div>
        <span class="tag">${item.category === "base" ? "materiales" : safe(item.category)}</span>
      </div>
    `;
    card.addEventListener("click", () => {
      state.pickerIngredient = item;
      if ($("#quantityIngredientName")) $("#quantityIngredientName").textContent = item.name;
      if ($("#quantityUnitLabel")) $("#quantityUnitLabel").textContent = item.unit;
      if ($("#quantityInput")) $("#quantityInput").value = "";
      closeModal("pickerModal");
      openModal("quantityModal");
    });
    list.appendChild(card);
  });
}

function confirmPickerQuantity() {
  const item = state.pickerIngredient;
  const qty = toNumber($("#quantityInput")?.value);
  if (!item || qty <= 0) {
    alert("Indica una cantidad válida.");
    return;
  }
  const row = {
    ingredientId: item.id,
    name: item.name,
    presentation: item.presentation,
    unit: item.unit,
    price: item.price,
    qty
  };
  const page = document.body.dataset.page;
  if (page === "cbrc") {
    const cbrc = getSelectedCBRC();
    if (!cbrc) return;
    cbrc.items.push(row);
    saveAll(true);
    renderCBRCEditor();
    showToast("Ingrediente añadido ✅");
  }
  if (page === "recetas") {
    const recipe = getSelectedRecipe();
    if (!recipe) return;
    if (state.pickerContext === "base") recipe.baseRows.push(row);
    if (state.pickerContext === "decor") recipe.decorRows.push(row);
    if (state.pickerContext === "present") recipe.presentRows.push(row);
    saveAll(true);
    renderRecipeEditor();
    showToast("Ingrediente añadido ✅");
  }
  state.pickerIngredient = null;
  closeModal("quantityModal");
}

function renderPage() {
  const page = document.body.dataset.page;
  if (page === "ingredientes") {
    renderIngredientList();
  }
  if (page === "cbrc") {
    renderCBRCList();
    renderCBRCEditor();
  }
  if (page === "lp") {
    renderLPTable();
  }
  if (page === "recetas") {
    renderRecipeList();
    renderRecipeEditor();
  }
}

function initMobileBottomNav() {
  const page = document.body.dataset.page;
  const navMap = {
    home: "home",
    ingredientes: "ingredientes",
    cbrc: "cbrc",
    lp: "lp",
    recetas: "recetas"
  };
  const current = navMap[page];
  if (!current) return;
  $$(".mobileBottomNavItem").forEach((item) => {
    item.classList.toggle("active", item.dataset.nav === current);
  });
}

function bindCommonEvents() {
  const btnGuardar = $("#btnGuardarTodo");
  if (btnGuardar) {
    btnGuardar.addEventListener("click", () => {
      saveAll();
    });
  }
  const btnGuardarHome = $("#btnGuardarTodoHome");
  if (btnGuardarHome) {
    btnGuardarHome.addEventListener("click", () => {
      saveAll();
    });
  }
  const btnExportBackup = $("#btnExportBackup");
  if (btnExportBackup) {
    btnExportBackup.addEventListener("click", exportBackup);
  }
  const btnExportBackupHome = $("#btnExportBackupHome");
  if (btnExportBackupHome) {
    btnExportBackupHome.addEventListener("click", exportBackup);
  }
  const inputImportBackup = $("#inputImportBackup");
  if (inputImportBackup) {
    inputImportBackup.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      importBackupFromFile(file);
      e.target.value = "";
    });
  }
  const inputImportBackupHome = $("#inputImportBackupHome");
  if (inputImportBackupHome) {
    inputImportBackupHome.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      importBackupFromFile(file);
      e.target.value = "";
    });
  }
  const btnCancelQuantity = $("#btnCancelQuantity");
  if (btnCancelQuantity) {
    btnCancelQuantity.addEventListener("click", () => closeModal("quantityModal"));
  }
  const btnConfirmQuantity = $("#btnConfirmQuantity");
  if (btnConfirmQuantity) {
    btnConfirmQuantity.addEventListener("click", confirmPickerQuantity);
  }
  const pickerSearch = $("#pickerSearch");
  if (pickerSearch) {
    pickerSearch.addEventListener("input", (e) => {
      state.searchPicker = e.target.value;
      renderPickerList();
    });
  }
  $$("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  ["pickerModal", "quantityModal"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", (e) => {
        if (e.target.id === id) closeModal(id);
      });
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["pickerModal", "quantityModal"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.classList.contains("show")) closeModal(id);
    });
  });

  document.addEventListener("click", (e) => {
    const deleteIngBtn = e.target.closest("[data-delete-ing-id]");
    if (deleteIngBtn) {
      const ingId = deleteIngBtn.dataset.deleteIngId;
      const item = state.ingredients.find(x => x.id === ingId);
      if (item) {
        requestDelete("ingredient", ingId, item.name);
      }
      return;
    }

    const removeCBRCRow = e.target.closest("[data-remove-cbrc-row]");
    if (removeCBRCRow) {
      const item = getSelectedCBRC();
      const index = toNumber(removeCBRCRow.dataset.removeCbrcRow);
      item.items.splice(index, 1);
      saveAll(true);
      renderCBRCEditor();
      showToast("Ingrediente eliminado ✅");
      return;
    }

    const removeRecipeRow = e.target.closest("[data-remove-recipe-row-section]");
    if (removeRecipeRow) {
      const recipe = getSelectedRecipe();
      const section = removeRecipeRow.dataset.removeRecipeRowSection;
      const index = toNumber(removeRecipeRow.dataset.removeRecipeRowIndex);
      recipe[section].splice(index, 1);
      saveAll(true);
      renderRecipeEditor();
      showToast("Ingrediente eliminado ✅");
      return;
    }

    const removeMobile = e.target.closest("[data-mobile-remove-section]");
    if (removeMobile) {
      const section = removeMobile.dataset.mobileRemoveSection;
      const index = toNumber(removeMobile.dataset.mobileRemoveIndex);
      if (section === "cbrc") {
        const cbrc = getSelectedCBRC();
        cbrc.items.splice(index, 1);
        saveAll(true);
        renderCBRCEditor();
        showToast("Ingrediente eliminado ✅");
        return;
      }
      const recipe = getSelectedRecipe();
      recipe[section].splice(index, 1);
      saveAll(true);
      renderRecipeEditor();
      showToast("Ingrediente eliminado ✅");
      return;
    }

    const removeLP = e.target.closest("[data-delete-lp-id]");
    if (removeLP) {
      const lpId = removeLP.dataset.deleteLpId;
      const lp = state.lp.find((x) => x.id === lpId);
      requestDelete("lp", lpId, safe(lp?.name) || safe(lp?.size) || "Fila de lista");
    }
  });

  document.addEventListener("input", (e) => {
    const cbrcRow = e.target.closest("[data-cbrc-row]");
    if (cbrcRow) {
      const item = getSelectedCBRC();
      const index = toNumber(cbrcRow.dataset.cbrcRow);
      item.items[index].qty = toNumber(cbrcRow.value);
      saveAll(true);
      renderCBRCEditor();
      return;
    }
    const recipeRow = e.target.closest("[data-recipe-row-section]");
    if (recipeRow) {
      const recipe = getSelectedRecipe();
      const section = recipeRow.dataset.recipeRowSection;
      const index = toNumber(recipeRow.dataset.recipeRowIndex);
      recipe[section][index].qty = toNumber(recipeRow.value);
      saveAll(true);
      renderRecipeEditor();
      return;
    }
    const mobileRow = e.target.closest("[data-mobile-section]");
    if (mobileRow) {
      const section = mobileRow.dataset.mobileSection;
      const index = toNumber(mobileRow.dataset.mobileIndex);
      if (section === "cbrc") {
        const cbrc = getSelectedCBRC();
        cbrc.items[index].qty = toNumber(mobileRow.value);
        saveAll(true);
        renderCBRCEditor();
        return;
      }
      const recipe = getSelectedRecipe();
      recipe[section][index].qty = toNumber(mobileRow.value);
      saveAll(true);
      renderRecipeEditor();
      return;
    }
  });
}

function bindIngredientesPage() {
  const ingredientSearch = $("#ingredientSearch");
  if (ingredientSearch) {
    ingredientSearch.addEventListener("input", (e) => {
      state.searchIngredient = e.target.value;
      renderIngredientList();
    });
  }
  const btnSaveIngredient = $("#btnSaveIngredient");
  if (btnSaveIngredient) btnSaveIngredient.addEventListener("click", saveIngredient);
  const btnClearIngredient = $("#btnClearIngredient");
  if (btnClearIngredient) btnClearIngredient.addEventListener("click", clearIngredientForm);
  const btnDeleteIngredient = $("#btnDeleteIngredient");
  if (btnDeleteIngredient) btnDeleteIngredient.addEventListener("click", removeIngredient);
}

function bindCBRCPage() {
  const cbrcSearch = $("#cbrcSearch");
  if (cbrcSearch) {
    cbrcSearch.addEventListener("input", (e) => {
      state.searchCBRC = e.target.value;
      renderCBRCList();
    });
  }
  const btnNewCBRC = $("#btnNewCBRC");
  if (btnNewCBRC) btnNewCBRC.addEventListener("click", createCBRC);
  const btnDuplicateCBRC = $("#btnDuplicateCBRC");
  if (btnDuplicateCBRC) btnDuplicateCBRC.addEventListener("click", duplicateCBRC);
  const btnDeleteCBRC = $("#btnDeleteCBRC");
  if (btnDeleteCBRC) {
    btnDeleteCBRC.addEventListener("click", () => {
      const item = getSelectedCBRC();
      if (!item) return;
      requestDelete("cbrc", item.id, item.name);
    });
  }
  ["#cbrcName", "#cbrcYield", "#cbrcYieldUnit", "#cbrcNotes"].forEach((selector) => {
    const el = $(selector);
    if (el) el.addEventListener("input", updateSelectedCBRCFromFields);
  });
  const cbrcType = $("#cbrcType");
  if (cbrcType) cbrcType.addEventListener("change", updateSelectedCBRCFromFields);
  const btnAddIngredientToCBRC = $("#btnAddIngredientToCBRC");
  if (btnAddIngredientToCBRC) {
    btnAddIngredientToCBRC.addEventListener("click", () => openIngredientPicker("cbrc"));
  }
}

function bindLPPage() {
  const lpSearch = $("#lpSearch");
  if (lpSearch) {
    lpSearch.addEventListener("input", (e) => {
      state.searchLP = e.target.value;
      renderLPTable();
    });
  }
  const btnNewLP = $("#btnNewLP");
  if (btnNewLP) btnNewLP.addEventListener("click", createLP);
  const btnDuplicateLP = $("#btnDuplicateLP");
  if (btnDuplicateLP) {
    btnDuplicateLP.addEventListener("click", () => {
      if (!state.lp.length) {
        createLP();
        return;
      }
      state.selectedLPId = state.lp[0]?.id || null;
      duplicateLP();
    });
  }
  const btnDeleteLP = $("#btnDeleteLP");
  if (btnDeleteLP) {
    btnDeleteLP.addEventListener("click", () => {
      const first = state.lp[0];
      if (!first) return;
      requestDelete("lp", first.id, safe(first.name) || safe(first.size) || "Fila de lista");
    });
  }
  const desktop = $("#lpTableBody");
  if (desktop) {
    desktop.addEventListener("input", (e) => {
      const field = e.target.closest("[data-lp-id][data-lp-field]");
      if (!field) return;
      updateLPField(field.dataset.lpId, field.dataset.lpField, field.value);
      if (field.dataset.lpField === "name") return;
      if (field.dataset.lpField === "size") return;
    });
    desktop.addEventListener("change", (e) => {
      const field = e.target.closest("[data-lp-id][data-lp-field]");
      if (!field) return;
      updateLPField(field.dataset.lpId, field.dataset.lpField, field.value);
      renderLPTable();
    });
    desktop.addEventListener("blur", (e) => {
      const field = e.target.closest("[data-lp-id][data-lp-field]");
      if (!field) return;
      updateLPField(field.dataset.lpId, field.dataset.lpField, field.value);
      renderLPTable();
    }, true);
  }
  const mobile = $("#lpMobileCards");
  if (mobile) {
    mobile.addEventListener("input", (e) => {
      const field = e.target.closest("[data-lp-id][data-lp-field]");
      if (!field) return;
      updateLPField(field.dataset.lpId, field.dataset.lpField, field.value);
    });
    mobile.addEventListener("change", (e) => {
      const field = e.target.closest("[data-lp-id][data-lp-field]");
      if (!field) return;
      updateLPField(field.dataset.lpId, field.dataset.lpField, field.value);
      renderLPTable();
    });
    mobile.addEventListener("blur", (e) => {
      const field = e.target.closest("[data-lp-id][data-lp-field]");
      if (!field) return;
      updateLPField(field.dataset.lpId, field.dataset.lpField, field.value);
      renderLPTable();
    }, true);
  }
}

function bindRecetasPage() {
  const recipeSearch = $("#recipeSearch");
  if (recipeSearch) {
    recipeSearch.addEventListener("input", (e) => {
      state.searchRecipe = e.target.value;
      renderRecipeList();
    });
  }
  const btnNewRecipe = $("#btnNewRecipe");
  if (btnNewRecipe) btnNewRecipe.addEventListener("click", createRecipe);
  const btnDuplicateRecipe = $("#btnDuplicateRecipe");
  if (btnDuplicateRecipe) btnDuplicateRecipe.addEventListener("click", duplicateRecipe);
  const btnDeleteRecipe = $("#btnDeleteRecipe");
  if (btnDeleteRecipe) {
    btnDeleteRecipe.addEventListener("click", () => {
      const item = getSelectedRecipe();
      if (!item) return;
      requestDelete("recipe", item.id, item.name);
    });
  }
  ["#recipeName", "#recipeSize", "#recipeServings", "#recipeLabor", "#recipeDelivery", "#recipeMargin", "#recipeNotes", "#recipeRellenoQty", "#recipeCoberturaQty", "#manualTopperPrice"].forEach((selector) => {
    const el = $(selector);
    if (el) el.addEventListener("input", updateSelectedRecipeFromFields);
  });
  const recipeCategory = $("#recipeCategory");
  if (recipeCategory) recipeCategory.addEventListener("change", updateSelectedRecipeFromFields);
  const recipeRellenoCBRC = $("#recipeRellenoCBRC");
  if (recipeRellenoCBRC) recipeRellenoCBRC.addEventListener("change", updateSelectedRecipeFromFields);
  const recipeCoberturaCBRC = $("#recipeCoberturaCBRC");
  if (recipeCoberturaCBRC) recipeCoberturaCBRC.addEventListener("change", updateSelectedRecipeFromFields);
  const btnAddBaseToRecipe = $("#btnAddBaseToRecipe");
  if (btnAddBaseToRecipe) btnAddBaseToRecipe.addEventListener("click", () => openIngredientPicker("base"));
  const btnAddDecorToRecipe = $("#btnAddDecorToRecipe");
  if (btnAddDecorToRecipe) btnAddDecorToRecipe.addEventListener("click", () => openIngredientPicker("decor"));
  const btnAddPresentToRecipe = $("#btnAddPresentToRecipe");
  if (btnAddPresentToRecipe) btnAddPresentToRecipe.addEventListener("click", () => openIngredientPicker("present"));
}

function initData() {
  state.ingredients = readStorage(STORAGE.ingredients, []);
  state.cbrc = readStorage(STORAGE.cbrc, [createEmptyCBRC()]);
  state.lp = readStorage(STORAGE.lp, []);
  state.recipes = readStorage(STORAGE.recipes, [createEmptyRecipe()]).map(ensureRecipe);
  if (!state.cbrc.length) state.cbrc = [createEmptyCBRC()];
  if (!state.recipes.length) state.recipes = [createEmptyRecipe()];
  state.selectedCBRCId = state.cbrc[0]?.id || null;
  state.selectedLPId = state.lp[0]?.id || null;
  state.selectedRecipeId = state.recipes[0]?.id || null;
}

function init() {
  initData();
  bindCommonEvents();
  const page = document.body.dataset.page;
  if (page === "ingredientes") bindIngredientesPage();
  if (page === "cbrc") bindCBRCPage();
  if (page === "lp") bindLPPage();
  if (page === "recetas") bindRecetasPage();
  renderPage();
  initMobileBottomNav();
}

document.addEventListener("DOMContentLoaded", init);
/* =========================
   EXPORTACIÓN FORZADA PARA WEBINTOAPP
   ========================= */

function exportBackupForzado() {
  try {
    const payload = buildBackupPayload();
    const date = new Date();
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      "-",
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0")
    ].join("");
    
    const filename = `essencia-respaldo-${stamp}.json`;
    const content = JSON.stringify(payload, null, 2);
    const mimeType = "application/json";
    
    console.log("🚀 Iniciando descarga forzada:", filename);
    
    // MÉTODO 1: window.location con data URI
    try {
      console.log("📥 Método 1: window.location");
      const dataUri = "data:" + mimeType + ";charset=utf-8," + encodeURIComponent(content);
      window.location.href = dataUri;
      showToast("✅ Descargando...");
      setTimeout(() => showToast("✅ Revisa Descargas"), 2000);
      return;
    } catch (e1) {
      console.error("❌ Método 1 falló:", e1);
    }
    
    // MÉTODO 2: Nueva ventana/pestaña
    try {
      console.log("📥 Método 2: window.open");
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank");
      if (!newWindow) {
        window.location.href = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast("✅ Descargando...");
      return;
    } catch (e2) {
      console.error("❌ Método 2 falló:", e2);
    }
    
    // MÉTODO 3: Iframe oculto con download
    try {
      console.log("📥 Método 3: iframe");
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.sandbox = "allow-downloads";
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      iframe.src = url;
      document.body.appendChild(iframe);
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 3000);
      showToast("✅ Descargando...");
      return;
    } catch (e3) {
      console.error("❌ Método 3 falló:", e3);
    }
    
    // MÉTODO 4: Link con target="_blank"
    try {
      console.log("📥 Método 4: link target blank");
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 3000);
      showToast("✅ Descargando...");
      return;
    } catch (e4) {
      console.error("❌ Método 4 falló:", e4);
    }
    
    // MÉTODO 5: Forzar descarga con fetch
    try {
      console.log("📥 Método 5: fetch blob");
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      fetch(url)
        .then(response => response.blob())
        .then(blob => {
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
          }, 3000);
        });
      URL.revokeObjectURL(url);
      showToast("✅ Descargando...");
      return;
    } catch (e5) {
      console.error("❌ Método 5 falló:", e5);
    }
    
    // MÉTODO 6: Última opción - prompt para copiar
    console.log("📋 Método 6: copiar al portapapeles");
    showToast("⚠️ Copia el respaldo");
    setTimeout(() => {
      const copyText = prompt("COPIA TU RESPALDO (Ctrl+C):", content);
      if (copyText !== null) {
        showToast("✅ Respaldo guardado");
      }
    }, 500);
    
  } catch (err) {
    console.error("💥 Error crítico en exportación:", err);
    alert("Error al exportar: " + err.message);
  }
}

// Reemplazar el evento del botón Exportar
document.addEventListener("DOMContentLoaded", () => {
  const btnExport = $("#btnExportBackup");
  const btnExportHome = $("#btnExportBackupHome");
  
  if (btnExport) {
    btnExport.removeEventListener("click", exportBackup);
    btnExport.addEventListener("click", exportBackupForzado);
  }
  
  if (btnExportHome) {
    btnExportHome.removeEventListener("click", exportBackup);
    btnExportHome.addEventListener("click", exportBackupForzado);
  }
});

console.log("✅ Sistema de exportación forzada activado");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js", {
        scope: "./"
      });
      console.log("Service worker registrado:", registration);
      if (registration.waiting) {
        console.log("Hay un service worker esperando activarse.");
      }
      registration.addEventListener("updatefound", () => {
        console.log("Nuevo service worker encontrado.");
      });
    } catch (error) {
      console.error("Error registrando service worker:", error);
    }
  });
}