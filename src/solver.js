/**
 * Cắt tấm carton 2 giai đoạn (guillotine).
 *
 * Máy cắt hàng loạt:
 *   1) Cắt NGANG xuyên suốt tấm → các dải cùng chiều cao
 *   2) Cắt DỌC từng dải → từng tấm hộp
 *
 * Trong một dải, mọi tấm phải cùng chiều cao (sau khi xoay 90° nếu được phép).
 * Nếu lệch hàng, nhát cắt ngang sẽ hư tấm.
 */

const EPS = 1e-6

export function fmt(n) {
  if (!Number.isFinite(n)) return "—"
  const r = Math.round(n * 1000) / 1000
  if (Number.isInteger(r)) return String(r)
  return String(r)
}

function nearly(a, b) {
  return Math.abs(a - b) < 1e-4
}

function cloneItems(items) {
  return items.map((it) => ({ ...it }))
}

function itemKey(it) {
  return `${it.name}::${it.width}x${it.height}`
}

function isPositiveNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

function allInts(sheet, items) {
  const vals = [sheet.width, sheet.height]
  for (const it of items) vals.push(it.width, it.height)
  return vals.every((v) => Math.abs(v - Math.round(v)) < 1e-9)
}

function orientationsFor(item, sheetW, sheetH, allowRotation) {
  const opts = []
  if (item.height <= sheetH + EPS && item.width <= sheetW + EPS) {
    opts.push({ rotated: false, stripH: item.height, pieceW: item.width })
  }
  if (
    allowRotation &&
    !nearly(item.width, item.height) &&
    item.width <= sheetH + EPS &&
    item.height <= sheetW + EPS
  ) {
    opts.push({ rotated: true, stripH: item.width, pieceW: item.height })
  }
  return opts
}

function knapsackGreedy(capacity, types, wideFirst) {
  const sorted = [...types].sort((a, b) =>
    wideFirst ? b.width - a.width : a.width - b.width,
  )
  let left = capacity
  const counts = {}
  for (const t of sorted) {
    if (t.width <= EPS) continue
    const k = Math.min(t.qty, Math.floor((left + EPS) / t.width))
    if (k > 0) {
      counts[t.id] = (counts[t.id] || 0) + k
      left -= k * t.width
    }
  }
  return { used: capacity - left, counts }
}

function knapsackDP(capacity, types) {
  const W = Math.round(capacity)
  const n = types.length
  const work = types.map((t) => ({
    ...t,
    width: Math.round(t.width),
    qty: Math.max(0, Math.floor(t.qty)),
  }))
  const ops = work.reduce((s, t) => s + t.qty, 0) * (W + 1)
  if (W > 900 || ops > 250_000) return knapsackGreedy(capacity, types, true)

  const dp = Array(W + 1).fill(null)
  dp[0] = { pieces: 0, counts: Array(n).fill(0) }

  for (let i = 0; i < n; i++) {
    const width = work[i].width
    const qty = work[i].qty
    if (width <= 0 || qty <= 0) continue
    const next = dp.map((s) => (s ? { pieces: s.pieces, counts: s.counts.slice() } : null))
    for (let w = 0; w <= W; w++) {
      if (!dp[w]) continue
      const maxK = Math.min(qty, Math.floor((W - w) / width))
      for (let k = 1; k <= maxK; k++) {
        const nw = w + k * width
        const pieces = dp[w].pieces + k
        if (!next[nw] || pieces > next[nw].pieces) {
          const counts = dp[w].counts.slice()
          counts[i] += k
          next[nw] = { pieces, counts }
        }
      }
    }
    for (let w = 0; w <= W; w++) dp[w] = next[w]
  }

  let bestW = 0
  for (let w = 1; w <= W; w++) {
    if (dp[w] && w >= bestW) bestW = w
  }
  const counts = {}
  if (dp[bestW]) {
    dp[bestW].counts.forEach((c, i) => {
      if (c) counts[work[i].id] = c
    })
  }
  return { used: bestW, counts }
}

