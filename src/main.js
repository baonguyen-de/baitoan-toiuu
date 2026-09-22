import { EXAMPLES, exampleById } from "./examples.js"
import {
  bindSheetZoom,
  colorMap,
  fmt,
  renderCuts,
  renderLegend,
  renderMetrics,
  renderPlanCards,
  renderViewer,
} from "./render.js"

const $ = (sel) => document.querySelector(sel)

function samplePieceRotation(sample) {
  if (sample.allowPieceRotation != null) return Boolean(sample.allowPieceRotation)
  return sample.allowRotation !== false
}

function sampleSheetRotation(sample) {
  return sample.allowSheetRotation === true
}

function sampleTrim(sample) {
  const t = sample.trim || {}
  return {
    left: Number(t.left) || 0,
    right: Number(t.right) || 0,
    top: Number(t.top) || 0,
    bottom: Number(t.bottom) || 0,
  }
}

const state = {
  sample: EXAMPLES[0],
  allowPieceRotation: samplePieceRotation(EXAMPLES[0]),
  allowSheetRotation: sampleSheetRotation(EXAMPLES[0]),
  trim: sampleTrim(EXAMPLES[0]),
  items: EXAMPLES[0].items.map((it, i) => ({ ...it, id: i + 1 })),
  nextId: EXAMPLES[0].items.length + 1,
  result: null,
  selectedId: null,
}

function itemName(it) {
  return (it.name || "").trim() || `${fmt(Number(it.width) || 0)}×${fmt(Number(it.height) || 0)}`
}

function updateUsableLine() {
  const el = $("#usable-size")
  if (!el) return
  const w = Number($("#sheet-w").value)
  const h = Number($("#sheet-h").value)
  const t = {
    left: Number($("#trim-l")?.value) || 0,
    right: Number($("#trim-r")?.value) || 0,
    top: Number($("#trim-t")?.value) || 0,
    bottom: Number($("#trim-b")?.value) || 0,
  }
  const uw = w - t.left - t.right
  const uh = h - t.top - t.bottom
  if (!(w > 0) || !(h > 0)) {
    el.textContent = "Khổ hữu dụng: —"
    el.classList.remove("is-bad")
    return
  }
  if (uw <= 0 || uh <= 0) {
    el.textContent = "Khổ hữu dụng không hợp lệ (trim lớn hơn tấm nguyên)."
    el.classList.add("is-bad")
    return
  }
  el.textContent = `Khổ hữu dụng: ${fmt(uw)} × ${fmt(uh)}`
  el.classList.remove("is-bad")
}

function renderForm() {
  const sample = state.sample
  const trim = state.trim || sampleTrim(sample)
  $("#sheet-w").value = state.sheetW ?? sample.sheet.width
  $("#sheet-h").value = state.sheetH ?? sample.sheet.height
  if ($("#trim-l")) $("#trim-l").value = trim.left
  if ($("#trim-r")) $("#trim-r").value = trim.right
  if ($("#trim-t")) $("#trim-t").value = trim.top
  if ($("#trim-b")) $("#trim-b").value = trim.bottom
  $("#allow-rot").checked = state.allowPieceRotation
  if ($("#allow-sheet-rot")) $("#allow-sheet-rot").checked = state.allowSheetRotation
  updateUsableLine()
  const body = state.items
    .map(
      (it) => `
      <tr data-id="${it.id}">
        <td><input type="text" data-k="name" value="${escapeAttr(it.name)}" placeholder="${escapeAttr(itemName(it))}"></td>
        <td><input class="dim" type="number" min="0" step="any" data-k="width" value="${it.width}"></td>
        <td><input class="dim" type="number" min="0" step="any" data-k="height" value="${it.height}"></td>
        <td><input class="qty" type="number" min="1" step="1" data-k="quantity" value="${it.quantity}"></td>
        <td><button class="row-del" type="button" data-del="${it.id}" aria-label="Xóa dòng">×</button></td>
      </tr>`,
    )
    .join("")
  $("#item-body").innerHTML = body
}

function escapeAttr(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
}

