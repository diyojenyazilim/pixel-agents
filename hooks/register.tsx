import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, Mode } from '../types'

const mode = atom({ plugin: 'pixel-agents', key: 'mode' } as const, 'idle' as Mode)
const frame = atom({ plugin: 'pixel-agents', key: 'frame' } as const, 0)
const label = atom({ plugin: 'pixel-agents', key: 'label' } as const, '')
// Ana oturumun ajan adı (settings "agent", örn. orchestrator); boşsa etikette karakter adı kalır
const mainAgent = atom({ plugin: 'pixel-agents', key: 'mainAgent' } as const, '')
const isHidden = atom({ plugin: 'pixel-agents', key: 'isHidden' } as const, false)
const character = atom({ plugin: 'pixel-agents', key: 'character' } as const, 'bit')
const agents = atom({ plugin: 'pixel-agents', key: 'agents' } as const, [] as AgentRow[])
// Boşta kalmanın başladığı kare (-1: boşta değil). Her karede sayaç yazmamak için
// yalnız geçişte yazılır; boşta süresi frame farkından hesaplanır.
const idleStart = atom({ plugin: 'pixel-agents', key: 'idleStart' } as const, -1)
const theme = atom({ plugin: 'pixel-agents', key: 'theme' } as const, 'classic')
// ---HAREKET-START---
// `theme auto` açık mı; theme atomuna 'auto' yazılmaz, tema saate göre bu bayrakla seçilir
const themeAuto = atom({ plugin: 'pixel-agents', key: 'themeAuto' } as const, false)
// Saat (yerel) -> tema: sabah ocean, gün classic, akşam ember, gece mono
function autoThemeFor(hour: number): string {
  if (hour >= 6 && hour < 11) return 'ocean'
  if (hour >= 11 && hour < 17) return 'classic'
  if (hour >= 17 && hour < 21) return 'ember'

  return 'mono'
}
// ---HAREKET-END---
const ctx = atom({ plugin: 'pixel-agents', key: 'ctx' } as const, -1)
// /pixel-agents switch ile açılan karakter ızgarası görünüyor mu
const picking = atom({ plugin: 'pixel-agents', key: 'picking' } as const, false)
// Alt ajanlar iki satıra açık mı (false: tek satıra indirilmiş)
const miniExpanded = atom({ plugin: 'pixel-agents', key: 'miniExpanded' } as const, true)
// ---BAĞ-START--- (atomlar)
// Karakter başına bağ puanı (başarılı tur sayısı) ve karakter başına seçili şapka
const bondPoints = atom({ plugin: 'pixel-agents', key: 'bondPoints' } as const, {} as Record<string, number>)
const bondHats = atom({ plugin: 'pixel-agents', key: 'bondHats' } as const, {} as Record<string, string>)
// /pixel-agents hat ile açılan şapka listesi (Select) görünüyor mu
const bondHatPicking = atom({ plugin: 'pixel-agents', key: 'bondHatPicking' } as const, false)
// Uzun aradan sonra bantta kısa süre görünen karşılama metni ('' = yok)
const bondWelcome = atom({ plugin: 'pixel-agents', key: 'bondWelcome' } as const, '')
// ---BAĞ-END---

// ---BALON-START---
// Konuşma balonu: sabit tablodan tek satırlık tepki. Metin araç adının saf fonksiyonudur,
// bu yüzden aynı araçta sabit kalır, araç değişince güncellenir.
// Ardışık başarısız araç sayısı (başarıda ve yeni istekte sıfırlanır)
const balonErrStreak = atom({ plugin: 'pixel-agents', key: 'balonErrStreak' } as const, 0)
// Biten tur sayısı; "bitti" varyasyonunu seçer ve tur boyunca sabit tutar
const balonTurns = atom({ plugin: 'pixel-agents', key: 'balonTurns' } as const, 0)
// /pixel-agents chatter ile açılıp kapanır; kalıcıdır
const balonOn = atom({ plugin: 'pixel-agents', key: 'balonOn' } as const, true)

// Bu kadar ardışık hatadan sonra "tekrar deneyelim" balonu çıkar
const BALON_ERR_STREAK = 3
// Balon için sağ sütunda gereken en az genişlik (hücre); daha darsa çizilmez
const BALON_MIN_W = 16

const BALON_TOOLS: Record<string, string> = {
  bash: 'into the terminal',
  powershell: 'into the terminal',
  read: 'reading up',
  edit: 'making changes',
  multiedit: 'making changes',
  write: 'making changes',
  notebookedit: 'making changes',
  grep: 'on the hunt',
  glob: 'on the hunt',
  webfetch: 'off to the web',
  websearch: 'off to the web',
  agent: 'calling a helper',
  task: 'calling a helper',
  todowrite: 'ticking things off',
}

const BALON_DONE = ['done', 'all done', 'done and dusted', 'ready for more']

// Tablo dışı (MCP vb.) araçlar adın içeriğine göre gruplanır; tanınmayana genel metin
function balonForTool(tool: string): string {
  const t = tool.toLowerCase()
  const exact = BALON_TOOLS[t]

  if (exact) return exact
  if (/web|browser|navigate|fetch|chrome|playwright/.test(t)) return 'off to the web'
  if (/grep|glob|search|explore|find|query/.test(t)) return 'on the hunt'
  if (/bash|powershell|shell/.test(t)) return 'into the terminal'
  if (/edit|write|notebook|replace|insert/.test(t)) return 'making changes'
  if (/read|view/.test(t)) return 'reading up'

  return 'working on it'
}

type BalonIn = { on: boolean; m: Mode; tool: string; streak: number; tired: boolean; turns: number }

// Boşta/uyurken (m === 'idle') ve kapalıyken balon yok. Öncelik: hata serisi > yorgunluk > araç.
function balonText(i: BalonIn): string {
  if (!i.on || i.m === 'idle') return ''
  if (i.m === 'ok') return BALON_DONE[i.turns % BALON_DONE.length] ?? 'done'
  if (i.streak >= BALON_ERR_STREAK) return "hmm, let's try again"
  if (i.tired) return 'my head is getting full'

  return i.tool ? balonForTool(i.tool) : 'thinking it over'
}
// ---BALON-END---

// Bağlam bu yüzdeyi aşınca karakter yorgun görünür
const CTX_TIRED = 85

const TICK_MS = 450
// Biten bir alt ajan bantta bu kadar kare kalır; motor kaydı birkaç saniye sonra düşürüyor
const HOLD_TICKS = 14
const HOLD_MS = HOLD_TICKS * TICK_MS
// frame bu değerde başa sarar; boşta süresi ve giriş-çıkış farkları aynı modülle hesaplanır
const FRAME_WRAP = 100000

type Seen = {
  type: string
  char: string
  mode: Mode
  enteredFrame: number
  endedAt?: number
  endedFrame?: number
}

// ---SPRITE-START---
// Sprite 14x12 piksel. Tuval 12 piksel sprite + 2 piksel baş boşluğu = 14 piksel
// (7 metin satırı); sprite dinlenirken tuvalin tabanına oturur, taban çizgisi zemin
// görevi görür. Her metin satırı iki piksel satırını ▀ (ön plan = üst, arka plan = alt)
// ile çizer: hücre başına iki renk, piksel kare.
const SW = 14
const SH = 12
const H = 14
// Geniş tuval: yürüme payı ve sağda aksesuar alanı var. Dar terminalde sprite yalnız
// kendi genişliğini ve 1 piksel kenar boşluğunu kullanır (yürüme/aksesuar yok).
const W_WIDE = 28
const W_NARROW = 16
const WIDE_MIN_COLUMNS = 76
const PROP_X = 18
// Boşta bu kadar kare (~450 ms) geçince uyur. 262 % CYCLE = 62: yürüyüş döngüsü bittikten
// sonraki an, yani uykuya geçerken karakter zaten başlangıç yerinde durur (sıçrama yok)
const SLEEP_AFTER = 262
// Boşta davranış döngüsü; FRAME_WRAP ile tam bölünür, sarma anında sıçrama olmaz
const CYCLE = 100

type Spec = {
  title: string
  palette: Record<string, string>
  // 12 satır x 7 sütun; sağ yarı ayna ile üretilir. '.' saydam.
  half: string[]
  // Sol gözün sol sütunu; sağ göz aynalanır (12 - eyeX)
  eyeX: number
  eyeY: number
  mouthY: number
  eye: string
  line: string
  // Yüz alanı 2 piksel genişliğinde gözden fazlasını taşımıyorsa (dar yüz) mutlu/hata
  // gözleri yüzün dışına, kontura taşmasın diye 2 piksellik çizilir
  narrow?: boolean
  // Temada yeniden renklendirilmeyen palet harfleri (aksesuar, ten, sakal gibi vurgu renkleri)
  keep?: string
  // Hata gözü (X) rengi; gövde kırmızıya yakınsa (turuncu, yeşil) okunsun diye. Varsayılan RED
  errEye?: string
}

const WHITE = '#FFFFFF'
const RED = '#E5484D'
const AMBER = '#F6B93B'
const SWEAT = '#7FE3FF'
// Hem açık hem koyu terminal zemininde okunan orta ton
const ZZZ = '#7A8CA0'