function fillStrip(capacity, types, integerMode, fillMode) {
  const usable = types.filter((t) => t.qty > 0 && t.width <= capacity + EPS)
  if (!usable.length) return { used: 0, counts: {} }
  if (fillMode === "narrow") return knapsackGreedy(capacity, usable, false)
  if (fillMode === "wide" || !integerMode) return knapsackGreedy(capacity, usable, true)
  return knapsackDP(capacity, usable)
}

function expandPieces(counts, typeById, stripH) {
  const pieces = []
  const types = Object.keys(counts)
    .map((id) => typeById[id])
    .filter(Boolean)
    .sort((a, b) => b.width - a.width)
  for (const t of types) {
    const k = counts[t.id] || 0
    for (let i = 0; i < k; i++) {
      pieces.push({
        key: t.key,
        name: t.name,
        width: t.width,
        height: stripH,
        rotated: t.rotated,
        origW: t.origW,
        origH: t.origH,
      })
    }
  }
  return pieces
}

function makeStripsHomogeneous(sheetW, assignment) {
  const strips = []
  for (const { item, orient } of assignment) {
    if (!orient || item.quantity <= 0) continue
    let left = item.quantity
    const per = Math.floor((sheetW + EPS) / orient.pieceW)
    if (per <= 0) continue
    const type = {
      id: item.key,
      key: item.key,
      name: item.name,
      width: orient.pieceW,
      qty: left,
      rotated: orient.rotated,
      origW: item.width,
      origH: item.height,
    }
    while (left > 0) {
      const k = Math.min(per, left)
      const counts = { [type.id]: k }
      const pieces = expandPieces(counts, { [type.id]: { ...type, qty: k } }, orient.stripH)
      strips.push({
        height: orient.stripH,
        usedWidth: k * orient.pieceW,
        pieces,
      })
      left -= k
    }
  }
  return strips
}

function makeStripsMixed(sheetW, assignment, integerMode, fillMode) {
  const groups = new Map()
  for (const { item, orient } of assignment) {
    if (!orient || item.quantity <= 0) continue
    if (!groups.has(orient.stripH)) groups.set(orient.stripH, [])
    groups.get(orient.stripH).push({
      id: item.key,
      key: item.key,
      name: item.name,
      width: orient.pieceW,
      qty: item.quantity,
      rotated: orient.rotated,
      origW: item.width,
      origH: item.height,
    })
  }

  const strips = []
  for (const [stripH, types] of groups) {
    const remaining = types.map((t) => ({ ...t }))
    const typeById = Object.fromEntries(remaining.map((t) => [t.id, t]))
    while (remaining.some((t) => t.qty > 0)) {
      const fill = fillStrip(sheetW, remaining, integerMode, fillMode)
      if (!fill.used || Object.keys(fill.counts).length === 0) break
      let placed = 0
      for (const [id, k] of Object.entries(fill.counts)) {
        const t = remaining.find((x) => x.id === id)
        if (!t) continue
        const use = Math.min(k, t.qty)
        if (use <= 0) {
          delete fill.counts[id]
          continue
        }
        fill.counts[id] = use
        t.qty -= use
        placed += use
      }
      if (!placed) break
      const pieces = expandPieces(fill.counts, typeById, stripH)
      const usedWidth = pieces.reduce((s, p) => s + p.width, 0)
      if (!pieces.length) break
      strips.push({ height: stripH, usedWidth, pieces })
    }
  }
  return strips
}

