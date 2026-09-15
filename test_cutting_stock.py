import subprocess
import sys
import unittest
from pathlib import Path

from cutting_stock import SAMPLE, assert_valid_plan, suggest_plans

ROOT = Path(__file__).resolve().parent


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
        self.assertEqual(best["metrics"]["wasteArea"], 100 * 200 - used)

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

    def test_vercel_public_sync(self):
        script = ROOT / "scripts" / "sync_vercel_public.py"
        subprocess.check_call([sys.executable, str(script)])
        public = ROOT / "public"
        self.assertTrue((public / "index.html").is_file())
        for name in ("main.js", "render.js", "examples.js", "style.css"):
            self.assertTrue((public / "src" / name).is_file())
        self.assertFalse((public / "src" / "solver.js").exists())


if __name__ == "__main__":
    unittest.main()
