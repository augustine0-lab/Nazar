// Prints the demo readings as JSON for make.py: { "<message key>": { title: [ru, kk], text: [ru, kk] } }.
// Only texts written into the messages are voiced; a teacher's own text is read by the browser's voice.
import { reading } from "../../src/lib/i18n/messages/reading";

const all = reading as Record<string, readonly [string, string]>;
const out: Record<string, { title: readonly [string, string]; text: readonly [string, string] }> = {};
for (const key of Object.keys(all)) {
  const m = key.match(/^demo\.read\.(\w+)\.(\d+)\.text$/);
  if (!m) continue;
  const title = all[`demo.read.${m[1]}.${m[2]}.title`] ?? ["", ""];
  out[key] = { title, text: all[key] };
}
process.stdout.write(JSON.stringify(out));
