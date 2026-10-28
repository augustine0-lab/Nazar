import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { AccessDenied, type Actor } from "@/lib/access";
import * as S from "@/lib/services";
import * as R from "@/lib/reading-services";
import * as D from "@/lib/domain";

let db: DB;
const actor = (login: string): Actor => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return { id: u.id, role: u.role, schoolId: u.schoolId };
};
const classOf = (login: string) => db.select().from(s.classGroups).where(eq(s.classGroups.teacherId, actor(login).id)).get()!.id;

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db, S.today());
});

describe("living text rules", () => {
  it("splits chapters by empty lines and takes the first line as the title", () => {
    const ch = D.parseChapters("В тёплом море\nСолнце грело воду.\n  \n\nОдна строка без названия");
    expect(ch).toEqual([
      { title: "В тёплом море", text: "Солнце грело воду.", scene: "sea" },
      { title: "", text: "Одна строка без названия", scene: expect.any(String) },
    ]);
    expect(D.parseChapters(D.chaptersToText(ch)).map((c) => c.text)).toEqual(ch.map((c) => c.text));
  });

  it("picks a picture from the words in both languages", () => {
    expect(D.pickScene("Осенний лес", "Белки прячут грибы.")).toBe("forest");
    expect(D.pickScene("Наш город", "Дети идут в школу.")).toBe("city");
    expect(D.pickScene("Над горами", "Капля упала на вершину снежинкой.")).toBe("mountains");
    expect(D.pickScene("Таулардың үстінде", "Бұлт Алатау тауларына жетті, шыңға қар түсті.")).toBe("mountains");
    expect(D.pickScene("Дала арқылы", "Өзен даланы кесіп ақты, жылқылар су ішті.")).toBe("steppe");
    expect(D.pickScene("Қара қалам", "Қарап тұр.", 0)).toBe("steppe"); // no hint: "қара" is not snow, "қалам" is not a town
    expect(D.pickScene("Степень числа", "", 1)).toBe("sky"); // "степень" is not the steppe
  });

  it("gives a calm reading time per chapter", () => {
    expect(D.readingSeconds("Два слова")).toBe(8);
    expect(D.readingSeconds(Array(30).fill("слово").join(" "))).toBe(24);
    expect(D.readingSeconds(Array(500).fill("слово").join(" "))).toBe(60);
    expect(D.sentences("Раз. Два! Три?")).toEqual(["Раз.", "Два!", "Три?"]);
  });
});

describe("living text access", () => {
  it("the class teacher writes, pupils of that class read, others cannot", async () => {
    const cls = classOf("aigul");
    await expect(R.createReading(db, actor("nurlan"), { classId: cls, title: "Т", source: "", text: "Текст" })).rejects.toBeInstanceOf(AccessDenied);
    await expect(R.createReading(db, actor("aigul"), { classId: cls, title: "Т", source: "", text: "" })).rejects.toThrow();
    await expect(R.createReading(db, actor("aigul"), { classId: cls, title: "Т", source: "", text: "x".repeat(D.MAX_CHAPTER_TEXT + 1) })).rejects.toThrow();
    const id = await R.createReading(db, actor("aigul"), { classId: cls, title: "Лес", source: "", text: "Осенний лес\nЛистья падают." });

    expect((await R.readingsOf(db, actor("miras"))).map((r) => r.id)).toContain(id);
    expect((await R.readingFor(db, actor("miras"), id)).chapters[0].scene).toBe("forest");
    const other = await R.readingsOf(db, actor("nurlan"), classOf("nurlan"));
    expect(other.map((r) => r.id)).not.toContain(id);
    await expect(R.readingFor(db, actor("nurlan"), id)).rejects.toBeInstanceOf(AccessDenied);
    await expect(R.readingFor(db, actor("gulnar"), id)).rejects.toBeInstanceOf(AccessDenied);
    await expect(R.deleteReading(db, actor("miras"), id)).rejects.toBeInstanceOf(AccessDenied);
  });

  it("keeps the pictures the teacher chose and deletes", async () => {
    const [demo] = await R.readingsOf(db, actor("aigul"), classOf("aigul"));
    expect(demo.chapters.map((c) => c.scene)).toEqual(["sea", "sky", "mountains", "river", "steppe"]);
    await R.updateReading(db, actor("aigul"), { id: demo.id, title: "Капля", source: "", text: "Первая\nТекст.\n\nВторая\nТекст.", scenes: ["night", "bogus"] });
    const after = await R.readingFor(db, actor("aigul"), demo.id);
    expect(after.chapters.map((c) => c.scene)[0]).toBe("night");
    expect(D.isScene(after.chapters[1].scene)).toBe(true);
    await R.deleteReading(db, actor("aigul"), demo.id);
    expect(await R.readingsOf(db, actor("miras"))).toEqual([]);
  });
});
