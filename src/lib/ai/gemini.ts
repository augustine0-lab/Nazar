// The one place that talks to the Gemini API. The key lives only in the server's environment (GEMINI_API_KEY)
// and never reaches a browser. No SDK: one REST call, answers checked by the caller against a fixed shape.
import "server-only";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 30_000;

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
  if (!res.ok) {
    // The body may echo the request; only the status is kept, never the content.
    throw new GeminiError("FAILED", `HTTP ${res.status}`);
  }
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