function readForm() {
  state.sheetW = Number($("#sheet-w").value)
  state.sheetH = Number($("#sheet-h").value)
  state.allowPieceRotation = $("#allow-rot").checked
  state.allowSheetRotation = Boolean($("#allow-sheet-rot")?.checked)
  state.trim = {
    left: Number($("#trim-l")?.value) || 0,
    right: Number($("#trim-r")?.value) || 0,
    top: Number($("#trim-t")?.value) || 0,
    bottom: Number($("#trim-b")?.value) || 0,
  }
  $("#item-body")
    .querySelectorAll("tr")
    .forEach((tr) => {
      const id = Number(tr.dataset.id)
      const item = state.items.find((x) => x.id === id)
      if (!item) return
      tr.querySelectorAll("input").forEach((input) => {
        const k = input.dataset.k
        item[k] = k === "name" ? input.value : input.value === "" ? "" : Number(input.value)
      })
    })
}

function renderResults() {
  const errHost = $("#errors")
  const result = state.result
  if (!result) {
    errHost.hidden = true
    $("#plans").innerHTML = `<div class="empty">Nhấn «Bắt đầu cắt» để xem các phương án.</div>`
    $("#metrics").innerHTML = ""
    $("#viewer").innerHTML = ""
    $("#cuts").innerHTML = ""
    $("#legend").innerHTML = ""
    return
  }
  if (!result.ok) {
    errHost.hidden = false
    errHost.textContent = result.errors.join(" ")
    $("#plans").innerHTML = ""
    $("#metrics").innerHTML = ""
    $("#viewer").innerHTML = ""
    $("#cuts").innerHTML = ""
    $("#legend").innerHTML = ""
    return
  }
  errHost.hidden = true
  if (!result.plans.length) {
    const msg = result.message || "Không xếp được cách cắt nào."
    $("#plans").innerHTML = `<div class="empty">${msg}</div>`
    $("#metrics").innerHTML = ""
    $("#viewer").innerHTML = ""
    $("#cuts").innerHTML = ""
    $("#legend").innerHTML = ""
    return
  }
  const plan = result.plans.find((p) => p.id === state.selectedId) || result.plans[0]
  if (plan) state.selectedId = plan.id
  const colors = colorMap(result.demand)
  $("#plans").innerHTML = renderPlanCards(result.plans, state.selectedId)
  $("#metrics").innerHTML = plan ? renderMetrics(plan) : ""
  $("#viewer").innerHTML = renderViewer(plan, colors)
  $("#viewer").classList.toggle("is-best", Boolean(plan?.best))
  $("#legend").innerHTML = renderLegend(result.demand, colors)
  $("#cuts").innerHTML = plan ? renderCuts(plan) : ""
  bindSheetZoom($("#viewer"))
}

async function compute() {
  readForm()
  const items = state.items.map((it) => ({
    name: itemName(it),
    width: Number(it.width),
    height: Number(it.height),
    quantity: Number(it.quantity),
  }))
  const errHost = $("#errors")
  try {
    const res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheet: { width: state.sheetW, height: state.sheetH },
        trim: state.trim,
        items,
        allowPieceRotation: state.allowPieceRotation,
        allowSheetRotation: state.allowSheetRotation,
        allowRotation: state.allowPieceRotation,
        maxPlans: 6,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    state.result = await res.json()
  } catch (err) {
    errHost.hidden = false
    errHost.textContent =
      "Không gọi được thuật toán Python. Chạy `python app.py` rồi mở http://127.0.0.1:5000 — " +
      err.message
    return
  }
  const wanted = location.hash.replace("#", "")
  state.selectedId =
    (wanted && state.result.plans.some((p) => p.id === wanted) && wanted) ||
    state.result.plans[0]?.id ||
    null
  renderResults()
}

function addRow() {
  readForm()
  state.items.push({
    id: state.nextId++,
    name: "",
    width: "",
    height: "",
    quantity: 1,
  })
  renderForm()
  const last = $("#item-body tr:last-child input[data-k='width']")
  last?.focus()
}

