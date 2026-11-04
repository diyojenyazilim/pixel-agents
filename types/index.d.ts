export type Mode = 'idle' | 'work' | 'ok' | 'err'

// Bir alt ajanın bantta görünen satırı; mode, ajanın durumundan türetilir
export type AgentRow = { id: string; type: string; char: string; mode: Mode }

declare module 'claude-code' {
  interface PluginState {
    'pixel-agent': {
      mode: Mode
      frame: number
      label: string
      isHidden: boolean
      character: string
      agents: AgentRow[]
    }
  }
}
