import * as path from "path";
import * as fs from "fs";
import {
  getEncryptedSetting,
  setEncryptedSetting,
  deleteSetting,
  updatePostLinkedIn,
} from "../db/repository.js";
import { translateToEnglish } from "./vaibecod.js";
import { htmlToPlainText } from "../lib/html.js";

const MEDIA_DIR = path.resolve("media");
const API = "https://api.linkedin.com";
// LinkedIn commentary hard limit is 3000 chars — keep a margin for the article link
const COMMENTARY_LIMIT = 2950;
const MAX_IMAGES = 9;
// LinkedIn transcodes uploaded video asynchronously
const VIDEO_PROCESSING_TIMEOUT_MS = 180_000;

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




// ——— Media upload (legacy assets API, works with w_member_social) ———

interface MediaFile {
  id: number;
  type: string;
  filePath: string;
}

async function uploadAsset(
  token: string,
  personUrn: string,
  filePath: string,
  kind: "image" | "video"
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
        recipes: [`urn:li:digitalmediaRecipe:feedshare-${kind}`],
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
    throw new Error(`${kind} upload failed: ${putRes.status} ${(await putRes.text()).slice(0, 200)}`);
  }
  return asset;
}

/**
 * Videos are transcoded asynchronously — sharing an asset that is still
 * PROCESSING produces a post with a broken player, so wait for it.
 */
async function waitForAsset(token: string, asset: string, timeoutMs: number): Promise<boolean> {
  const id = asset.split(":").pop();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`${API}/v2/assets/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      const statuses = Object.values(data.recipes || {}).map((r: any) => r?.status);
      if (statuses.includes("AVAILABLE")) return true;
      if (statuses.includes("CLIENT_ERROR") || statuses.includes("SERVER_ERROR")) return false;
    } catch {
      // transient — keep polling until the deadline
    }
  }
  return false;
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
  articleUrl: string | null,
  telegramUrl?: string | null,
  englishHtml?: string | null
): Promise<string | null> {
  if (post.linkedinPostId) return post.linkedinPostId; // already shared

  const token = await getEncryptedSetting(LINKEDIN_TOKEN_KEY);
  const personUrn = await getEncryptedSetting(LINKEDIN_URN_KEY);
  if (!token || !personUrn) return null; // not connected
  if ((await getEncryptedSetting(LINKEDIN_ENABLED_KEY)) === "false") return null;

  // LinkedIn audience is English-speaking. Reuse the translation the site
  // already produced; only translate again when it is unavailable.
  let bodyHtml = englishHtml?.trim() || "";
  if (!bodyHtml) {
    try {
      bodyHtml = (await translateToEnglish(htmlText)).trim();
    } catch (err) {
      console.warn(
        `[LinkedIn] English translation failed for post #${post.id}, posting original:`,
        (err as Error).message
      );
      bodyHtml = htmlText;
    }
  }

  // Links are appended after the body, so the body gets whatever room is left
  const links: string[] = [];
  if (articleUrl) links.push(`🔗 Full version: https://www.vaibecod.com${articleUrl}`);
  if (telegramUrl) links.push(`📣 Telegram: ${telegramUrl}`);
  const suffix = links.length > 0 ? `\n\n${links.join("\n")}` : "";

  let text = htmlToPlainText(bodyHtml);
  const room = COMMENTARY_LIMIT - suffix.length;
  if (text.length > room) {
    text = text.slice(0, room - 1).replace(/\s+\S*$/, "") + "…";
  }
  text += suffix;

  // LinkedIn allows either one video or up to 9 images in a share — not both.
  const media = post.mediaFiles || [];
  const video = media.find((m) => m.type === "video" || m.type === "animation");
  const assets: string[] = [];
  let category: "NONE" | "IMAGE" | "VIDEO" = "NONE";

  if (video) {
    const localPath = path.join(MEDIA_DIR, video.filePath);
    if (fs.existsSync(localPath)) {
      try {
        const asset = await uploadAsset(token, personUrn, localPath, "video");
        console.log(`[LinkedIn] Post #${post.id}: video uploaded, waiting for transcoding…`);
        if (await waitForAsset(token, asset, VIDEO_PROCESSING_TIMEOUT_MS)) {
          assets.push(asset);
          category = "VIDEO";
        } else {
          console.warn(`[LinkedIn] Post #${post.id}: video not ready in time, posting without it`);
        }
      } catch (err) {
        console.warn(`[LinkedIn] Video upload failed for post #${post.id}:`, (err as Error).message);
      }
    }
  }

  if (category === "NONE") {
    const photos = media.filter((m) => m.type === "photo").slice(0, MAX_IMAGES);
    for (const m of photos) {
      const localPath = path.join(MEDIA_DIR, m.filePath);
      if (!fs.existsSync(localPath)) continue;
      try {
        assets.push(await uploadAsset(token, personUrn, localPath, "image"));
      } catch (err) {
        console.warn(`[LinkedIn] Image upload failed for post #${post.id}:`, (err as Error).message);
      }
    }
    if (assets.length > 0) category = "IMAGE";
  }

  const body = {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: category,
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
