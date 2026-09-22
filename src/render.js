export function fmt(n) {
  if (!Number.isFinite(n)) return "—"
  const r = Math.round(n * 1000) / 1000
  if (Number.isInteger(r)) return String(r)
  return String(r)
}

export const PALETTE = [
  "#c45c26",
  "#2c6e9e",
  "#2f6f4e",
  "#7a4e8a",
  "#b0892e",
  "#b54747",
  "#3f7c7c",
  "#6b4f2e",
  "#1f4e5f",
  "#8e3b2e",
]

export function colorMap(demand) {
  const map = {}
  demand.forEach((it, i) => {
    map[it.key] = PALETTE[i % PALETTE.length]
  })
  return map
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function pct(ratio) {
  return `${(ratio * 100).toFixed(1)}%`
}

export function pct2(ratio) {
  const n = Number.isFinite(ratio) ? ratio : 0
  return `${(n * 100).toFixed(2)}%`
}

export function area(n) {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r)
}

export function renderPlanCards(plans, selectedId) {
  if (!plans.length) {
    return `<div class="empty">Chưa có cách cắt. Nhấn «Bắt đầu cắt».</div>`
  }
  return plans
    .map((plan) => {
      const m = plan.metrics
      const active = plan.id === selectedId ? " is-active" : ""
      const warn = m.unpacked.length ? " is-warn" : ""
      const best = plan.best ? " is-best" : ""
      return `
        <button class="plan-card${active}${warn}${best}" data-plan="${esc(plan.id)}" type="button">
          <div class="plan-card__head">
            <strong>${esc(plan.title)}</strong>
            <span>${m.sheetCount} tấm · ${m.stripCount} hàng</span>
          </div>
          ${plan.best ? `<div class="neon-pill">Cách tối ưu nhất</div>` : ""}
          <div class="plan-card__label">${esc(plan.label || "")}</div>
          <div class="plan-card__kpis">
            <div><span>Hiệu suất</span><b>${pct2(m.utilization)}</b></div>
            <div><span>Hao hụt</span><b>${pct2(m.wasteRatio)}</b></div>
          </div>
          <dl>
            <div><dt>Trim máy</dt><dd>${area(m.trimArea || 0)}</dd></div>
            <div><dt>Scrap</dt><dd>${area(m.scrapArea)}</dd></div>
            <div><dt>Remnant</dt><dd>${esc(m.remnantLabel)}</dd></div>
            <div><dt>Nhát cắt</dt><dd>${m.cutCount}</dd></div>
          </dl>
        </button>`
    })
    .join("")
}

export function renderMetrics(plan) {
  const m = plan.metrics
  const unpack = m.unpacked.length
    ? `<div class="banner banner--warn">Chưa cắt hết:
        ${m.unpacked.map((u) => `${esc(u.name)} ${fmt(u.width)}×${fmt(u.height)} × ${u.quantity}`).join("; ")}
       </div>`
    : ""
  const best = plan.best
    ? `<div class="banner banner--best"><span class="neon-pill">Cách tối ưu nhất</span> Hiệu suất cao / ít tấm / ít hao hụt nhất trong các gợi ý.</div>`
    : ""
  return `
    ${best}
    ${unpack}
    <div class="kpi-row">
      <div class="kpi kpi--ok">
        <span>Hiệu suất sử dụng</span>
        <b>${pct2(m.utilization)}</b>
        <em>${area(m.packedArea || m.usedArea)} / ${area(m.sheetArea)}</em>
      </div>
      <div class="kpi kpi--warn">
        <span>Tỷ lệ hao hụt</span>
        <b>${pct2(m.wasteRatio)}</b>
        <em>${area(m.wasteArea)}</em>
      </div>
    </div>
    <div class="waste-split">
      <div><span>Trim máy</span><b>${area(m.trimArea || 0)}</b></div>
      <div><span>Scrap (không tái sử dụng)</span><b>${area(m.scrapArea)}</b></div>
      <div><span>Remnant (tái sử dụng)</span><b>${esc(m.remnantLabel)}</b></div>
    </div>
    <div class="metrics">
      <div><span>Số lượng tấm nguyên dùng</span><b>${m.sheetCount}</b></div>
      <div><span>Số hàng ngang cắt</span><b>${m.stripCount}</b></div>
      <div><span>Tổng diện tích đã dùng</span><b>${area(m.packedArea || m.usedArea)}</b></div>
      <div><span>Khổ hữu dụng</span><b>${fmt(m.usableWidth)}×${fmt(m.usableHeight)}</b></div>
      <div><span>Đã xếp</span><b>${m.packedCount}/${m.demandCount}</b></div>
      <div><span>Nhát cắt</span><b>${m.cutCount}</b></div>
    </div>
    <p class="plan-desc">
      ${esc(plan.desc.sheetTxt)}. ${esc(plan.desc.mixTxt)}.
      ${plan.desc.rows.map((r) => esc(r)).join(" · ")}
    </p>`
}

