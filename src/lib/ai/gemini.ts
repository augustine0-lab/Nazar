// The one place that talks to the Gemini API. The key lives only in the server's environment (GEMINI_API_KEY)
// and never reaches a browser. No SDK: one REST call, answers checked by the caller against a fixed shape.
import "server-only";

// The newest stable Flash. It thinks before answering, so a reply can take several seconds.
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 60_000;

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export interface GeminiRequest {
  system: string;
  parts: GeminiPart[];
  schema: object;
  /** Lower is steadier; marks and steps want little invention. */
  temperature?: number;
}

export interface GeminiAnswer {
  json: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** NO_KEY: the server has no key. QUOTA: the free daily or per-minute limit is used up. FAILED: anything else. */
export class GeminiError extends Error {
  constructor(public readonly kind: "NO_KEY" | "QUOTA" | "FAILED", message: string) {
    super(message);
  }
}

export const geminiKey = () => process.env.GEMINI_API_KEY?.trim() || null;
export const geminiModel = () => process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

// Tests swap the network for a fake; the app always uses the real fetch.
let fetcher: typeof fetch = (...args) => fetch(...args);
export function setGeminiFetch(f: typeof fetch | null) {
  fetcher = f ?? ((...args) => fetch(...args));
}

/**
 * Why Google refused, for the server log: the error code and reason (for example API_KEY_INVALID) and the first
 * words of Google's message. Google's error messages name fields and settings, not the text we sent.
 */
async function errorReason(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as {
    error?: { status?: string; message?: string; details?: { reason?: string }[] };
  } | null;
  const e = data?.error;
  if (!e) return "";
  const reason = e.details?.map((d) => d.reason).filter(Boolean).join(",");
  const message = (e.message ?? "").replace(/\s+/g, " ").slice(0, 160);
  return [e.status, reason, message].filter(Boolean).map((x) => ` ${x}`).join("");
}

export async function askGemini(req: GeminiRequest): Promise<GeminiAnswer> {
  const key = geminiKey();
  if (!key) throw new GeminiError("NO_KEY", "GEMINI_API_KEY is not set");
  const model = geminiModel();
  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: req.parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: req.schema,
      temperature: req.temperature ?? 0.4,
    },
  };
  let res: Response;
  try {
    res = await fetcher(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new GeminiError("FAILED", `network: ${(e as Error).message}`);
  }
  if (res.status === 429) throw new GeminiError("QUOTA", "rate limit or quota");
  if (!res.ok) throw new GeminiError("FAILED", `HTTP ${res.status}${await errorReason(res)}`);
  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    modelVersion?: string;
  } | null;
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new GeminiError("FAILED", `empty answer (${data?.candidates?.[0]?.finishReason ?? "no candidate"})`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GeminiError("FAILED", "answer is not JSON");
  }
  return {
    json,
    model: data?.modelVersion ?? model,
    inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
