export type Mode = 'idle' | 'work' | 'ok' | 'err'

// Bir alt ajanın bantta görünen satırı; mode, ajanın durumundan türetilir
// enteredFrame / endedFrame: ajanın görüldüğü ve bittiği kare; giriş-çıkış kayması bunlardan hesaplanır
export type AgentRow = {
  id: string
  type: string
  char: string
  mode: Mode
  enteredFrame: number
  endedFrame?: number
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-agent': {
      mode: Mode
      frame: number
      label: string
      isHidden: boolean
      character: string
      agents: AgentRow[]
      idleStart: number
      theme: string
      // Bağlam doluluğu yüzdesi (0-100); -1: henüz ölçülmedi (taze oturum / compact sonrası)
      ctx: number
    }
  }
}
