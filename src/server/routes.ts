import { Router, Request, Response } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import {
  getPosts,
  getPost,
  updatePostTranslatedText,
  updatePostStatus,
  deletePost,
  getChannels,
  addChannel,
  deleteChannel,
  updateChannelTarget,
  getMedia,
  deleteMedia,
  getSubscriptions,
  upsertSubscriptions,
  getSubscription,
  getSubscriptionByUsername,
  updateSubscriptionAvatar,
  createMedia,
} from "../db/repository.js";
import { publishPost } from "../bot/publisher.js";
import { getTelegramClient } from "../parser/client.js";
import { entitiesToTelegramHtml, stripMarkdownArtifacts } from "../parser/formatter.js";
import { translateText, verifyTranslation } from "../translator/llm.js";
import { fetchChannelHistory } from "../parser/history.js";
import { triggerChannelSync } from "../parser/poller.js";
import { loginHandler, requireAuth } from "./auth.js";

import { Status } from "@prisma/client";

const MEDIA_DIR = path.resolve("media");
const AVATAR_DIR = path.resolve("media/avatars");
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const upload = multer({ dest: path.join(MEDIA_DIR, "tmp") });

// Track active history fetches per channel to prevent duplicates
const activeFetches = new Map<number, { signal: { aborted: boolean } }>();

export const router = Router();

// ——— Health (public) ———
router.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ——— Auth ———
router.post("/api/auth/login", loginHandler);
router.use("/api", requireAuth);

// ——— Posts ———