// 1) Bit: kutu kafalı robot, ekranda amber LED gözler
const BIT: Spec = {
  title: 'Bit',
  palette: {
    O: '#2F3A4A',
    h: '#DDE6EE',
    m: '#8FA3B8',
    k: '#5B6B80',
    s: '#18202B',
    a: '#FFB454',
  },
  half: [
    '......a',
    '......O',
    '..OOOOO',
    '.Ohhhhh',
    '.Omssss',
    'kOmssss',
    'kOmssss',
    '.Omssss',
    '.Omssss',
    '.Okkkkk',
    '.Ohmmmm',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 5,
  mouthY: 8,
  eye: '#FFB454',
  line: '#C98A3E',
  keep: 'a',
}

// 2) Gölge: kulaklı, dalgalı etekli kedi-hayalet
const GOLGE: Spec = {
  title: 'Ghost',
  palette: {
    O: '#3B3A4A',
    h: '#FBF8F2',
    m: '#F2EDE4',
    k: '#C9BFAE',
    p: '#E8A0B0',
  },
  half: [
    '..O....',
    '.OmO...',
    '.OpmOOO',
    '.Ommhhh',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Okmmmmm',
    'Okkkkkk',
    'O.OO.O.',
  ],
  eyeX: 3,
  eyeY: 5,
  mouthY: 8,
  eye: '#1B9C8C',
  line: '#3B3A4A',
  keep: 'p',
}

// 3) Ay Yolcusu: yuvarlak kask, koyu vizör, sırt çantası
const ASTRONOT: Spec = {
  title: 'Astronaut',
  palette: {
    O: '#1E2A44',
    h: '#FFFFFF',
    m: '#F4F1EA',
    k: '#BFC6D0',
    s: '#26335A',
    r: '#FF6B4A',
    b: '#8A93A3',
  },
  half: [
    '....OOO',
    '..OOhhh',
    '.Ohhmmm',
    'Ommssss',
    'Ommssss',
    'Ommssss',
    'Ommssss',
    'Ommssss',
    '.Okkkkk',
    'bbOmmmm',
    'bbOmmmr',
    '.OOkkkk',
  ],
  eyeX: 3,
  eyeY: 4,
  mouthY: 7,
  eye: '#7FE3FF',
  line: '#5BB8D6',
  keep: 'r',
}

// 4) Kod Büyücüsü: sivri şapka, yıldız, sakal
const BUYUCU: Spec = {
  title: 'Code Wizard',
  palette: {
    O: '#0F3A40',
    h: '#2FA3B0',
    m: '#1F6F78',
    k: '#14464D',
    f: '#F1D7B6',
    b: '#F1E6D3',
    y: '#F2C94C',
  },
  half: [
    '......O',
    '.....Om',
    '....Ohm',
    '....mym',
    '...Ohmm',
    '.OOmmmm',
    '.Okkkkk',
    '...Offf',
    '...Offf',
    '...Offf',
    '..Obbbb',
    '....Obb',
  ],
  eyeX: 4,
  eyeY: 7,
  mouthY: 9,
  eye: '#2A1D16',
  line: '#7A4B3A',
  narrow: true,
  keep: 'fby',
}

// 5) Bulut-ruh: yuvarlak, yumuşak bulut
const BULUT: Spec = {
  title: 'Cloud',
  palette: {
    O: '#6E8AA3',
    h: '#FFFFFF',
    m: '#DCE8F0',
    k: '#9FB6C8',
  },
  half: [
    '......O',
    '....OOh',
    '...Ohhh',
    '.OOhhmm',
    'Ohhmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Okmmmmm',
    '.Okkkkk',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 6,
  mouthY: 9,
  eye: '#4A6A85',
  line: '#4A6A85',
}

// 6) Kedi: sivri kulaklı turuncu tekir, beyaz çene
const KEDI: Spec = {
  title: 'Cat',
  palette: { O: '#4A2C1A', h: '#F6B26B', m: '#E8903C', k: '#B8661F', w: '#FFF1DC', p: '#F4A6A6' },
  half: [
    '.O.....',
    '.OpO...',
    '.OmmOOO',
    '.Ohhhhh',
    'Ohmmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Omwwwww',
    'Okwwwww',
    '.Okkkkk',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 5,
  mouthY: 8,
  eye: '#2B1B0E',
  line: '#4A2C1A',
  errEye: '#FFFFFF',
  keep: 'wp',
}

// 7) Tilki: uzun kulaklı, beyaz yanaklı, sivri çeneli
const TILKI: Spec = {
  title: 'Fox',
  palette: { O: '#4A2A14', h: '#F2994A', m: '#E07B2A', k: '#B4561A', w: '#FFF6EA', d: '#3A2418' },
  half: [
    '.Od....',
    '.Omd...',
    '.OmmOOO',
    '.Ohhhhh',
    'Ohmmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Owmmmmm',
    'Owwwwww',
    '.Owwwww',
    '..Owwkk',
    '...OOOO',
  ],
  eyeX: 3,
  eyeY: 5,
  mouthY: 8,
  eye: '#2A1608',
  line: '#4A2A14',
  errEye: '#FFFFFF',
  keep: 'wd',
}

// 8) Kurbağa: tepede çıkıntılı gözler, açık renk karın
const KURBAGA: Spec = {
  title: 'Frog',
  palette: { O: '#1E5A2A', h: '#8EDB74', m: '#4FAE4A', k: '#3A8A3A', w: '#E8F7C8' },
  half: [
    '..OOOO.',
    '.OhhhhO',
    'Ohmmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Okmmmmm',
    'Owwwwww',
    'Owwwwww',
    '.Okkkkk',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 2,
  mouthY: 5,
  eye: '#10331A',
  line: '#1E5A2A',
  errEye: '#FFFFFF',
  keep: 'w',
}

// 9) Penguen: koyu kafa, beyaz yüz ve karın, turuncu gaga
const PENGUEN: Spec = {
  title: 'Penguin',
  palette: { O: '#14213D', m: '#2B3A5C', k: '#1B2845', w: '#F4F6FA', b: '#F5A524' },
  half: [
    '...OOOO',
    '..Ommmm',
    '.Ommmmm',
    '.Ommmmm',
    '.Owwwww',
    '.Owwwww',
    '.Owwwww',
    '.Omwwbb',
    '.Omwwbb',
    'Ommwwww',
    'Ommwwww',
    '.bbbOOO',
  ],
  eyeX: 3,
  eyeY: 4,
  mouthY: 7,
  eye: '#14213D',
  line: '#8A4B0E',
  keep: 'wb',
}

// 10) Baykuş: kulak tüyleri, krem yüz diskleri, gaga
const BAYKUS: Spec = {
  title: 'Owl',
  palette: { O: '#3E2A1C', h: '#B07A4A', m: '#8C5A32', k: '#6B4224', w: '#F2E3C4', b: '#F2A93B' },
  half: [
    '.O.....',
    '.OmO...',
    '.OmmOOO',
    '.Ohhhhh',
    'Ohwwwww',
    'Omwwwww',
    'Omwwwww',
    'Ommmmbb',
    'Ommmmbb',
    'Ommwmwm',
    '.Okmwmw',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 4,
  mouthY: 7,
  eye: '#2A1A10',
  line: '#7A4A12',
  keep: 'wb',
}

// 11) Panda: yuvarlak kulaklar, koyu göz lekeleri
const PANDA: Spec = {
  title: 'Panda',
  palette: { O: '#1A1A1A', h: '#FFFFFF', m: '#F2F2F2', k: '#CFCFCF', s: '#222222' },
  half: [
    '.OO....',
    'OssO...',
    'OssOOOO',
    '.Ohhhhh',
    'Ohssssm',
    'Ohssssm',
    'Ohssssm',
    'Ohmmmmm',
    'Ohmmmmm',
    '.Okmmmm',
    '.Ossmmm',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 4,
  mouthY: 7,
  eye: '#FFFFFF',
  line: '#1A1A1A',
  keep: 's',
}

// 12) Tavşan: uzun kulaklar, pembe burun
const TAVSAN: Spec = {
  title: 'Bunny',
  palette: { O: '#6A4A5A', h: '#FFFFFF', m: '#F3E6EE', k: '#D9C3D2', p: '#F2A6C0', n: '#E87FA0' },
  half: [
    '.OO....',
    '.OpO...',
    '.OpO...',
    '.OmmOOO',
    'Ohhhhhh',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmn',
    'Ommmmmm',
    'Okmmmmm',
    '.Okkkkk',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 5,
  mouthY: 8,
  eye: '#4A2A3A',
  line: '#8A5A6E',
  keep: 'pn',
}

// 13) Ejderha: boynuzlar, sırt çıkıntısı, krem burun
const EJDERHA: Spec = {
  title: 'Dragon',
  palette: { O: '#143D2B', h: '#7FD08B', m: '#3FA85F', k: '#2A7A45', y: '#F2D16B', w: '#E8F5D0' },
  half: [
    '.y.....',
    '.Oy...y',
    '.OmOOOO',
    '.Ohhhhh',
    'Ohmmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Okmwwww',
    'Ommwwww',
    '.Okkkkk',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 5,
  mouthY: 8,
  eye: '#FFD54A',
  line: '#143D2B',
  errEye: '#FFFFFF',
  keep: 'yw',
}

// 14) Balkabağı: sap, yan dilimler
const BALKABAGI: Spec = {
  title: 'Pumpkin',
  palette: { O: '#5A2D0C', h: '#F59A3B', m: '#E67E22', k: '#B85C14', g: '#4C8C3A' },
  half: [
    '.....gg',
    '....Ogg',
    '.OOhhhh',
    'Ohhmmmm',
    'Ohmmmmm',
    'Okmmmmm',
    'Okmmmmm',
    'Okmmmmm',
    'Okmmmmm',
    'Okkmmmm',
    '.Okkmmm',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 4,
  mouthY: 7,
  eye: '#3A1A06',
  line: '#3A1A06',
  errEye: '#FFFFFF',
  keep: 'g',
}

// 15) Uzaylı: iri baş, büyük koyu gözler, sivri çene
const UZAYLI: Spec = {
  title: 'Alien',
  palette: { O: '#1F3D1F', h: '#9BE08F', m: '#6CC26A', k: '#4A9A4E', s: '#142014' },
  half: [
    '...OOOO',
    '..Ohhhh',
    '.Ohhmmm',
    '.Ommmmm',
    'Osssssm',
    'Osssssm',
    '.Osssmm',
    '.Ommmmm',
    '..Okmmm',
    '..Okmmm',
    '...Okkk',
    '....OOO',
  ],
  eyeX: 3,
  eyeY: 4,
  mouthY: 7,
  eye: '#B6FF9A',
  line: '#1F3D1F',
  keep: 's',
}

// 16) Jöle: alçak, yarı saydam görünümlü damla
const JOLE: Spec = {
  title: 'Slime',
  palette: { O: '#1D5C6B', h: '#8EF0E0', m: '#3CCDB8', k: '#25A394' },
  half: [
    '.......',
    '.......',
    '....OOO',
    '..OOhhh',
    '.Ohhmmm',
    '.Ommmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Okmmmmm',
    'Okkkkkk',
    '.OOOOOO',
  ],
  eyeX: 3,
  eyeY: 5,
  mouthY: 8,
  eye: '#0F3D44',
  line: '#16707F',
}

// 17) Mantar: beyaz benekli kırmızı şapka, yüz gövdede
const MANTAR: Spec = {
  title: 'Mushroom',
  palette: { O: '#4A1F1F', h: '#F25A5A', m: '#D63A3A', k: '#A12626', w: '#FFF8E8', f: '#F4E4C8', s: '#D8C2A0' },
  half: [
    '...OOOO',
    '..Ohhhh',
    '.Ohwwmm',
    'Ohhmmmw',
    'Ommmmmm',
    'Okkkkkk',
    '.Offfff',
    '.Offfff',
    '.Offfff',
    '.Offfff',
    '.Offsss',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 6,
  mouthY: 9,
  eye: '#3A2418',
  line: '#8A5A3A',
  keep: 'wfs',
}

// 18) Şövalye: çelik miğfer, koyu siperlik, kırmızı tüy
const SOVALYE: Spec = {
  title: 'Knight',
  palette: { O: '#2B2F38', h: '#D5DAE3', m: '#A9B1BF', k: '#7C8596', s: '#1A1D24', r: '#E5484D' },
  half: [
    '.....rr',
    '....Orr',
    '..OOhhh',
    '.Ohhmmm',
    'Ohmmmmm',
    'Omsssss',
    'Omsssss',
    'Omsssss',
    'Ommmmmm',
    'Okmmmmm',
    '.Okkkkk',
    '..OOOOO',
  ],
  eyeX: 3,
  eyeY: 5,
  mouthY: 8,
  eye: '#FFD166',
  line: '#2B2F38',
  keep: 'rs',
}

// 19) Ahtapot: kubbe baş, dalgalı kollar
const AHTAPOT: Spec = {
  title: 'Octopus',
  palette: { O: '#3E2A5A', h: '#C9A6F0', m: '#A06BE0', k: '#7B47B8' },
  half: [
    '...OOOO',
    '..Ohhhh',
    '.Ohhmmm',
    'Ohmmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Ommmmmm',
    'Okmmmmm',
    'Okkkkkk',
    'OO.OO.O',
  ],
  eyeX: 3,
  eyeY: 4,
  mouthY: 7,
  eye: '#2B1A44',
  line: '#4A2F78',
  errEye: '#FFFFFF',
}

// 20) Kaktüs: dilimli fıçı kaktüs, tepede çiçek, saksı
const KAKTUS: Spec = {
  title: 'Cactus',
  palette: { O: '#1F4D2B', h: '#7BC47F', m: '#4FA35A', k: '#35803F', p: '#F5A3C7', c: '#C46A3A', d: '#8E4A28' },
  half: [
    '.....pp',
    '....Opp',
    '..OOOmh',
    '.Ohhmmk',
    'Ohmmmmk',
    'Ommmmmk',
    'Ommmmmk',
    'Ommmmmk',
    'Ommmmmk',
    'Okmmmmk',
    '.Occccc',
    '.Oddddd',
  ],
  eyeX: 3,
  eyeY: 4,
  mouthY: 7,
  eye: '#10331A',
  line: '#1F4D2B',
  errEye: '#FFFFFF',
  keep: 'pcd',
}

const CHARACTERS: Record<string, Spec> = {
  bit: BIT,
  ghost: GOLGE,
  astronaut: ASTRONOT,
  wizard: BUYUCU,
  cloud: BULUT,
  cat: KEDI,
  fox: TILKI,
  frog: KURBAGA,
  penguin: PENGUEN,
  owl: BAYKUS,
  panda: PANDA,
  bunny: TAVSAN,
  dragon: EJDERHA,
  pumpkin: BALKABAGI,
  alien: UZAYLI,
  slime: JOLE,
  mushroom: MANTAR,
  knight: SOVALYE,
  octopus: AHTAPOT,
  cactus: KAKTUS,
}
const ORDER = [
  'bit', 'ghost', 'astronaut', 'wizard', 'cloud',
  'cat', 'fox', 'frog', 'penguin', 'owl',
  'panda', 'bunny', 'dragon', 'pumpkin', 'alien',
  'slime', 'mushroom', 'knight', 'octopus', 'cactus',
]

function pick(id: string): Spec {
  return CHARACTERS[id] ?? BIT
}

// Renk temaları: gövde renklerinin tonunu/doygunluğunu değiştirir, açıklığı korur
// (kontrast ve gölge düzeni bozulmaz). Göz, ağız ve Spec.keep harfleri sabit kalır.
type Theme = { title: string; hue?: number; sat?: number }

const THEMES: Record<string, Theme> = {
  classic: { title: 'Classic' },
  mono: { title: 'Mono', sat: 0 },
  ember: { title: 'Ember', hue: 22, sat: 0.65 },
  forest: { title: 'Forest', hue: 140, sat: 0.4 },
  ocean: { title: 'Ocean', hue: 205, sat: 0.55 },
  rose: { title: 'Rose', hue: 335, sat: 0.5 },
}
const THEME_ORDER = ['classic', 'mono', 'ember', 'forest', 'ocean', 'rose']

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) return [0, 0, l]

  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4

  return [(h * 60 + 360) % 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

function themed(spec: Spec, themeId: string): Spec {
  const t = THEMES[themeId]
  if (!t || (t.hue === undefined && t.sat === undefined)) return spec

  const palette: Record<string, string> = {}
  for (const [key, color] of Object.entries(spec.palette)) {
    if (spec.keep?.includes(key)) {
      palette[key] = color
    } else {
      const [h, s, l] = hexToHsl(color)
      palette[key] = hslToHex(t.hue ?? h, t.sat ?? s, l)
    }
  }

  return { ...spec, palette }
}

function mirror(row: string): string {
  return row + row.split('').reverse().join('')
}

// Alt ajan giriş/çıkış kayması: girerken soldan, çıkarken sağa 3 karede kayar.
// since: göründüğünden beri geçen kare; left: kalıp kalkmasına kalan kare (bitmediyse undefined)
const SLIDE_TICKS = 3
const SLIDE_STEP = 3

function miniSlide(since: number, left: number | undefined): number {
  if (left !== undefined && left < SLIDE_TICKS) return SLIDE_STEP * (SLIDE_TICKS - Math.max(0, left))

  return -SLIDE_STEP * Math.max(0, SLIDE_TICKS - since)
}

type Px = string | undefined

// Çalışırken karakterin yanında beliren aksesuarlar. '.' saydam; her kare bir satır dizisi.
// Renkler açık ve koyu zeminde okunsun diye koyu çerçeve (O) ile çevrili.
type PropKind = 'book' | 'pad' | 'term' | 'lens' | 'globe'

const PROP_COLORS: Record<string, string> = {
  O: '#3B4252',
  p: '#F4F1EA',
  i: '#6B7C93',
  c: '#C0563B',
  a: '#F6B93B',
  k: '#1E2733',
  G: '#4FB286',
  w: '#FFFFFF',
  t: '#2FA3B0',
  l: '#BFE9F0',
  b: '#3E8EDE',
  g: '#4FB286',
}

// step: kaç karede bir sonraki kareye geçilir
const PROPS: Record<PropKind, { step: number; frames: string[][] }> = {
  // Read: sayfa çeviren kitap
  book: {
    step: 2,
    frames: [
      ['OOOOOOO', 'OiiOiiO', 'OppOppO', 'OiiOipO', 'OppOppO', 'ccccccc'],
      ['OOOOOOO', 'OiiOppO', 'OppOiiO', 'OiiOppO', 'OppOiiO', 'ccccccc'],
    ],
  },
  // Edit/Write: kalemle yazılan not defteri
  pad: {
    step: 1,
    frames: [
      ['OOOOOOO', 'OiiappO', 'OpppppO', 'OpppppO', 'OpppppO', 'OOOOOOO'],
      ['OOOOOOO', 'OiiiiaO', 'OpppppO', 'OpppppO', 'OpppppO', 'OOOOOOO'],
      ['OOOOOOO', 'OiiiiiO', 'OiapppO', 'OpppppO', 'OpppppO', 'OOOOOOO'],
      ['OOOOOOO', 'OiiiiiO', 'OiiiapO', 'OpppppO', 'OpppppO', 'OOOOOOO'],
    ],
  },
  // Bash/PowerShell: imleci yanıp sönen terminal
  term: {
    step: 1,
    frames: [
      ['OOOOOOOO', 'OGkGGGkO', 'OGkGGkkO', 'OGkwkkkO', 'OOOOOOOO'],
      ['OOOOOOOO', 'OGkGGGkO', 'OGkGGkkO', 'OGkkkkkO', 'OOOOOOOO'],
      ['OOOOOOOO', 'OGkGGGkO', 'OGkGGGGO', 'OGkwkkkO', 'OOOOOOOO'],
    ],
  },
  // Grep/Glob/arama: camında ışık gezinen büyüteç
  lens: {
    step: 1,
    frames: [
      ['.ttttt..', 'tlwllt..', 'tllllt..', 'tllllt..', '.tttttc.', '.......c'],
      ['.ttttt..', 'tllllt..', 'tllwlt..', 'tllllt..', '.tttttc.', '.......c'],
      ['.ttttt..', 'tllllt..', 'tllllt..', 'tlllwt..', '.tttttc.', '.......c'],
    ],
  },
  // WebFetch/WebSearch/tarayıcı: dönen küre
  globe: {
    step: 1,
    frames: [
      ['..bbbb..', '.bggbbb.', 'bbgggbbb', 'bbbggbbb', '.bbbbgb.', '..bbbb..'],
      ['..bbbb..', '.bbggbb.', 'bbbgggbb', 'bbbbggbb', '.bbbbbg.', '..bbbb..'],
      ['..bbbb..', '.bbbggb.', 'bbbbgggb', 'bbbbbggb', '.gbbbbb.', '..bbbb..'],
    ],
  },
}

// Araç adından aksesuar seçer; tanınmayan araçta aksesuar yok (yazma noktaları kalır)
function propFor(tool: string): PropKind | undefined {
  const t = tool.toLowerCase()

  if (/web|browser|navigate|fetch|chrome|playwright/.test(t)) return 'globe'
  if (/grep|glob|search|explore|find|query/.test(t)) return 'lens'
  if (/bash|powershell|shell/.test(t)) return 'term'
  if (/edit|write|notebook|replace|insert/.test(t)) return 'pad'
  if (/read|view/.test(t)) return 'book'

  return undefined
}

// Boşta davranış kipi; hepsi kare sayısının saf fonksiyonu, ek durum tutulmaz
type Pose = {
  wx: number
  look: -1 | 0 | 1
  yawn: boolean
  hop: boolean
  asleep: boolean
  walking: boolean
}

// walk: yürüyebileceği en fazla sütun; dar tuvalde 0, yani yerinde durur
function poseFor(m: Mode, idleTicks: number, walk: number): Pose {
  const still: Pose = { wx: 0, look: 0, yawn: false, hop: false, asleep: false, walking: false }

  if (m !== 'idle') return still
  if (idleTicks >= SLEEP_AFTER) return { ...still, asleep: true }

  const t = idleTicks % CYCLE

  // 0-17 dur, 18-25 etrafa bak, 26-37 sağa yürü, 38-49 dur+esne, 50-61 geri yürü,
  // 70-73 tekrar bak, 80 zıpla, kalanı dur
  if (t >= 18 && t < 22) return { ...still, look: -1 }
  if (t >= 22 && t < 26) return { ...still, look: 1 }
  if (t >= 26 && t < 38) return { ...still, wx: Math.min(walk, t - 25), look: 1, walking: walk > 0 }
  if (t >= 38 && t < 50) return { ...still, wx: walk, yawn: t >= 42 && t < 46 }
  if (t >= 50 && t < 62) return { ...still, wx: Math.max(0, walk - (t - 49)), look: -1, walking: walk > 0 }
  if (t >= 70 && t < 74) return { ...still, look: t < 72 ? -1 : 1 }
  if (t === 80) return { ...still, hop: true }

  return still
}

// ---BAĞ-START--- (şapkalar)
// Şapka 2 piksel yüksekliğinde: baş boşluğu (2 piksel) tuvalin üstünden taşmasın.
// Satırlar '.' saydam; rows[0] üst, rows[1] kafaya oturan satır.
type Hat = { title: string; need: number; x: number; rows: string[] }

const HAT_COLORS: Record<string, string> = {
  r: '#D9534F',
  R: '#9E2F2C',
  b: '#4A78C8',
  B: '#2F4F8F',
  n: '#C9B26B',
  N: '#8E7A3E',
  y: '#F6C945',
  k: '#34343E',
  h: '#FFE066',
}

// need: açılması için gereken bağ puanı. x: şapkanın sol sütunu (sprite koordinatı; kafa
// merkezi 6/7 arası olduğundan 6 genişlik x=4, 8 genişlik x=3)
const HATS: Record<string, Hat> = {
  beanie: { title: 'Beanie', need: 10, x: 4, rows: ['.rrrr.', 'RRRRRR'] },
  cap: { title: 'Cap', need: 25, x: 4, rows: ['.bbbb.', 'bbbbBB'] },
  bucket: { title: 'Bucket Hat', need: 50, x: 3, rows: ['..nnnn..', 'NNNNNNNN'] },
  crown: { title: 'Crown', need: 100, x: 4, rows: ['y.yy.y', 'yyyyyy'] },
  tophat: { title: 'Top Hat', need: 200, x: 3, rows: ['..kkkk..', 'kkrrrrkk'] },
  halo: { title: 'Halo', need: 400, x: 4, rows: ['.hhhh.', '......'] },
}
const HAT_ORDER = ['beanie', 'cap', 'bucket', 'crown', 'tophat', 'halo']

// Kendi şapkası/miğferi olan karakterler: ikinci şapka çakışır (Spec'te id yok, başlıkla eşlenir)
const HAT_SKIP = new Set(['Code Wizard', 'Knight'])
// Şapkanın oturacağı kafa tepesi sütunları; kulak/boynuz kenarlarda kaldığı için merkez bakılır
const CROWN_FROM = 4
const CROWN_TO = 10

// Şapka pikselleri [x, y, renk] sprite koordinatında (dy eklenmeden). Şapka merkez
// sütunlardaki ilk dolu satırın üstüne oturur (anten/sap varsa onun üstüne); üst kenar
// tuvalin dışına çıkacaksa aşağı kayar ve yalnız boş piksele çizilir (sprite öndedir).
// Şapka hangi sprite'a oturuyor: ana (14 geniş) ya da alt ajan boyu (10x10, 8 geniş)
type HatTarget = { title: string; half: string[]; mini?: boolean }

function crownRow({ half, mini }: HatTarget): number {
  const [from, to] = mini ? [2, 6] : [CROWN_FROM, CROWN_TO]
  let crown = half.length
  for (let r = 0; r < half.length && crown === half.length; r += 1) {
    const full = mirror(half[r] ?? '')
    for (let c = from; c < to; c += 1) {
      if (full.charAt(c) !== '.') {
        crown = r
        break
      }
    }
  }

  return crown
}

// Şapkanın tamamı görünsün diye sprite'ın inebileceği en az dy (baş boşluğu şapka yüksekliğinden
// azsa zıplama/nefes dy'yi düşürüp şapkayı yarım keserdi)
function hatMinDy(spec: HatTarget, hatId: string): number {
  const hat = HATS[hatId]
  if (!hat || HAT_SKIP.has(spec.title)) return 0

  return Math.max(0, hat.rows.length - crownRow(spec))
}

function hatPixels(spec: HatTarget, hatId: string, dy: number): Array<[number, number, string]> {
  const hat = HATS[hatId]
  if (!hat || HAT_SKIP.has(spec.title)) return []

  const crown = crownRow(spec)
  const top = Math.max(-dy, crown - hat.rows.length)
  // Alt ajan sprite'ı 8 geniş: şapka ortalanır
  const x = spec.mini ? (8 - (hat.rows[0]?.length ?? 0)) / 2 : hat.x
  const out: Array<[number, number, string]> = []
  hat.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      const color = HAT_COLORS[row.charAt(c)]
      if (color) out.push([x + c, top + r, color])
    }
  })

  return out
}
// ---BAĞ-END---

// tired: bağlam dolmak üzere; yarı kapalı gözler ve ter damlası
// hat: seçili şapka id'si (yok = şapkasız)
type ComposeOpts = { cw: number; idleTicks: number; tool: string; tired: boolean; long?: boolean; hat?: string }

// Z harfi: uyku parçacığı (3x3)
const Z_PIXELS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [2, 0],
  [1, 1],
  [0, 2],
  [1, 2],
  [2, 2],
]

// ---HAREKET-START---
// Karaktere özgü boşta hareketi. CYCLE içinde t = 86..97'de (poseFor'un yürüyüş/esneme/bakınma/
// zıplama pencerelerinden sonra, uyku anı 62'den uzak) 6 kare x 2 tik oynar; yürüme, esneme ve
// uykuyla çakışmaz. Yalnız sprite'ı yukarı kaydırır (lift), bakış yönünü değiştirir (look) ve
// boş piksellere parçacık düşer (dots); half dizileri ve yüz pikselleri değişmez.
const HAREKET_BASLA = 86
const HAREKET_TIK = 2
const HAREKET_KARE = 6

type HareketNokta = readonly [number, number, string]
// Renk: tek harf = karakterin (temalı) palet harfi, aksi halde hex
type Hareket = {
  lift?: readonly number[]
  look?: readonly (-1 | 0 | 1)[]
  dots?: readonly (readonly HareketNokta[])[]
}

const HK_GRI = '#9AA3AD'
const HK_ACIK = '#C9D1D9'
const HK_YAGMUR = '#6CB4EE'
const HK_BALON = '#9FD8F5'
const HK_YESIL = '#7CFF9B'
const HK_PEMBE = '#F28BB0'
const HK_BAMBU = '#5DB04A'
const HK_SPOR = '#E8DCC0'

// Dikey çizgi: x sütununda y0..y1
const hkCol = (x: number, y0: number, y1: number, c: string): HareketNokta[] =>
  Array.from({ length: Math.max(0, y1 - y0 + 1) }, (_, i) => [x, y0 + i, c] as const)
// Artı (parıltı): merkez c, kollar a
const hkPlus = (x: number, y: number, c: string, a: string): HareketNokta[] => [
  [x, y, c],
  [x - 1, y, a],
  [x + 1, y, a],
  [x, y - 1, a],
  [x, y + 1, a],
]

const HAREKET_VARSAYILAN: Hareket = {
  dots: [[], [[16, 4, WHITE]], hkPlus(16, 4, WHITE, WHITE), hkPlus(16, 4, WHITE, WHITE), [[16, 4, WHITE]], []],
}

const QUIRKS: Record<string, Hareket> = {
  // Anten yanıp söner
  bit: {
    dots: [
      [],
      [[7, 1, AMBER], [8, 1, AMBER]],
      [[7, 0, AMBER], [8, 0, AMBER]],
      [[6, 0, WHITE], [9, 0, WHITE]],
      [[5, 1, WHITE], [10, 1, WHITE]],
      [],
    ],
  },
  // Süzülür
  ghost: { lift: [0, 1, 2, 2, 1, 0] },
  // Süzülür, yıldız parıldar
  astronaut: {
    lift: [0, 1, 1, 2, 1, 0],
    dots: [[], [[16, 3, WHITE]], [[16, 3, WHITE], [17, 6, WHITE]], [[17, 6, WHITE]], [[15, 9, WHITE]], []],
  },
  // Şapka ucunda sihir kıvılcımı
  wizard: {
    dots: [
      [],
      [[10, 2, AMBER]],
      [[10, 2, AMBER], [4, 3, WHITE]],
      [[4, 3, WHITE], [11, 1, AMBER]],
      [[11, 1, AMBER], [5, 1, WHITE]],
      [],
    ],
  },
  // Yanlardan yağmur damlası
  cloud: {
    dots: [
      [[0, 6, HK_YAGMUR]],
      [[0, 8, HK_YAGMUR], [15, 5, HK_YAGMUR]],
      [[0, 10, HK_YAGMUR], [15, 7, HK_YAGMUR]],
      [[0, 12, HK_YAGMUR], [15, 9, HK_YAGMUR]],
      [[15, 11, HK_YAGMUR]],
      [[15, 13, HK_YAGMUR]],
    ],
  },
  // Kuyruk sallar
  cat: {
    dots: [
      [[15, 11, 'k'], [16, 11, 'k'], [17, 11, 'k']],
      [[15, 11, 'k'], [16, 10, 'k'], [16, 9, 'k']],
      [[15, 11, 'k'], [16, 11, 'k'], [17, 11, 'k']],
      [[15, 11, 'k'], [16, 12, 'k'], [17, 12, 'k']],
      [[15, 11, 'k'], [16, 11, 'k'], [17, 11, 'k']],
      [[15, 11, 'k'], [16, 10, 'k'], [16, 9, 'k']],
    ],
  },
  // Kabarık kuyruk, beyaz uçlu
  fox: {
    dots: [
      [[15, 10, 'k'], [16, 10, 'k'], [17, 10, 'w']],
      [[15, 10, 'k'], [16, 9, 'k'], [17, 8, 'w']],
      [[15, 10, 'k'], [16, 10, 'k'], [17, 10, 'w']],
      [[15, 10, 'k'], [16, 11, 'k'], [17, 12, 'w']],
      [[15, 10, 'k'], [16, 10, 'k'], [17, 10, 'w']],
      [[15, 10, 'k'], [16, 9, 'k'], [17, 8, 'w']],
    ],
  },
  // Zıplar, sinek uçar
  frog: {
    lift: [0, 1, 2, 2, 1, 0],
    dots: [[], [[16, 6, WHITE]], [[17, 4, WHITE]], [[16, 3, WHITE]], [[17, 5, WHITE]], []],
  },
  // Kanat çırpar
  penguin: {
    lift: [0, 1, 0, 1, 0, 0],
    dots: [
      [],
      [[1, 9, 'w'], [14, 9, 'w']],
      [[1, 8, 'w'], [0, 7, 'w'], [14, 8, 'w'], [15, 7, 'w']],
      [[1, 9, 'w'], [14, 9, 'w']],
      [[1, 8, 'w'], [0, 7, 'w'], [14, 8, 'w'], [15, 7, 'w']],
      [],
    ],
  },
  // Başını çevirir (bakış kayar)
  owl: { look: [-1, -1, 1, 1, -1, 0] },
  // Bambu çiğner
  panda: {
    lift: [0, 1, 0, 1, 0, 1],
    dots: [
      [],
      hkCol(15, 4, 12, HK_BAMBU),
      hkCol(15, 6, 12, HK_BAMBU),
      hkCol(15, 8, 12, HK_BAMBU),
      hkCol(15, 10, 12, HK_BAMBU),
      [],
    ],
  },
  // Çift zıplama
  bunny: { lift: [0, 2, 0, 2, 0, 0] },
  // Burundan küçük duman
  dragon: {
    dots: [
      [],
      [[15, 8, HK_GRI]],
      [[15, 7, HK_GRI], [16, 6, HK_ACIK]],
      [[16, 5, HK_GRI], [17, 4, HK_ACIK]],
      [[17, 3, HK_ACIK]],
      [],
    ],
  },
  // Yüzünün yanında parıltı
  pumpkin: {
    dots: [[], [[16, 6, WHITE]], hkPlus(16, 6, WHITE, AMBER), hkPlus(16, 6, WHITE, AMBER), [[16, 6, AMBER]], []],
  },
  // Anten sinyali
  alien: {
    lift: [0, 1, 1, 0, 0, 0],
    dots: [
      [],
      [[7, 1, HK_YESIL], [8, 1, HK_YESIL]],
      [[6, 0, HK_YESIL], [9, 0, HK_YESIL]],
      [[5, 1, HK_YESIL], [10, 1, HK_YESIL]],
      [],
      [],
    ],
  },
  // Sıçrar, inince sıçrama damlası
  slime: {
    lift: [0, 1, 2, 2, 1, 0],
    dots: [[], [], [], [], [[0, 13, 'h'], [15, 13, 'h']], [[0, 13, 'h'], [15, 13, 'h']]],
  },
  // Başından spor saçar
  mushroom: {
    dots: [
      [],
      [[5, 1, HK_SPOR]],
      [[5, 0, HK_SPOR], [9, 1, HK_SPOR]],
      [[9, 0, HK_SPOR], [6, 1, HK_SPOR]],
      [[11, 0, HK_SPOR], [4, 0, HK_SPOR]],
      [],
    ],
  },
  // Kılıcını kaldırır
  knight: {
    dots: [
      [],
      hkCol(15, 10, 11, HK_ACIK),
      hkCol(15, 8, 11, HK_ACIK),
      [...hkCol(15, 6, 11, HK_ACIK), [15, 5, WHITE]],
      hkCol(15, 9, 11, HK_ACIK),
      [],
    ],
  },
  // Kabarcık çıkarır
  octopus: {
    lift: [0, 1, 0, 1, 0, 0],
    dots: [
      [],
      [[15, 10, HK_BALON]],
      [[15, 9, HK_BALON], [16, 7, HK_BALON]],
      [[16, 6, HK_BALON], [15, 5, HK_BALON]],
      [[15, 4, HK_BALON]],
      [],
    ],
  },
  // Tepesinde çiçek açar
  cactus: {
    dots: [
      [],
      [[7, 1, HK_PEMBE], [8, 1, HK_PEMBE]],
      [[7, 1, HK_PEMBE], [8, 1, HK_PEMBE], [7, 0, HK_PEMBE], [8, 0, AMBER]],
      [[7, 1, HK_PEMBE], [8, 1, HK_PEMBE], [7, 0, HK_PEMBE], [8, 0, AMBER]],
      [[7, 1, HK_PEMBE], [8, 1, HK_PEMBE]],
      [],
    ],
  },
}

// Pencere dışında -1; yalnız boşta, uyumuyorken
function hareketKare(m: Mode, idleTicks: number): number {
  if (m !== 'idle' || idleTicks >= SLEEP_AFTER) return -1

  const t = idleTicks % CYCLE
  if (t < HAREKET_BASLA || t >= HAREKET_BASLA + HAREKET_TIK * HAREKET_KARE) return -1

  return Math.floor((t - HAREKET_BASLA) / HAREKET_TIK)
}

// compose yalnız Spec alır (tema palet verir); karakteri başlığından bulur
function hareketOf(spec: Spec): Hareket {
  const id = Object.keys(CHARACTERS).find(key => CHARACTERS[key]?.title === spec.title)

  return (id !== undefined ? QUIRKS[id] : undefined) ?? HAREKET_VARSAYILAN
}

// Bakış yönünü pencerede değiştirir; poseFor'un kendi look alanlarıyla çakışmaz
function hareketPose(pose: Pose, spec: Spec, m: Mode, idleTicks: number): Pose {
  const k = hareketKare(m, idleTicks)
  const look = k < 0 ? undefined : hareketOf(spec).look?.[k]

  return look === undefined ? pose : { ...pose, look }
}

function hareketLift(spec: Spec, m: Mode, idleTicks: number): number {
  const k = hareketKare(m, idleTicks)

  return k < 0 ? 0 : (hareketOf(spec).lift?.[k] ?? 0)
}

// spark yalnız boş piksele yazar; sprite her zaman öndedir
function hareketCiz(spec: Spec, m: Mode, idleTicks: number, spark: (x: number, y: number, c: string) => void): void {
  const k = hareketKare(m, idleTicks)
  if (k < 0) return

  for (const [x, y, c] of hareketOf(spec).dots?.[k] ?? []) {
    const color = c.length === 1 ? spec.palette[c] : c
    if (color) spark(x, y, color)
  }
}
// ---HAREKET-END---

function compose(spec: Spec, m: Mode, f: number, o: ComposeOpts): Px[][] {
  const { cw } = o
  const canvas: Px[][] = Array.from({ length: H }, () => Array<Px>(cw).fill(undefined))
  const pose = hareketPose(poseFor(m, o.idleTicks, Math.max(0, cw - W_NARROW)), spec, m, o.idleTicks) // HAREKET

  // Hareket: boşta nefes (1 px), yürürken adım sekmesi, uykuda yavaş nefes, çalışırken
  // hızlı sekme, bitince zıplama, hatada titreme
  let dy = 2
  if (m === 'idle') {
    if (pose.hop) dy = 0
    else if (pose.asleep) dy = 2 - (f % 12 < 6 ? 0 : 1)
    else if (pose.walking) dy = 2 - (f % 2)
    else dy = 2 - (f % 8 < 4 ? 0 : 1)
  } else if (m === 'work') {
    dy = 2 - (f % 2)
  } else if (m === 'ok') {
    dy = 1 - (f % 2)
  }
  dy = Math.max(0, dy - hareketLift(spec, m, o.idleTicks)) // HAREKET
  if (o.hat) dy = Math.max(dy, hatMinDy(spec, o.hat)) // BAĞ: şapka tuvalin üstünden kesilmesin
  const dx = m === 'err' ? (f % 2 === 0 ? 0 : 2) : 1 + pose.wx

  const put = (x: number, y: number, c: Px) => {
    const row = canvas[y]
    if (row && c && x >= 0 && x < cw) row[x] = c
  }
  const px = (x: number, y: number, c: Px) => put(dx + x, dy + y, c)
  const spark = (x: number, y: number, c: string) => {
    if (canvas[y]?.[x] === undefined) put(x, y, c)
  }

  spec.half.forEach((half, r) => {
    const full = mirror(half)
    for (let c = 0; c < full.length; c += 1) {
      px(c, r, spec.palette[full.charAt(c)])
    }
  })

  const ey = spec.eyeY
  const my = spec.mouthY
  const blink = pose.asleep || (m === 'idle' && !pose.walking && f % 8 === 7)

  for (const [ex, isRight] of [
    [spec.eyeX, false],
    [SW - 2 - spec.eyeX, true],
  ] as const) {
    if (m === 'idle' && blink) {
      // Göz kırpma / uyku: kapalı göz, tek çizgi
      px(ex, ey + 1, spec.line)
      px(ex + 1, ey + 1, spec.line)
    } else if (o.tired && (m === 'idle' || m === 'work')) {
      // Yorgun göz: üst satır göz kapağı, altta yarım göz
      px(ex, ey, spec.line)
      px(ex + 1, ey, spec.line)
      px(ex, ey + 1, spec.eye)
      px(ex + 1, ey + 1, spec.eye)
    } else if (m === 'idle' || m === 'work') {
      for (const [gx, gy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        px(ex + gx, ey + gy, spec.eye)
      }
      // Parlama pikseli: çalışırken sağa sola, boşta baktığı yöne kayar
      const glint = m === 'work' ? f % 2 : pose.look > 0 ? 1 : 0
      px(ex + glint, ey, WHITE)
    } else if (m === 'ok' && spec.narrow) {
      // Dar yüz: iki piksellik eğik çizgi, sol göz / sağ göz \
      px(ex, isRight ? ey : ey + 1, spec.eye)
      px(ex + 1, isRight ? ey + 1 : ey, spec.eye)
    } else if (m === 'ok') {
      // Mutlu göz: ^ yayı
      px(ex - 1, ey + 1, spec.eye)
      px(ex, ey, spec.eye)
      px(ex + 1, ey, spec.eye)
      px(ex + 2, ey + 1, spec.eye)
    } else if (spec.narrow) {
      // Dar yüz: 2x2 kırmızı blok
      for (const [gx, gy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        px(ex + gx, ey + gy, spec.errEye ?? RED)
      }
    } else {
      // Hata: X göz 3 piksel geniş; iki X birbirine değmesin diye dışa doğru açılır
      const x0 = isRight ? ex : ex - 1
      for (const [gx, gy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]] as const) {
        px(x0 + gx, ey + gy, spec.errEye ?? RED)
      }
    }
  }

  if (m === 'idle') {
    if (pose.yawn) {
      // Esneme: 2x2 açık ağız
      for (const [gx, gy] of [[6, 0], [7, 0], [6, 1], [7, 1]] as const) px(gx, my + gy, spec.line)
    } else {
      px(6, my, spec.line)
      px(7, my, spec.line)
    }
  } else if (m === 'work') {
    // Konuşur gibi: ağız 2 ile 4 piksel arasında açılıp kapanır
    const cols = f % 2 === 0 ? [6, 7] : [5, 6, 7, 8]
    for (const c of cols) px(c, my, spec.line)
  } else if (m === 'ok') {
    px(5, my, spec.line)
    px(6, my + 1, spec.line)
    px(7, my + 1, spec.line)
    px(8, my, spec.line)
  } else {
    px(5, my + 1, RED)
    px(6, my, RED)
    px(7, my, RED)
    px(8, my + 1, RED)
  }

  // ---BAĞ-START--- (şapka kancası)
  if (o.hat) {
    for (const [hx, hy, hc] of hatPixels(spec, o.hat, dy)) {
      if (canvas[dy + hy]?.[dx + hx] === undefined) px(hx, hy, hc)
    }
  }
  // ---BAĞ-END---

  // Parçacıklar yalnız boş piksele düşer; sprite her zaman öndedir
  // Dar tuvalde sağ kenara sığacak şekilde geri çekilir; sprite'ın boş pikselleri kalır
  const sideX = Math.min(15, cw - 3)

  if (pose.asleep) {
    // İki Z, yarım döngü arayla yükselir
    for (const phase of [f % 12, (f + 6) % 12]) {
      const zx = Math.min(16, cw - 4) + (phase % 4 < 2 ? 0 : 1)
      const zy = 7 - Math.floor(phase / 2)
      for (const [gx, gy] of Z_PIXELS) spark(zx + gx, zy + gy, ZZZ)
    }
  } else if (m === 'work') {
    for (let i = 0; i < 3; i += 1) spark(sideX + i, 0, i === f % 3 ? AMBER : '#4A4440')
  } else if (m === 'ok') {
    spark(0, 3 + (f % 3), AMBER)
    spark(15, 5 - (f % 3), AMBER)
    spark(f % 2 === 0 ? 3 : 12, 0, WHITE)
    // İSTATİSTİK: uzun işten sonra ekstra yıldızlar (üst iki satır baş boşluğudur)
    if (o.long) {
      spark(15, f % 2, WHITE)
      spark(0, 1 + (f % 2), WHITE)
      spark(f % 2 === 0 ? 8 : 5, 1, AMBER)
    }
  } else if (m === 'err') {
    spark(15, 3 + (f % 4), SWEAT)
  }

  if (o.tired && (m === 'idle' || m === 'work')) spark(sideX, 3 + (f % 4), SWEAT)

  hareketCiz(spec, m, o.idleTicks, spark) // HAREKET

  // Aksesuar: yalnız geniş tuvalde, çalışırken ve araç tanınıyorsa; zemine oturur
  const kind = m === 'work' && cw >= W_WIDE ? propFor(o.tool) : undefined
  if (kind) {
    const prop = PROPS[kind]
    const rows = prop.frames[Math.floor(f / prop.step) % prop.frames.length] ?? []
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        const color = PROP_COLORS[row.charAt(c)]
        if (color) put(PROP_X + c, H - rows.length + r, color)
      }
    })
  }

  return canvas
}

type Run = { text: string; color?: string; bg?: string }

// İki piksel satırını tek metin satırına çevirir; aynı stildeki hücreleri birleştirir.
function rowRuns(top: Px[], bottom: Px[], width: number): Run[] {
  const runs: Run[] = []

  for (let c = 0; c < width; c += 1) {
    const t = top[c]
    const b = bottom[c]
    let cell: Run

    if (t && b) {
      cell = t === b ? { text: '█', color: t } : { text: '▀', color: t, bg: b }
    } else if (t) {
      cell = { text: '▀', color: t }
    } else if (b) {
      cell = { text: '▄', color: b }
    } else {
      cell = { text: ' ' }
    }

    const prev = runs[runs.length - 1]

    if (prev && prev.color === cell.color && prev.bg === cell.bg) {
      prev.text += cell.text
    } else {
      runs.push(cell)
    }
  }

  return runs
}

// Alt ajanlar için 8x8 küçük sprite'lar (10x10 tuval). Gövde şekli karaktere göre;
// renkler ana karakterin paletinden gelir. Alt ajan türü hep aynı karakteri alır.
type Mini = { half: string[]; eyeY: number }

const MINI_BIT: Mini = {
  half: ['...a', '.OOO', 'Ohhh', 'Osss', 'Osss', 'Osss', 'Okkk', '.OOO'],
  eyeY: 4,
}

const MINIS: Record<string, Mini> = {
  bit: MINI_BIT,
  ghost: {
    half: ['.O..', 'OmOO', 'Ommm', 'Ommm', 'Ommm', 'Ommm', 'Okkk', 'O.OO'],
    eyeY: 3,
  },
  astronaut: {
    half: ['..OO', '.Ohh', 'Omss', 'Omss', 'Omss', '.Okk', 'bOmr', '.OOk'],
    eyeY: 3,
  },
  wizard: {
    half: ['...m', '..Om', '.Omm', 'Okkk', '.Off', '.Off', '.Obb', '..Ob'],
    eyeY: 4,
  },
  cloud: {
    half: ['..OO', '.Ohh', 'Ohhm', 'Ommm', 'Ommm', 'Ommm', 'Okmm', '.OOO'],
    eyeY: 4,
  },
  cat: { half: ['.O..', 'OpOO', 'Ommm', 'Ommm', 'Owww', 'Owww', 'Okkk', '.OOO'], eyeY: 3 },
  fox: { half: ['O...', 'OmO.', 'OmmO', 'Ommm', 'Owww', 'Owww', '.Okw', '..OO'], eyeY: 3 },
  frog: { half: ['.OO.', 'Ohhm', 'Ommm', 'Ommm', 'Owww', 'Owww', 'Okkk', '.OOO'], eyeY: 2 },
  penguin: { half: ['.OOO', 'Ommm', 'Owww', 'Owbb', 'Omww', 'Omww', 'Omww', '.bOO'], eyeY: 2 },
  owl: { half: ['O...', 'OmOO', 'Owww', 'Owbb', 'Ommm', 'Omwm', 'Okwk', '.OOO'], eyeY: 2 },
  panda: { half: ['OO..', 'OsO.', 'Ommm', 'Omsm', 'Ommm', 'Ommm', 'Okmk', '.OOO'], eyeY: 3 },
  bunny: { half: ['.O..', 'OpO.', 'OpO.', 'Ohhh', 'Ommm', 'Ommm', 'Okmm', '.OOO'], eyeY: 4 },
  dragon: { half: ['y...', 'OyO.', 'OmmO', 'Ommm', 'Ommw', 'Owww', 'Okkk', '.OOO'], eyeY: 3 },
  pumpkin: { half: ['...g', '..Og', '.Ohh', 'Ohmm', 'Ommm', 'Ommm', 'Okkm', '.OOO'], eyeY: 4 },
  alien: { half: ['.OOO', 'Ohhh', 'Ommm', 'Ossm', '.Omm', '.Okk', '..Ok', '..OO'], eyeY: 3 },
  slime: { half: ['....', '....', '..OO', '.Ohh', 'Ohmm', 'Ommm', 'Okkk', 'OOOO'], eyeY: 4 },
  mushroom: { half: ['..OO', '.Ohw', 'Ohmm', 'Okkk', '.Off', '.Off', '.Oss', '..OO'], eyeY: 4 },
  knight: { half: ['...r', '..Or', '.Ohh', 'Ohmm', 'Omss', 'Ommm', 'Okkk', '.OOO'], eyeY: 4 },
  octopus: { half: ['.OOO', 'Ohhh', 'Ommm', 'Ommm', 'Ommm', 'Okkk', 'Okkk', 'O.O.'], eyeY: 3 },
  cactus: { half: ['...p', '..Op', '.Ohh', 'Ohmm', 'Ommm', 'Ommk', 'Occc', '.Odd'], eyeY: 3 },
}

// ---ROL-START---
// Alt ajan türü -> sabit karakter. Anahtar: türün son parçası (agent-sdk-dev:x -> x), küçük harf.
// Aynı tür her oturumda aynı yüzü taşısın diye ilk görülme sırasına bağlı değil.
const ROLE_CHARS: Record<string, string> = {
  explore: 'owl',
  plan: 'wizard',
  'general-purpose': 'panda',
  'claude-code-guide': 'astronaut',
  'statusline-setup': 'bit',
  'web-dev-expert': 'cat',
  'db-architect': 'cloud',
  'devops-engineer': 'knight',
  'ui-reviewer': 'mushroom',
  'react-native-expert': 'alien',
  'langchain-ts-expert': 'octopus',
  'ml-engineer': 'slime',
  'obsidian-vault-manager': 'bunny',
  'agent-sdk-verifier-py': 'frog',
  'agent-sdk-verifier-ts': 'frog',
}

function roleKey(type: string): string {
  return (type.split(':').pop() ?? type).toLowerCase()
}

// Bilinmeyen türler yalnız sabit rollerin kullanmadığı karakterlerden sırayla alır
const ROLE_FIXED = new Set(Object.values(ROLE_CHARS))
const SPARE_CHARS = ORDER.filter((c) => !ROLE_FIXED.has(c))

// Rol aksesuarı: mini sprite'a göre (sol üst = sprite 0,0) piksel parçaları. Negatif x/y
// sprite'ın dışındaki 1 piksellik kenar şeridi. Sprite önde çizilir; aksesuar yalnız boş
// piksele düşer, bu yüzden gözleri (sütun 2/5) ve ağzı (3-4) asla kapatmaz. Her aksesuar
// ait olduğu karakterin boş köşelerine göre ayarlıdır.
type AccPart = { x: number; y: number; rows: string[] }
type Accessory = { palette: Record<string, string>; parts: AccPart[] }

const ACCESSORIES: Record<string, Accessory> = {
  // Dürbün: baykuşun kulak tüyleri arasındaki boş üst satır
  explore: {
    palette: { B: '#C9A227', L: '#7FE3FF' },
    parts: [{ x: 1, y: 0, rows: ['BLBBLB'] }],
  },
  // Klasör: sihirbazın cübbesinin daraldığı sol alt boşluk
  plan: {
    palette: { T: '#B07D1E', Y: '#E8B84A' },
    parts: [{ x: -1, y: 3, rows: ['T.', 'YY', 'YY', 'YY'] }],
  },
  // Sırt çantası: gövdenin iki yanında taşan çanta
  'general-purpose': {
    palette: { H: '#E3A24E', P: '#B8651B', D: '#7A3F10' },
    parts: [
      { x: -1, y: 2, rows: ['H', 'P', 'P', 'P', 'D'] },
      { x: 8, y: 2, rows: ['H', 'P', 'P', 'P', 'D'] },
    ],
  },
  // İngiliz anahtarı: şövalyenin sağ üstündeki boşluk, sap sağ kenarda
  'devops-engineer': {
    palette: { S: '#B5C0CC', D: '#6C7A89' },
    parts: [{ x: 6, y: 0, rows: ['S.S', 'SDS', '..S', '..S', '..S'] }],
  },
  // Veritabanı silindiri: bulutun sağ üst köşesi
  'db-architect': {
    palette: { L: '#9FD3FF', B: '#4D8FD6', D: '#2F5F9E' },
    parts: [{ x: 7, y: -1, rows: ['LL', 'BB', 'DD'] }],
  },
  // Telefon: uzaylının sağ yanındaki boş sütunlar
  'react-native-expert': {
    palette: { D: '#3A4252', S: '#7FE3FF' },
    parts: [{ x: 7, y: 4, rows: ['DD', 'SS', 'SS', 'DD'] }],
  },
  // Renk paleti: mantarın sap kenarı
  'ui-reviewer': {
    palette: { T: '#D9B77E', R: '#E5484D', G: '#4CAF50', B: '#4D8FD6' },
    parts: [{ x: -1, y: 4, rows: ['TR', 'GT', 'TB'] }],
  },
  // Deney şişesi: balçığın boş üst yarısı
  'ml-engineer': {
    palette: { G: '#CFE8F5', L: '#5BD58A' },
    parts: [{ x: 6, y: -1, rows: ['.G.', '.G.', 'LLL', 'LLL'] }],
  },
  // Obsidyen taşı: tavşanın kulakları arasındaki vadi
  'obsidian-vault-manager': {
    palette: { L: '#D8C8FF', P: '#9B7BF0', D: '#6A4BC4' },
    parts: [
      { x: 2, y: 0, rows: ['LPPD'] },
      { x: 3, y: 1, rows: ['PD'] },
    ],
  },
}
// ---ROL-END---

const MW = 10
const MH = 10

// slide: giriş/çıkış kayması (miniSlide); kayarken adım sekmesi yapar
function composeMini(
  id: string,
  m: Mode,
  f: number,
  slide: number,
  themeId: string,
  type?: string,
  hat?: string,
): Px[][] {
  const spec = themed(pick(id), themeId)
  const mini = MINIS[id] ?? MINI_BIT
  const canvas: Px[][] = Array.from({ length: MH }, () => Array<Px>(MW).fill(undefined))
  const hatOn: HatTarget = { title: spec.title, half: mini.half, mini: true }

  // Çalışan alt ajan seker, biten zıplar, hata alan titrer, bekleyen durur
  let dy = slide !== 0 || m === 'work' ? 1 + (f % 2) : m === 'ok' ? f % 2 : 1
  if (hat) dy = Math.max(dy, hatMinDy(hatOn, hat)) // şapka tuvalin üstünden kesilmesin
  const dx = m === 'err' && slide === 0 ? (f % 2 === 0 ? 0 : 2) : 1 + slide

  const put = (x: number, y: number, c: Px) => {
    const row = canvas[y]
    if (row && c && x >= 0 && x < MW) row[x] = c
  }
  const px = (x: number, y: number, c: Px) => put(dx + x, dy + y, c)
  // Kayarken parçacık yok; sprite dışarıdayken sabit noktalar tuvalde yüzmesin
  const spark = (x: number, y: number, c: string) => {
    if (slide === 0 && canvas[y]?.[x] === undefined) put(x, y, c)
  }

  mini.half.forEach((half, r) => {
    const full = mirror(half)
    for (let c = 0; c < full.length; c += 1) {
      px(c, r, spec.palette[full.charAt(c)])
    }
  })

  const ey = mini.eyeY

  if (hat) {
    for (const [hx, hy, hc] of hatPixels(hatOn, hat, dy)) {
      if (canvas[dy + hy]?.[dx + hx] === undefined) px(hx, hy, hc)
    }
  }

  for (const ex of [2, 5]) {
    if (m === 'err') px(ex, ey, RED)
    else if (m === 'idle' && f % 8 === 7) px(ex, ey, spec.line)
    else px(ex, ey, spec.eye)
  }

  if (m === 'ok') {
    px(3, ey + 1, spec.line)
    px(4, ey + 1, spec.line)
    spark(0, 2 + (f % 3), AMBER)
    spark(9, 4 - (f % 3), AMBER)
  } else if (m === 'work') {
    for (let i = 0; i < 3; i += 1) spark(3 + i, 0, i === f % 3 ? AMBER : '#4A4440')
  } else if (m === 'err') {
    spark(9, 2 + (f % 4), SWEAT)
  }

  // ---ROL-START---
  // Aksesuar en son ve yalnız boş piksele çizilir: sprite ve parçacıklar önde kalır
  const acc = type ? ACCESSORIES[roleKey(type)] : undefined
  if (acc) {
    for (const part of acc.parts) {
      part.rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c += 1) {
          const color = acc.palette[row.charAt(c)]
          const tx = dx + part.x + c
          const ty = dy + part.y + r
          if (color && canvas[ty]?.[tx] === undefined) put(tx, ty, color)
        }
      })
    }
  }
  // ---ROL-END---

  return canvas
}

function modeOf(status: string): Mode {
  if (status === 'running') return 'work'
  if (status === 'completed') return 'ok'
  if (status === 'failed' || status === 'killed') return 'err'
  return 'idle'
}
// ---SPRITE-END---

// VS Code ve masaüstü yüzeyleri terminal değil, tarayıcı ağıdır: yarım blok karakterler
// fonta ve satır yüksekliğine göre satır arası boşluk bırakır, hücre genişliği tutmaz;
// sprite kayar. Bu yüzeylerde piksel ızgarası SVG olarak çizilir (font/satır yüksekliğinden
// bağımsız, tam piksel hizalı). Yatayda aynı renkli pikseller tek <rect> olur.
const PX_MAIN = 5
const PX_MINI = 4

function rectsOf(canvas: Px[][], w: number): string[] {
  const rects: string[] = []

  canvas.forEach((row, y) => {
    let x = 0
    while (x < w) {
      const c = row[x]
      if (!c) {
        x += 1
        continue
      }
      let end = x + 1
      while (end < w && row[end] === c) end += 1
      rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${c}"/>`)
      x = end
    }
  })

  return rects
}

function svgOf(canvas: Px[][], w: number, scale: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${canvas.length}" width="${w * scale}" height="${canvas.length * scale}" shape-rendering="crispEdges">${rectsOf(canvas, w).join('')}</svg>`
}

const STATUS: Record<Mode, string> = {
  idle: 'ready',
  work: 'working',
  ok: 'done',
  err: 'tool failed',
}

const ROWS = H / 2

// Alt ajan adı en fazla bu kadar karakter gösterilir; daha uzunu kesilir
const NAME_MAX = 24
// Alt ajan: üstündeki durum (ikon veya yazı) satırı + sprite (MH / 2 satır) + altındaki ad satırı
const MINI_ROWS = MH / 2 + 2
// Alt ajanlar arası boşluk (hücre)
const MINI_GAP = 1
// Alt ajan yokken ve alt ajanlı bantta: üst satır (başlık) + alt satır (Random) = 2 satır
const CHROME_ROWS = 2
// Sprite'lı alt ajan satırı sayısı: açıkken iki, Collapse'ta bir. Sığmayan ajanlar alt satırda
// "+3 agents running" diye özetlenir
const MAX_MINI_LINES = 2

// Alt ajanın üstünde yazan durum (ana karakterin STATUS'undan ayrı: "tool failed" sütuna sığmaz)
const SUB_STATUS: Record<Mode, string> = {
  idle: 'waiting',
  work: 'working',
  ok: 'done',
  err: 'failed',
}

// Durum ikonları: VS Code / masaüstü / mobilde yazı yerine 8x8 piksel SVG (svgOf ile çizilir);
// terminalde SVG yok, orada durum yazıyla kalır. '#' dolu piksel.
const ICON = 8
const ICON_SCALE = 2
const ICON_DIM = '#6B7C93'
const ICON_GREEN = '#4FB286'
const ICON_MOON = '#E8D48A'

type IconKind = 'ready' | 'sleep' | 'wait' | 'work' | 'ok' | 'err'

const ICON_SHAPES: Record<Exclude<IconKind, 'work'>, { color: string; rows: string[] }> = {
  // Halka + nokta: hazır
  ready: { color: ICON_DIM, rows: ['..####..', '.#....#.', '#......#', '#..##..#', '#..##..#', '#......#', '.#....#.', '..####..'] },
  // Hilal: uyuyor
  sleep: { color: ICON_MOON, rows: ['..###...', '.##.....', '##......', '##......', '##......', '.##...##', '..#####.', '........'] },
  // Kum saati: alt ajan bekliyor
  wait: { color: ICON_DIM, rows: ['########', '.#....#.', '..#..#..', '...##...', '...##...', '..#..#..', '.#.##.#.', '########'] },
  // Onay işareti: bitti
  ok: { color: ICON_GREEN, rows: ['........', '......##', '.....##.', '#...##..', '##.##...', '.###....', '..#.....', '........'] },
  // Çarpı: hata
  err: { color: RED, rows: ['##....##', '.##..##.', '..####..', '...##...', '..####..', '.##..##.', '##....##', '........'] },
}

// Çalışıyor: üç nokta, kare başına biri vurgulanır
function iconCanvas(kind: IconKind, f: number): Px[][] {
  const canvas: Px[][] = Array.from({ length: ICON }, () => Array<Px>(ICON).fill(undefined))

  if (kind === 'work') {
    for (let i = 0; i < 3; i += 1) {
      const color = i === f % 3 ? AMBER : '#4A4440'

      for (const y of [3, 4]) {
        for (const x of [i * 3, i * 3 + 1]) {
          const row = canvas[y]
          if (row) row[x] = color
        }
      }
    }

    return canvas
  }

  const shape = ICON_SHAPES[kind]
  shape.rows.forEach((line, y) => {
    const row = canvas[y]
    if (!row) return

    for (let x = 0; x < ICON; x += 1) {
      if (line.charAt(x) === '#') row[x] = shape.color
    }
  })

  return canvas
}

const iconSvg = (kind: IconKind, f: number): string => svgOf(iconCanvas(kind, f), ICON, ICON_SCALE)

// Terminalde SVG yok: tek hücrelik simge (çalışırken üç nokta döner); ana ajanda yanında kısa durum yazısı
const TERM_ICONS: Record<Exclude<IconKind, 'work'>, { glyph: string; color: string }> = {
  ready: { glyph: '○', color: ICON_DIM },
  sleep: { glyph: 'zzz', color: ICON_MOON },
  wait: { glyph: '⧖', color: ICON_DIM },
  ok: { glyph: '✓', color: ICON_GREEN },
  err: { glyph: '✗', color: RED },
}

function termIcon(kind: IconKind, f: number): Array<{ glyph: string; color: string }> {
  if (kind === 'work') {
    return [0, 1, 2].map(i => ({ glyph: '●', color: i === f % 3 ? AMBER : '#4A4440' }))
  }

  return [TERM_ICONS[kind]]
}

// SVG yüzeylerinde ana karakterin üstündeki ad ve konuşma balonu da yazı değil SVG etiket.
// Yazı genişliği textLength ile sabitlenir; font farkı etiketi taşırmaz, ölçü tahminidir.
const LABEL_FONT = 11
const LABEL_CHAR = 6.6
const LABEL_FAMILY = 'ui-monospace, Menlo, Consolas, monospace'
const LABEL_INK = '#1E2733'
const LABEL_PAPER = '#F4F1EA'
const LABEL_DARK = '#2A2F3A'
// Host metin hücresinin ve satırının tahmini piksel ölçüsü: Svg px, Box/maxRows hücre/satır olduğundan
// yerleşim hesabında çevrilir. Yanlışsa yalnız bu iki sabit ayarlanır.
const CELL_PX = 7
const SVG_ROW_PX = 20

type Label = { svg: string; w: number; h: number }

const xml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Koyu hap içinde ad
function nameLabel(title: string): Label {
  const tw = Math.ceil(title.length * LABEL_CHAR)
  const w = tw + 16
  const h = 18
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="9" fill="${LABEL_DARK}"/><text x="8" y="12.5" font-family="${LABEL_FAMILY}" font-size="${LABEL_FONT}" font-weight="600" fill="#E8E6E1" textLength="${tw}" lengthAdjust="spacingAndGlyphs">${xml(title)}</text></svg>`

  return { svg, w, h }
}

// Durum ikonu + konuşma balonu (aşağı kuyruklu); metin yoksa yalnız ikon
function bubbleLabel(icon: Px[][], text: string): Label {
  const size = ICON * ICON_SCALE

  if (!text) return { svg: svgOf(icon, ICON, ICON_SCALE), w: size, h: size }

  const tw = Math.ceil(text.length * LABEL_CHAR)
  const pad = 6
  const body = size + 8
  const tail = 5
  const w = pad + size + 5 + tw + pad
  const h = body + tail
  const cx = w / 2
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<polygon points="${cx - 4},${body - 1} ${cx + 4},${body - 1} ${cx},${h - 0.75}" fill="${LABEL_PAPER}" stroke="${LABEL_DARK}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<rect x="0.75" y="0.75" width="${w - 1.5}" height="${body - 1.5}" rx="7" fill="${LABEL_PAPER}" stroke="${LABEL_DARK}" stroke-width="1.5"/>` +
    `<rect x="${cx - 3}" y="${body - 2.5}" width="6" height="3" fill="${LABEL_PAPER}"/>` +
    `<g transform="translate(${pad} 4) scale(${ICON_SCALE})" shape-rendering="crispEdges">${rectsOf(icon, ICON).join('')}</g>` +
    `<text x="${pad + size + 5}" y="${4 + size / 2 + 4}" font-family="${LABEL_FAMILY}" font-size="${LABEL_FONT}" fill="${LABEL_INK}" textLength="${tw}" lengthAdjust="spacingAndGlyphs">${xml(text)}</text>` +
    `</svg>`

  return { svg, w, h }
}

// ---İSTATİSTİK-START---
// Tur süresi / araç sayacı, uzun iş kutlaması ve /pixel-agents stats. Sayaçlar oturum
// ömürlüdür (kalıcı değil); session.start'ta sıfırlanır.
type StatTurn = { startMs: number; startFrame: number; tools: number }
type StatTotals = { turns: number; tools: number; errors: number; workMs: number; byTool: Record<string, number> }

const STAT_NO_TURN: StatTurn = { startMs: -1, startFrame: -1, tools: 0 }
const STAT_EMPTY: StatTotals = { turns: 0, tools: 0, errors: 0, workMs: 0, byTool: {} }

// Çalışan turun başlangıcı (startFrame -1: tur yok). Süre render'da Date.now ile değil,
// 450 ms'lik frame sayacı farkından hesaplanır (saf render)
const statTurn = atom({ plugin: 'pixel-agents', key: 'statTurn' } as const, STAT_NO_TURN)
// Uzun biten turun süresi (sn); -1: son tur uzun değildi / tur sürüyor
const statDone = atom({ plugin: 'pixel-agents', key: 'statDone' } as const, -1)
const statTotals = atom({ plugin: 'pixel-agents', key: 'statTotals' } as const, STAT_EMPTY)

// Bu süre (sn) ve üstü süren tur "uzun iş" sayılır: ok modu daha uzun kalır, ekstra yıldız çıkar
const LONG_TURN_SEC = 120
const OK_HOLD_MS = 4000
const OK_HOLD_LONG_MS = 8000
const STAT_TOP_TOOLS = 3

// Olay kancasındaki $ (durum + saat); hook bağlamı bu şekle yapısal olarak uyar
type StatDollar = Parameters<typeof read>[0] & { clock: { now: () => Promise<number> } }

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))

  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

