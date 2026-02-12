export type GitHubAppEnv = {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
};

/**
 * Generate a short-lived installation access token for a GitHub App installation.
 * Uses the Web Crypto API (RS256) — no external dependencies.
 */
export async function createInstallationToken(
  env: GitHubAppEnv,
  installationId: number,
): Promise<string> {
  const appId = env.GITHUB_APP_ID;
  const privateKeyPem = env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKeyPem) {
    throw new Error(
      "GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required for installation tokens",
    );
  }

  const jwt = await signAppJwt(appId, privateKeyPem);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "clanki-worker",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create installation token (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { token?: string };
  if (typeof data.token !== "string" || data.token.length === 0) {
    throw new Error("GitHub returned an invalid installation token");
  }

  return data.token;
}

/**
 * Build an authenticated HTTPS clone URL for a GitHub repo.
 * Input repoUrl is like "https://github.com/owner/repo".
 */
export function buildAuthenticatedCloneUrl(repoUrl: string, token: string): string {
  const url = new URL(repoUrl);
  return `https://x-access-token:${token}@${url.host}${url.pathname}.git`;
}

// ---------------------------------------------------------------------------
// JWT helpers — RS256 via Web Crypto (zero deps)
// ---------------------------------------------------------------------------

async function signAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const keyData = pemToArrayBuffer(privateKeyPem);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 600, iss: appId };

  const encodedHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const input = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(input),
  );

  return `${input}.${base64urlEncode(new Uint8Array(signature))}`;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [\w ]+-----/, "")
    .replace(/-----END [\w ]+-----/, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
