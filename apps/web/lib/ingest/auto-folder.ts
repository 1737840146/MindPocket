/**
 * 自动文件夹分配模块
 * 使用 AI Agent 根据导入内容（URL、标题、文件名）自动决定归类到哪个文件夹
 */

import { stepCountIs, ToolLoopAgent } from "ai"
import { getDefaultProvider } from "@/db/queries/ai-provider"
import { getChatModel } from "@/lib/ai/provider"
import { createCreateFolderTool, createListFoldersTool } from "@/lib/ai/tools/folder-tools"

// Agent 输出解析正则
const FOLDER_ID_LINE_REGEX = /^FOLDER_ID:\s*([A-Za-z0-9_-]+)\s*$/i
const NONE_LINE_REGEX = /^NONE$/i

// 函数参数类型
interface ResolveFolderForIngestParams {
  userId: string
  sourceType: "url" | "file" | "extension"
  url?: string
  title?: string
  fileName?: string
}

/**
 * 为导入内容自动分配文件夹
 * 使用 AI Agent 分析内容，选择合适的已有文件夹或创建新文件夹
 */
export async function resolveFolderForIngest({
  userId,
  sourceType,
  url,
  title,
  fileName,
}: ResolveFolderForIngestParams): Promise<string | null> {
  try {
    console.info("[auto-folder] start", { userId, sourceType, url, title, fileName })

    // 获取用户默认的 chat 提供商
    const provider = await getDefaultProvider(userId, "chat")
    if (!provider) {
      console.warn("[auto-folder] skip: no default chat provider", { userId })
      return null
    }

    const model = getChatModel(provider)

    // 创建 AI Agent（使用 ToolLoopAgent）
    const agent = new ToolLoopAgent({
      model,
      instructions: `你是导入分配助手。
你只能使用工具做文件夹决策：
1) 必须先调用 listFolders。
2) 如果有合适文件夹，不要创建新文件夹。
3) 只有确实没有合适文件夹时才调用 createFolder。
4) 最终只输出一行：
- FOLDER_ID:<id> 代表分配到该文件夹
- NONE 代表不分配
不要输出其它内容。`,
      tools: {
        // 列出用户已有文件夹的工具
        listFolders: createListFoldersTool(userId),
        // 创建新文件夹的工具
        createFolder: createCreateFolderTool(userId),
      },
      // 最多 4 步（列出 → 分析 → 可能创建 → 输出）
      stopWhen: stepCountIs(4),
    })

    // 让 Agent 决定文件夹
    const result = await agent.generate({
      prompt: `请为以下导入内容分配文件夹：
sourceType: ${sourceType}
url: ${url ?? ""}
title: ${title ?? ""}
fileName: ${fileName ?? ""}`,
    })

    const text = result.text.trim()

    // 解析 Agent 输出
    const match = text.match(FOLDER_ID_LINE_REGEX)
    if (match) {
      const folderId = match[1]
      console.info("[auto-folder] choose folder by agent", { folderId, text })
      return folderId
    }

    // 输出 NONE 表示不分配
    if (NONE_LINE_REGEX.test(text)) {
      console.info("[auto-folder] choose none by agent")
      return null
    }

    // 如果 Agent 没有输出标准格式，尝试从工具调用结果中找创建的文件夹
    for (let i = result.steps.length - 1; i >= 0; i -= 1) {
      const step = result.steps[i]
      for (const toolResult of step.toolResults) {
        if (toolResult.toolName !== "createFolder") {
          continue
        }
        const output = toolResult.output as
          | { success?: boolean; data?: { folder?: { id?: string } } }
          | undefined
        const createdId = output?.data?.folder?.id
        if (output?.success && createdId) {
          console.info("[auto-folder] fallback to created folder from tool result", {
            folderId: createdId,
          })
          return createdId
        }
      }
    }

    console.info("[auto-folder] unrecognized agent output", { text })
    return null
  } catch (error) {
    console.error("[auto-folder] failed", {
      userId,
      sourceType,
      url,
      title,
      fileName,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
