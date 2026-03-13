export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // 监听消息
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "GET_PAGE_CONTENT") {
        sendResponse({
          url: window.location.href,
          title: document.title,
          html: document.documentElement.outerHTML,
        })
      }
      return true
    })

    // 创建 MindPocket 按钮
    function createMindPocketButton() {
      const host = document.createElement("div")
      host.style.display = "inline-flex"
      host.style.alignItems = "center"
      host.style.verticalAlign = "middle"

      const shadow = host.attachShadow({ mode: "open" })

      // 创建按钮
      const btn = document.createElement("button")
      btn.className = "mindpocket-btn"
      btn.setAttribute("aria-label", "收藏到 MindPocket")
      btn.title = "收藏到 MindPocket"

      // MindPocket 图标
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M14 2a3 3 0 0 1 .054 6l-.218.653A4.507 4.507 0 0 1 15.89 11.5h1.319a2.5 2.5 0 1 1 0 2h-1.32a4.487 4.487 0 0 1-1.006 1.968l.704.704a2.5 2.5 0 1 1-1.414 1.414l-.934-.934A4.485 4.485 0 0 1 11.5 17a4.481 4.481 0 0 1-1.982-.46l-.871 1.046a3 3 0 1 1-1.478-1.35l.794-.954A4.48 4.48 0 0 1 7 12.5c0-.735.176-1.428.488-2.041l-.868-.724A2.5 2.5 0 1 1 7.9 8.2l.87.724a4.48 4.48 0 0 1 3.169-.902l.218-.654A3 3 0 0 1 14 2M6 18a1 1 0 1 0 0 2 1 1 0 0 0 0-2m10.5 0a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1m-5-8a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5m8 2a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1m-14-5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1M14 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2"/>
        </svg>
      `

      // 样式
      const style = document.createElement("style")
      style.textContent = `
        .mindpocket-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          padding: 0;
          margin-left: 4px;
          background: transparent;
          border: none;
          border-radius: 9999px;
          cursor: pointer;
          color: rgb(113, 118, 123);
          transition: color 0.2s, background-color 0.2s;
        }
        .mindpocket-btn:hover {
          color: rgb(29, 161, 242);
          background-color: rgba(29, 161, 242, 0.1);
        }
        .mindpocket-btn.saved {
          color: rgb(29, 161, 242);
        }
        .mindpocket-btn.saving {
          opacity: 0.5;
          cursor: wait;
        }
      `

      shadow.appendChild(style)
      shadow.appendChild(btn)

      // 点击事件
      btn.addEventListener("click", async (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (btn.classList.contains("saving")) {
          return
        }

        btn.classList.add("saving")

        try {
          const res = await browser.runtime.sendMessage({ type: "SAVE_PAGE" })
          if (res?.success) {
            btn.classList.add("saved")
            btn.title = "已收藏到 MindPocket"
          } else {
            console.error("[MindPocket] Save failed:", res?.error)
          }
        } catch (err) {
          console.error("[MindPocket] Save error:", err)
        } finally {
          btn.classList.remove("saving")
        }
      })

      return host
    }

    // 查找并添加按钮到 Twitter 推文
    function injectButtons() {
      // 找到所有书签按钮
      const bookmarkButtons = document.querySelectorAll('[data-testid="bookmark"]')

      for (const bookmarkBtn of bookmarkButtons) {
        // 检查是否已经添加过 MindPocket 按钮
        const parent = bookmarkBtn.parentElement
        if (!parent) {
          continue
        }

        // 检查是否已经添加过按钮
        const existingBtn = parent.querySelector(".mindpocket-host")
        if (existingBtn) {
          continue
        }

        // 创建 MindPocket 按钮
        const mpBtn = createMindPocketButton()
        mpBtn.className = "mindpocket-host"

        // 插入到书签按钮前面
        parent.insertBefore(mpBtn, bookmarkBtn)
      }
    }

    // 使用 MutationObserver 监听页面变化（Twitter 是 SPA）
    const observer = new MutationObserver(() => {
      // 每次 DOM 变化都尝试注入
      injectButtons()
    })

    // 开始观察
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // 初始注入
    injectButtons()
  },
})