function makeStripsBackfill(sheetW, assignment, integerMode) {
  const leftoverDemand = new Map()
  for (const { item, orient } of assignment) {
    if (!orient) continue
    leftoverDemand.set(item.key, {
      item,
      orient,
      qty: item.quantity,
    })
  }

  const strips = []
  for (const { item, orient } of assignment) {
    if (!orient) continue
    const rec = leftoverDemand.get(item.key)
    if (!rec || rec.qty <= 0) continue
    const per = Math.floor((sheetW + EPS) / orient.pieceW)
    if (per <= 0) continue

    while (rec.qty > 0) {
      const k = Math.min(per, rec.qty)
      const pieces = []
      for (let i = 0; i < k; i++) {
        pieces.push({
          key: item.key,
          name: item.name,
          width: orient.pieceW,
          height: orient.stripH,
          rotated: orient.rotated,
          origW: item.width,
          origH: item.height,
        })
      }
      rec.qty -= k
      let usedWidth = k * orient.pieceW

      const others = []
      for (const [key, other] of leftoverDemand) {
        if (key === item.key || other.qty <= 0 || !other.orient) continue
        if (!nearly(other.orient.stripH, orient.stripH)) continue
        others.push({
          id: key,
          key,
          name: other.item.name,
          width: other.orient.pieceW,
          qty: other.qty,
          rotated: other.orient.rotated,
          origW: other.item.width,
          origH: other.item.height,
        })
      }
      const gap = sheetW - usedWidth
      if (others.length && gap > EPS) {
        const fill = fillStrip(gap, others, integerMode, "dp")
        for (const [id, cnt] of Object.entries(fill.counts)) {
          const other = leftoverDemand.get(id)
          if (!other) continue
          const use = Math.min(cnt, other.qty)
          for (let i = 0; i < use; i++) {
            pieces.push({
              key: id,
              name: other.item.name,
              width: other.orient.pieceW,
              height: orient.stripH,
              rotated: other.orient.rotated,
              origW: other.item.width,
              origH: other.item.height,
            })
            usedWidth += other.orient.pieceW
          }
          other.qty -= use
        }
      }

      strips.push({ height: orient.stripH, usedWidth, pieces })
    }
  }
  return strips
}

function packStripsIntoSheets(strips, sheetW, sheetH, binMode) {
  const tooTall = strips.filter((s) => s.height > sheetH + EPS)
  if (tooTall.length) return { sheets: [], leftoverStrips: strips }

  const ordered =
    binMode === "keep"
      ? [...strips]
      : [...strips].sort((a, b) => b.height - a.height)

  const bins = []
  for (const strip of ordered) {
    let target = -1
    if (binMode === "best") {
      let bestGap = Infinity
      bins.forEach((bin, i) => {
        const gap = sheetH - bin.usedH - strip.height
        if (gap >= -EPS && gap < bestGap) {
          bestGap = gap
          target = i
        }
      })
    } else {
      target = bins.findIndex((bin) => bin.usedH + strip.height <= sheetH + EPS)
    }
    if (target >= 0) {
      bins[target].strips.push(strip)
      bins[target].usedH += strip.height
    } else {
      bins.push({ strips: [strip], usedH: strip.height })
    }
  }

  const sheets = bins.map((bin) => layoutSheet(bin.strips, sheetW, sheetH))
  return { sheets, leftoverStrips: [] }
}

function layoutSheet(strips, sheetW, sheetH) {
  let y = 0
  const laid = []
  for (const strip of strips) {
    let x = 0
    const pieces = strip.pieces.map((p) => {
      const placed = { ...p, x, y }
      x += p.width
      return placed
    })
    laid.push({
      y,
      height: strip.height,
      usedWidth: x,
      scrapWidth: Math.max(sheetW - x, 0),
      pieces,
    })
    y += strip.height
  }
  const remnantH = Math.max(sheetH - y, 0)
  return {
    width: sheetW,
    height: sheetH,
    strips: laid,
    usedHeight: y,
    remnant: { x: 0, y, width: sheetW, height: remnantH },
  }
}

function countPacked(sheets) {
  const map = new Map()
  for (const sheet of sheets) {
    for (const strip of sheet.strips) {
      for (const p of strip.pieces) {
        const rec = map.get(p.key) || { name: p.name, width: p.origW, height: p.origH, quantity: 0 }
        rec.quantity += 1
        map.set(p.key, rec)
      }
    }
  }
  return map
}

