import { describe, expect, it } from "vitest";
import { resolveSvgTracePlan, SVG_TRACE_QUALITIES } from "@/lib/svgTrace";

describe("SVG trace planning", () => {
  it("maps quality presets to distinct working resolutions", () => {
    const fast = resolveSvgTracePlan({ svgQuality: "fast" }, 2400, 1200);
    const fine = resolveSvgTracePlan({ svgQuality: "fine" }, 2400, 1200);
    const max = resolveSvgTracePlan({ svgQuality: "max" }, 2400, 1200);

    expect(fast.width).toBe(900);
    expect(fine.width).toBe(1600);
    expect(max.width).toBe(2400);
    expect(fast.options.ltres).toBeGreaterThan(fine.options.ltres);
    expect(fine.options.ltres).toBeGreaterThan(max.options.ltres);
  });

  it("uses a bounded high-detail resolution only for live previews", () => {
    const preview = resolveSvgTracePlan({ svgQuality: "max", svgPreview: true }, 3200, 1600);
    const output = resolveSvgTracePlan({ svgQuality: "max" }, 3200, 1600);

    expect(preview.width).toBe(2000);
    expect(output.width).toBe(3200);
  });

  it("keeps the selected color count authoritative for every filter", () => {
    for (const svgFilter of ["edge6", "detail1", "artistic1"]) {
      const plan = resolveSvgTracePlan({ svgFilter, svgColors: 4 }, 1200, 1200);
      expect(plan.options.numberofcolors).toBe(4);
    }
  });

  it("gives smoothing presets materially different geometry", () => {
    const smooth1 = resolveSvgTracePlan({ svgFilter: "smooth1" }, 1200, 1200);
    const smooth2 = resolveSvgTracePlan({ svgFilter: "smooth2" }, 1200, 1200);

    expect(smooth1.options.blurradius).toBe(2);
    expect(smooth2.options.blurradius).toBe(5);
    expect(smooth2.options.pathomit).toBeGreaterThan(smooth1.options.pathomit);
  });

  it("retains old saved Max settings during migration", () => {
    const plan = resolveSvgTracePlan({ svgResolution: "original", svgDetail: "maximum" }, 1800, 900);
    expect(plan.quality.id).toBe("max");
  });

  it("exposes the compact Fast, Fine, and Max selector", () => {
    expect(SVG_TRACE_QUALITIES.map(({ id }) => id)).toEqual(["fast", "fine", "max"]);
  });
});
