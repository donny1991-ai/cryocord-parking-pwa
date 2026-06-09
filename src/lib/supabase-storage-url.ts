export function getBrowserSupabaseUrl(serverUrl: string, configuredPublicUrl?: string | null) {
  if (configuredPublicUrl?.trim()) return configuredPublicUrl.trim().replace(/\/$/, "");

  try {
    const parsed = new URL(serverUrl);
    if (parsed.hostname === "host.docker.internal") {
      parsed.hostname = "localhost";
      return parsed.origin;
    }
    return parsed.origin;
  } catch {
    return serverUrl.replace(/\/$/, "");
  }
}

export function rewriteSupabaseStorageSignedUrl(input: {
  signedUrl: string;
  serverUrl: string;
  publicUrl?: string | null;
}) {
  const browserOrigin = getBrowserSupabaseUrl(input.serverUrl, input.publicUrl);

  try {
    const signed = new URL(input.signedUrl);
    const server = new URL(input.serverUrl);
    const browser = new URL(browserOrigin);

    if (signed.origin !== server.origin) return input.signedUrl;
    signed.protocol = browser.protocol;
    signed.hostname = browser.hostname;
    signed.port = browser.port;
    return signed.toString();
  } catch {
    return input.signedUrl;
  }
}