function buildCuts(sheets) {
  return sheets.map((sheet, si) => {
    const horizontal = []
    let acc = 0
    for (const strip of sheet.strips) {
      acc += strip.height
      if (acc < sheet.height - EPS) horizontal.push(acc)
    }
    const vertical = sheet.strips.map((strip, ti) => {
      const positions = []
      let x = 0
      for (const p of strip.pieces) {
        x += p.width
        if (x < sheet.width - EPS) positions.push(x)
      }
      return {
        strip: ti + 1,
        y: strip.y,
        height: strip.height,
        positions,
      }
    })
    return { sheet: si + 1, horizontal, vertical }
  })
}

function metricsOf(sheets, items, sheetW, sheetH) {
  const demandCount = items.reduce((s, it) => s + it.quantity, 0)
  const packedMap = countPacked(sheets)
  const packedCount = [...packedMap.values()].reduce((s, r) => s + r.quantity, 0)
  const unpacked = []
  for (const it of items) {
    const got = packedMap.get(it.key)?.quantity || 0
    if (got < it.quantity) {
      unpacked.push({
        name: it.name,
        width: it.width,
        height: it.height,
        quantity: it.quantity - got,
      })
    }
  }
  const sheetCount = sheets.length
  const stripCount = sheets.reduce((s, sh) => s + sh.strips.length, 0)
  const sheetArea = sheetCount * sheetW * sheetH
  let usedArea = 0
  let scrapArea = 0
  let remnantArea = 0
  let cutCount = 0
  const remnants = []
  for (const sheet of sheets) {
    for (const strip of sheet.strips) {
      for (const p of strip.pieces) usedArea += p.width * p.height
      scrapArea += strip.scrapWidth * strip.height
      cutCount += strip.pieces.length > 0 ? Math.max(strip.pieces.length - (strip.scrapWidth > EPS ? 0 : 1), 0) : 0
    }
    remnantArea += sheet.remnant.height * sheet.remnant.width
    if (sheet.remnant.height > EPS) {
      remnants.push(`${fmt(sheet.remnant.width)}×${fmt(sheet.remnant.height)}`)
      cutCount += sheet.strips.length
    } else {
      cutCount += Math.max(sheet.strips.length - 1, 0)
    }
  }
  const wasteArea = Math.max(sheetArea - usedArea, 0)
  return {
    sheetCount,
    stripCount,
    usedArea,
    sheetArea,
    wasteArea,
    wasteRatio: sheetArea > 0 ? wasteArea / sheetArea : 0,
    scrapArea,
    remnantArea,
    remnantLabel: remnants.join(", ") || "không còn dải nguyên",
    cutCount,
    packedCount,
    demandCount,
    unpacked,
  }
}

function layoutHash(sheets) {
  return sheets
    .map((sheet) =>
      `${sheet.width}x${sheet.height}|` +
      sheet.strips
        .map(
          (st) =>
            `${fmt(st.height)}@${fmt(st.y)}:` +
            st.pieces.map((p) => `${p.key}:${fmt(p.width)}x${fmt(p.height)}`).join(","),
        )
        .join("/"),
    )
    .join("||")
}

function scorePlan(plan) {
  const m = plan.metrics
  return [
    m.unpacked.reduce((s, u) => s + u.quantity, 0),
    m.sheetCount,
    m.scrapArea,
    m.stripCount,
    m.cutCount,
    m.wasteArea,
  ]
}

function betterScore(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true
    if (a[i] > b[i]) return false
  }
  return false
}

function describe(assignment, mix, swapped, sheetW, sheetH) {
  const sheetTxt = swapped
    ? `Xoay tấm nguyên thành ${fmt(sheetW)}×${fmt(sheetH)} rồi cắt ngang theo cạnh ${fmt(sheetW)}`
    : `Tấm ${fmt(sheetW)}×${fmt(sheetH)}, cắt ngang trước rồi cắt dọc`
  const mixTxt =
    mix === true
      ? "Trộn các khổ cùng chiều dài trong một hàng"
      : mix === "backfill"
        ? "Xếp cùng khổ trước, phần dư hàng mới trộn"
        : "Mỗi hàng chỉ một khổ — cắt đồng loạt cùng size"
  const rows = assignment
    .filter((a) => a.orient)
    .map((a) => {
      const rot = a.orient.rotated ? " (xoay 90°)" : ""
      return `${a.item.name} → hàng dài ${fmt(a.orient.stripH)}${rot}`
    })
  return { sheetTxt, mixTxt, rows }
}

