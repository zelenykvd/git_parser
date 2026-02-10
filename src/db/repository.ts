import { PrismaClient, Status } from "@prisma/client";

export const prisma = new PrismaClient();

// ——— Channels ———

export async function getChannels() {
  return prisma.channel.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getActiveChannels() {
  return prisma.channel.findMany({ where: { active: true } });
}

export async function addChannel(username: string, title?: string, targetChannelId?: string) {
  const clean = username.replace(/^@/, "");
  return prisma.channel.upsert({
    where: { username: clean },
    update: { active: true, title, ...(targetChannelId !== undefined ? { targetChannelId } : {}) },
    create: { username: clean, title, targetChannelId },
  });
}

export async function updateChannelTarget(id: number, targetChannelId: string | null) {
  return prisma.channel.update({
    where: { id },
    data: { targetChannelId },
  });
}

export async function removeChannel(id: number) {
  return prisma.channel.update({ where: { id }, data: { active: false } });
}

export async function deleteChannel(id: number) {
  return prisma.channel.delete({ where: { id } });
}

export async function updateLastCheckedMsgId(channelId: number, msgId: number) {
  return prisma.channel.update({
    where: { id: channelId },
    data: { lastCheckedMsgId: msgId },
  });
}

export async function getMaxTelegramMsgId(channelId: number): Promise<number | null> {
  const result = await prisma.post.aggregate({
    where: { channelId },
    _max: { telegramMsgId: true },
  });
  return result._max.telegramMsgId;
}

// ——— Posts ———

export async function createPost(data: {
  channelId: number;
  telegramMsgId: number;
  originalText: string;
  entities?: unknown;
  createdAt?: Date;
  isHistorical?: boolean;
}) {
  return prisma.post.upsert({
    where: {
      channelId_telegramMsgId: {
        channelId: data.channelId,
        telegramMsgId: data.telegramMsgId,
      },
    },
    update: data.isHistorical === false ? { isHistorical: false } : {},
    create: {
      channelId: data.channelId,
      telegramMsgId: data.telegramMsgId,
      originalText: data.originalText,
      entities: data.entities as any,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      ...(data.isHistorical ? { isHistorical: true } : {}),
    },
  });
}

export async function updateTranslation(postId: number, translatedText: string) {
  return prisma.post.update({
    where: { id: postId },
    data: { translatedText },
  });
}

export async function updatePostStatus(postId: number, status: Status) {
  return prisma.post.update({
    where: { id: postId },
    data: {
      status,
      ...(status === Status.PUBLISHED ? { publishedAt: new Date() } : {}),
    },
  });
}

export async function getPost(id: number) {
  return prisma.post.findUnique({
    where: { id },
    include: { mediaFiles: true, channel: true },
  });
}

export async function getPosts(params: {
  status?: Status;
  channelId?: number;
  isHistorical?: boolean;
  since?: Date;
  page?: number;
  limit?: number;
}) {
  const { status, channelId, isHistorical, since, page = 1, limit = 20 } = params;
  const where: any = {};
  if (status) where.status = status;
  if (channelId) where.channelId = channelId;
  if (isHistorical !== undefined) where.isHistorical = isHistorical;
  if (since) where.createdAt = { gte: since };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: { mediaFiles: true, channel: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ]);

  return { posts, total, page, totalPages: Math.ceil(total / limit) };
}

export async function deletePost(id: number) {
  return prisma.post.delete({ where: { id } });
}

export async function updatePostTranslatedText(postId: number, text: string) {
  return prisma.post.update({
    where: { id: postId },
    data: { translatedText: text },
  });
}

// ——— Media ———

export async function createMedia(data: {
  postId: number;
  type: string;
  filePath: string;
  fileName?: string;
  mimeType?: string;
}) {
  return prisma.media.create({ data });
}

export async function getMedia(id: number) {
  return prisma.media.findUnique({ where: { id } });
}

export async function getMediaByPostId(postId: number) {
  return prisma.media.findMany({ where: { postId } });
}

export async function deleteMedia(id: number) {
  return prisma.media.delete({ where: { id } });
}

// ——— Subscriptions ———

export async function getSubscriptions() {
  return prisma.subscription.findMany({ orderBy: { title: "asc" } });
}

export async function upsertSubscriptions(
  items: {
    telegramId: string;
    title: string;
    username: string | null;
    isChannel: boolean;
    isGroup: boolean;
    participantsCount: number | null;
  }[]
) {
  for (const item of items) {
    await prisma.subscription.upsert({
      where: { telegramId: item.telegramId },
      update: {
        title: item.title,
        username: item.username,
        isChannel: item.isChannel,
        isGroup: item.isGroup,
        participantsCount: item.participantsCount,
      },
      create: item,
    });
  }
}

export async function getSubscription(telegramId: string) {
  return prisma.subscription.findUnique({ where: { telegramId } });
}

export async function getSubscriptionByUsername(username: string) {
  return prisma.subscription.findFirst({ where: { username } });
}

export async function updateSubscriptionAvatar(telegramId: string, avatarPath: string) {
  return prisma.subscription.update({
    where: { telegramId },
    data: { avatarPath },
  });
}
