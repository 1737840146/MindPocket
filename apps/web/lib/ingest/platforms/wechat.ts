/**
 * 微信公众号文章转换模块
 * 解析微信文章的 HTML，提取正文和图片，转换为 Markdown
 */

import { convertHtml } from "../converter"
import type { ConvertResult } from "./index"

// 微信图片正则（data-src 属性，懒加载图片）
const WX_IMG_DATA_SRC_REGEX = /<img[^>]+data-src="([^"]+)"[^>]*>/gi

// 微信图片正则（src 属性，普通图片）
const WX_IMG_SRC_REGEX = /<img[^>]+src="(https?:\/\/mmbiz[^"]+)"[^>]*>/gi

// Markdown 图片正则
const MD_IMG_REGEX = /!\[[^\]]*\]\([^)]+\)/g
const MD_IMG_URL_REGEX = /\(([^)]+)\)/

/**
 * 从微信 HTML 中提取图片 URL
 * 微信使用 data-src 存储懒加载图片，用 src 存储普通图片
 */
function extractWechatImages(html: string): string[] {
  const images: string[] = []
  const seen = new Set<string>()

  // 遍历两种图片正则
  for (const regex of [WX_IMG_DATA_SRC_REGEX, WX_IMG_SRC_REGEX]) {
    regex.lastIndex = 0
    for (const match of html.matchAll(regex)) {
      const url = match[1]
      // 去重
      if (!seen.has(url)) {
        seen.add(url)
        images.push(url)
      }
    }
  }

  return images
}

/**
 * 将微信文章转换为 Markdown
 * - 先用通用 HTML 转换
 * - 再提取微信文章中的图片（微信特殊格式）
 * - 补充缺失的图片
 */
export async function convertWechat(html: string, url: string): Promise<ConvertResult | null> {
  // 先用通用 HTML 转换
  const result = await convertHtml(html, url)
  if (!result?.markdown) {
    return null
  }

  // 提取微信文章中的图片
  const images = extractWechatImages(html)
  if (images.length === 0) {
    return result
  }

  // 检查已有图片，去重
  const existingImages = result.markdown.match(MD_IMG_REGEX) ?? []
  const existingUrls = new Set(
    existingImages.map((img) => {
      const urlMatch = img.match(MD_IMG_URL_REGEX)
      return urlMatch ? urlMatch[1] : ""
    })
  )

  // 找出缺失的图片
  const missingImages = images.filter((img) => !existingUrls.has(img))
  if (missingImages.length === 0) {
    return result
  }

  // 补充缺失的图片
  const imageMarkdown = missingImages.map((img) => `![](${img})`).join("\n\n")
  const markdown = `${result.markdown}\n\n${imageMarkdown}`

  return { title: result.title, markdown }
}