function optionHtml(ex) {
  const hot = ex.highlight ? ` class="sample-hot"` : ""
  const star = ex.highlight ? "★ " : ""
  return `<option value="${escapeAttr(ex.id)}"${hot} title="${escapeAttr(ex.title || "")}">${star}${escapeAttr(ex.name)}</option>`
}

function fillSampleSelect() {
  const sel = $("#sample-select")
  if (!sel) return
  const hot = EXAMPLES.filter((ex) => ex.highlight)
  const rest = EXAMPLES.filter((ex) => !ex.highlight)
  sel.innerHTML = `
    <optgroup label="Thử thuật toán">
      ${hot.map(optionHtml).join("")}
    </optgroup>
    <optgroup label="Mẫu cơ bản">
      ${rest.map(optionHtml).join("")}
    </optgroup>`
  const chips = $("#sample-chips")
  if (chips) {
    chips.innerHTML = hot
      .map(
        (ex) =>
          `<button type="button" class="sample-chip" data-sample="${escapeAttr(ex.id)}" title="${escapeAttr(ex.title || "")}">${escapeAttr(ex.name)}</button>`,
      )
      .join("")
  }
}

function syncSampleUi(id) {
  const sample = exampleById(id)
  const sel = $("#sample-select")
  if (sel) {
    sel.value = sample.id
    sel.classList.toggle("is-highlight", Boolean(sample.highlight))
  }
  document.querySelectorAll(".sample-chip").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.sample === sample.id)
  })
  const hint = $("#sample-hint")
  if (hint) {
    hint.textContent = sample.title || ""
    hint.hidden = !sample.title
    hint.classList.toggle("is-highlight", Boolean(sample.highlight))
  }
}

function loadSampleById(id) {
  const sample = exampleById(id)
  state.sample = sample
  state.sheetW = sample.sheet.width
  state.sheetH = sample.sheet.height
  state.trim = sampleTrim(sample)
  state.allowPieceRotation = samplePieceRotation(sample)
  state.allowSheetRotation = sampleSheetRotation(sample)
  state.items = sample.items.map((it, i) => ({ ...it, id: i + 1 }))
  state.nextId = state.items.length + 1
  state.result = null
  state.selectedId = null
  if (location.hash) history.replaceState(null, "", location.pathname + location.search)
  syncSampleUi(sample.id)
  renderForm()
  compute()
}

function onPlansClick(ev) {
  const btn = ev.target.closest("[data-plan]")
  if (!btn) return
  state.selectedId = btn.dataset.plan
  history.replaceState(null, "", `#${state.selectedId}`)
  renderResults()
}

function onTableInput(ev) {
  if (ev.target.dataset.del) {
    readForm()
    const id = Number(ev.target.dataset.del)
    state.items = state.items.filter((it) => it.id !== id)
    if (!state.items.length) addRow()
    else renderForm()
  }
}

async function init() {
  try {
    const res = await fetch("/api/sample")
    if (res.ok) {
      const data = await res.json()
      const chuan = EXAMPLES.find((e) => e.id === "chuan")
      if (chuan && data.sheet && Array.isArray(data.items)) {
        chuan.sheet = data.sheet
        chuan.items = data.items
      }
    }
  } catch {
    /* giữ EXAMPLES */
  }
  fillSampleSelect()
  $("#add-row").addEventListener("click", addRow)
  $("#sample-select").addEventListener("change", (ev) => loadSampleById(ev.target.value))
  $("#sample-chips")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-sample]")
    if (!btn) return
    loadSampleById(btn.dataset.sample)
  })
  $("#compute").addEventListener("click", compute)
  $("#plans").addEventListener("click", onPlansClick)
  $("#item-body").addEventListener("click", onTableInput)
  $("#order-form").addEventListener("submit", (ev) => {
    ev.preventDefault()
    compute()
  })
  ;["sheet-w", "sheet-h", "trim-l", "trim-r", "trim-t", "trim-b"].forEach((id) => {
    $(`#${id}`)?.addEventListener("input", updateUsableLine)
  })
  loadSampleById("chuan")
}

init()
