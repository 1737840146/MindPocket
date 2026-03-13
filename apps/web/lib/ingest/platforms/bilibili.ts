/**
 * B站视频转换模块
 * 通过 B 站 API 获取视频信息，生成包含标题、视频链接、嵌入播放器和字幕的 Markdown
 */

import type { BilibiliCredentials } from "@repo/types"
import type { ConvertResult } from "./index"

// B站视频 URL 正则（匹配 BV 号）
const BV_URL_REGEX = /\/video\/(BV[A-Za-z0-9]+)/

// 移除 B 站标题后缀的正则
const BILIBILI_SUFFIX_REGEX = /_哔哩哔哩.*$/

// 字幕数据结构
interface SubtitleItem {
  from: number
  to: number
  content: string
}

interface SubtitleData {
  body: SubtitleItem[]
}

interface SubtitleInfo {
  lan: string
  lan_doc: string
  subtitle_url: string
}

/** 从 URL 中提取 BV 号 */
function extractBvidFromUrl(url: string): string | null {
  const match = url.match(BV_URL_REGEX)
  return match ? match[1] : null
}

/** 将秒数格式化为 MM:SS */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

/** 通过 API 获取视频标题 */
async function fetchTitle(bvid: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    const json = await res.json()
    if (json?.data?.title) {
      // 移除 B 站标题后缀
      return json.data.title.replace(BILIBILI_SUFFIX_REGEX, "").trim()
    }
  } catch (error) {
    console.error("[bilibili] Failed to fetch title from API:", error)
  }
  return null
}

/** 通过 API 获取视频的 aid 和 cid（用于获取字幕） */
async function fetchVideoInfo(bvid: string): Promise<{ aid: number; cid: number } | null> {
  try {
    const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    const json = await res.json()
    if (json?.data?.aid && json?.data?.cid) {
      return { aid: json.data.aid, cid: json.data.cid }
    }
  } catch (error) {
    console.error("[bilibili] Failed to fetch video info:", error)
  }
  return null
}

/** 通过 API 获取字幕列表（需要用户凭证） */
async function fetchSubtitles(
  aid: number,
  cid: number,
  credentials: BilibiliCredentials
): Promise<SubtitleInfo[] | null> {
  try {
    // 构建 Cookie 头（需要用户的登录凭证）
    const cookieHeader = `SESSDATA=${credentials.sessdata}; bili_jct=${credentials.biliJct}; buvid3=${credentials.buvid3}`
    const res = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, {
      headers: {
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.bilibili.com",
      },
    })
    const json = await res.json()
    if (json?.data?.subtitle?.subtitles) {
      return json.data.subtitle.subtitles
    }
  } catch (error) {
    console.error("[bilibili] Failed to fetch subtitles:", error)
  }
  return null
}

/** 下载字幕文件内容 */
async function downloadSubtitle(subtitleUrl: string): Promise<SubtitleData | null> {
  try {
    const url = subtitleUrl.startsWith("//") ? `https:${subtitleUrl}` : subtitleUrl
    const res = await fetch(url)
    const data = await res.json()
    return data
  } catch (error) {
    console.error("[bilibili] Failed to download subtitle:", error)
  }
  return null
}

/** 将字幕格式化为 Markdown（带时间戳） */
function formatSubtitleToMarkdown(subtitleData: SubtitleData): string {
  const lines = ["## 视频字幕", ""]
  for (const item of subtitleData.body) {
    lines.push(`[${formatTime(item.from)}] ${item.content}`)
  }
  return lines.join("\n")
}

/**
 * 将 B 站视频转换为 Markdown
 * - 获取视频标题
 * - 嵌入播放器
 * - 如果提供凭证，尝试获取并添加字幕
 */
export async function convertBilibili(
  url: string,
  credentials?: BilibiliCredentials | null
): Promise<ConvertResult | null> {
  // 从 URL 提取 BV 号
  const bvid = extractBvidFromUrl(url)
  if (!bvid) {
    return null
  }

  // 获取视频标题
  const title = await fetchTitle(bvid)
  const videoUrl = `https://www.bilibili.com/video/${bvid}`
  const iframeSrc = `//player.bilibili.com/player.html?isOutside=true&bvid=${bvid}`

  // 构建 Markdown（标题 + 链接 + 嵌入播放器）
  const markdownParts = [
    title ? `# ${title}` : "# B站视频",
    "",
    `**视频链接**：${videoUrl}`,
    "",
    `<iframe src="${iframeSrc}" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>`,
  ]

  // 如果提供了用户凭证，尝试获取字幕
  if (credentials) {
    const videoInfo = await fetchVideoInfo(bvid)
    if (videoInfo) {
      const subtitles = await fetchSubtitles(videoInfo.aid, videoInfo.cid, credentials)
      if (subtitles && subtitles.length > 0) {
        // 优先选择中文字幕
        const subtitle = subtitles.find((s) => s.lan.includes("zh")) || subtitles[0]
        const subtitleData = await downloadSubtitle(subtitle.subtitle_url)
        if (subtitleData) {
          markdownParts.push("", formatSubtitleToMarkdown(subtitleData))
        }
      }
    }
  }

  const markdown = markdownParts.join("\n")

  return { title, markdown }
}
