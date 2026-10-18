import { describe, expect, it } from "vitest";
import * as D from "@/lib/domain";

describe("day statistics", () => {
  it("leaves 'not rated' out of the percentage", () => {
    const t = D.tally([
      { goalId: "a", value: "YES" },
      { goalId: "a", value: "NO" },
      { goalId: "b", value: "NA" },
      { goalId: "b", value: "YES" },
    ]);
    expect(t).toMatchObject({ yes: 2, no: 1, na: 1 });
    expect(D.pct(t.ratio)).toBe(67);
  });

  it("has no percentage when nothing was rated", () => {
    expect(D.tally([{ goalId: "a", value: "NA" }]).ratio).toBeNull();
    expect(D.isSuccessfulDay(D.tally([]), 70)).toBe(false);
  });

  it("counts a day as successful at exactly the threshold", () => {
    const t = D.tally([...Array(7).fill({ goalId: "a", value: "YES" }), ...Array(3).fill({ goalId: "a", value: "NO" })]);
    expect(D.isSuccessfulDay(t, 70)).toBe(true);
    expect(D.isSuccessfulDay(t, 75)).toBe(false);
  });
});

describe("dates", () => {
  it("knows school days and weeks", () => {
    expect(D.weekday("2026-10-17")).toBe(6);
    expect(D.isSchoolDay("2026-10-17")).toBe(false);
    expect(D.mondayOf("2026-10-17")).toBe("2026-10-12");
    expect(D.previousSchoolDay("2026-10-19")).toBe("2026-10-16");
    expect(D.nextSchoolDay("2026-10-16")).toBe("2026-10-19");
  });

  it("lets teachers correct marks only for today and the previous school day", () => {
    expect(D.canEditMarksFor("2026-10-16", "2026-10-19")).toBe(true);
    expect(D.canEditMarksFor("2026-10-15", "2026-10-19")).toBe(false);
    expect(D.canEditMarksFor("2026-10-19", "2026-10-19")).toBe(true);
  });

  it("picks the current lesson by bell schedule", () => {
    const bell = ["08:30", "09:25", "10:20"];
    expect(D.currentLessonNo(bell, { hour: 8, minute: 0 })).toBe(1);
    expect(D.currentLessonNo(bell, { hour: 9, minute: 30 })).toBe(2);
    expect(D.currentLessonNo(bell, { hour: 15, minute: 0 })).toBe(3);
  });

  it("closes the day automatically at 18:00", () => {
    expect(D.isDayClosed("2026-10-16", null, "2026-10-16", { hour: 17 })).toBe(false);
    expect(D.isDayClosed("2026-10-16", null, "2026-10-16", { hour: 18 })).toBe(true);
    expect(D.isDayClosed("2026-10-15", null, "2026-10-16", { hour: 9 })).toBe(true);
  });
});

describe("stars", () => {
  it("never goes below zero", () => {
    expect(D.starBalance({ yesMarks: 3, selfCheckStars: 1, grantedCosts: [5, 5] })).toBe(0);
    expect(D.starBalance({ yesMarks: 10, selfCheckStars: 2, grantedCosts: [5] })).toBe(7);
  });

  it("caps self-check stars at three a day", () => {
    expect(D.selfCheckEarnsStar(true, 2)).toBe(true);
    expect(D.selfCheckEarnsStar(true, 3)).toBe(false);
    expect(D.selfCheckEarnsStar(false, 0)).toBe(false);
  });
});

describe("plans", () => {
  const plans = [
    { id: "v1", status: "ARCHIVED" as const, effectiveFrom: "2026-09-01", version: 1 },
    { id: "v2", status: "ACTIVE" as const, effectiveFrom: "2026-10-19", version: 2 },
    { id: "v3", status: "PENDING" as const, effectiveFrom: null, version: 3 },
  ];
  it("uses the plan that was in force on the date", () => {
    expect(D.planForDate(plans, "2026-10-16")?.id).toBe("v1");
    expect(D.planForDate(plans, "2026-10-19")?.id).toBe("v2");
    expect(D.planForDate(plans, "2026-08-01")).toBeNull();
  });

  it("validates goals, threshold and timer", () => {
    const ok = { goals: [{ adultText: "a", childText: "b", place: "SCHOOL" as const }], thresholdPct: 70, workMinutes: 10, breakMinutes: 3 };
    expect(D.validatePlan(ok)).toEqual([]);
    expect(D.validatePlan({ ...ok, goals: [] })).toHaveLength(1);
    expect(D.validatePlan({ ...ok, goals: Array(5).fill(ok.goals[0]) })).toHaveLength(1);
    expect(D.validatePlan({ ...ok, thresholdPct: 72 })).toHaveLength(1);
    expect(D.validatePlan({ ...ok, thresholdPct: 95 })).toHaveLength(1);
  });

  it("suggests raising or simplifying only after two weeks in a row", () => {
    expect(D.goalSuggestion([0.5, 0.95, 0.92])).toBe("RAISE");
    expect(D.goalSuggestion([0.95, 0.5])).toBeNull();
    expect(D.goalSuggestion([0.2, 0.25])).toBe("SIMPLIFY");
    expect(D.goalSuggestion([null, 0.1])).toBeNull();
  });
});

describe("focus timer", () => {
  it("alternates work and break from the start time", () => {
    expect(D.timerState(0, 10, 3)).toEqual({ phase: "WORK", remainingSec: 600, cycle: 0 });
    expect(D.timerState(599, 10, 3)).toEqual({ phase: "WORK", remainingSec: 1, cycle: 0 });
    expect(D.timerState(600, 10, 3)).toEqual({ phase: "BREAK", remainingSec: 180, cycle: 0 });
    expect(D.timerState(780, 10, 3)).toEqual({ phase: "WORK", remainingSec: 600, cycle: 1 });
  });

  it("asks the self-check between minutes 4 and 7 of a 10-minute block", () => {
    expect(D.selfCheckAt(10, 0)).toBe(240);
    expect(D.selfCheckAt(10, 1)).toBe(420);
    expect(D.selfCheckAt(5, 1)).toBeLessThan(300);
  });
});
