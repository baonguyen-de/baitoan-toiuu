import subprocess
import sys
import unittest
from pathlib import Path

from cutting_stock import SAMPLE, assert_valid_plan, suggest_plans

ROOT = Path(__file__).resolve().parent

POSTER_SHEET = {"width": 2200, "height": 3000}
POSTER_TRIM = {"left": 25, "right": 25, "top": 0, "bottom": 0}
POSTER_ITEMS = [
    {"name": "A", "width": 700, "height": 1000, "quantity": 3},
    {"name": "B", "width": 800, "height": 1000, "quantity": 3},
    {"name": "C", "width": 650, "height": 1000, "quantity": 3},
]


class TwoStageCutting(unittest.TestCase):
    def test_sample_fits_one_sheet(self):
        result = suggest_plans(SAMPLE["sheet"], SAMPLE["items"])
        self.assertTrue(result["ok"], result.get("errors"))
        self.assertGreaterEqual(len(result["plans"]), 1)
        best = result["plans"][0]
        self.assertTrue(best["best"])
        self.assertEqual(assert_valid_plan(best), [])
        self.assertEqual(best["metrics"]["unpacked"], [])
        self.assertEqual(best["metrics"]["sheetCount"], 1)
        self.assertEqual(best["metrics"]["packedCount"], 45)
        used = 10 * 10 * 20 + 15 * 5 * 10 + 20 * 2 * 3
        self.assertEqual(best["metrics"]["usedArea"], used)
        self.assertEqual(best["metrics"]["packedArea"], used)
        self.assertEqual(best["metrics"]["wasteArea"], 100 * 200 - used)
        self.assertEqual(best["sheetWidth"], 100)
        self.assertEqual(best["sheetHeight"], 200)

    def test_prefers_less_scrap(self):
        plans = suggest_plans(SAMPLE["sheet"], SAMPLE["items"])["plans"]
        scraps = [p["metrics"]["scrapArea"] for p in plans]
        self.assertLessEqual(min(scraps), 330 + 1e-6)
        self.assertEqual(plans[0]["metrics"]["scrapArea"], min(scraps))

    def test_perfect_5x5(self):
        plans = suggest_plans({"width": 10, "height": 10}, [{"name": "5×5", "width": 5, "height": 5, "quantity": 4}])["plans"]
        best = plans[0]
        self.assertEqual(assert_valid_plan(best), [])
        self.assertEqual(best["metrics"]["wasteArea"], 0)
        self.assertEqual(len(best["sheets"][0]["strips"]), 2)

    def test_too_big(self):
        result = suggest_plans({"width": 10, "height": 10}, [{"name": "big", "width": 12, "height": 8, "quantity": 1}])
        self.assertEqual(result["plans"], [])
        self.assertIn("Không xếp được", result["message"])

    def test_multi_sheet(self):
        plans = suggest_plans({"width": 20, "height": 20}, [{"name": "10×10", "width": 10, "height": 10, "quantity": 9}])["plans"]
        best = plans[0]
        self.assertEqual(assert_valid_plan(best), [])
        self.assertGreaterEqual(best["metrics"]["sheetCount"], 3)
        self.assertEqual(best["metrics"]["packedCount"], 9)

    def test_mixed_same_height(self):
        plans = suggest_plans(
            {"width": 100, "height": 20},
            [
                {"name": "A", "width": 20, "height": 10, "quantity": 3},
                {"name": "B", "width": 5, "height": 10, "quantity": 8},
            ],
            allow_rotation=True,
        )["plans"]
        mixed = next(p for p in plans if p["mix"] is True)
        for strip in mixed["sheets"][0]["strips"]:
            heights = {p["height"] for p in strip["pieces"]}
            self.assertEqual(heights, {strip["height"]})

    def test_poster_2200x3000_trim25(self):
        result = suggest_plans(
            POSTER_SHEET,
            POSTER_ITEMS,
            allow_rotation=False,
            allow_piece_rotation=False,
            allow_sheet_rotation=False,
            trim_input=POSTER_TRIM,
        )
        self.assertTrue(result["ok"], result.get("errors"))
        self.assertGreaterEqual(len(result["plans"]), 1)
        best = result["plans"][0]
        self.assertEqual(assert_valid_plan(best), [])
        self.assertEqual(best["sheetWidth"], 2200)
        self.assertEqual(best["sheetHeight"], 3000)
        self.assertEqual(best["origSheetWidth"], 2200)
        self.assertEqual(best["origSheetHeight"], 3000)
        self.assertFalse(best["swapped"])
        m = best["metrics"]
        self.assertEqual(m["unpacked"], [])
        self.assertEqual(m["sheetCount"], 1)
        self.assertEqual(m["stripCount"], 3)
        self.assertEqual(m["packedCount"], 9)
        self.assertEqual(m["usedArea"], 6_450_000)
        self.assertEqual(m["packedArea"], 6_450_000)
        self.assertEqual(m["sheetArea"], 6_600_000)
        self.assertEqual(m["trimArea"], 150_000)
        self.assertEqual(m["wasteArea"], 150_000)
        self.assertEqual(m["usableWidth"], 2150)
        self.assertEqual(m["usableHeight"], 3000)
        self.assertEqual(f"{m['utilization'] * 100:.2f}", "97.73")
        self.assertEqual(f"{m['wasteRatio'] * 100:.2f}", "2.27")
        sheet = best["sheets"][0]
        self.assertEqual(sheet["width"], 2200)
        self.assertEqual(sheet["height"], 3000)
        self.assertEqual(len(sheet["strips"]), 3)
        for strip in sheet["strips"]:
            self.assertAlmostEqual(strip["height"], 1000)
            self.assertAlmostEqual(strip["usedWidth"], 2150)
            widths = sorted(p["width"] for p in strip["pieces"])
            self.assertEqual(widths, [650, 700, 800])
            self.assertAlmostEqual(sum(p["width"] for p in strip["pieces"]), 2150)
            for p in strip["pieces"]:
                self.assertGreaterEqual(p["x"], 25 - 1e-6)
                self.assertLessEqual(p["x"] + p["width"], 25 + 2150 + 1e-6)
                self.assertGreaterEqual(p["y"], -1e-6)
                self.assertLessEqual(p["y"] + p["height"], 3000 + 1e-6)

    def test_pieces_do_not_overlap_trim(self):
        result = suggest_plans(
            {"width": 100, "height": 100},
            [{"name": "A", "width": 40, "height": 40, "quantity": 4}],
            allow_rotation=False,
            allow_sheet_rotation=False,
            trim_input={"left": 10, "right": 10, "top": 5, "bottom": 5},
        )
        self.assertTrue(result["ok"], result.get("errors"))
        self.assertGreaterEqual(len(result["plans"]), 1)
        best = result["plans"][0]
        self.assertEqual(assert_valid_plan(best), [])
        usable = best["sheets"][0]["usableRect"]
        self.assertAlmostEqual(usable["x"], 10)
        self.assertAlmostEqual(usable["y"], 5)
        self.assertAlmostEqual(usable["width"], 80)
        self.assertAlmostEqual(usable["height"], 90)
        for strip in best["sheets"][0]["strips"]:
            for p in strip["pieces"]:
                self.assertGreaterEqual(p["x"], usable["x"] - 1e-6)
                self.assertGreaterEqual(p["y"], usable["y"] - 1e-6)
                self.assertLessEqual(p["x"] + p["width"], usable["x"] + usable["width"] + 1e-6)
                self.assertLessEqual(p["y"] + p["height"], usable["y"] + usable["height"] + 1e-6)
                for zone in best["sheets"][0]["trimZones"]:
                    overlap_x = p["x"] < zone["x"] + zone["width"] - 1e-9 and p["x"] + p["width"] > zone["x"] + 1e-9
                    overlap_y = p["y"] < zone["y"] + zone["height"] - 1e-9 and p["y"] + p["height"] > zone["y"] + 1e-9
                    self.assertFalse(overlap_x and overlap_y, f"piece {p} overlaps trim {zone}")
        m = best["metrics"]
        self.assertGreater(m["trimArea"], 0)
        self.assertAlmostEqual(m["utilization"], m["packedArea"] / m["sheetArea"])
        self.assertAlmostEqual(m["sheetArea"], 100 * 100 * m["sheetCount"])

    def test_cannot_pack_into_trim(self):
        result = suggest_plans(
            {"width": 100, "height": 100},
            [{"name": "full", "width": 100, "height": 100, "quantity": 1}],
            allow_rotation=False,
            allow_sheet_rotation=False,
            trim_input={"left": 10, "right": 10, "top": 10, "bottom": 10},
        )
        self.assertEqual(result["plans"], [])
        self.assertIn("Không xếp được", result["message"])

    def test_utilization_includes_trim(self):
        result = suggest_plans(
            {"width": 100, "height": 100},
            [{"name": "A", "width": 80, "height": 80, "quantity": 1}],
            allow_rotation=False,
            allow_sheet_rotation=False,
            trim_input={"left": 10, "right": 10, "top": 10, "bottom": 10},
        )
        best = result["plans"][0]
        self.assertEqual(assert_valid_plan(best), [])
        m = best["metrics"]
        self.assertEqual(m["packedArea"], 6400)
        self.assertEqual(m["sheetArea"], 10000)
        self.assertEqual(m["trimArea"], 3600)
        self.assertEqual(f"{m['utilization'] * 100:.2f}", "64.00")
        self.assertEqual(f"{m['wasteRatio'] * 100:.2f}", "36.00")

    def test_trim_too_large(self):
        result = suggest_plans(
            {"width": 100, "height": 50},
            [{"name": "A", "width": 10, "height": 10, "quantity": 1}],
            trim_input={"left": 60, "right": 60, "top": 0, "bottom": 0},
        )
        self.assertFalse(result["ok"])
        self.assertTrue(any("hữu dụng" in e for e in result["errors"]))

    def test_allow_rotation_maps_to_piece_rotation(self):
        blocked = suggest_plans(
            {"width": 20, "height": 40},
            [{"name": "A", "width": 30, "height": 10, "quantity": 2}],
            allow_rotation=False,
            allow_sheet_rotation=False,
        )
        self.assertEqual(blocked["plans"], [])
        allowed = suggest_plans(
            {"width": 20, "height": 40},
            [{"name": "A", "width": 30, "height": 10, "quantity": 2}],
            allow_rotation=True,
            allow_sheet_rotation=False,
        )
        self.assertGreaterEqual(len(allowed["plans"]), 1)
        self.assertEqual(assert_valid_plan(allowed["plans"][0]), [])
        self.assertTrue(any(p["rotated"] for s in allowed["plans"][0]["sheets"][0]["strips"] for p in s["pieces"]))

    def test_sheet_rotation_keeps_original_labels(self):
        result = suggest_plans(
            {"width": 80, "height": 160},
            [
                {"name": "A", "width": 50, "height": 30, "quantity": 8},
                {"name": "B", "width": 30, "height": 20, "quantity": 12},
            ],
            allow_piece_rotation=True,
            allow_sheet_rotation=True,
        )
        self.assertTrue(result["ok"], result.get("errors"))
        self.assertGreaterEqual(len(result["plans"]), 1)
        for plan in result["plans"]:
            self.assertEqual(plan["sheetWidth"], 80)
            self.assertEqual(plan["sheetHeight"], 160)
            self.assertEqual(plan["origSheetWidth"], 80)
            self.assertEqual(plan["origSheetHeight"], 160)
            self.assertEqual(assert_valid_plan(plan), [])
            for sh in plan["sheets"]:
                self.assertEqual(sh["width"], 80)
                self.assertEqual(sh["height"], 160)

    def test_default_sheet_rotation_off(self):
        result = suggest_plans(POSTER_SHEET, POSTER_ITEMS, allow_rotation=False, trim_input=POSTER_TRIM)
        self.assertTrue(all(not p["swapped"] for p in result["plans"]))

    def test_vercel_public_sync(self):
        script = ROOT / "scripts" / "sync_vercel_public.py"
        subprocess.check_call([sys.executable, str(script)])
        public = ROOT / "public"
        self.assertTrue((public / "index.html").is_file())
        for name in ("main.js", "render.js", "examples.js", "style.css", "query.js"):
            self.assertTrue((public / "src" / name).is_file())
        self.assertFalse((public / "src" / "solver.js").exists())


if __name__ == "__main__":
    unittest.main()
