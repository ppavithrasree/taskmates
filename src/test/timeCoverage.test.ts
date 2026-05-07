import { describe, expect, it } from "vitest";
import { analyzeDayCoverage, mergeIntervals, startOfLocalDay, unloggedGapsBody } from "@/lib/timeCoverage";

const day = startOfLocalDay(new Date("2026-05-02T12:00:00").getTime());
const minute = (value: number) => day + value * 60_000;

describe("daily coverage", () => {
  it("merges overlaps and ignores redundant ranges", () => {
    expect(
      mergeIntervals([
        { start: 60, end: 120 },
        { start: 90, end: 180 },
        { start: 100, end: 110 },
        { start: 180, end: 240 },
      ])
    ).toEqual([{ start: 60, end: 240 }]);
  });

  it("detects full 24 hour coverage with overlapping posts", () => {
    const coverage = analyzeDayCoverage(
      [
        { startTime: minute(-30), endTime: minute(720) },
        { startTime: minute(300), endTime: minute(1440) },
        { startTime: minute(500), endTime: minute(600) },
      ],
      day
    );

    expect(coverage.isComplete).toBe(true);
    expect(coverage.coveredMinutes).toBe(1440);
    expect(coverage.gaps).toEqual([]);
  });

  it("returns exact missing intervals", () => {
    const coverage = analyzeDayCoverage(
      [
        { startTime: minute(0), endTime: minute(60) },
        { startTime: minute(60), endTime: minute(120) },
        { startTime: minute(180), endTime: minute(240) },
      ],
      day
    );

    expect(coverage.isComplete).toBe(false);
    expect(coverage.gaps).toEqual([
      { start: 120, end: 180 },
      { start: 240, end: 1440 },
    ]);
  });

  it("names the only missing range when there is one continuous gap", () => {
    expect(unloggedGapsBody([{ start: 300, end: 420 }])).toBe("You have not kept logs for 05:00-07:00.");
  });

  it("uses a generic message when multiple time slots are missing", () => {
    expect(unloggedGapsBody([
      { start: 300, end: 420 },
      { start: 480, end: 540 },
    ])).toBe("There are some time slots that you have not kept logs for.");
  });
});
