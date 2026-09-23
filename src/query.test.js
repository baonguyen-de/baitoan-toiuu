import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildOrderQuery, parseOrderQuery } from "./query.js"

const poster =
  "?rong=2200&dai=3000&trai=25&phai=25&tren=0&duoi=0&n=3&items=A,700,1000,3|B,800,1000,3|C,650,1000,3"

describe("parseOrderQuery", () => {
  it("returns null when the link has no order params", () => {
    assert.equal(parseOrderQuery(""), null)
    assert.equal(parseOrderQuery("?x=1"), null)
  })

  it("reads a hand-written poster link and marks it ready to cut", () => {
    const order = parseOrderQuery(poster)
    assert.equal(order.sheetW, 2200)
    assert.equal(order.sheetH, 3000)
    assert.deepEqual(order.trim, { left: 25, right: 25, top: 0, bottom: 0 })
    assert.equal(order.items.length, 3)
    assert.deepEqual(order.items[1], { name: "B", width: 800, height: 1000, quantity: 3 })
    assert.equal(order.allowPieceRotation, true)
    assert.equal(order.allowSheetRotation, false)
    assert.equal(order.error, "")
    assert.equal(order.autoRun, true)
  })

  it("round-trips names that contain a comma or non-ascii text", () => {
    const qs = buildOrderQuery({
      sheetW: 100,
      sheetH: 200,
      trim: { left: 1, right: 2, top: 3, bottom: 4 },
      items: [
        { name: "Nắp", width: 10, height: 20, quantity: 5 },
        { name: "A,B", width: 6, height: 7, quantity: 1 },
      ],
      allowPieceRotation: false,
      allowSheetRotation: true,
    })
    const order = parseOrderQuery(qs)
    assert.equal(order.items[0].name, "Nắp")
    assert.equal(order.items[1].name, "A,B")
    assert.equal(order.items[1].width, 6)
    assert.equal(order.allowPieceRotation, false)
    assert.equal(order.allowSheetRotation, true)
    assert.equal(order.autoRun, true)
    assert.match(qs, /xoay=0/)
    assert.match(qs, /xoayTo=1/)
  })

  it("accepts a fully percent-encoded items value", () => {
    const order = parseOrderQuery("?rong=10&dai=10&n=1&items=A%2C5%2C5%2C4")
    assert.deepEqual(order.items, [{ name: "A", width: 5, height: 5, quantity: 4 }])
    assert.equal(order.autoRun, true)
  })

  it("opens blank rows when only n is set", () => {
    const order = parseOrderQuery("?rong=2200&dai=3000&n=3")
    assert.equal(order.items.length, 3)
    assert.equal(order.items[0].name, "")
    assert.equal(order.autoRun, false)
    assert.equal(order.error, "")
  })

  it("keeps the item list when n is the total quantity instead of the row count", () => {
    const order = parseOrderQuery(
      "?rong=2200&dai=3000&trai=25&phai=25&n=9&items=A,700,1000,3|B,800,1000,3|C,650,1000,3",
    )
    assert.equal(order.items.length, 3)
    assert.equal(order.error, "")
    assert.equal(order.autoRun, true)
  })

  it("reads items when n is omitted", () => {
    const order = parseOrderQuery("?rong=2200&dai=3000&trai=25&phai=25&items=A,700,1000,3|B,800,1000,3|C,650,1000,3")
    assert.equal(order.items.length, 3)
    assert.equal(order.autoRun, true)
  })

  it("splits items when the browser encoded the pipe as %7C", () => {
    const order = parseOrderQuery(
      "?rong=2200&dai=3000&trai=25&phai=25&n=3&items=A,700,1000,3%7CB,800,1000,3%7CC,650,1000,3",
    )
    assert.equal(order.items.length, 3)
    assert.deepEqual(order.items[2], { name: "C", width: 650, height: 1000, quantity: 3 })
    assert.equal(order.autoRun, true)
  })

  it("splits items on semicolon", () => {
    const order = parseOrderQuery("?rong=2200&dai=3000&n=3&items=A,700,1000,3;B,800,1000,3;C,650,1000,3")
    assert.equal(order.items.length, 3)
    assert.equal(order.items[1].name, "B")
    assert.equal(order.autoRun, true)
  })

  it("reads repeated item params", () => {
    const order = parseOrderQuery(
      "?rong=2200&dai=3000&trai=25&phai=25&n=3&item=A,700,1000,3&item=B,800,1000,3&item=C,650,1000,3",
    )
    assert.equal(order.items.length, 3)
    assert.deepEqual(order.items[0], { name: "A", width: 700, height: 1000, quantity: 3 })
    assert.equal(order.autoRun, true)
  })

  it("does not auto-run when trim eats the sheet", () => {
    const order = parseOrderQuery("?rong=10&dai=10&trai=8&phai=8&tren=0&duoi=0&n=1&items=A,1,1,1")
    assert.equal(order.error, "")
    assert.equal(order.autoRun, false)
  })

  it("reports negative sheet and trim instead of auto-running", () => {
    const sheet = parseOrderQuery("?rong=-10&dai=10&n=1&items=A,1,1,1")
    assert.match(sheet.error, /dương/)
    assert.equal(sheet.autoRun, false)
    const trim = parseOrderQuery("?rong=10&dai=10&trai=-1&n=1&items=A,1,1,1")
    assert.match(trim.error, /Trim trai/)
    assert.equal(trim.autoRun, false)
  })
})
