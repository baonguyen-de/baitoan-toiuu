// Đơn trên link:
//   rong, dai, trai, phai, tren, duoi, n, items
//   items = "kíHiệu,rộng,dài,sl|..."  (dấu | hoặc ; ngăn từng tấm)
//   item=... lặp lại cũng được (cùng format một tấm)
//   xoay / xoayTo là tuỳ chọn (1 hoặc 0).
//   n = số dòng form khi chưa có items. Có danh sách rồi thì lấy items.

const KNOWN = new Set(["rong", "dai", "trai", "phai", "tren", "duoi", "n", "items", "item", "xoay", "xoayTo"])

function decode(raw) {
  const text = String(raw ?? "").replaceAll("+", " ")
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function splitPairs(search) {
  const raw = String(search ?? "").replace(/^\?/, "")
  if (!raw) return []
  const pairs = []
  for (const part of raw.split("&")) {
    if (!part) continue
    const i = part.indexOf("=")
    const key = decode(i < 0 ? part : part.slice(0, i))
    const value = i < 0 ? "" : part.slice(i + 1)
    pairs.push([key, value])
  }
  return pairs
}

function parseItemToken(raw) {
  let body = String(raw ?? "").trim()
  if (!body.includes(",")) body = decode(body)
  const parts = body.split(",")
  if (parts.length < 4) {
    return { name: decode(body).trim(), width: "", height: "", quantity: 1, bad: true, blank: false }
  }
  const quantity = decode(parts.pop()).trim()
  const height = decode(parts.pop()).trim()
  const width = decode(parts.pop()).trim()
  const name = decode(parts.join(",")).trim()
  const blank = name === "" && width === "" && height === ""
  const w = Number(width)
  const h = Number(height)
  const q = Number(quantity)
  const bad =
    !blank &&
    (width === "" ||
      height === "" ||
      quantity === "" ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      !Number.isFinite(q) ||
      !(w > 0) ||
      !(h > 0) ||
      !Number.isInteger(q) ||
      q < 1)
  return {
    name,
    width: width === "" || !Number.isFinite(w) ? "" : w,
    height: height === "" || !Number.isFinite(h) ? "" : h,
    quantity: quantity === "" || !Number.isFinite(q) ? (blank ? 1 : "") : q,
    bad,
    blank,
  }
}

function parseItems(raw) {
  if (raw == null || String(raw).trim() === "") return []
  let body = String(raw).trim()
  // Trình duyệt / chat hay đổi | thành %7C nhưng giữ nguyên dấu phẩy.
  if (!body.includes("|")) body = decode(body)
  const sep = body.includes("|") ? "|" : body.includes(";") ? ";" : "|"
  return body
    .split(sep)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(parseItemToken)
}

function collectParsedItems(pairs) {
  const fromItems = pairs.filter(([key]) => key === "items").flatMap(([, value]) => parseItems(value))
  if (fromItems.length) return fromItems
  return pairs.filter(([key]) => key === "item").flatMap(([, value]) => parseItems(value))
}

function readNumber(raw) {
  if (raw == null) return { missing: true, value: "", error: "" }
  const text = decode(raw).trim()
  if (text === "") return { missing: false, value: "", error: "" }
  const n = Number(text)
  if (!Number.isFinite(n)) return { missing: false, value: "", error: "không phải số" }
  return { missing: false, value: n, error: "" }
}

function flagOn(raw, fallback) {
  if (raw == null) return fallback
  const text = decode(raw).trim().toLowerCase()
  if (text === "0" || text === "false") return false
  if (text === "1" || text === "true") return true
  return fallback
}

function usable(sheetW, sheetH, trim) {
  if (!(sheetW > 0) || !(sheetH > 0)) return false
  const sides = [trim.left, trim.right, trim.top, trim.bottom]
  if (sides.some((n) => !Number.isFinite(n) || n < 0)) return false
  return sheetW - trim.left - trim.right > 0 && sheetH - trim.top - trim.bottom > 0
}

export function parseOrderQuery(search) {
  const pairs = splitPairs(search)
  if (!pairs.some(([key]) => KNOWN.has(key))) return null

  const first = new Map()
  for (const [key, value] of pairs) {
    if (!first.has(key)) first.set(key, value)
  }

  const errors = []
  const rong = readNumber(first.has("rong") ? first.get("rong") : null)
  const dai = readNumber(first.has("dai") ? first.get("dai") : null)
  if (rong.error) errors.push("Rộng tấm nguyên không phải số.")
  if (dai.error) errors.push("Dài tấm nguyên không phải số.")
  if (!rong.missing && rong.value !== "" && !rong.error && !(rong.value > 0)) {
    errors.push("Rộng tấm nguyên phải là số dương.")
  }
  if (!dai.missing && dai.value !== "" && !dai.error && !(dai.value > 0)) {
    errors.push("Dài tấm nguyên phải là số dương.")
  }

  const trim = {}
  for (const [key, field] of [
    ["trai", "left"],
    ["phai", "right"],
    ["tren", "top"],
    ["duoi", "bottom"],
  ]) {
    const read = readNumber(first.has(key) ? first.get(key) : null)
    if (read.error) errors.push(`Trim ${key} không phải số.`)
    else if (!read.missing && read.value !== "" && read.value < 0) {
      errors.push(`Trim ${key} không được âm.`)
    }
    trim[field] = read.missing || read.value === "" ? 0 : read.value
  }

  const parsed = collectParsedItems(pairs)
  if (parsed.some((it) => it.bad)) {
    errors.push("Mỗi tấm cần cắt ghi dạng kí hiệu,rộng,dài,số lượng.")
  }

  let n = null
  if (first.has("n")) {
    const read = readNumber(first.get("n"))
    if (read.error || read.value === "" || !Number.isInteger(read.value) || read.value < 1) {
      errors.push("Số lượng tấm cần cắt (n) phải là số nguyên dương.")
    } else {
      n = read.value
    }
  }

  let items = parsed.map(({ name, width, height, quantity }) => ({ name, width, height, quantity }))
  if (!parsed.length && n != null) {
    items = Array.from({ length: n }, () => ({ name: "", width: "", height: "", quantity: 1 }))
  }
  if (!items.length) items.push({ name: "", width: "", height: "", quantity: 1 })

  const complete =
    items.length > 0 &&
    parsed.length === items.length &&
    parsed.every((it) => !it.bad && !it.blank)
  const error = errors.join(" ")
  const autoRun =
    !error &&
    complete &&
    usable(rong.value, dai.value, trim)

  return {
    sheetW: rong.missing ? "" : rong.value,
    sheetH: dai.missing ? "" : dai.value,
    trim,
    items,
    allowPieceRotation: flagOn(first.has("xoay") ? first.get("xoay") : null, true),
    allowSheetRotation: flagOn(first.has("xoayTo") ? first.get("xoayTo") : null, false),
    error,
    autoRun,
  }
}

function enc(value) {
  return encodeURIComponent(value ?? "")
}

export function buildOrderQuery(order) {
  const trim = order.trim || {}
  const rows = order.items || []
  const head = [
    ["rong", order.sheetW ?? ""],
    ["dai", order.sheetH ?? ""],
    ["trai", trim.left ?? 0],
    ["phai", trim.right ?? 0],
    ["tren", trim.top ?? 0],
    ["duoi", trim.bottom ?? 0],
    ["n", rows.length],
  ]
    .map(([key, value]) => `${key}=${enc(value)}`)
    .join("&")
  const items = rows
    .map((it) => [enc(String(it.name ?? "").trim()), it.width ?? "", it.height ?? "", it.quantity ?? ""].join(","))
    .join("|")
  const flags = `xoay=${order.allowPieceRotation === false ? "0" : "1"}&xoayTo=${order.allowSheetRotation ? "1" : "0"}`
  return `${head}&items=${items}&${flags}`
}
