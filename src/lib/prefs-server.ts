import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { PREFS_COOKIE, parsePrefs } from "./prefs";

export const getPrefs = cache(async () => parsePrefs((await cookies()).get(PREFS_COOKIE)?.value));