function candidateFrom(items, sheetW, sheetH, assignment, mix, swapped, integerMode, fillMode, binMode) {
  let strips
  if (mix === true) strips = makeStripsMixed(sheetW, assignment, integerMode, fillMode)
  else if (mix === "backfill") strips = makeStripsBackfill(sheetW, assignment, integerMode)
  else strips = makeStripsHomogeneous(sheetW, assignment)

  if (!strips.length) return null
  const packed = packStripsIntoSheets(strips, sheetW, sheetH, binMode)
  if (!packed.sheets.length) return null

  const metrics = metricsOf(packed.sheets, items, sheetW, sheetH)
  const desc = describe(assignment, mix, swapped, sheetW, sheetH)
  return {
    sheets: packed.sheets,
    metrics,
    swapped,
    sheetWidth: sheetW,
    sheetHeight: sheetH,
    mix,
    desc,
    cuts: buildCuts(packed.sheets),
    hash: layoutHash(packed.sheets),
  }
}

function eachAssignment(items, sheetW, sheetH, allowRotation, visit) {
  const choices = items.map((item) => {
    const opts = orientationsFor(item, sheetW, sheetH, allowRotation)
    return opts.length ? opts : [null]
  })
  const product = choices.reduce((p, c) => p * c.length, 1)
  if (product > 24) {
    const heuristics = ["first", "tall", "wide", "fill"]
    for (const h of heuristics) {
      const assignment = items.map((item, i) => {
        const opts = choices[i].filter(Boolean)
        let orient = opts[0] || null
        if (h === "tall") orient = [...opts].sort((a, b) => b.stripH - a.stripH)[0] || null
        if (h === "wide") orient = [...opts].sort((a, b) => b.pieceW - a.pieceW)[0] || null
        if (h === "fill") {
          orient =
            [...opts].sort((a, b) => {
              const fill = (o) => Math.floor((sheetW + EPS) / o.pieceW) * o.pieceW
              const d = fill(b) - fill(a)
              if (d) return d
              const per = (o) => Math.max(1, Math.floor((sheetW + EPS) / o.pieceW))
              return Math.ceil(item.quantity / per(a)) - Math.ceil(item.quantity / per(b))
            })[0] || null
        }
        return { item, orient }
      })
      visit(assignment)
    }
    return
  }

  const rec = (i, acc) => {
    if (i === items.length) {
      visit(acc.map((x) => ({ ...x })))
      return
    }
    for (const orient of choices[i]) {
      acc.push({ item: items[i], orient })
      rec(i + 1, acc)
      acc.pop()
    }
  }
  rec(0, [])
}

function normalize(sheet, items) {
  const errors = []
  const width = Number(sheet.width)
  const height = Number(sheet.height)
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
    errors.push("Khổ tấm phải là số dương.")
  }
  const cleaned = []
  items.forEach((raw, i) => {
    const w = Number(raw.width)
    const h = Number(raw.height)
    const q = Number(raw.quantity)
    if (!isPositiveNumber(w) || !isPositiveNumber(h)) {
      errors.push(`Dòng ${i + 1}: rộng/dài phải là số dương.`)
      return
    }
    if (!isPositiveNumber(q) || Math.floor(q) !== q) {
      errors.push(`Dòng ${i + 1}: số lượng phải là số nguyên dương.`)
      return
    }
    const name = (raw.name || "").trim() || `${fmt(w)}×${fmt(h)}`
    cleaned.push({
      name,
      width: w,
      height: h,
      quantity: q,
      key: `${name}::${w}x${h}`,
    })
  })
  if (!cleaned.length) errors.push("Cần ít nhất một khổ cần cắt.")
  return { errors, sheet: { width, height }, items: cleaned }
}

/**
 * Gợi ý nhiều cách cắt 2 giai đoạn, xếp theo hao phí rác rồi số tấm.
 */