async function statTurnBegin($: StatDollar): Promise<void> {
  const now = await $.clock.now()
  const f = await read($, frame)
  await update($, statTurn, () => ({ startMs: now, startFrame: f, tools: 0 }))
  await update($, statDone, () => -1)
}

async function statToolCall($: StatDollar, tool: string): Promise<void> {
  // MCP araçları "mcp__sunucu__ad" gelir; listede yalnız son parça okunur
  const name = tool.split('__').pop() || tool
  await update($, statTurn, t => ({ ...t, tools: t.tools + 1 }))
  await update($, statTotals, t => ({ ...t, tools: t.tools + 1, byTool: { ...t.byTool, [name]: (t.byTool[name] ?? 0) + 1 } }))
}

async function statToolError($: StatDollar): Promise<void> {
  await update($, statTotals, t => ({ ...t, errors: t.errors + 1 }))
}

// Turu kapatır; ok modunun kaç ms kalacağını döndürür (uzun turda daha uzun)
async function statTurnEnd($: StatDollar): Promise<number> {
  const now = await $.clock.now()
  const turn = await read($, statTurn)
  // prompt.submit görülmediyse (mod turun ortasında yüklendi) süre bilinmez, 0 sayılır
  const ms = turn.startMs < 0 ? 0 : Math.max(0, now - turn.startMs)
  const long = ms >= LONG_TURN_SEC * 1000

  await update($, statTotals, t => ({ ...t, turns: t.turns + 1, workMs: t.workMs + ms }))
  await update($, statTurn, () => STAT_NO_TURN)
  await update($, statDone, () => (long ? Math.floor(ms / 1000) : -1))

  return long ? OK_HOLD_LONG_MS : OK_HOLD_MS
}