router.get("/api/posts", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as Status | undefined;
    const channelId = req.query.channelId ? Number(req.query.channelId) : undefined;
    const isHistorical = req.query.isHistorical !== undefined
      ? req.query.isHistorical === "true"
      : undefined;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const result = await getPosts({ status, channelId, isHistorical, since, page, limit });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/posts/:id", async (req: Request, res: Response) => {
  try {
    const post = await getPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json(post);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/posts/:id", async (req: Request, res: Response) => {
  try {
    const { translatedText } = req.body;
    const post = await updatePostTranslatedText(Number(req.params.id), translatedText);
    res.json(post);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/posts/:id/approve", async (req: Request, res: Response) => {
  try {
    const post = await updatePostStatus(Number(req.params.id), Status.APPROVED);
    res.json(post);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/posts/:id/reject", async (req: Request, res: Response) => {
  try {
    const post = await updatePostStatus(Number(req.params.id), Status.REJECTED);
    res.json(post);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/posts/:id/publish", async (req: Request, res: Response) => {
  try {
    await publishPost(Number(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/posts/:id/reset", async (req: Request, res: Response) => {
  try {
    const post = await updatePostStatus(Number(req.params.id), Status.PENDING);
    res.json(post);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/posts/:id", async (req: Request, res: Response) => {
  try {
    const post = await getPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Delete media files from disk
    for (const media of post.mediaFiles) {
      const filePath = path.join(MEDIA_DIR, media.filePath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    // Try to remove the post's media directory
    const mediaDir = path.join(MEDIA_DIR, String(post.channelId), String(post.id));
    if (fs.existsSync(mediaDir)) fs.rmSync(mediaDir, { recursive: true });

    await deletePost(post.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/posts/:id/translate", async (req: Request, res: Response) => {
  try {
    const post = await getPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Allow re-translation with ?force=true
    const force = req.query.force === "true";
    if (post.translatedText && !force) {
      return res.status(400).json({ error: "Already translated" });
    }

    const cleanText = stripMarkdownArtifacts(post.originalText);
    const html = entitiesToTelegramHtml(
      cleanText,
      (post.entities as any[]) || []
    );
    const translated = await translateText(html);
    const verified = await verifyTranslation(html, translated);
    const updated = await updatePostTranslatedText(post.id, verified);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ——— Channels ———

router.get("/api/channels", async (_req: Request, res: Response) => {
  try {
    const channels = await getChannels();
    res.json(channels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/channels", async (req: Request, res: Response) => {
  try {
    const { username, title } = req.body;
    if (!username) return res.status(400).json({ error: "username is required" });
    const channel = await addChannel(username, title);

    // Trigger initial sync in background (non-blocking)
    if (channel.lastCheckedMsgId === null) {
      triggerChannelSync(channel);
    }

    res.json(channel);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/channels/:id", async (req: Request, res: Response) => {
  try {
    const { targetChannelId } = req.body;
    const channel = await updateChannelTarget(
      Number(req.params.id),
      targetChannelId || null
    );
    res.json(channel);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/channels/:id/fetch-history", async (req: Request, res: Response) => {
  try {
    const channelId = Number(req.params.id);
    const channel = await getChannels().then((chs) =>
      chs.find((c) => c.id === channelId)
    );
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    // Prevent parallel fetches for the same channel
    if (activeFetches.has(channelId)) {
      return res.status(409).json({ error: "Fetch already in progress for this channel" });
    }

    const since = req.body?.since ? new Date(req.body.since) : undefined;
    const signal = { aborted: false };
    activeFetches.set(channelId, { signal });

    // SSE stream for progress
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Abort on client disconnect
    req.on("close", () => {
      signal.aborted = true;
      activeFetches.delete(channelId);
      console.log(`Client disconnected, aborting fetch for channel ${channel.username}`);
    });

    await fetchChannelHistory(channel.id, channel.username, (progress) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      }
    }, { since, signal });

    activeFetches.delete(channelId);
    if (!res.writableEnded) res.end();
  } catch (err: any) {
    const channelId = Number(req.params.id);
    activeFetches.delete(channelId);
    // If headers already sent, send error as SSE event
    if (res.headersSent) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true, error: err.message })}\n\n`);
        res.end();
      }
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.delete("/api/channels/:id", async (req: Request, res: Response) => {
  try {
    await deleteChannel(Number(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ——— Telegram Dialogs ———

router.get("/api/telegram/dialogs", async (req: Request, res: Response) => {
  try {
    const refresh = req.query.refresh === "true";

    // Return cached from DB if not refreshing
    if (!refresh) {
      const cached = await getSubscriptions();
      if (cached.length > 0) {
        return res.json(
          cached.map((s) => ({
            id: s.telegramId,
            title: s.title,
            username: s.username,
            isChannel: s.isChannel,
            isGroup: s.isGroup,
            participantsCount: s.participantsCount,
            hasAvatar: !!s.avatarPath,
          }))
        );
      }
    }

    // Fetch fresh from Telegram API
    const client = await getTelegramClient();
    const dialogs = await client.getDialogs({});

    const filtered = dialogs.filter((d: any) => d.isChannel || d.isGroup);

    const mapped = filtered.map((d: any) => ({
      id: d.id?.toString(),
      title: d.title || "",
      username: d.entity?.username || null,
      isChannel: !!d.isChannel,
      isGroup: !!d.isGroup,
      participantsCount: d.entity?.participantsCount ?? null,
    }));

    // Save to DB first so subscription rows exist for avatar updates
    await upsertSubscriptions(
      mapped.map((r) => ({
        telegramId: r.id,
        title: r.title,
        username: r.username,
        isChannel: r.isChannel,
        isGroup: r.isGroup,
        participantsCount: r.participantsCount,
      }))
    );

    // Download avatars sequentially (gramjs doesn't support concurrent downloads —
    // parallel calls cause WebSocket reconnection storms and all downloads fail)
    const avatarStatus = new Map<string, boolean>();

    for (const d of filtered) {
      const tid = d.id?.toString();
      if (!tid) continue;
      const filePath = path.join(AVATAR_DIR, `${tid}.jpg`);

      // Already on disk — mark as success, skip download
      if (fs.existsSync(filePath)) {
        avatarStatus.set(tid, true);
        continue;
      }

      try {
        if (!d.entity) { avatarStatus.set(tid, false); continue; }
        const photo = await client.downloadProfilePhoto(d.entity);
        if (photo && photo instanceof Buffer && photo.length > 0) {
          fs.writeFileSync(filePath, photo);
          await updateSubscriptionAvatar(tid, filePath).catch(() => {});
          avatarStatus.set(tid, true);
        } else {
          avatarStatus.set(tid, false);
        }
      } catch {
        avatarStatus.set(tid, false);
      }
    }

    const result = mapped.map((r) => ({
      ...r,
      hasAvatar: avatarStatus.get(r.id) ?? false,
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ——— Telegram Avatar ———

router.get("/api/telegram/avatar/:id", async (req: Request, res: Response) => {
  try {
    const paramId = req.params.id as string;
    const isNumeric = /^-?\d+$/.test(paramId);

    // Look up subscription in DB (by telegramId or username)
    const sub = isNumeric
      ? await getSubscription(paramId)
      : await getSubscriptionByUsername(paramId);

    // Serve cached avatar from disk
    if (sub?.avatarPath) {
      const filePath = path.resolve(sub.avatarPath);
      if (fs.existsSync(filePath)) {
        res.set("Content-Type", "image/jpeg");
        res.set("Cache-Control", "public, max-age=86400");
        return res.sendFile(filePath);
      }
    }

    // Subscription exists but has no avatar — don't hit Telegram API again
    if (sub && !sub.avatarPath) {
      return res.status(404).json({ error: "No avatar" });
    }

    // Download from Telegram API
    const client = await getTelegramClient();
    const entityId = isNumeric ? parseInt(paramId, 10) : paramId;
    const entity = await client.getEntity(entityId);
    const photo = await client.downloadProfilePhoto(entity);
    if (!photo || (photo instanceof Buffer && photo.length === 0)) {
      return res.status(404).json({ error: "No avatar" });
    }

    // Save to disk and update DB
    const buf = Buffer.from(photo);
    const fileKey = sub?.telegramId || paramId;
    const filePath = path.join(AVATAR_DIR, `${fileKey}.jpg`);
    fs.writeFileSync(filePath, buf);
    if (sub) {
      await updateSubscriptionAvatar(sub.telegramId, filePath).catch(() => {});
    }

    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (err: any) {
    res.status(404).json({ error: "Avatar not found" });
  }
});

// ——— Media ———

router.get("/api/media/:id", async (req: Request, res: Response) => {
  try {
    const media = await getMedia(Number(req.params.id));
    if (!media) return res.status(404).json({ error: "Media not found" });

    const filePath = path.join(MEDIA_DIR, media.filePath);
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/posts/:id/media", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const post = await getPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: "Post not found" });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const dir = path.join(MEDIA_DIR, String(post.channelId), String(post.id));
    fs.mkdirSync(dir, { recursive: true });

    const destPath = path.join(dir, file.originalname);
    fs.renameSync(file.path, destPath);

    const mimeType = file.mimetype || "";
    let type = "document";
    if (mimeType.startsWith("image/")) type = "photo";
    else if (mimeType.startsWith("video/")) type = "video";

    const media = await createMedia({
      postId: post.id,
      type,
      filePath: path.relative(MEDIA_DIR, destPath),
      fileName: file.originalname,
      mimeType,
    });
    res.json(media);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/media/:id", async (req: Request, res: Response) => {
  try {
    const media = await getMedia(Number(req.params.id));
    if (!media) return res.status(404).json({ error: "Media not found" });

    // Delete file from disk
    const filePath = path.join(MEDIA_DIR, media.filePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await deleteMedia(media.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
