import { describe, expect, it } from "vitest";
import * as D from "@/lib/domain";

describe("which bag lines the camera knows", () => {
  it("finds the thing by the words of the title, in Russian or Kazakh", () => {
    expect(D.scanThingOf(["Учебники по расписанию"], "📚")).toBe("book");
    expect(D.scanThingOf(["Бір бөтелке су"], "🎒")).toBe("bottle");
    expect(D.scanThingOf(["Бутылка воды"], "🎒")).toBe("bottle");
    expect(D.scanThingOf(["Ножницы для труда"], "🎒")).toBe("scissors");
    expect(D.scanThingOf(["Еңбек сабағына қайшы"], "🎒")).toBe("scissors");
    expect(D.scanThingOf(["Тетрадь по математике"], "📝")).toBe("book");
  });

  it("falls back to the picture, and leaves unknown things to the ordinary tick", () => {
    expect(D.scanThingOf(["Что-то для обеда"], "🍎")).toBe("apple");
    expect(D.scanThingOf(["Дневник"], "📓")).toBeNull();
    expect(D.scanThingOf(["Сменная обувь"], "👟")).toBeNull();
    expect(D.scanThingOf(["Пенал"], "✏️")).toBeNull();
  });

  it("does not take a word inside another word for «су» (water) or «доп» (ball)", () => {
    expect(D.scanThingOf(["Сурет альбомы"], "🎨")).toBe("book"); // «альбом», not «су»
    expect(D.scanThingOf(["Сурет салу"], "🎨")).toBeNull();
    expect(D.scanThingOf(["Допуск"], "🎒")).toBeNull();
  });

  it("gives a shown thing to the first line still waiting for it", () => {
    const lines = [
      { id: "a", thing: "book" as const },
      { id: "b", thing: null },
      { id: "c", thing: "book" as const },
    ];
    expect(D.lineForThing(lines, new Set(), "book")?.id).toBe("a");
    expect(D.lineForThing(lines, new Set(["a"]), "book")?.id).toBe("c");
    expect(D.lineForThing(lines, new Set(["a", "c"]), "book")).toBeNull();
    expect(D.lineForThing(lines, new Set(), "bottle")).toBeNull();
  });
});

describe("when a thing counts as shown", () => {
  const frames = (seq: [string[], number][]) => {
    let state: D.ScanState = {};
    const shown: [D.ScanThing, number][] = [];
    for (const [seen, t] of seq) {
      const r = D.scanStep(state, new Set(seen as D.ScanThing[]), t);
      state = r.state;
      r.shown.forEach((s) => shown.push([s, t]));
    }
    return shown;
  };

  it("needs a few frames in a row, not one lucky frame", () => {
    expect(frames([[["bottle"], 0], [[], 125], [["bottle"], 250], [[], 375]])).toEqual([]);
    expect(frames([[["bottle"], 0], [["bottle"], 125], [["bottle"], 250]])).toEqual([["bottle", 250]]);
  });

  it("counts a thing held in front of the camera once", () => {
    const held = Array.from({ length: 20 }, (_, k) => [["book"], k * 125] as [string[], number]);
    expect(frames(held)).toHaveLength(1);
  });

  it("counts the next book only after the first one left the picture", () => {
    const seq: [string[], number][] = [
      [["book"], 0], [["book"], 125], [["book"], 250], // first book
      [[], 375], [["book"], 500], [["book"], 625], [["book"], 750], // back too soon: same book
      [[], 875], [[], 875 + D.SCAN_REARM_MS], // gone long enough
      [["book"], 2200], [["book"], 2325], [["book"], 2450], // second book
    ];
    expect(frames(seq).map(([, t]) => t)).toEqual([250, 2450]);
  });

  it("follows two things at once", () => {
    const seq: [string[], number][] = [[["book", "bottle"], 0], [["book", "bottle"], 125], [["book", "bottle"], 250]];
    expect(frames(seq).map(([s]) => s).sort()).toEqual(["book", "bottle"]);
  });
});
