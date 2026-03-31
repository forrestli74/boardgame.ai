import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PlayerConfigSchema = z
  .object({
    name: z.string(),
    model: z.string().optional(),
    persona: z.string().optional(),
    personaFile: z.string().optional(),
  })
  .refine((p) => !(p.persona && p.personaFile), {
    message: 'persona and personaFile are mutually exclusive',
  })

function toPlayerId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

export const GameConfigSchema = z.object({
  game: z.string(),
  gameOptions: z.record(z.string(), z.unknown()).optional(),
  players: z.array(PlayerConfigSchema).min(1, 'At least one player is required'),
}).refine((c) => {
  const ids = c.players.map((p) => toPlayerId(p.name))
  return new Set(ids).size === ids.length
}, { message: 'Player names must produce unique IDs (case-insensitive, spaces collapsed)' })

export type PlayerConfig = z.infer<typeof PlayerConfigSchema>
export type GameConfig = z.infer<typeof GameConfigSchema>

export interface ResolvedPlayer {
  name: string
  model?: string
  persona?: string
}

export function parseConfig(raw: unknown): GameConfig {
  return GameConfigSchema.parse(raw)
}

export async function resolvePersonas(
  players: PlayerConfig[],
  configDir: string,
): Promise<ResolvedPlayer[]> {
  return Promise.all(
    players.map(async (p) => {
      const resolved: ResolvedPlayer = { name: p.name }
      if (p.model) resolved.model = p.model
      if (p.personaFile) {
        const filePath = resolve(configDir, p.personaFile)
        try {
          resolved.persona = await readFile(filePath, 'utf-8')
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code
          const reason = code === 'ENOENT' ? 'not found' : `cannot read (${code})`
          throw new Error(`Persona file ${reason}: ${filePath} (player: ${p.name})`)
        }
      } else if (p.persona) {
        resolved.persona = p.persona
      }
      return resolved
    }),
  )
}
