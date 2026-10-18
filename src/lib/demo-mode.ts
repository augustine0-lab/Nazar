/**
 * Show mode (one-click login and demo reset) is for presentations only.
 * It is on in development, and in production only when DEMO_MODE=on is set explicitly.
 */
export function demoEnabled(): boolean {
  if (process.env.DEMO_MODE === "on") return true;
  return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE !== "off";
}