function trimGuide(trim) {
  const t = trim || {}
  return `trái ${fmt(t.left || 0)}, phải ${fmt(t.right || 0)}, trên ${fmt(t.top || 0)}, dưới ${fmt(t.bottom || 0)}`
}

export function renderCuts(plan) {
  const fallbackTrim = plan.metrics?.trim || {}
  const origW = plan.origSheetWidth ?? plan.sheetWidth
  const origH = plan.origSheetHeight ?? plan.sheetHeight
  const blocks = plan.cuts.map((c) => {
    const trim = c.trim || fallbackTrim
    const h =
      c.horizontal.length === 0
        ? "Không cần cắt ngang (một dải đúng chiều dài khổ hữu dụng)."
        : `Cắt ngang xuyên khổ hữu dụng tại y = ${c.horizontal.map((y) => fmt(y)).join(", ")}`
    const v = c.vertical
      .map((strip) => {
        const pos =
          strip.positions.length === 0
            ? "không cắt dọc (một tấm đúng khổ dải)"
            : `cắt dọc tại x = ${strip.positions.map((x) => fmt(x)).join(", ")}`
        return `<li>Dải ${strip.strip} (dài ${fmt(strip.height)}, từ y=${fmt(strip.y)}): ${pos}</li>`
      })
      .join("")
    const swapNote =
      plan.swapped || c.swapped
        ? `<p><span class="tag tag-swap">Xoay hướng cắt</span> Xoay hướng cắt tấm nguyên rồi cắt trên bàn. Tờ vẫn ${fmt(origW)}×${fmt(origH)}.</p>`
        : ""
    return `
      <section class="cuts-block">
        <h3>Tấm ${c.sheet} · ${fmt(origW)}×${fmt(origH)}</h3>
        <p><span class="tag tag-trim">1. Xén biên máy</span> ${esc(trimGuide(trim))}</p>
        ${swapNote}
        <p><span class="tag tag-h">2. Ngang</span> ${esc(h)}</p>
        <p><span class="tag tag-v">3. Dọc</span> Cắt từng dải (không cắt xuyên các dải khác):</p>
        <ul>${v}</ul>
      </section>`
  })
  return blocks.join("") || "<p>Không có nhát cắt.</p>"
}

export function renderLegend(demand, colors) {
  const items = demand
    .map(
      (it) => `
      <li>
        <i style="background:${colors[it.key]}"></i>
        ${esc(it.name)}
        <em>${fmt(it.width)}×${fmt(it.height)} × ${it.quantity}</em>
      </li>`,
    )
    .join("")
  return `
    <ul class="legend">
      ${items}
      <li><i class="hatch trim"></i> Trim máy (biên xén)</li>
      <li><i class="hatch remnant"></i> Remnant — dư tái sử dụng</li>
      <li><i class="hatch scrap"></i> Scrap — không tái sử dụng</li>
      <li><i class="line h"></i> Cắt ngang </li>
      <li><i class="line v"></i> Cắt dọc </li>
    </ul>`
}

function hatchPatterns(uid) {
  return `
    <pattern id="${uid}-scrap" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="#d7c4a3"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="#b08968" stroke-width="3"/>
    </pattern>
    <pattern id="${uid}-remnant" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="10" height="10" fill="#efe6d4"/>
      <line x1="0" y1="0" x2="0" y2="10" stroke="#cbb892" stroke-width="2"/>
    </pattern>
    <pattern id="${uid}-trim" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="#c5d0c8"/>
      <path d="M0 0 L6 6 M6 0 L0 6" stroke="#4d6358" stroke-width="1.1"/>
    </pattern>`
}

