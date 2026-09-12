import * as path from "node:path"
import * as fs from "node:fs"

const AUTHOR = "Asadullah"
const TOOL = "opencode"

const sessions = new Map()
const roots = new Map()
const logPaths = new Map()

function getSession(sessionID) {
  let s = sessions.get(sessionID)
  if (!s) {
    s = { messages: new Map(), captured: new Set() }
    sessions.set(sessionID, s)
  }
  return s
}

function renderText(msg) {
  if (!msg.text || msg.text.size === 0) return ""
  const parts = []
  for (const text of msg.text.values()) {
    if (text == null) continue
    parts.push(text)
  }
  return parts.join("\n\n")
}

function modelOf(info) {
  if (!info || !info.modelID) return "unknown"
  return info.providerID ? `${info.providerID}/${info.modelID}` : info.modelID
}

function pad(n) {
  return String(n).padStart(2, "0")
}

function fileStamp(iso) {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`
}

function updateHeader(file, changes) {
  if (!fs.existsSync(file)) return
  let content = fs.readFileSync(file, "utf8")
  const next = content.replace(/^---\n[\s\S]*?\n---/, (block) => {
    let out = block
    for (const key of Object.keys(changes)) {
      out = out.replace(new RegExp(`^(\\s*${key}:\\s*).*$`, "m"), `$1${changes[key]}`)
    }
    return out
  })
  fs.writeFileSync(file, next, "utf8")
}

function flush(sessionID, baseDir, projectName) {
  const s = sessions.get(sessionID)
  if (!s || s.messages.size === 0) return
  if (roots.get(sessionID) === false) return

  const list = [...s.messages.values()]
  let assistantMsg = null
  for (let i = list.length - 1; i >= 0; i--) {
    const info = list[i].info
    if (info && info.role === "assistant" && info.time && info.time.completed) {
      assistantMsg = list[i]
      break
    }
  }
  if (!assistantMsg) return

  let userMsg = null
  for (let i = list.indexOf(assistantMsg) - 1; i >= 0; i--) {
    const info = list[i].info
    if (info && info.role === "user") {
      userMsg = list[i]
      break
    }
  }
  if (!userMsg) return

  const userID = userMsg.info.id
  if (s.captured.has(userID)) return
  s.captured.add(userID)

  const promptTimeISO = new Date(userMsg.info.time.created).toISOString()
  const completionISO = new Date(assistantMsg.info.time.completed).toISOString()
  const date = promptTimeISO.slice(0, 10)

  const dir = path.join(baseDir, ".agent-logs")
  fs.mkdirSync(dir, { recursive: true })

  let file = logPaths.get(sessionID)
  if (!file) {
    const existing = fs
      .readdirSync(dir)
      .find((name) => name.endsWith(`_${sessionID}.md`))
    file = existing
      ? path.join(dir, existing)
      : path.join(dir, `${fileStamp(promptTimeISO)}_${sessionID}.md`)
    logPaths.set(sessionID, file)
  }

  const fileExists = fs.existsSync(file)
  const num = fileExists
    ? (fs.readFileSync(file, "utf8").match(/\[LOG_ENTRY type=PROMPT/g) || []).length + 1
    : 1

  const short = String(sessionID).slice(0, 8)
  const model = modelOf(assistantMsg.info)

  let promptText = renderText(userMsg)
  let responseText = renderText(assistantMsg)
  if (!responseText && assistantMsg.info.error) {
    const message = assistantMsg.info.error && assistantMsg.info.error.message
    responseText = message ? `[error] ${message}` : "[error]"
  }

  const entry =
    `[LOG_ENTRY type=PROMPT num=${num} session=${short}]\n` +
    `timestamp: ${promptTimeISO}\n` +
    `model: ${model}\n\n` +
    (promptText || "") +
    `\n\n\n` +
    `[LOG_ENTRY type=RESPONSE num=${num} session=${short}]\n` +
    `timestamp: ${completionISO}\n` +
    `model: ${model}\n\n` +
    (responseText || "") +
    `\n\n`

  if (!fs.existsSync(file)) {
    const header =
      `---\n` +
      `session_id: ${sessionID}\n` +
      `date: ${date}\n` +
      `author: ${AUTHOR}\n` +
      `model: ${model}\n` +
      `tool: ${TOOL}\n` +
      `project: ${projectName}\n` +
      `total_exchanges: ${num}\n` +
      `first_prompt_time: ${promptTimeISO}\n` +
      `last_prompt_time: ${new Date().toISOString()}\n` +
      `---\n\n` +
      `# Session Log - ${date}\n\n` +
      `Session: \`${short}\` | Project: \`${projectName}\` | Author: \`${AUTHOR}\`\n\n` +
      `---\n\n\n`
    fs.writeFileSync(file, header + entry, "utf8")
  } else {
    updateHeader(file, {
      total_exchanges: num,
      last_prompt_time: new Date().toISOString(),
      model,
    })
    fs.appendFileSync(file, "\n" + entry, "utf8")
  }
}

export const captureAgentLog = async ({ directory, worktree }) => {
  const baseDir = directory || worktree
  const projectName = baseDir ? path.basename(baseDir) : "unknown"
  return {
    event: async ({ event }) => {
      const p = event.properties
      if (!p || !p.sessionID) return
      const sessionID = p.sessionID

      if (event.type === "session.created") {
        const info = p.info
        roots.set(sessionID, !(info && info.parentID))
        return
      }

      if (event.type === "message.updated") {
        const info = p.info
        if (!info) return
        const s = getSession(sessionID)
        const existing = s.messages.get(info.id)
        if (existing) {
          existing.info = info
        } else {
          s.messages.set(info.id, { info, text: new Map() })
        }
        return
      }

      if (event.type === "message.part.updated") {
        const part = p.part
        if (!part || part.type !== "text") return
        const s = getSession(sessionID)
        const msg = s.messages.get(part.messageID)
        if (msg) msg.text.set(part.id, part.text)
        return
      }

      if (event.type === "session.status" && p.status && p.status.type === "idle") {
        flush(sessionID, baseDir, projectName)
      }
    },
  }
}