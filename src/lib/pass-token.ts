let demoPassCounter = 0;

export function createDemoPassToken(): { id: string; token: string } {
  demoPassCounter += 1;
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  const id = `v-${Date.now().toString(36)}-${demoPassCounter.toString(36)}-${random}`;
  return { id, token: `cc-pass:${id}` };
}

export function extractPassToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const tokenFromPath = url.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(tokenFromPath ?? trimmed);
  } catch {
    return decodeURIComponent(trimmed);
  }
}

export function extractDemoVisitId(value: string): string {
  const token = extractPassToken(value);
  if (token.startsWith("cc-pass:")) return token.slice("cc-pass:".length);
  return token.split(/[:.]/).pop() ?? "";
}
