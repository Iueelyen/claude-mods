// Pure helpers for My Commands: reading a command file and filling it in.

/** A command file: its name (the file name) and what its frontmatter and body say. */
export type CommandFile = { name: string; description: string; argumentHint?: string; body: string }

/** Lowercase letters, digits and hyphens, starting with a letter: what you can type after the slash. */
export function commandName(fileName: string): string | null {
  const m = /^([a-z][a-z0-9-]{0,63})\.md$/i.exec(fileName)
  return m ? m[1]!.toLowerCase() : null
}

/**
 * Reads `---` frontmatter (description, argument-hint) and the body after it.
 * A file with no frontmatter is all body, described by its first line.
 */
export function parseCommand(name: string, text: string): CommandFile {
  const normalized = text.replace(/\r\n/g, '\n')
  const front = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  const fields: Record<string, string> = {}
  if (front) {
    for (const line of front[1]!.split('\n')) {
      const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line)
      if (m) fields[m[1]!.toLowerCase()] = m[2]!.trim().replace(/^["']|["']$/g, '')
    }
  }
  const body = (front ? normalized.slice(front[0].length) : normalized).trim()
  const firstLine = body.split('\n').find(l => l.trim() !== '' && !l.trim().startsWith('<!--'))?.trim() ?? ''
  const description = fields.description || firstLine.slice(0, 100) || `Run /${name}`
  return {
    name,
    description,
    ...(fields['argument-hint'] ? { argumentHint: fields['argument-hint'] } : {}),
    body,
  }
}

/** The command's instructions with what was typed after its name put in for $ARGUMENTS. */
export function fillIn(body: string, args: string): string {
  const typed = args.trim()
  return body.replace(/\$ARGUMENTS/g, typed === '' ? '(nothing)' : typed)
}