function pieceTitle(p) {
  const size = `${fmt(p.origW)}×${fmt(p.origH)}`
  const rot = p.rotated ? " · xoay 90°" : ""
  return p.name && p.name !== size ? `${p.name} · ${size}${rot}` : `${size}${rot}`
}

function pieceLabel(p, scale) {
  const minSide = Math.min(p.width, p.height) * scale
  if (minSide < 14) return ""
  const orig = `${fmt(p.origW)}×${fmt(p.origH)}`
  const rot = p.rotated ? " ↻" : ""
  const font = Math.max(8, Math.min(13, minSide * 0.32)) / scale
  const showName = minSide >= 28 && p.name && p.name !== orig
  const lines = showName ? [esc(p.name), orig + rot] : [orig + rot]
  const dy = lines.length === 1 ? 0.35 : -0.15
  const text = lines
    .map(
      (line, i) =>
        `<tspan x="${p.x + p.width / 2}" dy="${i === 0 ? `${dy}em` : "1.15em"}">${line}</tspan>`,
    )
    .join("")
  return `<text x="${p.x + p.width / 2}" y="${p.y + p.height / 2}" text-anchor="middle" font-size="${font}" fill="#fff8ee">${text}</text>`
}

function axisTicks(max, pixelLen) {
  if (!(max > 0)) return [0]
  const target = Math.max(3, Math.min(7, Math.round(pixelLen / 56) || 4))
  const raw = max / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  const step = n <= 1 ? pow : n <= 2 ? 2 * pow : n <= 5 ? 5 * pow : 10 * pow
  const ticks = []
  for (let v = 0; v < max - step * 0.35; v += step) {
    ticks.push(Number(v.toPrecision(12)))
  }
  ticks.push(max)
  return ticks
}

function zoomPanel(title, svgHtml, variant) {
  return `
    <div class="sheet-zoom-wrap sheet-zoom-wrap--${variant}" data-sheet-zoom>
      <div class="zoom-bar">
        <span class="zoom-bar__title">${esc(title)}</span>
        <button type="button" data-zoom-out title="Thu nhỏ" aria-label="Thu nhỏ">−</button>
        <span data-zoom-label>100%</span>
        <button type="button" data-zoom-in title="Phóng to" aria-label="Phóng to">+</button>
        <button type="button" data-zoom-reset>Vừa khung</button>
      </div>
      <div class="sheet-full-viewport" title="Lăn chuột để zoom, kéo để xem">
        <div class="sheet-full-stage">${svgHtml}</div>
      </div>
    </div>`
}

