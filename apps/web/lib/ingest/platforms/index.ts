/**
 * 平台转换模块
 * 针对不同平台（微信、小红书、B站）使用专门的转换逻辑
 */

import type { BilibiliCredentials } from "@repo/types"
import { convertHtml } from "../converter"
import { convertBilibili } from "./bilibili"
import { convertWechat } from "./wechat"
import { convertXiaohongshu } from "./xiaohongshu"

// 转换结果类型
export interface ConvertResult {
  title: string | null
  markdown: string
}

/** 不需要浏览器渲染的平台（可以直接从 URL 解析） */
const BROWSER_FREE_PLATFORMS = new Set(["bilibili"])

/** 判断平台是否需要浏览器渲染 */
export function needsBrowser(platform: string | null): boolean {
  if (!platform) {
    return false
  }
  return !BROWSER_FREE_PLATFORMS.has(platform)
}

/**
 * 不需要 HTML 的平台转换（直接从 URL 解析）
 * 适用于 bilibili 等可以通过 API 获取内容的平台
 */
export async function convertWithoutHtml(
  url: string,
  platform: string,
  credentials?: BilibiliCredentials | null
): Promise<ConvertResult | null> {
  switch (platform) {
    case "bilibili":
      return await convertBilibili(url, credentials)
    default:
      return null
  }
}

/**
 * 需要 HTML 的平台转换
 * 适用于微信、小红书等需要解析 HTML 的平台
 */
export async function convertWithPlatform(
  html: string,
  url: string,
  platform: string | null
): Promise<ConvertResult | null> {
  switch (platform) {
    case "wechat":
      return await convertWechat(html, url)
    case "xiaohongshu":
      return await convertXiaohongshu(html, url)
    default:
      // 未知平台使用通用 HTML 转换
      return await convertHtml(html, url)
  }
}