async function statReset($: StatDollar): Promise<void> {
  await update($, statTurn, () => STAT_NO_TURN)
  await update($, statDone, () => -1)
  await update($, statTotals, () => STAT_EMPTY)
}

async function statsText($: StatDollar): Promise<string> {
  const t = await read($, statTotals)
  const top = Object.entries(t.byTool)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, STAT_TOP_TOOLS)
    .map(([name, n]) => `${name} ${n}`)
    .join(', ')

  return `Session: ${plural(t.turns, 'turn')}, ${plural(t.tools, 'tool call')}, ${plural(t.errors, 'error')}, ${fmtClock(t.workMs / 1000)} working.\nTop tools: ${top || 'none yet'}.`
}

// ---İSTATİSTİK-END---

// Alt komutlar: yazım satırı önerileri ve /pixel-agents help buradan beslenir
const SUBCOMMANDS: Array<{ name: string; hint: string }> = [
  { name: 'switch', hint: 'Pick a character from a grid' },
  { name: 'random', hint: 'Switch to a random character' },
  { name: 'hat', hint: 'Pick a hat (unlocks as the bond grows)' },
  { name: 'bond', hint: 'Bond turns and the next hat' },
  { name: 'theme', hint: 'Change the color theme (next, auto or a name)' },
  { name: 'stats', hint: 'Session summary' },
  { name: 'chatter', hint: 'Speech bubble on or off' },
  { name: 'list', hint: 'List all characters' },
  { name: 'help', hint: 'Show all commands' },
]

