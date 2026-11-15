"""Voices the demo living texts ahead of time, in Russian and Kazakh, with a time for every word.

Browsers often have no Kazakh voice, so the demo text «Путешествие капли» comes with its own recordings:
public/voice/<slug>/<lang>/<n>.mp3, and src/lib/voice/recorded.ts with the time of every word, so the player
can light up the word being read. Everything runs on this computer (Piper, offline); nothing is sent anywhere.

    pip install piper-tts onnx
    # voices from https://github.com/rhasspy/piper/releases/tag/v0.0.2 (unpack each .tar.gz into one folder):
    #   voice-kk-issai-high.tar.gz (CC BY 4.0, ISSAI), voice-ru-irinia-medium.tar.gz (RHVoice data)
    python3 scripts/voice/make.py --voices /path/to/voices

Run it again after changing a demo text: the player only uses a recording whose text it still matches.
Needs ffmpeg and npx (for scripts/voice/texts.ts).
"""

import argparse
import json
import re
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parents[2]
VOICES = {
    # lang: (model file, speaker, length scale: a little slower than the voice's own pace, for young readers)
    "ru": ("ru-irinia-medium.onnx", None, 1.12),
    "kk": ("kk-issai-high.onnx", 3, 1.15),
}
CREDIT = {
    "ru": "Piper, голос «Irina» (данные RHVoice)",
    "kk": "Piper, голос ISSAI KazakhTTS (CC BY 4.0)",
}
GAP_TITLE = 0.6  # silence after the chapter title, seconds
GAP_SENTENCE = 0.35  # silence between sentences


def fnv(text: str) -> int:
    """FNV-1a over UTF-16 code units, the same as textHash() in src/lib/domain/voice.ts (of "title\ntext")."""
    h = 0x811C9DC5
    data = text.encode("utf-16-le")
    for k in range(0, len(data), 2):
        h ^= data[k] | (data[k + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def sentences(text: str) -> list[str]:
    """The same split as sentences() in src/lib/domain/reading.ts."""
    return [s for s in re.split(r"(?<=[.!?…])\s+", text) if s]


def synth(voice: PiperVoice, cfg: SynthesisConfig, text: str):
    """Audio of one sentence and the start and end (in samples) of each spoken word."""
    audio, words = [], []
    at = 0
    for chunk in voice.synthesize(text, syn_config=cfg, include_alignments=True):
        pcm = chunk.audio_int16_array
        pos, start = at, None
        for a in chunk.phoneme_alignments or []:
            p, n = a.phoneme, int(a.num_samples)
            if p in ("^", "$", "_"):
                pos += n
                continue
            if p == " ":
                if start is not None:
                    words.append((start, pos))
                    start = None
            elif p not in ",.!?;:—…" and start is None:
                start = pos
            pos += n
        if start is not None:
            words.append((start, pos))
        if not chunk.phoneme_alignments:
            words = []
        audio.append(pcm)
        at += len(pcm)
    return np.concatenate(audio), words, voice.config.sample_rate


def times(tokens: list[str], spoken: list[tuple[int, int]], begin: int, length: int, rate: int):
    """Word times in seconds. When the voice split words its own way, they are spread by length instead."""
    if len(spoken) == len(tokens):
        return [((begin + s) / rate, (begin + e) / rate) for s, e in spoken]
    weight = [len(re.sub(r"\W", "", t)) + 1 for t in tokens]
    total, acc, out = sum(weight), 0, []
    for w in weight:
        out.append(((begin + length * acc / total) / rate, (begin + length * (acc + w) / total) / rate))
        acc += w
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voices", required=True, help="folder with the .onnx voices and their .onnx.json")
    args = ap.parse_args()
    texts = json.loads(subprocess.check_output(["npx", "--yes", "tsx", "scripts/voice/texts.ts"], cwd=ROOT))

    recorded: dict[str, dict] = {}
    for lang, (model, speaker, scale) in VOICES.items():
        voice = PiperVoice.load(str(Path(args.voices) / model), include_alignments=True)
        cfg = SynthesisConfig(speaker_id=speaker, length_scale=scale)
        rate = voice.config.sample_rate
        for key, entry in texts.items():
            slug, n = re.match(r"demo\.read\.(\w+)\.(\d+)\.text", key).groups()
            li = 0 if lang == "ru" else 1
            title, text = entry["title"][li], entry["text"][li]
            parts, words, at = [], [], 0
            if title:
                pcm, _, _ = synth(voice, cfg, title)
                parts += [pcm, np.zeros(int(GAP_TITLE * rate), np.int16)]
                at += len(pcm) + int(GAP_TITLE * rate)
            start = at / rate
            for k, s in enumerate(sentences(text)):
                pcm, spoken, _ = synth(voice, cfg, s)
                words += times(s.split(), spoken, at, len(pcm), rate)
                parts.append(pcm)
                at += len(pcm)
                gap = np.zeros(int(GAP_SENTENCE * rate), np.int16)
                parts.append(gap)
                at += len(gap)
            out = ROOT / "public" / "voice" / slug / lang / f"{n}.mp3"
            out.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
                with wave.open(tmp.name, "wb") as w:
                    w.setnchannels(1)
                    w.setsampwidth(2)
                    w.setframerate(rate)
                    w.writeframes(np.concatenate(parts).tobytes())
                subprocess.run(
                    ["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name, "-af", "loudnorm=I=-18:TP=-2", "-ac", "1", "-ar", "22050", "-b:a", "48k", str(out)],
                    check=True,
                )
            recorded.setdefault(key, {})[lang] = {
                "src": f"/voice/{slug}/{lang}/{n}.mp3",
                "hash": fnv(f"{title}\n{text}"),
                "start": round(start, 2),
                "dur": round(at / rate, 2),
                "words": [round(x, 2) for pair in words for x in pair],
            }
            print(f"{lang} {key}: {at / rate:.1f} s, {len(words)} words")

    ts = ROOT / "src" / "lib" / "voice" / "recorded.ts"
    ts.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for key, langs in recorded.items():
        inner = ",\n".join(f"    {lang}: {json.dumps(rec, ensure_ascii=False, separators=(', ', ': '))}" for lang, rec in langs.items())
        lines.append(f'  "{key}": {{\n{inner},\n  }},')
    body = "{\n" + "\n".join(lines) + "\n}"
    ts.write_text(
        "// Made by scripts/voice/make.py: do not edit by hand. Recordings of the demo living texts and the time of\n"
        "// every word in them (start, end, start, end, ... seconds from the start of the file).\n"
        f"// Voices: {CREDIT['ru']}; {CREDIT['kk']}.\n"
        'import type { Recording } from "@/lib/domain/voice";\n\n'
        f"export const RECORDED: Record<string, Partial<Record<\"ru\" | \"kk\", Recording>>> = {body};\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