export function suggestPlans(sheetInput, itemsInput, options = {}) {
  const allowRotation = options.allowRotation !== false
  const maxPlans = options.maxPlans ?? 6
  const { errors, sheet, items } = normalize(sheetInput, itemsInput)
  if (errors.length) return { ok: false, errors, plans: [] }

  const integerMode = allInts(sheet, items)
  const candidates = []
  const sheetOpts = [
    { width: sheet.width, height: sheet.height, swapped: false },
    { width: sheet.height, height: sheet.width, swapped: true },
  ]
  const mixModes = [false, true, "backfill"]
  const fillModes = integerMode ? ["dp", "wide"] : ["wide", "narrow"]
  const binModes = ["keep", "first"]

  for (const sh of sheetOpts) {
    eachAssignment(items, sh.width, sh.height, allowRotation, (assignment) => {
      if (assignment.every((a) => !a.orient)) return
      for (const mix of mixModes) {
        for (const fillMode of mix === true ? fillModes : ["dp"]) {
          for (const binMode of binModes) {
            const cand = candidateFrom(
              items,
              sh.width,
              sh.height,
              assignment,
              mix,
              sh.swapped,
              integerMode,
              fillMode,
              binMode,
            )
            if (cand) candidates.push(cand)
          }
        }
      }
    })
  }

  const bestByHash = new Map()
  for (const cand of candidates) {
    const prev = bestByHash.get(cand.hash)
    if (!prev || betterScore(scorePlan(cand), scorePlan(prev))) {
      bestByHash.set(cand.hash, cand)
    }
  }

  const unique = [...bestByHash.values()].sort((a, b) => {
    const sa = scorePlan(a)
    const sb = scorePlan(b)
    if (betterScore(sa, sb)) return -1
    if (betterScore(sb, sa)) return 1
    return 0
  })

  const mixLabel = (mix) => {
    if (mix === true) return "trộn hàng"
    if (mix === "backfill") return "dư hàng trộn"
    return "tách khổ"
  }

  const plans = unique.slice(0, maxPlans).map((cand, i) => ({
    id: `plan-${i + 1}`,
    title: `Cách ${i + 1}`,
    label: [mixLabel(cand.mix), cand.swapped ? "xoay tấm" : null].filter(Boolean).join(" · "),
    sheetWidth: cand.sheetWidth,
    sheetHeight: cand.sheetHeight,
    swapped: cand.swapped,
    mix: cand.mix,
    desc: cand.desc,
    sheets: cand.sheets,
    cuts: cand.cuts,
    metrics: cand.metrics,
  }))

  if (!plans.length) {
    return {
      ok: true,
      errors: [],
      plans: [],
      demand: items,
      sheet,
      message: "Không xếp được khổ nào vào tấm (kể cả khi xoay). Tăng khổ tấm hoặc giảm khổ cần cắt.",
    }
  }

  return { ok: true, errors: [], plans, demand: items, sheet }
}

export function assertValidPlan(plan) {
  const problems = []
  for (const [si, sheet] of plan.sheets.entries()) {
    for (const strip of sheet.strips) {
      if (strip.y + strip.height > sheet.height + EPS) {
        problems.push(`Sheet ${si}: strip vượt chiều cao tấm`)
      }
      let x = 0
      for (const p of strip.pieces) {
        if (!nearly(p.height, strip.height)) {
          problems.push(`Sheet ${si}: tấm ${p.name} lệch chiều cao dải`)
        }
        if (!nearly(p.y, strip.y) || !nearly(p.x, x)) {
          problems.push(`Sheet ${si}: tấm ${p.name} không thẳng hàng`)
        }
        if (p.x + p.width > sheet.width + EPS) {
          problems.push(`Sheet ${si}: tấm ${p.name} tràn mép`)
        }
        x += p.width
      }
    }
  }
  return problems
}

export const SAMPLE = {
  sheet: { width: 100, height: 200 },
  items: [
    { name: "10×20", width: 10, height: 20, quantity: 10 },
    { name: "5×10", width: 5, height: 10, quantity: 15 },
    { name: "2×3", width: 2, height: 3, quantity: 20 },
  ],
}