// Bantta 10 saniyede bir değişen ipucu satırı; Random düğmesi zaten sağ altta olduğundan listede yok
const TIPS = [
  '/pixel-agents hat · try on a hat',
  '/pixel-agents theme next · change the colors',
  '/pixel-agents switch · pick a character',
  '/pixel-agents bond · hats unlock as you work together',
  '/pixel-agents theme auto · colors follow the time of day',
  '/pixel-agents stats · session summary',
  '/pixel-agents chatter off · hide the speech bubble',
  '/pixel-agents help · all commands',
]
const TIP_MS = 10000

// Komut adından sonra dim görünen ipucu; alt komut yazılıp boşluk bırakılınca onun parametrelerine döner
const ROOT_HINT = '[switch | random | hat | theme | bond | stats | chatter | help | <character>]'

const SUB_HINTS: Record<string, string> = {
  theme: `[${[...THEME_ORDER, 'next', 'auto'].join(' | ')}]`,
  hat: `[none | ${HAT_ORDER.join(' | ')}]`,
  chatter: '[on | off]',
}

// prompt.autocomplete boş kelimede tetiklenmediği için (token hiç boş olmaz) boşluk sonrası ipucu
// yalnızca argumentHint ile verilebilir; yazım kutusu her değiştiğinde buradan hesaplanır
function hintFor(text: string): string {
  const m = /^\/(?:pixel-agents:)?pixel-agents\s+(\S+)\s+\S*$/.exec(text)

  return (m?.[1] && SUB_HINTS[m[1].toLowerCase()]) || ROOT_HINT
}

