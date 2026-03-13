import type { IngestResult, IngestStatus } from "@repo/types"
import { put } from "@vercel/blob"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/db/client"
import { getDefaultProvider } from "@/db/queries/ai-provider"
import { getBilibiliCredentials } from "@/db/queries/bilibili-credentials"
import { bookmark } from "@/db/schema/bookmark"
import { embedding as embeddingTable } from "@/db/schema/embedding"
import { generateEmbeddings } from "@/lib/ai/embedding"
import { getEmbeddingModel } from "@/lib/ai/provider"
import {
  convertBuffer,
  convertUrl,
  extractDescription,
  inferTypeFromExtension,
  inferTypeFromUrl,
} from "./converter"
import { convertWithoutHtml, convertWithPlatform, needsBrowser } from "./platforms"
import { inferPlatform } from "./types"

const FILE_EXT_REGEX = /\.[^.]+$/

interface IngestUrlParams {
  userId: string
  url: string
  folderId?: string
  title?: string
  clientSource: string
}

interface IngestFileParams {
  userId: string
  file: File
  folderId?: string
  title?: string
  clientSource: string
}

interface IngestExtensionParams {
  userId: string
  url: string
  html?: string
  folderId?: string
  title?: string
  clientSource: string
}

function sanitizeForDb(str: string): string {
  // 清理字符串，移除控制字符，截断到 1000 字符（PostgreSQL UTF-8 兼容）
  // biome-ignore lint/suspicious/noControlCharactersInRegex: need to strip NULL bytes for PostgreSQL UTF-8 compatibility
  return str.replace(/\x00/g, "").slice(0, 1000)
}

async function updateBookmarkStatus(bookmarkId: string, status: IngestStatus, error?: string) {
  // 更新书签的处理状态和错误信息
  await db
    .update(bookmark)
    .set({ ingestStatus: status, ingestError: error ? sanitizeForDb(error) : null })
    .where(eq(bookmark.id, bookmarkId))
}

async function generateAndStoreEmbeddings(bookmarkId: string, content: string, userId: string) {
  // 获取用户默认的 embedding 提供商配置
  const config = await getDefaultProvider(userId, "embedding")
  if (!config) {
    return
  }

  // 获取 embedding 模型并生成向量
  const model = getEmbeddingModel(config)
  // 先删除旧的 embedding（如果有）
  await db.delete(embeddingTable).where(eq(embeddingTable.bookmarkId, bookmarkId))
  const embeddings = await generateEmbeddings(bookmarkId, content, model)
  // 存储新的 embedding
  if (embeddings.length > 0) {
    await db.insert(embeddingTable).values(embeddings)
  }
}

export async function ingestFromUrl(params: IngestUrlParams): Promise<IngestResult> {
  // 从 URL 导入书签的入口函数
  const { userId, url, folderId, title: userTitle, clientSource } = params
  const bookmarkId = nanoid()
  // 根据 URL 推断书签类型（link、video、article 等）
  const type = inferTypeFromUrl(url)

  // 创建书签记录，初始状态为 pending
  await db.insert(bookmark).values({
    id: bookmarkId,
    userId,
    folderId: folderId ?? null,
    type,
    title: userTitle || url,
    url,
    sourceType: "url",
    clientSource,
    platform: inferPlatform(url),
    ingestStatus: "pending" as IngestStatus,
  })

  // 触发后台处理，不 await（异步处理）
  processIngestUrl(bookmarkId, url, userId, userTitle).catch(console.error)

  // 立即返回结果，状态为 pending
  return { bookmarkId, title: userTitle || url, markdown: null, type, status: "pending" }
}

async function processIngestUrl(
  bookmarkId: string,
  url: string,
  userId: string,
  userTitle?: string
) {
  // 后台处理 URL 导入的逻辑
  await updateBookmarkStatus(bookmarkId, "processing")
  try {
    // 识别平台（bilibili、wechat、xiaohongshu 等）
    const platform = inferPlatform(url)
    let result: { title: string | null; markdown: string } | null = null

    // 根据平台选择处理方式
    if (platform) {
      if (needsBrowser(platform)) {
        // 需要浏览器渲染的平台（wechat、xiaohongshu 等）
        const { fetchWithBrowser } = await import("./browser")
        const html = await fetchWithBrowser(url)
        if (html) {
          result = await convertWithPlatform(html, url, platform)
        }
      } else {
        // 不需要浏览器的平台（bilibili），直接从 URL 解析
        // 对于 bilibili，尝试获取用户凭证
        const credentials = platform === "bilibili" ? await getBilibiliCredentials(userId) : null
        result = await convertWithoutHtml(url, platform, credentials)
      }
    }

    // 无平台或平台解析失败时，走通用转换（markitdown）
    if (!result?.markdown) {
      result = await convertUrl(url)
    }

    // 转换失败则标记为 failed
    if (!result?.markdown) {
      await updateBookmarkStatus(bookmarkId, "failed", "Conversion returned empty result")
      return
    }

    // 更新书签内容
    const finalTitle = userTitle || result.title || url
    const description = extractDescription(result.markdown)

    await db
      .update(bookmark)
      .set({ title: finalTitle, description, content: result.markdown, ingestStatus: "completed" })
      .where(eq(bookmark.id, bookmarkId))

    // 生成向量嵌入（异步，不等待）
    generateAndStoreEmbeddings(bookmarkId, result.markdown, userId).catch(console.error)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error"
    await updateBookmarkStatus(bookmarkId, "failed", errMsg)
  }
}

