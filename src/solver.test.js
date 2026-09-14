import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { SAMPLE, assertValidPlan, suggestPlans } from "./solver.js"

describe("2-stage carton cutting", () => {
  it("packs the sample order on one sheet without breaking row height", () => {
    const { ok, plans, errors } = suggestPlans(SAMPLE.sheet, SAMPLE.items)
    assert.equal(ok, true, errors.join("; "))
    assert.ok(plans.length >= 1)
    const best = plans[0]
    const problems = assertValidPlan(best)
    assert.deepEqual(problems, [])
    assert.equal(best.metrics.unpacked.length, 0)
    assert.equal(best.metrics.sheetCount, 1)
    assert.equal(best.metrics.packedCount, 10 + 15 + 20)
    const used = 10 * 10 * 20 + 15 * 5 * 10 + 20 * 2 * 3
    assert.equal(best.metrics.usedArea, used)
    assert.equal(best.metrics.wasteArea, 100 * 200 - used)
  })

  it("prefers less in-row scrap when 2×3 can stand as height 2", () => {
    const { plans } = suggestPlans(SAMPLE.sheet, SAMPLE.items)
    const scraps = plans.map((p) => p.metrics.scrapArea)
    assert.ok(Math.min(...scraps) <= 330 + 1e-6)
  })

  it("fills a 10×10 sheet with four 5×5 with zero waste", () => {
    const { plans } = suggestPlans({ width: 10, height: 10 }, [
      { name: "5×5", width: 5, height: 5, quantity: 4 },
    ])
    const best = plans[0]
    assert.deepEqual(assertValidPlan(best), [])
    assert.equal(best.metrics.wasteArea, 0)
    assert.equal(best.metrics.sheetCount, 1)
    assert.equal(best.sheets[0].strips.length, 2)
    assert.ok(best.sheets[0].strips.every((s) => s.pieces.length === 2))
  })

  it("marks pieces larger than the sheet as unpacked", () => {
    const { plans, message } = suggestPlans({ width: 10, height: 10 }, [
      { name: "big", width: 12, height: 8, quantity: 1 },
    ])
    assert.equal(plans.length, 0)
    assert.match(message, /Không xếp được/)
  })

  it("uses several sheets when demand exceeds one board", () => {
    const { plans } = suggestPlans({ width: 20, height: 20 }, [
      { name: "10×10", width: 10, height: 10, quantity: 9 },
    ])
    const best = plans[0]
    assert.deepEqual(assertValidPlan(best), [])
    assert.equal(best.metrics.unpacked.length, 0)
    assert.ok(best.metrics.sheetCount >= 3)
    assert.equal(best.metrics.packedCount, 9)
  })

  it("keeps same-height pieces in a mixed strip", () => {
    const { plans } = suggestPlans(
      { width: 100, height: 20 },
      [
        { name: "A", width: 20, height: 10, quantity: 3 },
        { name: "B", width: 5, height: 10, quantity: 8 },
      ],
      { allowRotation: true },
    )
    const mixed = plans.find((p) => p.mix === true)
    assert.ok(mixed)
    for (const strip of mixed.sheets[0].strips) {
      const heights = new Set(strip.pieces.map((p) => p.height))
      assert.equal(heights.size, 1)
      assert.equal([...heights][0], strip.height)
    }
  })
})