// command.describe önbellekli olduğundan geçerli ipucu burada tutulur; atom değil, çünkü bantı yeniden çizmesin
let liveHint = ROOT_HINT

// Yazım kutusu değişince argumentHint'i alt komuta göre güncelle (theme + boşluk → tema adları)
// Motor $'ı yalnızca dosya üstündeki fonksiyonlara geçirebildiği için register dışında tanımlı
function syncHint($: Parameters<typeof read>[0] & { ui: { invalidate: (event: 'command.describe') => void } }, text: string) {
  const hint = hintFor(text)

  if (hint === liveHint) return

  liveHint = hint
  $.ui.invalidate('command.describe')
}

type Suggest = { text: string; description: string }

// /pixel-agents <token> ve /pixel-agents <alt komut> <token> için yazım satırı önerileri
function suggestFor(sub: string | undefined, want: string): Suggest[] {
  let pool: Suggest[]

  if (sub === undefined) {
    pool = [
      ...SUBCOMMANDS.map(s => ({ text: s.name, description: s.hint })),
      ...ORDER.map(id => ({ text: id, description: `Switch to ${pick(id).title}` })),
    ]
  } else if (sub === 'theme') {
    pool = [
      ...THEME_ORDER.map(id => ({ text: id, description: `${THEMES[id]?.title ?? id} colors` })),
      { text: 'next', description: 'Next color theme' },
      { text: 'auto', description: 'Follow the time of day' },
    ]
  } else if (sub === 'hat') {
    pool = [
      { text: 'none', description: 'Take the hat off' },
      ...HAT_ORDER.map(h => ({ text: h, description: `${HATS[h]?.title ?? h} · unlocks at ${HATS[h]?.need ?? 0} bond turns` })),
    ]
  } else if (sub === 'chatter') {
    pool = [
      { text: 'on', description: 'Show the speech bubble' },
      { text: 'off', description: 'Hide the speech bubble' },
    ]
  } else {
    return []
  }

  return pool.filter(r => r.text.startsWith(want))
}

function helpText(): string {
  const cmds = SUBCOMMANDS.map(s => `/pixel-agents ${s.name} · ${s.hint}`).join('\n')
  const hats = HAT_ORDER.map(h => `${HATS[h]?.title ?? h} ${HATS[h]?.need ?? 0}`).join(', ')

  return [
    '/pixel-agents · hide or show the agent',
    cmds,
    '/pixel-agents <character> · for example cat, fox, wizard',
    `Hats unlock per character: every turn Claude finishes successfully with that character adds 1 bond turn (subagent turns, cancels and errors do not count). Bond turns needed: ${hats}.`,
  ].join('\n')
}

// Mevcut karakter dışından rastgele biri; tek karakter varsa aynısı döner
function randomOther(current: string): string {
  const pool = ORDER.filter(id => id !== current)

  return pool[Math.floor(Math.random() * pool.length)] ?? current
}

// ---BAĞ-START--- (puan, kilit ve komut mantığı)
// Hook içinden gelen $ bu alanların üst kümesidir; yalnız kullanılanlar tanımlanır
type BondCtx = Parameters<typeof read>[0] & {
  store: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> }
  ui: { toast: (text: string) => void }
  clock: { now: () => Promise<number>; after: (ms: number, fn: () => void) => unknown }
}

const BOND_DAY_MS = 86400000
// Bu kadar gün açılmazsa dönüşte kısa karşılama gösterilir
const BOND_AWAY_DAYS = 3
const BOND_WELCOME_MS = 12000

// Diskten gelen veri güvenilmez: bilinmeyen karakter/şapka ve geçersiz sayılar atılır
function cleanPoints(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (raw && typeof raw === 'object') {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (ORDER.includes(id) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[id] = Math.floor(v)
    }
  }

  return out
}

function cleanHats(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (raw && typeof raw === 'object') {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (ORDER.includes(id) && typeof v === 'string' && HATS[v]) out[id] = v
    }
  }

  return out
}

// Seçili şapka yalnız açıksa görünür (puan değeri elle bozulsa bile kilitli şapka çıkmaz)
function activeHat(hats: Record<string, string>, points: number, id: string): string | undefined {
  const h = hats[id]
  const need = h ? HATS[h]?.need : undefined

  return h && need !== undefined && points >= need ? h : undefined
}

function nextUnlock(points: number): { id: string; need: number } | undefined {
  for (const id of HAT_ORDER) {
    const need = HATS[id]?.need ?? 0
    if (points < need) return { id, need }
  }

  return undefined
}

// Oturum açılışında puan/şapkaları geri yükler; uzun aradan dönüşte kısa karşılama kurar.
// Yalnız son görülme zamanı saklanır, ayrıca özlem sayacı tutulmaz.
async function bondRestore($: BondCtx): Promise<void> {
  const points = cleanPoints(await $.store.get('bondPoints'))
  const hats = cleanHats(await $.store.get('bondHats'))
  await update($, bondPoints, () => points)
  await update($, bondHats, () => hats)

  const now = await $.clock.now()
  const lastSeen = await $.store.get('bondLastSeen')
  await $.store.set('bondLastSeen', now)

  if (typeof lastSeen !== 'number' || now - lastSeen < BOND_AWAY_DAYS * BOND_DAY_MS) return

  const id = await read($, character)
  if ((points[id] ?? 0) <= 0) return

  const days = Math.floor((now - lastSeen) / BOND_DAY_MS)
  await update($, bondWelcome, () => `welcome back, ${days} days`)
  $.clock.after(BOND_WELCOME_MS, () => {
    void update($, bondWelcome, () => '').catch(() => undefined)
  })
}

// Ana döngüde başarıyla biten turda aktif karakterin bağını 1 artırır; alt ajan turu,
// iptal ve hata sayılmaz. Yeni şapka açılırsa kısa bildirim gösterir.
async function bondTurnDone($: BondCtx): Promise<void> {
  const id = await read($, character)
  const points = await update($, bondPoints, p => ({ ...p, [id]: (p[id] ?? 0) + 1 }))
  await $.store.set('bondPoints', points)
  await $.store.set('bondLastSeen', await $.clock.now())

  const n = points[id] ?? 0
  const got = HAT_ORDER.find(h => HATS[h]?.need === n)
  if (got) {
    $.ui.toast(`${pick(id).title} bond ${n}: new hat unlocked, ${HATS[got]?.title ?? got}. Try /pixel-agents hat`)
  }
}

// Şapka seçimi ('none' = şapkasız); komut ve Select ortak kullanır. ok: false ise seçim değişmedi
async function bondChooseHat($: BondCtx, id: string, want: string): Promise<{ ok: boolean; text: string }> {
  const name = pick(id).title

  if (want === 'none') {
    const next = await update($, bondHats, h => {
      const rest = { ...h }
      delete rest[id]

      return rest
    })
    await $.store.set('bondHats', next)

    return { ok: true, text: `${name} wears no hat.` }
  }

  const hat = HATS[want]
  if (!hat) return { ok: false, text: `Unknown hat: ${want}. Options: ${HAT_ORDER.join(', ')}, none.` }

  const points = (await read($, bondPoints))[id] ?? 0
  if (points < hat.need) {
    return { ok: false, text: `${hat.title} unlocks at ${hat.need} bond turns; ${name} has ${points}.` }
  }

  const next = await update($, bondHats, h => ({ ...h, [id]: want }))
  await $.store.set('bondHats', next)

  return { ok: true, text: `${name} wears the ${hat.title}.` }
}

