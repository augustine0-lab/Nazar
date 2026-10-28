"use client";

import { useState } from "react";
import { SceneArt } from "./SceneArt";
import { SCENES, type Chapter, type Scene } from "@/lib/domain/reading";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n";

/** One picture choice per chapter, with a live preview. Sent with the edit form as repeated "scene" fields. */
export function ChapterScenes({ id, chapters }: { id: string; chapters: Chapter[] }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<Scene[]>(chapters.map((c) => c.scene));
  return (
    <div className="lt-scenes">
      {chapters.map((c, k) => (
        <label key={k}>
          <span className="thumb"><SceneArt scene={picked[k]} uid={`pick-${id}-${k}`} /></span>
          <span><b>{String(k + 1).padStart(2, "0")}</b> · {c.title || t("read.part", { n: k + 1 })}</span>
          <select name="scene" value={picked[k]} onChange={(e) => setPicked((p) => p.map((s, j) => (j === k ? (e.target.value as Scene) : s)))}>
            {SCENES.map((s) => <option key={s} value={s}>{t(`scene.${s}` as MsgKey)}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