export function renderSheetSVG(sheet, colors, sheetNo, options = {}) {
  const mode = options.mode || "full"
  const showLabels = options.labels !== false
  const showAxes = options.axes === true
  const showCaption = options.caption !== false
  const padL = showAxes ? 64 : 52
  const padT = showCaption ? 28 : showAxes ? 16 : 10
  const padR = showAxes ? 20 : 16
  const padB = showAxes ? 52 : 30
  const maxW = options.maxW ?? (mode === "full" ? 220 : 640)
  const maxH = options.maxH ?? (mode === "full" ? 360 : 520)
  const usedH = sheet.usedHeight || 0
  const peek = Math.max(usedH * 0.2, Math.min(sheet.height - usedH, 12))
  const focusH =
    mode === "used" && usedH > 0
      ? Math.min(sheet.height, usedH + peek)
      : sheet.height
  let scale = Math.min(maxW / sheet.width, maxH / focusH)
  if (mode === "used" && sheet.strips.length) {
    const minStrip = Math.min(...sheet.strips.map((s) => s.height))
    if (minStrip * scale < 22) {
      scale = Math.min(26 / minStrip, 900 / sheet.width)
    }
  }
  const innerW = sheet.width * scale
  const innerH = focusH * scale
  const svgW = innerW + padL + padR
  const svgH = innerH + padT + padB
  const uid = options.uid || `s${sheetNo}`
  const clipped = mode === "used" && focusH < sheet.height - 0.001
  const sw = (n) => n / scale

  const remnantTextSize = Math.min(sw(13), Math.max((sheet.remnant.height || 0) * 0.2, sw(9)))
  const remnantLabel =
    !clipped && sheet.remnant.height > 0.001
      ? `<text x="${sheet.remnant.x + sheet.remnant.width / 2}" y="${sheet.remnant.y + sheet.remnant.height / 2}" text-anchor="middle" font-size="${remnantTextSize}" fill="#6b542e">dư ${fmt(sheet.remnant.width)}×${fmt(sheet.remnant.height)}</text>`
      : ""
  const remnant =
    sheet.remnant.height > 0.001
      ? `<rect class="remnant" x="${sheet.remnant.x}" y="${sheet.remnant.y}" width="${sheet.remnant.width}" height="${sheet.remnant.height}" fill="url(#${uid}-remnant)" stroke="#a89068" stroke-width="${sw(1.2)}"/>${remnantLabel}`
      : ""

  const usable = sheet.usableRect || { x: 0, y: 0, width: sheet.width, height: sheet.height }
  const trimZones = (sheet.trimZones || [])
    .map((z) => {
      const minSide = Math.min(z.width, z.height) * scale
      const font = Math.max(7, Math.min(12, minSide * 0.42)) / scale
      const cx = z.x + z.width / 2
      const cy = z.y + z.height / 2
      const sideways = z.side === "left" || z.side === "right"
      const label =
        minSide >= 10
          ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="#24352c"${
              sideways ? ` transform="rotate(-90 ${cx} ${cy})"` : ""
            }>${esc(z.label || "TRIM")}</text>`
          : ""
      return `<g class="trim-zone">
        <rect x="${z.x}" y="${z.y}" width="${z.width}" height="${z.height}" fill="url(#${uid}-trim)" stroke="#3d5248" stroke-width="${sw(0.9)}"/>
        ${label}
      </g>`
    })
    .join("")

  const strips = sheet.strips
    .map((strip) => {
      const sr = strip.scrapRect
      const scrap =
        sr && sr.width > 0.001 && sr.height > 0.001
          ? `<rect x="${sr.x}" y="${sr.y}" width="${sr.width}" height="${sr.height}" fill="url(#${uid}-scrap)" stroke="#a89068" stroke-width="${sw(0.8)}"/>`
          : strip.scrapWidth > 0.001
            ? `<rect x="${(strip.x ?? 0) + strip.usedWidth}" y="${strip.y}" width="${strip.scrapWidth}" height="${strip.height}" fill="url(#${uid}-scrap)" stroke="#a89068" stroke-width="${sw(0.8)}"/>`
            : ""
      const pieces = strip.pieces
        .map((p) => {
          const fill = colors[p.key] || "#666"
          return `<g class="piece">
            <rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="${fill}" stroke="#241910" stroke-width="${sw(1)}" opacity="0.95">
              <title>${esc(pieceTitle(p))}</title>
            </rect>
            ${showLabels ? pieceLabel(p, scale) : ""}
          </g>`
        })
        .join("")
      return scrap + pieces
    })
    .join("")

  const hCuts = []
  for (const strip of sheet.strips) {
    const ori = strip.orientation || "h"
    if (ori === "h") {
      const yb = strip.y + strip.height
      if (yb < usable.y + usable.height - 0.001) {
        hCuts.push(
          `<line x1="${usable.x}" y1="${yb}" x2="${usable.x + usable.width}" y2="${yb}" stroke="#c0392b" stroke-width="${sw(2.6)}"/>`,
        )
      }
    } else if (strip.pieces.length) {
      for (const p of strip.pieces) {
        const ye = p.y + p.height
        if (ye < usable.y + usable.height - 0.001) {
          hCuts.push(
            `<line x1="${p.x}" y1="${ye}" x2="${p.x + p.width}" y2="${ye}" stroke="#c0392b" stroke-width="${sw(1.7)}"/>`,
          )
        }
      }
    }
  }

  const vCuts = sheet.strips
    .flatMap((strip) => {
      const ori = strip.orientation || "h"
      const lines = []
      if (ori === "v") {
        if (strip.pieces.length) {
          const xb = strip.pieces[0].x + strip.pieces[0].width
          if (xb < usable.x + usable.width - 0.001) {
            lines.push(
              `<line x1="${xb}" y1="${usable.y}" x2="${xb}" y2="${usable.y + usable.height}" stroke="#1a5276" stroke-width="${sw(2.6)}"/>`,
            )
          }
        }
        return lines
      }
      for (const p of strip.pieces) {
        const xe = p.x + p.width
        if (xe < usable.x + usable.width - 0.001) {
          lines.push(
            `<line x1="${xe}" y1="${strip.y}" x2="${xe}" y2="${strip.y + strip.height}" stroke="#1a5276" stroke-width="${sw(1.7)}"/>`,
          )
        }
      }
      return lines
    })
    .join("")

  const rowLabels =
    showLabels && !showAxes
      ? sheet.strips
          .map((strip) => {
            const cy = padT + (strip.y + strip.height / 2) * scale
            if (cy > svgH - padB) return ""
            return `<text x="${padL - 8}" y="${cy}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="#6b542e">${fmt(strip.height)}</text>`
          })
          .join("")
      : ""

  const origW = sheet.origSheetWidth ?? sheet.width
  const origH = sheet.origSheetHeight ?? sheet.height
  const swapNote = sheet.swapped ? " · xoay hướng cắt" : ""
  const caption =
    mode === "used"
      ? `Phóng vùng cắt · tấm ${sheetNo}`
      : `Toàn tấm ${sheetNo} · ${fmt(origW)}×${fmt(origH)}${swapNote}`

  const axisMarkup = showAxes
    ? (() => {
        const xTicks = axisTicks(sheet.width, innerW)
        const yTicks = axisTicks(focusH, innerH)
        const y0 = padT + innerH
        const xAxis = xTicks
          .map((v) => {
            const x = padL + v * scale
            return `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + 6}" stroke="#6b542e" stroke-width="1"/>
              <text x="${x}" y="${y0 + 18}" text-anchor="middle" font-size="10" fill="#6b542e">${fmt(v)}</text>`
          })
          .join("")
        const yAxis = yTicks
          .map((v) => {
            const y = padT + v * scale
            return `<line x1="${padL - 6}" y1="${y}" x2="${padL}" y2="${y}" stroke="#6b542e" stroke-width="1"/>
              <text x="${padL - 10}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#6b542e">${fmt(v)}</text>`
          })
          .join("")
        const midX = padL + innerW / 2
        const midY = padT + innerH / 2
        return `
          <line x1="${padL}" y1="${y0}" x2="${padL + innerW}" y2="${y0}" stroke="#6b542e" stroke-width="1"/>
          <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${y0}" stroke="#6b542e" stroke-width="1"/>
          ${xAxis}
          ${yAxis}
          <text x="${midX}" y="${svgH - 8}" text-anchor="middle" font-size="12" fill="#5a4630">Rộng</text>
          <text x="14" y="${midY}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#5a4630" transform="rotate(-90 14 ${midY})">Dài</text>`
      })()
    : ""

  const clipNote = showAxes
    ? clipped
      ? `<text x="${padL + innerW}" y="12" text-anchor="end" font-size="10" fill="#7a6550">còn dư ${fmt(sheet.remnant.width)}×${fmt(sheet.remnant.height)} phía dưới</text>`
      : ""
    : showCaption
      ? clipped
        ? `<text x="${padL}" y="${svgH - 8}" font-size="11" fill="#7a6550">↓ còn dư ${fmt(sheet.remnant.width)}×${fmt(sheet.remnant.height)} phía dưới (xem toàn tấm)</text>`
        : `<text x="${padL}" y="${svgH - 8}" font-size="11" fill="#7a6550">rộng ${fmt(sheet.width)}</text>`
      : ""

  const captionEl =
    showAxes || !showCaption
      ? ""
      : `<text x="${padL}" y="16" font-size="13" fill="#5a4630">${esc(caption)}</text>`

  return `
    <svg class="sheet-svg sheet-svg--${mode}" width="${Math.round(svgW)}" height="${Math.round(svgH)}" viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="${esc(caption)}">
      <defs>
        ${hatchPatterns(uid)}
        <clipPath id="${uid}-clip"><rect x="0" y="0" width="${sheet.width}" height="${focusH}"/></clipPath>
      </defs>
      ${captionEl}
      ${rowLabels}
      <g transform="translate(${padL}, ${padT}) scale(${scale})">
        <g clip-path="url(#${uid}-clip)">
          <rect x="0" y="0" width="${sheet.width}" height="${sheet.height}" fill="#e2c48a" stroke="none"/>
          ${trimZones}
          ${remnant}
          ${strips}
          ${vCuts}
          ${hCuts.join("")}
        </g>
        <rect x="0" y="0" width="${sheet.width}" height="${focusH}" fill="none" stroke="#241910" stroke-width="${sw(2)}"/>
      </g>
      ${axisMarkup}
      ${clipNote}
    </svg>`
}