// /pixel-agents hat ve /pixel-agents bond; başka komutsa undefined döner
async function bondCommand($: BondCtx, head: string, rest: string[]): Promise<{ text: string } | undefined> {
  if (head !== 'hat' && head !== 'bond') return undefined

  const id = await read($, character)
  const name = pick(id).title
  const points = (await read($, bondPoints))[id] ?? 0

  if (head === 'bond') {
    const next = nextUnlock(points)
    const tail = next
      ? `Next hat: ${HATS[next.id]?.title ?? next.id} at ${next.need} (${next.need - points} to go).`
      : 'All hats unlocked.'

    return { text: `${name}: bond ${points} turns. ${tail}` }
  }

  const want = rest.join('')

  if (want === '') {
    const open = !(await read($, bondHatPicking))
    await update($, bondHatPicking, () => open)
    await update($, picking, () => false)
    await update($, isHidden, () => false)

    return {
      text: open
        ? 'Hat list is open above the prompt: move with the arrow keys and press Enter. Locked hats show their bond turns. Run /pixel-agents hat again to close it.'
        : 'Hat list closed.',
    }
  }

  const res = await bondChooseHat($, id, want === 'off' ? 'none' : want)
  if (res.ok) {
    await update($, bondHatPicking, () => false)
    await update($, isHidden, () => false)
  }

  return { text: res.text }
}
// ---BAĞ-END---

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pixel-agents',
      argumentHint: ROOT_HINT,
      description:
        'Show or hide the pixel agent, change the character (switch opens a list, random, list, or a name like cat, fox, wizard) or the color theme (theme <name|next|auto>, auto follows the time of day), session stats (stats), or the speech bubble (chatter on|off), the bond (bond), or a hat (hat opens a list, hat <name|none>)',
    })

    await statReset($) // İSTATİSTİK: oturum sayaçları sıfırlanır

    // Ana ajanın adı: birleşik ayarlardaki "agent" anahtarı; okunamazsa karakter adı gösterilir
    const agentSetting = await $.settings.read({ key: 'agent' }).catch(() => undefined)
    if (typeof agentSetting === 'string') {
      await update($, mainAgent, () => agentSetting)
    }

    // Önceki oturumda seçilen karakteri geri yükle
    const saved = await $.store.get('character')
    if (typeof saved === 'string' && ORDER.includes(saved)) {
      await update($, character, () => saved)
    }

    const savedTheme = await $.store.get('theme')
    if (typeof savedTheme === 'string' && THEME_ORDER.includes(savedTheme)) {
      await update($, theme, () => savedTheme)
    }

    // ---BAĞ-START--- (karakter yukarıda geri yüklendikten sonra)
    await bondRestore($).catch(err => $.ui.status(`pixel-agents: ${String(err)}`))
    // ---BAĞ-END---

    // ---HAREKET-START---
    // Auto tema kalıcıdır; açılışta saate göre hemen seçilir (sayaç bir tik sonra izler)
    if ((await $.store.get('themeAuto')) === true) {
      await update($, themeAuto, () => true)
      await update($, theme, () => autoThemeFor(new Date().getHours()))
    }
    // ---HAREKET-END---

    // ---BALON-START---
    const savedChatter = await $.store.get('chatter')
    if (typeof savedChatter === 'boolean') {
      await update($, balonOn, () => savedChatter)
    }
    // ---BALON-END---

    const seen = new Map<string, Seen>()
    // Süresi dolup bantan düşen ajanlar; motor kaydı listede tutsa bile geri eklenmesin
    const dismissed = new Set<string>()
    const typeChar = new Map<string, string>()
    let lastRoster = ''

    // ---ROL-START---
    // Bilinen türler sabit karakter alır (ROLE_CHARS). Bilinmeyenler ilk görülme sırasıyla,
    // sabit rollerin kullanmadığı havuzdan atanır; aynı tür hep aynı karakterdir
    let spareUsed = 0
    const charFor = (type: string): string => {
      const known = typeChar.get(type)
      if (known) return known

      const fixed = ROLE_CHARS[roleKey(type)]
      if (fixed) {
        typeChar.set(type, fixed)
        return fixed
      }

      const assigned = SPARE_CHARS[spareUsed % SPARE_CHARS.length] ?? 'bit'
      spareUsed += 1
      typeChar.set(type, assigned)

      return assigned
    }
    // ---ROL-END---

    // Alt ajanları motorun listesinden okur. Biten ajan HOLD_MS boyunca "bitti"
    // olarak kalır; listeden izsiz düşen ajan da bitmiş sayılır.
    const track = async () => {
      const now = await $.clock.now()
      const nowFrame = await read($, frame)
      const list = await $.agent.list()
      const alive = new Set<string>()

      for (const a of list) {
        if (dismissed.has(a.id)) continue

        alive.add(a.id)
        const m = modeOf(a.status)
        const isEnded = m === 'ok' || m === 'err'
        const prev = seen.get(a.id)
        seen.set(a.id, {
          type: a.type,
          char: charFor(a.type),
          mode: m,
          // Giriş kayması ilk görüldüğü kareden, çıkış kayması bittiği kareden hesaplanır
          enteredFrame: prev?.enteredFrame ?? nowFrame,
          endedAt: isEnded ? (prev?.endedAt ?? now) : undefined,
          endedFrame: isEnded ? (prev?.endedFrame ?? nowFrame) : undefined,
        })
      }

      seen.forEach((s, id) => {
        if (!alive.has(id) && s.endedAt === undefined) {
          seen.set(id, { ...s, mode: 'ok', endedAt: now, endedFrame: nowFrame })
        }

        const entry = seen.get(id)
        if (entry?.endedAt !== undefined && now - entry.endedAt > HOLD_MS) {
          seen.delete(id)
          dismissed.add(id)
        }
      })

      const roster: AgentRow[] = []
      seen.forEach((s, id) =>
        roster.push({
          id,
          type: s.type,
          char: s.char,
          mode: s.mode,
          enteredFrame: s.enteredFrame,
          endedFrame: s.endedFrame,
        }),
      )

      // Yalnız değişince yaz; aksi halde her tikte gereksiz yeniden çizim olur
      const json = JSON.stringify(roster)
      if (json !== lastRoster) {
        lastRoster = json
        await update($, agents, () => roster)
      }
    }

    // Boşta süresini izler: yalnız boşta/değil geçişinde yazar
    const trackIdle = async () => {
      const m = await read($, mode)
      const start = await read($, idleStart)

      if (m === 'idle' && start < 0) {
        const f = await read($, frame)
        await update($, idleStart, () => f)
      } else if (m !== 'idle' && start >= 0) {
        await update($, idleStart, () => -1)
      }
    }

    // ---HAREKET-START---
    // Saati render'da değil burada okur (render saf kalır); atomu yalnız tema değişince yazar
    const trackTheme = async () => {
      if (!(await read($, themeAuto))) return

      const want = autoThemeFor(new Date().getHours())
      if ((await read($, theme)) !== want) await update($, theme, () => want)
    }
    // ---HAREKET-END---

    // Yalnızca görünürken kare ilerlet ve alt ajanları izle; gizliyken yeniden çizim yok
    $.clock.every(450, () => {
      void read($, isHidden)
        .then(async hidden => {
          if (hidden) return
          await update($, frame, n => (n + 1) % FRAME_WRAP)
          await trackIdle()
          await trackTheme() // HAREKET: auto tema
          await track()
        })
        .catch(err => {
          // Süs bir mod: hatayı durum satırında göster, oturumu bozma
          $.ui.status(`pixel-agents: ${String(err)}`)
        })
    })

    return next(e)
  })

  on('command.run', { command: 'pixel-agents' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const list = ORDER.map(id => `${id} (${pick(id).title})`).join(', ')
    const [head = '', ...rest] = arg.split(/\s+/)

    // ---BALON-START---
    if (head === 'chatter') {
      const want = rest[0] ?? ''

      if (want !== '' && want !== 'on' && want !== 'off') {
        return { text: `Unknown option: ${want}. Use /pixel-agents chatter on, off, or no argument to toggle.` }
      }

      const enabled = want === '' ? !(await read($, balonOn)) : want === 'on'
      await update($, balonOn, () => enabled)
      await $.store.set('chatter', enabled)

      return { text: enabled ? 'Speech bubble on.' : 'Speech bubble off.' }
    }
    // ---BALON-END---

    if (head === 'theme') {
      const want = rest[0] ?? ''
      const themes = THEME_ORDER.map(id => `${id} (${THEMES[id]?.title ?? id})`).join(', ')

      if (want === '') {
        const auto = (await read($, themeAuto)) ? ' Auto is on.' : ''

        return { text: `Themes: ${themes}. Pick one with /pixel-agents theme <name>, switch with /pixel-agents theme next, or follow the time of day with /pixel-agents theme auto.${auto}` }
      }

      // ---HAREKET-START---
      if (want === 'auto') {
        const now = autoThemeFor(new Date().getHours())
        await update($, themeAuto, () => true)
        await update($, theme, () => now)
        await update($, isHidden, () => false)
        await $.store.set('themeAuto', true)

        return { text: `Theme: auto (${THEMES[now]?.title ?? now} now; morning Ocean, day Classic, evening Ember, night Mono).` }
      }
      // ---HAREKET-END---

      let chosen = want
      if (want === 'next') {
        const current = await read($, theme)
        chosen = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length] ?? 'classic'
      }

      if (!THEME_ORDER.includes(chosen)) {
        return { text: `Unknown theme: ${want}. Options: ${themes}, auto.` }
      }

      // HAREKET: elle tema seçimi auto'yu kapatır
      await update($, themeAuto, () => false)
      await $.store.set('themeAuto', false)
      await update($, theme, () => chosen)
      await update($, isHidden, () => false)
      await $.store.set('theme', chosen)

      return { text: `Theme: ${THEMES[chosen]?.title ?? chosen}.` }
    }

    if (head === 'stats') return { text: await statsText($) } // İSTATİSTİK

    // ---BAĞ-START---
    const bondRes = await bondCommand($, head, rest)
    if (bondRes) return bondRes
    // ---BAĞ-END---

    if (arg === '') {
      const hide = !(await read($, isHidden))
      await update($, isHidden, () => hide)

      return { text: hide ? 'Pixel agent hidden.' : 'Pixel agent is back.' }
    }

    if (arg === 'help') {
      return { text: helpText() }
    }

    if (arg === 'list') {
      return { text: `Characters: ${list}. Pick one with /pixel-agents <name>, from a list with /pixel-agents switch, or get a random one with /pixel-agents random.` }
    }

    // Karakter listesi bantta açılır; ikinci çağrı kapatır
    if (arg === 'switch') {
      const open = !(await read($, picking))
      await update($, picking, () => open)
      // İki liste aynı anda açık kalıp üst üste binmesin
      if (open) await update($, bondHatPicking, () => false)
      await update($, isHidden, () => false)

      return {
        text: open
          ? 'Character list is open above the prompt: click a character (or move with Tab and press Enter). Run /pixel-agents switch again to close it.'
          : 'Character list closed.',
      }
    }

    let chosen = arg

    if (arg === 'random') {
      chosen = randomOther(await read($, character))
    }

    if (!ORDER.includes(chosen)) {
      return { text: `Unknown character: ${arg}. Options: ${list}.` }
    }

    await update($, character, () => chosen)
    await update($, isHidden, () => false)
    await $.store.set('character', chosen)

    return { text: `Character: ${pick(chosen).title}.` }
  })

  // /pixel-agents yazılırken alt komutlar ve değerleri yazım satırında listelenir
  on('prompt.autocomplete', async ($, e, next) => {
    const base = await next(e)
    const words = e.text.slice(0, e.start).trim().split(/\s+/).filter(Boolean)

    if (!/^\/(?:pixel-agents:)?pixel-agents$/.test(words[0] ?? '') || words.length > 2) return base

    return { suggestions: [...base.suggestions, ...suggestFor(words[1], e.token.toLowerCase())] }
  }).catch(($, e, next) => next(e)) // öneri hatası yazım kutusunu bozmasın

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    syncHint($, box.text)

    return box
  }).catch(($, e, next) => next(e))

  // Geçmişten çağırma, temizleme ve gönderim sonrası kutu boşalması
  on('prompt.change', async ($, e, next) => {
    syncHint($, e.text)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.describe', { command: 'pixel-agents' }, async ($, e, next) => next({ ...e, argumentHint: liveHint })).catch(
    ($, e, next) => next(e),
  )

  on('prompt.submit', async ($, e, next) => {
    await update($, mode, () => 'work')
    await update($, label, () => '')
    // Liste yeni bir istekte kendiliğinden kapanır
    await update($, picking, () => false)
    await update($, bondHatPicking, () => false) // BAĞ: şapka listesi de kapanır
    await update($, balonErrStreak, () => 0) // BALON: yeni tur temiz başlar
    await statTurnBegin($) // İSTATİSTİK

    return next(e)
  }).catch(($, e, next) => next(e)) // karakter hata verirse istek engellenmesin

  on('tool.call', async ($, e, next) => {
    await update($, mode, () => 'work')
    await update($, label, () => e.tool)
    await statToolCall($, e.tool) // İSTATİSTİK

    const ran = await next(e)
    // BALON: hatada seriyi artır, başarıda sıfırla
    await update($, balonErrStreak, n => ((ran as { isError?: boolean }).isError === true ? n + 1 : 0))

    if ((ran as { isError?: boolean }).isError === true) {
      await update($, mode, () => 'err')
      await statToolError($) // İSTATİSTİK
      // Hata kısa süre görünsün, tur sürüyorsa çalışma haline dönsün
      $.clock.after(1500, () => {
        void read($, mode).then(m => {
          if (m === 'err') void update($, mode, () => 'work')
        })
      })
    }

    return ran
  }).catch(($, e, next) => next(e)) // karakter hata verirse araç çağrısı engellenmesin

  on('turn.complete', async ($, e, next) => {
    // İSTATİSTİK: ok'tan önce yazılır ki ilk "ok" karesi süreyi/uzun kutlamayı hazır bulsun
    const okHoldMs = await statTurnEnd($)
    await update($, mode, () => 'ok')
    await update($, balonTurns, n => (n + 1) % 1000) // BALON: "bitti" varyasyonu
    await update($, label, () => '')
    $.clock.after(okHoldMs, () => {
      void read($, mode).then(m => {
        if (m === 'ok') void update($, mode, () => 'idle')
      })
    })

    // ---BAĞ-START---
    if (e.agentId === undefined && e.reason === 'answer') {
      await bondTurnDone($).catch(err => $.ui.status(`pixel-agents: ${String(err)}`))
    }
    // ---BAĞ-END---

    return next(e)
  }).catch(($, e, next) => next(e)) // sayaç hatası turu bitirmeyi engellemesin

  // Bağlam doluluğu motordan itilir (her turdan sonra); percent taze oturumda ve
  // /compact sonrası ilk yanıta kadar yoktur, o zaman -1 (çubuk gizli)
  on('session.measure', async ($, e, next) => {
    await update($, ctx, () => e.context.percent ?? -1)

    return next(e)
  }).catch(($, e, next) => next(e)) // ölçüm hatası oturumu bozmasın

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const maxRows = e.props.maxRows

    // Band bu kadar yükseğe sığmıyorsa çizme (yarım karakter göstermesin)
    // Terminalde ana karakter alt ajanlarla aynı boyda (MW x MH); SVG yüzeylerinde 14x14 sprite
    const isTerminal = e.surface === 'terminal'
    const bodyRows = isTerminal ? MH / 2 : ROWS

    if (e.props.hasSurvey || (maxRows !== undefined && maxRows < bodyRows) || (await read($, isHidden))) {
      return next(e)
    }

    // Çerçeve için yer yoksa yalnız sprite çizilir. Terminalde çerçeve: üst + alt kenar (2) ve
    // üst boşluk (1) ile ad satırı (1) = bodyRows + 4; SVG yüzeylerinde boşluk satırları (2)
    // Durum satırı ile sprite/şapka arasına bir boş satır daha girer: terminalde bodyRows + 5
    const framed = maxRows === undefined || maxRows >= bodyRows + (isTerminal ? 6 : 2)
    // Terminal çerçevesi yanlardan 2 kenar + 2 iç boşluk = 4 sütun yer; yerleşim iç genişliğe göre
    const columns = (e.props.bodyColumns ?? 100) - (isTerminal && framed ? 4 : 0)

    // Sprite'ın kendi genişliğine bile sığmıyorsa çizme; sığmayan satır sarılıp kayardı
    if (columns < W_NARROW) return next(e)
    const cw = columns >= WIDE_MIN_COLUMNS ? W_WIDE : W_NARROW

    const m = await read($, mode)
    const f = await read($, frame)
    const start = await read($, idleStart)
    const idleTicks = start < 0 ? 0 : (f - start + FRAME_WRAP) % FRAME_WRAP
    const tool = await read($, label)
    const themeId = await read($, theme)
    const characterId = await read($, character)
    const spec = themed(pick(characterId), themeId)
    const pct = await read($, ctx)
    const { Box, Button, Select, Text } = $.ui.resolve(e)
    const isPicking = await read($, picking)
    // Terminal tablosunda Svg yok; VS Code / masaüstü / mobilde var
    const Svg = e.surface === 'terminal' ? undefined : $.ui.resolve(e).Svg

    // ---BAĞ-START---
    const bondPts = (await read($, bondPoints))[characterId] ?? 0
    const bondHat = activeHat(await read($, bondHats), bondPts, characterId)
    const bondNote = await read($, bondWelcome)
    const isHatPicking = await read($, bondHatPicking)
    // ---BAĞ-END---
    const statDoneSec = await read($, statDone) // İSTATİSTİK
    const roster = await read($, agents)
    const asleep = m === 'idle' && idleTicks >= SLEEP_AFTER
    const mainKind: IconKind = m === 'idle' ? (asleep ? 'sleep' : 'ready') : m
    // Terminalde durum küçük bir simge + kısa yazı (başlıkta), sprite'ın yanında büyük piksel ikon yok
    const canvas = isTerminal
      ? composeMini(characterId, m, f, 0, themeId, undefined, bondHat)
      : compose(spec, m, f, { cw, idleTicks, tool, tired: pct >= CTX_TIRED, hat: bondHat,long: m === 'ok' && statDoneSec >= 0 })
    const gridW = isTerminal ? MW : cw
    const rows = Array.from({ length: bodyRows }, (_, i) =>
      rowRuns(canvas[i * 2] ?? [], canvas[i * 2 + 1] ?? [], gridW),
    )
    // Ana etiket: ana oturumun ajan adı (alt ajanlarla aynı kural: ":" sonrası, NAME_MAX'a kesilir);
    // ajan adı yoksa karakter adı
    const mainName = ((await read($, mainAgent)).split(':').pop() || spec.title).slice(0, NAME_MAX)

    // ---BALON-START---
    const balonRaw = balonText({
      on: await read($, balonOn),
      m,
      tool,
      streak: await read($, balonErrStreak),
      tired: pct >= CTX_TIRED,
      turns: await read($, balonTurns),
    })
    // ---BALON-END---

    const base = asleep ? 'sleeping' : m === 'work' && tool ? `${STATUS[m]} · ${tool}` : STATUS[m]

    // SVG yüzeylerinde ad ve konuşma balonu ana karakterin üstünde SVG etiket olarak durur
    const nameTag = Svg ? nameLabel(mainName) : undefined
    const bubbleTag = Svg ? bubbleLabel(iconCanvas(mainKind, f), balonRaw) : undefined
    // Ana sütun, sprite ve etiketlerin en genişi kadardır; Svg px, sağ sütun hücre hesabı için çevrilir
    // Terminalde sütun, alt ajanlar gibi sprite ve ad (+ boşluk ve en çok 3 hücrelik simge) kadar geniştir
    const mainCells = Svg
      ? Math.ceil(Math.max(cw * PX_MAIN, nameTag?.w ?? 0, bubbleTag?.w ?? 0) / CELL_PX)
      : Math.max(gridW, Math.min(NAME_MAX, Math.max(mainKind === 'work' || mainKind === 'sleep' ? 3 : 1, base.length)))
    // Sağ sütun ana sütundan kalan genişliktir; metinler sığmazsa sarılmaz, kesilir
    const rightW = Math.max(10, columns - mainCells - 2)
    // Üst boşluk: SVG yüzeylerinde ikon satırı için bir satır fazla; zemin çizgisi yalnız terminalde
    const topGap = Svg ? 2 : 1
    const frameRows = framed ? topGap + (isTerminal ? 5 : 0) : 0
    // Alt ajanlı bant (üst satır + durum + sprite + ad + Random satırı) sığmıyorsa Random üst
    // satıra (Hide yanına) alınır ve sprite çizilmez; ajanlar "N agents running" diye özetlenir
    // Alt ajan yüksekliği satır cinsinden: terminalde sabit; SVG'de ikon + sprite piksel, ad bir satır
    // Piksel ikonda durum sprite'ın yanındadır; üstteki durum satırı kalkar
    const miniH = Svg ? Math.ceil((ICON * ICON_SCALE + MH * PX_MINI) / SVG_ROW_PX) + 1 : MINI_ROWS
    // SVG sprite 40 px (~6 hücre); terminalde 10 hücre
    const miniMinW = Svg ? Math.ceil((MW * PX_MINI) / CELL_PX) : MW
    const tight = roster.length > 0 && maxRows !== undefined && maxRows - frameRows < CHROME_ROWS + miniH
    const fitLines =
      maxRows === undefined
        ? MAX_MINI_LINES
        : tight
          ? 0
          : Math.min(MAX_MINI_LINES, Math.floor((maxRows - frameRows - CHROME_ROWS) / miniH))
    const expanded = await read($, miniExpanded)
    const maxMiniLines = Math.min(fitLines, expanded ? MAX_MINI_LINES : 1)

    // Her alt ajan adı kadar geniş (en az sprite genişliği) bir sütun alır; sola yaslı yan yana
    // dizilir, sığmayan alt satıra geçer
    const items = roster.map(a => {
      const full = a.type.split(':').pop() ?? a.type
      const short = full.slice(0, Math.min(NAME_MAX, rightW))

      return { a, full, short, w: Math.max(miniMinW, short.length) }
    })
    type MiniItem = (typeof items)[number]

    const pack = (maxLines: number): MiniItem[][] => {
      const out: MiniItem[][] = []
      let used = 0

      for (const it of items) {
        const last = out[out.length - 1]

        if (last && used + MINI_GAP + it.w <= rightW) {
          last.push(it)
          used += MINI_GAP + it.w
        } else if (out.length < maxLines) {
          out.push([it])
          used = it.w
        } else {
          break
        }
      }

      return out
    }

    const lines = pack(maxMiniLines)
    // Tek satıra sığmayan ama iki satıra sığan ajan varken Expand/Collapse düğmesi çıkar
    const canToggle = fitLines >= MAX_MINI_LINES && pack(MAX_MINI_LINES).length > 1

    // Sprite satırlarına sığmayanlar alt satırda özetlenir: "+3 agents running"
    const overflow = items.slice(lines.reduce((n, line) => n + line.length, 0))
    const overRunning = overflow.filter(o => o.a.mode === 'work').length
    const overflowText = overflow.length
      ? `${lines.length > 0 ? '+' : ''}${plural(overflow.length, 'agent')}${
          overRunning === overflow.length ? ' running' : overRunning > 0 ? ` · ${overRunning} running` : ''
        }`
      : ''

    // SVG yüzeylerinde ad, durum ve balon ana karakterin üstündeki etiketlerde; sağ üstte süre,
    // araç sayısı veya ad yazılmaz (yalnız varsa karşılama notu). Terminalde başlık yazıyla kalır.
    // Terminalde de ad sprite'ın üstündeki satırda, durum simge olarak; yer yoksa (framed değil)
    // ad ve simge başlıkta kalır. Durum yazısı ("ready", "working") hiçbir yüzeyde yazılmaz.
    const nameAbove = isTerminal && framed
    // Terminalde etkinlik, alt ajanlarla aynı simge setiyle (termIcon) gösterilir; araç aksesuarı çizilmez
    // Terminalde durum: küçük simge + kısa yazı ("○ ready", "● working · Read") başlıkta
    const termIconEl = (
      <Text>
        {termIcon(mainKind, f).map((s, i) => (
          <Text key={`simge-${i}`} color={s.color}>
            {s.glyph}
          </Text>
        ))}
        <Text dimColor>{` ${base}`}</Text>
      </Text>
    )
    // Ana ajanın adı terminalde yazılmaz; durum framed ise sprite'ın üstünde, değilse başlıkta
    const header = Svg || nameAbove ? (
      bondNote ? (
        <Text dimColor wrap="truncate-end">
          {bondNote}
        </Text>
      ) : null
    ) : (
      <Text wrap="truncate-end">
        {termIconEl}
        {bondNote ? <Text dimColor>{` · ${bondNote}`}</Text> : null}
      </Text>
    )

    const hideButton = <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
    const randomButton = (
      <Button
        key="random"
        label="Random"
        onPress={async () => {
          const id = randomOther(characterId)
          await update($, character, () => id)
          await $.store.set('character', id)
        }}
      />
    )

    const toggleButton = canToggle ? (
      <Button
        key="expand"
        label={expanded ? 'Collapse' : 'Expand'}
        onPress={() => update($, miniExpanded, v => !v)}
      />
    ) : null

    const minis = lines.map((line, li) => (
      <Box key={`mini-satir-${li}`} gap={MINI_GAP}>
        {line.map(({ a, short, w }) => {
          const since = (f - a.enteredFrame + FRAME_WRAP) % FRAME_WRAP
          const left =
            a.endedFrame === undefined ? undefined : HOLD_TICKS - ((f - a.endedFrame + FRAME_WRAP) % FRAME_WRAP)
          const grid = composeMini(a.char, a.mode, f, miniSlide(since, left), themeId, a.type)
          const miniRows = Array.from({ length: MH / 2 }, (_, i) =>
            rowRuns(grid[i * 2] ?? [], grid[i * 2 + 1] ?? [], MW),
          )

          // Terminalde sütun, ad kadar geniş sabit hücre; Svg yüzeylerinde içeriğe göre.
          // Durum, sprite ve ad sütunda ortalanır; sütunlar satırda sola yaslıdır
          return (
            <Box key={`mini-${a.id}`} flexDirection="column" alignItems="center" flexShrink={0} width={isTerminal ? w : undefined}>
              {Svg ? (
                <Svg
                  source={iconSvg(a.mode === 'idle' ? 'wait' : a.mode, f)}
                  alt={`${short} ${SUB_STATUS[a.mode]}`}
                  width={ICON * ICON_SCALE}
                  height={ICON * ICON_SCALE}
                />
              ) : (
                <Text wrap="truncate-end">
                  {termIcon(a.mode === 'idle' ? 'wait' : a.mode, f).map((s, i) => (
                    <Text key={`simge-${i}`} color={s.color}>
                      {s.glyph}
                    </Text>
                  ))}
                </Text>
              )}
              {Svg ? (
                <Svg source={svgOf(grid, MW, PX_MINI)} alt={`${short} subagent`} width={MW * PX_MINI} height={MH * PX_MINI} />
              ) : (
                <Box flexDirection="column">
                  {miniRows.map((runs, i) => (
                    <Text key={`m-${i}`} wrap="truncate">
                      {runs.map((run, j) => (
                        <Text key={`c-${j}`} color={run.color} backgroundColor={run.bg}>
                          {run.text}
                        </Text>
                      ))}
                    </Text>
                  ))}
                </Box>
              )}
              <Text dimColor wrap="truncate-end">
                {short}
              </Text>
            </Box>
          )
        })}
      </Box>
    ))

    // ---BALON-START---
    // Yalnız terminalde sağ sütunda ayrı satır (SVG yüzeylerinde balon ana karakterin üstünde);
    // alt ajan satırı varken (tight dahil) ve sağ sütun darken çizilmez, böylece Hide/Random
    // düğmeleri ve alt ajan düzeni yer değiştirmez
    const balonLine = !Svg && lines.length === 0 && !overflowText && rightW >= BALON_MIN_W ? balonRaw : ''
    const balon = balonLine ? (
      <Text key="balon" italic dimColor wrap="truncate-end">
        {`“${balonLine}”`}
      </Text>
    ) : null
    // ---BALON-END---

    // Hide sağ üst köşede, Random sağ alt köşede (yanında varsa Expand/Collapse). Alt satırın
    // soluna: sığmayan ajanlar varsa "+3 agents running" özeti, alt ajan yokken 10 saniyede bir
    // değişen komut ipucu (TIPS).
    // Bant dar ise (tight) Random alt satır yerine üstte Hide'ın yanına alınır.
    const showHint = lines.length === 0 && !overflowText && rightW >= 34
    const bottomLeft =
      lines.length > 0 && overflowText ? (
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            {overflowText}
          </Text>
        </Box>
      ) : showHint ? (
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            {TIPS[Math.floor((f * TICK_MS) / TIP_MS) % TIPS.length]}
          </Text>
        </Box>
      ) : null
    const right = (
      <Box flexDirection="column" flexGrow={1} flexShrink={1} justifyContent="space-between">
        <Box gap={2} justifyContent="space-between">
          <Box flexShrink={1}>{header}</Box>
          <Box gap={2} flexShrink={0}>
            {tight ? randomButton : null}
            {isTerminal ? null : hideButton /* terminalde ana bilgisayarın [-] düğmesi var */}
          </Box>
        </Box>
        {lines.length > 0 ? <Box flexDirection="column">{minis}</Box> : null}
        {lines.length === 0 && overflowText ? <Text dimColor>{overflowText}</Text> : null}
        {balon}
        {tight ? null : (
          <Box gap={2} justifyContent={bottomLeft ? 'space-between' : 'flex-end'}>
            {bottomLeft}
            <Box gap={2} flexShrink={0}>
              {toggleButton}
              {randomButton}
            </Box>
          </Box>
        )}
      </Box>
    )

    // Karakter listesi: seçilince karakter kalıcı kaydedilir ve liste kapanır
    // Dikey Select yerine sarılan düğme ızgarası: 20 karakter birkaç satıra sığar, hepsi bir bakışta
    // görünür; mevcut karakter vurgulu. Düğme adları tam yazılır, kesilmez.
    const picker = isPicking ? (
      <Box key="character" flexDirection="column" marginTop={1}>
        <Box gap={2} justifyContent="space-between">
          <Text dimColor wrap="truncate-end">
            Character · pick one
          </Text>
          <Button key="character-close" label="Close" plain dimColor onPress={() => update($, picking, () => false)} />
        </Box>
        <Box flexWrap="wrap" gap={1}>
          {ORDER.map(id => (
            <Button
              key={`character-${id}`}
              label={pick(id).title}
              variant={id === characterId ? 'primary' : 'secondary'}
              autoFocus={id === characterId ? true : undefined}
              onPress={() => {
                void (async () => {
                  await update($, character, () => id)
                  await update($, picking, () => false)
                  await $.store.set('character', id)
                })().catch(err => $.ui.status(`pixel-agents: ${String(err)}`))
              }}
            />
          ))}
        </Box>
      </Box>
    ) : null

    // ---BAĞ-START--- (şapka listesi; kilitli şapka seçilemez, eşiği söyler)
    const hatPicker = isHatPicking ? (
      <Select
        key="hat"
        label={`Hat (bond ${bondPts})`}
        options={[
          { value: 'none', label: 'No hat' },
          ...HAT_ORDER.map(h => {
            const hat = HATS[h]
            const need = hat?.need ?? 0

            return { value: h, label: bondPts >= need ? (hat?.title ?? h) : `${hat?.title ?? h} (locked, ${need} turns)` }
          }),
        ]}
        value={bondHat ?? 'none'}
        autoFocus
        onSelect={choice => {
          void (async () => {
            const res = await bondChooseHat($, characterId, choice)
            if (res.ok) await update($, bondHatPicking, () => false)
            else $.ui.toast(res.text)
          })().catch(err => $.ui.status(`pixel-agents: ${String(err)}`))
        }}
      />
    ) : null
    // ---BAĞ-END---

    return (
      <Box
        flexDirection="column"
        marginTop={framed ? (nameAbove ? topGap - 1 : topGap) : 0}
        {...(nameAbove ? { borderStyle: 'round', borderDimColor: true, paddingX: 1, paddingTop: 1 } : {})}
      >
        {/* Varsayılan stretch: sağ sütun sprite yüksekliğine uzar; Hide üstte, Random altta kalır */}
        <Box gap={2}>
          {/* Sprite sütunu sabit genişlikte; küçülürse satırlar sarılıp sprite kayar. SVG
              yüzeylerinde durum ikonu sprite'ın üstünde ortalanır */}
          <Box flexDirection="column" flexShrink={0} alignItems="center" width={Svg ? undefined : mainCells}>
            {/* Terminalde üstteki boş satır yerine ad + durum simgesi */}
            {nameAbove ? (
              // İçeriğe göre boyutlanan grup sütunda ortalanır; simge satırı ön boşlukla yazının
              // orta noktasına hizalanır (flex ortalaması tek/çift farkında ve host'ta güvenilmez)
              <Box flexDirection="column" alignItems="flex-start" flexShrink={0}>
                <Text key="durum-simge" wrap="truncate">
                  {' '.repeat(Math.max(0, Math.floor((base.length - termIcon(mainKind, f).reduce((n, s) => n + s.glyph.length, 0)) / 2)))}
                  {termIcon(mainKind, f).map((s, i) => (
                    <Text key={`simge-${i}`} color={s.color}>
                      {s.glyph}
                    </Text>
                  ))}
                </Text>
                <Text key="durum-yazi" dimColor wrap="truncate">
                  {base}
                </Text>
              </Box>
            ) : null}
            {/* Durum ile sprite/şapka arasında tam bir boş satır; şapka tuval içinde çizilir (hatMinDy) */}
            {nameAbove ? <Box height={1} /> : null}
            {Svg ? (
              <Box flexDirection="column" alignItems="center">
                {nameTag ? <Svg source={nameTag.svg} alt={spec.title} width={nameTag.w} height={nameTag.h} /> : null}
                {bubbleTag ? (
                  <Svg source={bubbleTag.svg} alt={balonRaw ? `${spec.title} says ${balonRaw}` : `${spec.title} ${base}`} width={bubbleTag.w} height={bubbleTag.h} />
                ) : null}
                <Svg source={svgOf(canvas, cw, PX_MAIN)} alt={`${spec.title} pixel agent, ${base}`} width={cw * PX_MAIN} height={H * PX_MAIN} />
              </Box>
            ) : (
              rows.map((runs, i) => (
                <Text key={`satir-${i}`} wrap="truncate">
                  {runs.map((run, j) => (
                    <Text key={`hucre-${j}`} color={run.color} backgroundColor={run.bg}>
                      {run.text}
                    </Text>
                  ))}
                </Text>
              ))
            )}
          </Box>
          {right}
        </Box>
        {picker}
        {hatPicker}
      </Box>
    )
  })
}
