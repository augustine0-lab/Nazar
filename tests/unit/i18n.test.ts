import { describe, expect, it } from "vitest";
import { dictionary, formatDate, langFromHeader, makeT, msgText, resolve, translate } from "@/lib/i18n";
import * as D from "@/lib/domain";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("messages", () => {
  const ru = dictionary("ru");
  const kk = dictionary("kk");

  it("every message is translated and keeps its placeholders", () => {
    for (const key of Object.keys(ru)) {
      expect(kk[key]?.trim(), key).toBeTruthy();
      expect(placeholders(kk[key]), key).toEqual(placeholders(ru[key]));
    }
  });

  it("Kazakh texts are really Kazakh: no message is a copy of the Russian one, except shared words", () => {
    const shared = Object.keys(ru).filter((k) => ru[k] === kk[k]);
    // Same spelling in both languages is fine for names, units and loan words, but it should stay a short list.
    expect(shared.length).toBeLessThan(30);
    for (const k of shared) expect(ru[k].length, k).toBeLessThan(40);
  });

  it("Kazakh messages use Kazakh letters where the language needs them", () => {
    const text = Object.values(kk).join(" ");
    for (const ch of "әғқңөүұі") expect(text).toContain(ch);
  });
});

describe("translate", () => {
  it("fills placeholders", () => {
    expect(translate("ru", "err.balanceShort", { have: 3, need: 5 })).toBe("Не хватает звёзд: есть 3, нужно 5.");
    expect(translate("kk", "err.balanceShort", { have: 3, need: 5 })).toBe("Жұлдыз жетпейді: 3 бар, 5 керек.");
  });

  it("translates demo content stored as @key and leaves typed text alone", () => {
    expect(resolve("kk", "@demo.reward.game")).toBe("15 минут сүйікті ойын");
    expect(resolve("ru", "@demo.reward.game")).toBe("15 минут любимой игры");
    expect(resolve("kk", "Пойти в кино")).toBe("Пойти в кино");
    expect(resolve("kk", "@не-ключ")).toBe("@не-ключ");
  });

  it("plan validation errors are translated when shown", () => {
    const errors = D.validatePlan({ goals: [], thresholdPct: 72, workMinutes: 10, breakMinutes: 3 });
    expect(errors.map((e) => msgText("ru", e))).toEqual(["Добавьте хотя бы одну цель.", "Порог должен быть от 50% до 90% с шагом 5%."]);
    expect(errors.map((e) => msgText("kk", e))[0]).toBe("Кемінде бір мақсат қосыңыз.");
  });

  it("makeT binds a language", () => {
    expect(makeT("kk")("nav.logout")).toBe("Шығу");
  });
});

describe("language choice and dates", () => {
  it("reads Accept-Language", () => {
    expect(langFromHeader("kk-KZ,kk;q=0.9,ru;q=0.8")).toBe("kk");
    expect(langFromHeader("ru-RU,ru;q=0.9,kk;q=0.5")).toBe("ru");
    expect(langFromHeader("en-US,en;q=0.9")).toBe("ru");
    expect(langFromHeader(null)).toBe("ru");
  });

  it("formats dates and weekdays in both languages", () => {
    expect(formatDate("2026-10-16", "ru")).toBe("16 октября");
    expect(formatDate("2026-10-16", "kk")).toBe("16 қазан");
    expect(D.shortWeekday("2026-10-16", "ru")).toBe("Пт");
    expect(D.shortWeekday("2026-10-16", "kk")).toBe("Жм");
  });
});