export function renderViewer(plan, colors) {
  if (!plan) return `<div class="empty">Chọn một cách cắt để xem sơ đồ.</div>`
  const blocks = plan.sheets.map((sheet, i) => {
    const overview = renderSheetSVG(sheet, colors, i + 1, {
      uid: `f${i}`,
      mode: "full",
      maxW: 280,
      maxH: 560,
      labels: false,
      caption: false,
    })
    const used = sheet.usedHeight || 0
    const detail =
      used > 0
        ? zoomPanel(
            `Phóng vùng cắt · tấm ${i + 1}`,
            renderSheetSVG(sheet, colors, i + 1, {
              uid: `z${i}`,
              mode: "used",
              maxW: 680,
              maxH: 480,
              axes: true,
              caption: false,
            }),
            "used",
          )
        : ""
    return `
      <div class="sheet-block">
        ${zoomPanel(`Toàn tấm ${i + 1}`, overview, "full")}
        ${detail}
      </div>`
  })
  return `<div class="sheet-stack">${blocks.join("")}</div>`
}

export function bindSheetZoom(root) {
  root.querySelectorAll("[data-sheet-zoom]").forEach((wrap) => {
    const stage = wrap.querySelector(".sheet-full-stage")
    const viewport = wrap.querySelector(".sheet-full-viewport")
    const label = wrap.querySelector("[data-zoom-label]")
    if (!stage || !viewport) return
    let scale = 1
    const min = 0.4
    const max = 8

    const apply = () => {
      const svg = stage.querySelector("svg")
      if (svg && !svg.dataset.baseW) {
        svg.dataset.baseW = svg.getAttribute("width") || String(svg.clientWidth)
        svg.dataset.baseH = svg.getAttribute("height") || String(svg.clientHeight)
      }
      const baseW = svg
        ? Number(svg.dataset.baseW) || Number(svg.getAttribute("width"))
        : stage.scrollWidth
      const baseH = svg
        ? Number(svg.dataset.baseH) || Number(svg.getAttribute("height"))
        : stage.scrollHeight
      stage.style.width = `${baseW * scale}px`
      stage.style.height = `${baseH * scale}px`
      if (svg) {
        svg.style.width = `${baseW * scale}px`
        svg.style.height = `${baseH * scale}px`
      }
      if (label) label.textContent = `${Math.round(scale * 100)}%`
    }

    wrap.querySelector("[data-zoom-in]")?.addEventListener("click", () => {
      scale = Math.min(max, scale * 1.25)
      apply()
    })
    wrap.querySelector("[data-zoom-out]")?.addEventListener("click", () => {
      scale = Math.max(min, scale / 1.25)
      apply()
    })
    wrap.querySelector("[data-zoom-reset]")?.addEventListener("click", () => {
      scale = 1
      apply()
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
    })
    viewport.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault()
        const next = ev.deltaY < 0 ? scale * 1.12 : scale / 1.12
        scale = Math.min(max, Math.max(min, next))
        apply()
      },
      { passive: false },
    )

    let dragging = false
    let sx = 0
    let sy = 0
    let sl = 0
    let st = 0
    viewport.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return
      dragging = true
      sx = ev.clientX
      sy = ev.clientY
      sl = viewport.scrollLeft
      st = viewport.scrollTop
      viewport.classList.add("is-dragging")
      viewport.setPointerCapture(ev.pointerId)
    })
    viewport.addEventListener("pointermove", (ev) => {
      if (!dragging) return
      viewport.scrollLeft = sl - (ev.clientX - sx)
      viewport.scrollTop = st - (ev.clientY - sy)
    })
    const stopDrag = () => {
      dragging = false
      viewport.classList.remove("is-dragging")
    }
    viewport.addEventListener("pointerup", stopDrag)
    viewport.addEventListener("pointercancel", stopDrag)
    apply()
  })
}
