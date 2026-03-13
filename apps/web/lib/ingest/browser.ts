/**
 * 浏览器模块
 * 使用 Puppeteer 进行无头浏览器渲染，用于抓取需要 JavaScript 的页面
 */

// Chromium 包地址（Vercel 生产环境用）
const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.0/chromium-v143.0.0-pack.x64.tar"

/** 获取浏览器实例 */
async function getBrowser() {
  const puppeteer = await import("puppeteer-core").then((mod) => mod.default)

  // Vercel 生产环境使用 @sparticuz/chromium-min
  if (process.env.VERCEL_ENV === "production") {
    const chromium = await import("@sparticuz/chromium-min").then((mod) => mod.default)
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL)
    return puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    })
  }

  // 本地开发使用本地 Chrome
  return puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  })
}

/**
 * 使用浏览器获取网页完整 HTML
 * 用于需要 JavaScript 渲染的页面（微信文章、小红书等）
 */
export async function fetchWithBrowser(url: string): Promise<string | null> {
  let browser: import("puppeteer-core").Browser | null = null

  try {
    browser = await getBrowser()
    const page = await browser.newPage()

    // 设置 User-Agent 模拟真实浏览器
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
    await page.setExtraHTTPHeaders({
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    })

    // 等待网络空闲后获取内容
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 })

    const html = await page.content()
    return html || null
  } catch (error) {
    console.error("[browser] Failed to fetch with browser:", error)
    return null
  } finally {
    // 确保关闭浏览器
    await browser?.close()
  }
}