export async function ingestFromFile(params: IngestFileParams): Promise<IngestResult> {
  // 从文件导入书签的入口函数
  const { userId, file, folderId, title: userTitle, clientSource } = params
  const bookmarkId = nanoid()
  const fileName = file.name
  // 提取文件扩展名
  const extMatch = fileName.match(FILE_EXT_REGEX)
  const fileExtension = extMatch ? extMatch[0].toLowerCase() : ""
  // 根据扩展名推断类型
  const type = inferTypeFromExtension(fileExtension)

  // 创建书签记录
  await db.insert(bookmark).values({
    id: bookmarkId,
    userId,
    folderId: folderId ?? null,
    type,
    title: userTitle || fileName,
    sourceType: "file",
    clientSource,
    fileExtension,
    fileSize: file.size,
    ingestStatus: "pending" as IngestStatus,
  })

  // 先读取 file 到 buffer 并上传到 Vercel Blob（需要在请求生命周期内完成）
  const fileBuffer = await file.arrayBuffer()
  const blobResult = await put(`ingest/${bookmarkId}/${fileName}`, fileBuffer, {
    access: "public",
  })

  // 更新文件 URL
  await db
    .update(bookmark)
    .set({ fileUrl: blobResult.url, url: blobResult.url })
    .where(eq(bookmark.id, bookmarkId))

  // 触发后台处理，异步转换文件内容
  const buffer = Buffer.from(fileBuffer)
  processIngestFile(bookmarkId, buffer, fileExtension, userId, userTitle, fileName).catch(
    console.error
  )

  return { bookmarkId, title: userTitle || fileName, markdown: null, type, status: "pending" }
}

async function processIngestFile(
  bookmarkId: string,
  buffer: Buffer,
  fileExtension: string,
  userId: string,
  userTitle?: string,
  fileName?: string
) {
  // 后台处理文件导入的逻辑
  await updateBookmarkStatus(bookmarkId, "processing")
  try {
    // 使用 markitdown 将文件内容转换为 markdown
    const result = await convertBuffer(buffer, fileExtension)

    if (!result?.markdown) {
      await updateBookmarkStatus(bookmarkId, "failed", "Conversion returned empty result")
      return
    }

    // 更新书签内容
    const finalTitle = userTitle || result.title || fileName || "Untitled"
    const description = extractDescription(result.markdown)

    await db
      .update(bookmark)
      .set({ title: finalTitle, description, content: result.markdown, ingestStatus: "completed" })
      .where(eq(bookmark.id, bookmarkId))

    // 生成向量嵌入
    generateAndStoreEmbeddings(bookmarkId, result.markdown, userId).catch(console.error)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error"
    await updateBookmarkStatus(bookmarkId, "failed", errMsg)
  }
}

export async function ingestFromExtension(params: IngestExtensionParams): Promise<IngestResult> {
  // 从浏览器扩展导入书签的入口函数
  const { userId, url, html, folderId, title: userTitle, clientSource } = params
  const bookmarkId = nanoid()
  const platform = inferPlatform(url)

  // 创建书签记录
  await db.insert(bookmark).values({
    id: bookmarkId,
    userId,
    folderId: folderId ?? null,
    type: "article",
    title: userTitle || url,
    url,
    sourceType: "extension",
    clientSource,
    platform,
    ingestStatus: "pending" as IngestStatus,
  })

  // 触发后台处理，异步转换内容
  processIngestExtension(bookmarkId, html, url, platform, userId, userTitle).catch(console.error)

  return { bookmarkId, title: userTitle || url, markdown: null, type: "article", status: "pending" }
}

async function processIngestExtension(
  bookmarkId: string,
  html: string | undefined,
  url: string,
  platform: string | null,
  userId: string,
  userTitle?: string
) {
  // 后台处理浏览器扩展导入的逻辑
  await updateBookmarkStatus(bookmarkId, "processing")
  try {
    let result: { title: string | null; markdown: string } | null = null

    // 对于不需要浏览器的平台，尝试直接解析
    if (platform && !needsBrowser(platform)) {
      // 对于 bilibili，尝试获取用户凭证
      const credentials = platform === "bilibili" ? await getBilibiliCredentials(userId) : null
      result = await convertWithoutHtml(url, platform, credentials)
    }

    // 如果没有结果，尝试使用传入的 HTML 转换
    if (!result) {
      if (!html) {
        await updateBookmarkStatus(
          bookmarkId,
          "failed",
          `HTML is required for platform: ${platform ?? "unknown"}`
        )
        return
      }
      result = await convertWithPlatform(html, url, platform)
    }

    // 转换失败则标记为 failed
    if (!result?.markdown) {
      await updateBookmarkStatus(bookmarkId, "failed", "Conversion returned empty result")
      return
    }

    // 更新书签内容
    const finalTitle = userTitle || result.title || url
    const description = extractDescription(result.markdown)

    await db
      .update(bookmark)
      .set({ title: finalTitle, description, content: result.markdown, ingestStatus: "completed" })
      .where(eq(bookmark.id, bookmarkId))

    // 生成向量嵌入
    generateAndStoreEmbeddings(bookmarkId, result.markdown, userId).catch(console.error)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error"
    await updateBookmarkStatus(bookmarkId, "failed", errMsg)
  }
}
