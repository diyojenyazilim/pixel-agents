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
      // /pixel-agent theme auto: tema yerel saate göre kendiliğinden seçilir
      themeAuto: boolean
      // Bağlam doluluğu yüzdesi (0-100); -1: henüz ölçülmedi (taze oturum / compact sonrası)
      ctx: number
      // Karakter seçim listesi açık mı (/pixel-agent switch)
      picking: boolean
      // İstatistik: çalışan turun başlangıcı (startFrame -1: tur yok) ve araç sayısı
      statTurn: { startMs: number; startFrame: number; tools: number }
      // Uzun biten turun süresi (sn); -1: uzun değil / tur sürüyor
      statDone: number
      // Oturum toplamları (/pixel-agent stats)
      statTotals: { turns: number; tools: number; errors: number; workMs: number; byTool: Record<string, number> }
      // ---BAĞ-START---
      // Karakter id'sine göre bağ puanı (başarılı tur sayısı)
      bondPoints: Record<string, number>
      // Karakter id'sine göre seçili şapka id'si
      bondHats: Record<string, string>
      // Şapka listesi açık mı (/pixel-agent hat)
      bondHatPicking: boolean
      // Uzun aradan dönüşte bantta kısa süre görünen metin
      bondWelcome: string
      // ---BAĞ-END---
      // ---BALON-START---
      // Konuşma balonu: ardışık hata sayısı, biten tur sayısı ve açık/kapalı
      balonErrStreak: number
      balonTurns: number
      balonOn: boolean
      // ---BALON-END---
    }
  }
}
