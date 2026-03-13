/**
 * 内容转换模块
 * 负责将 URL、文件、HTML 转换为 Markdown 格式
 * 核心使用 markitdown-ts 库
 */

import "pdf-parse/worker"
import type { MarkItDown } from "markitdown-ts"
import type { BookmarkType } from "./types"
import { EXTENSION_TYPE_MAP, URL_TYPE_PATTERNS } from "./types"

// markitdown 单例
let markitdownInstance: MarkItDown | null = null

// 段落分隔正则
const PARAGRAPH_SPLIT_REGEX = /\n\n/

// 需要浏览器渲染的网站（微信文章等）
const BROWSER_ONLY_PATTERNS = [/^https?:\/\/mp\.weixin\.qq\.com\//]

/** 获取 markitdown 实例（单例模式） */
async function getMarkItDown(): Promise<MarkItDown> {
  if (!markitdownInstance) {
    const { MarkItDown } = await import("markitdown-ts")
    markitdownInstance = new MarkItDown()
  }
  return markitdownInstance
}

/** 使用浏览器获取网页 HTML（用于需要 JavaScript 渲染的网站） */
async function convertUrlWithBrowser(url: string) {
  const { fetchWithBrowser } = await import("./browser")
  const html = await fetchWithBrowser(url)
  if (!html) {
    return null
  }
  return convertHtml(html, url)
}

/**
 * 将 URL 转换为 Markdown
 * 优先尝试 markitdown，失败则降级到浏览器渲染
 */
export async function convertUrl(url: string) {
  // 需要浏览器渲染的网站，直接用浏览器
  if (BROWSER_ONLY_PATTERNS.some((p) => p.test(url))) {
    return convertUrlWithBrowser(url)
  }

  const md = await getMarkItDown()

  try {
    const result = await md.convert(url)
    if (result?.markdown) {
      return { title: result.title, markdown: result.markdown }
    }
  } catch (error) {
    console.warn("[converter] markitdown failed, trying browser fallback:", error)
  }

  // markitdown 失败，降级到浏览器
  return convertUrlWithBrowser(url)
}

/**
 * 将文件 Buffer 转换为 Markdown
 * 支持 PDF、Word、Markdown 等多种格式
 */
export async function convertBuffer(buffer: Buffer, fileExtension: string) {
  const md = await getMarkItDown()
  const result = await md.convertBuffer(buffer, { file_extension: fileExtension })
  if (!result) {
    return null
  }
  return { title: result.title, markdown: result.markdown }
}

/**
 * 将 HTML 内容转换为 Markdown
 */
export async function convertHtml(html: string, sourceUrl: string) {
  const md = await getMarkItDown()
  const response = new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  })
  const result = await md.convert(response, { url: sourceUrl })
  if (!result) {
    return null
  }
  return { title: result.title, markdown: result.markdown }
}

/** 根据文件扩展名推断书签类型 */
export function inferTypeFromExtension(ext: string): BookmarkType {
  return EXTENSION_TYPE_MAP[ext.toLowerCase()] ?? "other"
}

/** 根据 URL 推断书签类型 */
export function inferTypeFromUrl(url: string): BookmarkType {
  for (const { pattern, type } of URL_TYPE_PATTERNS) {
    if (pattern.test(url)) {
      return type
    }
  }
  return "link"
}

/**
 * 从 Markdown 中提取描述文本
 * 移除标题、图片、链接格式等，保留纯文本段落
 */
export function extractDescription(markdown: string): string {
  const text = markdown
    .replace(/^#+\s+.+$/gm, "") // 移除标题
    .replace(/!\[.*?\]\(.*?\)/g, "") // 移除图片
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1") // 将链接转为文字
    .replace(/[*_~`#>|-]/g, "") // 移除格式字符
    .trim()
  const firstParagraph = text.split(PARAGRAPH_SPLIT_REGEX)[0] ?? ""
  return firstParagraph.slice(0, 200).trim()
}
