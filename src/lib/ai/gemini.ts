// The one place that talks to the Gemini API. The key lives only in the server's environment (GEMINI_API_KEY)
// and never reaches a browser. No SDK: one REST call, answers checked by the caller against a fixed shape.
import "server-only";

// The newest stable Flash. It thinks before answering, so a reply can take several seconds.
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
// When the chosen model is busy (503) or its free limit is used up (429), the same question goes to these
// lighter models, which are on the free tier and have their own limits.
export const BACKUP_GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// The first model may think for a while; a backup only gets a short wait so the whole answer stays under a minute.
const FIRST_TIMEOUT_MS = 30_000;
const BACKUP_TIMEOUT_MS = 15_000;
// Worth asking another model: limits, overload and timeouts. A bad key or a bad request fails on every model.
const TRY_NEXT = new Set([429, 500, 502, 503, 504]);

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
/** The chosen model first, then the backups it is not already. */
export const geminiModels = () => [...new Set([geminiModel(), ...BACKUP_GEMINI_MODELS])];

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
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: req.parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: req.schema,
      temperature: req.temperature ?? 0.4,
    },
  });
  const models = geminiModels();
  const tried: string[] = [];
  let quotaOnly = true;
  for (const [i, model] of models.entries()) {
    let res: Response;
    try {
      res = await fetcher(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(i === 0 ? FIRST_TIMEOUT_MS : BACKUP_TIMEOUT_MS),
      });
    } catch (e) {
      quotaOnly = false;
      tried.push(`${model}: network ${(e as Error).message}`);
      continue;
    }
    if (TRY_NEXT.has(res.status)) {
      if (res.status !== 429) quotaOnly = false;
      tried.push(`${model}: HTTP ${res.status}${await errorReason(res)}`);
      continue;
    }
    if (!res.ok) throw new GeminiError("FAILED", `HTTP ${res.status}${await errorReason(res)}`);
    return readAnswer(res, model);
  }
  if (quotaOnly) throw new GeminiError("QUOTA", `rate limit or quota (${tried.join("; ")})`);
  throw new GeminiError("FAILED", tried.join("; "));
}

async function readAnswer(res: Response, model: string): Promise<GeminiAnswer> {
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
