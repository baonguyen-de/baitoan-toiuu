import { buildOrderQuery, parseOrderQuery } from "./query.js"
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

const state = {
  allowPieceRotation: true,
  allowSheetRotation: false,
  trim: { left: 0, right: 0, top: 0, bottom: 0 },
  sheetW: "",
  sheetH: "",
  items: [{ id: 1, name: "", width: "", height: "", quantity: 1 }],
  nextId: 2,
  result: null,
  selectedId: null,
  formError: "",
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
  const trim = state.trim
  $("#sheet-w").value = state.sheetW ?? ""
  $("#sheet-h").value = state.sheetH ?? ""
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

function readDim(el) {
  const raw = el.value.trim()
  if (raw === "") return ""
  const n = Number(raw)
  return Number.isFinite(n) ? n : ""
}

function readForm() {
  state.sheetW = readDim($("#sheet-w"))
  state.sheetH = readDim($("#sheet-h"))
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

function syncAddressBar() {
  const qs = buildOrderQuery({
    sheetW: state.sheetW,
    sheetH: state.sheetH,
    trim: state.trim,
    items: state.items.map((it) => ({
      name: it.name,
      width: it.width,
      height: it.height,
      quantity: it.quantity,
    })),
    allowPieceRotation: state.allowPieceRotation,
    allowSheetRotation: state.allowSheetRotation,
  })
  const hash = state.selectedId ? `#${state.selectedId}` : ""
  const next = `${location.pathname}?${qs}${hash}`
  if (`${location.pathname}${location.search}${location.hash}` !== next) {
    history.replaceState(null, "", next)
  }
}

function renderResults() {
  const errHost = $("#errors")
  const result = state.result
  if (!result) {
    if (state.formError) {
      errHost.hidden = false
      errHost.textContent = state.formError
    } else {
      errHost.hidden = true
    }
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
  state.formError = ""
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
    state.formError =
      "Không gọi được thuật toán Python. Chạy `python app.py` rồi mở http://127.0.0.1:5000 — " +
      err.message
    errHost.hidden = false
    errHost.textContent = state.formError
    syncAddressBar()
    return
  }
  const wanted = location.hash.replace("#", "")
  state.selectedId =
    (wanted && state.result.plans?.some((p) => p.id === wanted) && wanted) ||
    state.result.plans?.[0]?.id ||
    null
  syncAddressBar()
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

function onPlansClick(ev) {
  const btn = ev.target.closest("[data-plan]")
  if (!btn) return
  state.selectedId = btn.dataset.plan
  syncAddressBar()
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

function applyQuery(parsed) {
  state.sheetW = parsed.sheetW
  state.sheetH = parsed.sheetH
  state.trim = parsed.trim
  state.allowPieceRotation = parsed.allowPieceRotation
  state.allowSheetRotation = parsed.allowSheetRotation
  const rows = parsed.items.length ? parsed.items : [{ name: "", width: "", height: "", quantity: 1 }]
  state.items = rows.map((it, i) => ({
    id: i + 1,
    name: it.name ?? "",
    width: it.width ?? "",
    height: it.height ?? "",
    quantity: it.quantity === "" || it.quantity == null ? 1 : it.quantity,
  }))
  state.nextId = state.items.length + 1
  state.formError = parsed.error || ""
}

function init() {
  const parsed = parseOrderQuery(location.search)
  const auto = Boolean(parsed?.autoRun)
  if (parsed) applyQuery(parsed)
  $("#add-row").addEventListener("click", addRow)
  $("#plans").addEventListener("click", onPlansClick)
  $("#item-body").addEventListener("click", onTableInput)
  $("#order-form").addEventListener("submit", (ev) => {
    ev.preventDefault()
    compute()
  })
  ;["sheet-w", "sheet-h", "trim-l", "trim-r", "trim-t", "trim-b"].forEach((id) => {
    $(`#${id}`)?.addEventListener("input", updateUsableLine)
  })
  renderForm()
  renderResults()
  if (auto) compute()
}

init()
