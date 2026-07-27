import * as path from "path";
import * as fs from "fs";
import {
  getEncryptedSetting,
  setEncryptedSetting,
  deleteSetting,
  updatePostLinkedIn,
} from "../db/repository.js";

const MEDIA_DIR = path.resolve("media");
const API = "https://api.linkedin.com";
// LinkedIn commentary hard limit is 3000 chars — keep a margin for the article link
const COMMENTARY_LIMIT = 2950;
const MAX_IMAGES = 9;

export const LINKEDIN_TOKEN_KEY = "linkedin.accessToken";
export const LINKEDIN_URN_KEY = "linkedin.personUrn";
export const LINKEDIN_NAME_KEY = "linkedin.personName";
export const LINKEDIN_ENABLED_KEY = "linkedin.enabled";
export const LINKEDIN_CONNECTED_AT_KEY = "linkedin.connectedAt";

// ——— Connection management ———

export interface LinkedInProfile {
  sub: string;
  name: string | null;
}

/**
 * Validate an access token by fetching the OIDC userinfo. Requires the token
 * to carry the `openid profile` scopes (product "Sign In with LinkedIn using
 * OpenID Connect") in addition to `w_member_social` ("Share on LinkedIn").
 */
export async function fetchLinkedInProfile(token: string): Promise<LinkedInProfile> {
  const res = await fetch(`${API}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error("Токен недійсний або протух (LinkedIn відповів 401)");
    }
    if (res.status === 403) {
      throw new Error(
        "Токен без scopes openid/profile — у LinkedIn-застосунку додайте продукт «Sign In with LinkedIn using OpenID Connect» і згенеруйте токен з усіма трьома scopes"
      );
    }
    throw new Error(`LinkedIn userinfo error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  if (!data.sub) throw new Error("LinkedIn userinfo не повернув member id (sub)");
  return { sub: String(data.sub), name: data.name ? String(data.name) : null };
}

export async function connectLinkedIn(token: string): Promise<LinkedInProfile> {
  const profile = await fetchLinkedInProfile(token);
  await setEncryptedSetting(LINKEDIN_TOKEN_KEY, token);
  await setEncryptedSetting(LINKEDIN_URN_KEY, `urn:li:person:${profile.sub}`);
  await setEncryptedSetting(LINKEDIN_NAME_KEY, profile.name || "");
  await setEncryptedSetting(LINKEDIN_CONNECTED_AT_KEY, new Date().toISOString());
  await setEncryptedSetting(LINKEDIN_ENABLED_KEY, "true");
  return profile;
}

export async function disconnectLinkedIn(): Promise<void> {
  for (const key of [
    LINKEDIN_TOKEN_KEY,
    LINKEDIN_URN_KEY,
    LINKEDIN_NAME_KEY,
    LINKEDIN_CONNECTED_AT_KEY,
    LINKEDIN_ENABLED_KEY,
  ]) {
    await deleteSetting(key);
  }
}

export async function getLinkedInStatus(): Promise<{
  connected: boolean;
  enabled: boolean;
  name?: string;
  connectedAt?: string;
}> {
  const token = await getEncryptedSetting(LINKEDIN_TOKEN_KEY);
  if (!token) return { connected: false, enabled: false };
  const enabled = (await getEncryptedSetting(LINKEDIN_ENABLED_KEY)) !== "false";
  return {
    connected: true,
    enabled,
    name: (await getEncryptedSetting(LINKEDIN_NAME_KEY)) || undefined,
    connectedAt: (await getEncryptedSetting(LINKEDIN_CONNECTED_AT_KEY)) || undefined,
  };
}

export async function setLinkedInEnabled(enabled: boolean): Promise<void> {
  await setEncryptedSetting(LINKEDIN_ENABLED_KEY, enabled ? "true" : "false");
}

// ——— Text conversion ———

/**
 * Telegram-flavoured HTML → plain text for a LinkedIn post: tags are dropped,
 * paragraph structure is kept as newlines.
 */
export function htmlToLinkedInText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ——— Media upload (legacy assets API, works with w_member_social) ———

interface MediaFile {
  id: number;
  type: string;
  filePath: string;
}

async function uploadImage(
  token: string,
  personUrn: string,
  filePath: string
): Promise<string> {
  const registerRes = await fetch(`${API}/v2/assets?action=registerUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: personUrn,
        serviceRelationships: [
          { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
        ],
      },
    }),
  });
  if (!registerRes.ok) {
    throw new Error(`registerUpload failed: ${registerRes.status} ${(await registerRes.text()).slice(0, 200)}`);
  }
  const reg = (await registerRes.json()) as any;
  const asset: string = reg.value?.asset;
  const uploadUrl: string =
    reg.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  if (!asset || !uploadUrl) throw new Error("registerUpload returned no uploadUrl/asset");

  const binary = fs.readFileSync(filePath);
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: binary,
  });
  if (!putRes.ok) {
    throw new Error(`image upload failed: ${putRes.status} ${(await putRes.text()).slice(0, 200)}`);
  }
  return asset;
}

// ——— Publish ———

/**
 * Cross-post to the connected LinkedIn profile. Skips silently when LinkedIn
 * is not connected/disabled or the post was already shared (idempotent).
 * Photos are attached (up to 9); videos are not supported and are skipped.
 */
export async function publishPostToLinkedIn(
  post: { id: number; linkedinPostId: string | null; mediaFiles?: MediaFile[] },
  htmlText: string,
  articleUrl: string | null
): Promise<string | null> {
  if (post.linkedinPostId) return post.linkedinPostId; // already shared

  const token = await getEncryptedSetting(LINKEDIN_TOKEN_KEY);
  const personUrn = await getEncryptedSetting(LINKEDIN_URN_KEY);
  if (!token || !personUrn) return null; // not connected
  if ((await getEncryptedSetting(LINKEDIN_ENABLED_KEY)) === "false") return null;

  let text = htmlToLinkedInText(htmlText);
  if (text.length > COMMENTARY_LIMIT) {
    text = text.slice(0, COMMENTARY_LIMIT - 1).replace(/\s+\S*$/, "") + "…";
  }
  if (articleUrl) {
    text += `\n\nПовна версія: https://www.vaibecod.com${articleUrl}`;
  }

  // Upload photos (videos need a different, partner-gated API — skipped)
  const photos = (post.mediaFiles || [])
    .filter((m) => m.type === "photo")
    .slice(0, MAX_IMAGES);
  const assets: string[] = [];
  for (const m of photos) {
    const localPath = path.join(MEDIA_DIR, m.filePath);
    if (!fs.existsSync(localPath)) continue;
    try {
      assets.push(await uploadImage(token, personUrn, localPath));
    } catch (err) {
      console.warn(`[LinkedIn] Image upload failed for post #${post.id}:`, (err as Error).message);
    }
  }

  const body = {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: assets.length > 0 ? "IMAGE" : "NONE",
        ...(assets.length > 0
          ? { media: assets.map((a) => ({ status: "READY", media: a })) }
          : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch(`${API}/v2/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 300);
    if (res.status === 401) {
      throw new Error(
        `LinkedIn токен протух — перепідключіть LinkedIn у Налаштуваннях (401: ${errBody})`
      );
    }
    throw new Error(`LinkedIn post failed: ${res.status} ${errBody}`);
  }

  const created = (await res.json().catch(() => ({}))) as any;
  const postUrn: string = res.headers.get("x-restli-id") || created.id || "";
  const url = postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : "";
  if (postUrn) {
    await updatePostLinkedIn(post.id, postUrn, url);
  }
  console.log(`[LinkedIn] Post #${post.id} shared: ${url || postUrn || "ok"}`);
  return postUrn || null;
}
