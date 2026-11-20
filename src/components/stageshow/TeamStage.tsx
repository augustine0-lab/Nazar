"use client";

import { useEffect, useState } from "react";
import { Bar, LockScreen, Notification, Phone, Roll, Segmented, Stage, Window, Collapse, type Act } from "./kit";
import "./team-stage.css";

/*
 * «Команда вокруг ребёнка» in one beat, built with the Stageshow kit.
 * The teacher marks Мирас's goal on lesson 3; the percent rolls; a moment
 * later his mother's phone gets the note. A device pair: the Nazar window
 * pinned top-left and running off the bottom, the phone straddling its right
 * edge over the filler column, never over the marks.
 *
 * Real words only where the story is: the child, the lesson, the goal, the
 * answer, the percent and the notification. Everything else is filler bars.
 * Calm mode, reduced motion and print get the poster: the mark made and the
 * note on the phone.
 */

export interface TeamStageCopy {
  card: string;
  child: string;
  klass: string;
  lesson: string;
  goal: string;
  yes: string;
  no: string;
  before: string;
  after: string;
  of: string;
  notifTitle: string;
  notifBody: string;
  label: string;
  now: string;
}

type S = { marked: boolean; notified: boolean };
const initial: S = { marked: false, notified: false };
const POSTER: S = { marked: true, notified: true };
const REST = { wide: { x: 300, y: 480 }, compact: { x: 240, y: 430 } };

async function script(a: Act<S>) {
  await a.wait(900);
  await a.move({ at: "yes", x: 0.78, y: 0.72 });
  await a.wait(250);
  await a.click();
  await a.set({ marked: true });
  await a.wait(900);
  await a.set({ notified: true });
  // The cursor steps back to where it began while the payoff holds.
  await a.move(a.layout === "compact" ? REST.compact : REST.wide);
  await a.wait(2200);
  // What the story added leaves together, the last change first.
  await a.set({ notified: false });
  await a.wait(80);
  await a.set({ marked: false });
  await a.wait(700);
}

/** Calm mode on <html> (data-calm="1"): the stage stays on its poster. */
function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const read = () => setCalm(html.dataset.calm === "1");
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ["data-calm"] });
    return () => mo.disconnect();
  }, []);
  return calm;
}

/** Nazar's own dark theme: the cookie choice on <html>, else the system. */
function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const th = html.dataset.theme;
      setDark(th === "dark" || (th !== "light" && mq.matches));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    mq.addEventListener("change", read);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", read);
    };
  }, []);
  return dark;
}

export function TeamStage({ copy }: { copy: TeamStageCopy }) {
  const calm = useCalm();
  const dark = useDark();
  return (
    <figure className="nz-stage" role="img" aria-label={copy.label}>
      <Stage<S>
        width={640}
        height={500}
        compact={{ below: 520, width: 380, height: 440 }}
        initial={initial}
        poster={POSTER}
        script={calm ? undefined : script}
        cursor={calm ? undefined : { at: REST, style: "real" }}
        theme={dark ? "dark" : "light"}
        fill
        className="nz-team"
      >
        {(s, _rect, layout) => (
          <>
            <Window title="Nazar" className="nz-team-window">
              <div className="nz-team-body">
                <div className="nz-team-nav" aria-hidden>
                  {[58, 52, 70, 64].map((w, i) => (
                    <span key={i} data-on={i === 0 || undefined}>
                      <Bar w={10} h={10} r={3} tone={i === 0 ? 5 : 3} />
                      <Bar w={w} h={5} tone={i === 0 ? 5 : 3} />
                    </span>
                  ))}
                </div>
                <div className="nz-team-head">
                  <div>
                    <div className="nz-team-name">{copy.child}</div>
                    <div className="nz-team-class">{copy.klass}</div>
                  </div>
                </div>

                <div className="nz-team-card">
                  <div className="nz-team-cardhead">
                    <span className="nz-team-eyebrow">{copy.card}</span>
                    <span className="nz-team-pct">
                      <Roll>{s.marked ? copy.after : copy.before}</Roll>
                      <span className="nz-team-of">{copy.of}</span>
                    </span>
                  </div>

                  <div className="nz-team-lessons">
                    <span className="nz-team-chip" data-done>
                      <i />
                      <Bar w={46} h={5} tone={3} />
                    </span>
                    <span className="nz-team-chip" data-done>
                      <i />
                      <Bar w={40} h={5} tone={3} />
                    </span>
                    <span className="nz-team-chip" data-on data-done={s.marked || undefined}>
                      <i />
                      {copy.lesson}
                    </span>
                  </div>

                  <div className="nz-team-row">
                    <Bar w={layout === "wide" ? 150 : 128} h={6} tone={3} />
                    <Segmented items={["", "", ""]} value={0} className="nz-team-seg" data-filled />
                  </div>
                  <div className="nz-team-row" data-focus>
                    <span className="nz-team-goal">{copy.goal}</span>
                    <Segmented
                      items={[copy.yes, copy.no, "–"]}
                      value={0}
                      targets={["yes"]}
                      cursor="pointer"
                      className="nz-team-seg"
                      data-empty={s.marked ? undefined : ""}
                    />
                  </div>
                  <div className="nz-team-row">
                    <Bar w={layout === "wide" ? 118 : 104} h={6} tone={3} />
                    <Segmented items={["", "", ""]} value={2} className="nz-team-seg" data-filled />
                  </div>
                </div>

                <div className="nz-team-card nz-team-note" aria-hidden>
                  <Bar w={112} h={6} tone={4} />
                  <div className="nz-team-area">
                    <Bar w={180} h={5} tone={2} />
                    <Bar w={132} h={5} tone={2} />
                  </div>
                  <div className="nz-team-phrases">
                    {[64, 82, 56].map((w, i) => (
                      <span key={i}><Bar w={w} h={5} tone={3} /></span>
                    ))}
                  </div>
                </div>
              </div>
            </Window>

            <Phone width={236} time="10:58" frame="pro" dark wallpaper="radial-gradient(120% 70% at 25% 0%, rgba(255,255,255,.28), transparent 65%), linear-gradient(172deg, #7f8ce0 0%, #8a7fe0 48%, #5fb7aa 100%)" className="nz-team-phone">
              <LockScreen size="satellite" stack="top" clock={false}>
                <Collapse open={s.notified} reveal="drop">
                  <Notification
                    icon={<img src="/apple-icon.png" alt="" />}
                    title={copy.notifTitle}
                    time={copy.now}
                    body={copy.notifBody}
                  />
                </Collapse>
              </LockScreen>
            </Phone>
          </>
        )}
      </Stage>
    </figure>
  );
}
