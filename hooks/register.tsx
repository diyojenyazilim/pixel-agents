import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, Mode } from '../types'

const mode = atom({ plugin: 'pixel-agent', key: 'mode' } as const, 'idle' as Mode)
const frame = atom({ plugin: 'pixel-agent', key: 'frame' } as const, 0)
const label = atom({ plugin: 'pixel-agent', key: 'label' } as const, '')
const isHidden = atom({ plugin: 'pixel-agent', key: 'isHidden' } as const, false)
const character = atom({ plugin: 'pixel-agent', key: 'character' } as const, 'bit')
const agents = atom({ plugin: 'pixel-agent', key: 'agents' } as const, [] as AgentRow[])
// Boşta kalmanın başladığı kare (-1: boşta değil). Her karede sayaç yazmamak için
// yalnız geçişte yazılır; boşta süresi frame farkından hesaplanır.
const idleStart = atom({ plugin: 'pixel-agent', key: 'idleStart' } as const, -1)
const theme = atom({ plugin: 'pixel-agent', key: 'theme' } as const, 'classic')
const ctx = atom({ plugin: 'pixel-agent', key: 'ctx' } as const, -1)

// Bağlam bu yüzdeyi aşınca karakter yorgun görünür, çubuk kırmızıya döner
const CTX_WARN = 60
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

const CHARACTERS: Record<string, Spec> = {
  bit: BIT,
  ghost: GOLGE,
  astronaut: ASTRONOT,
  wizard: BUYUCU,
  cloud: BULUT,
}
const ORDER = ['bit', 'ghost', 'astronaut', 'wizard', 'cloud']

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

// tired: bağlam dolmak üzere; yarı kapalı gözler ve ter damlası
type ComposeOpts = { cw: number; idleTicks: number; tool: string; tired: boolean }

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

function compose(spec: Spec, m: Mode, f: number, o: ComposeOpts): Px[][] {
  const { cw } = o
  const canvas: Px[][] = Array.from({ length: H }, () => Array<Px>(cw).fill(undefined))
  const pose = poseFor(m, o.idleTicks, Math.max(0, cw - W_NARROW))

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
        px(ex + gx, ey + gy, RED)
      }
    } else {
      // Hata: X göz 3 piksel geniş; iki X birbirine değmesin diye dışa doğru açılır
      const x0 = isRight ? ex : ex - 1
      for (const [gx, gy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]] as const) {
        px(x0 + gx, ey + gy, RED)
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
  } else if (m === 'err') {
    spark(15, 3 + (f % 4), SWEAT)
  }

  if (o.tired && (m === 'idle' || m === 'work')) spark(sideX, 3 + (f % 4), SWEAT)

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
}

const MW = 10
const MH = 10

// slide: giriş/çıkış kayması (miniSlide); kayarken adım sekmesi yapar
function composeMini(id: string, m: Mode, f: number, slide: number, themeId: string): Px[][] {
  const spec = themed(pick(id), themeId)
  const mini = MINIS[id] ?? MINI_BIT
  const canvas: Px[][] = Array.from({ length: MH }, () => Array<Px>(MW).fill(undefined))

  // Çalışan alt ajan seker, biten zıplar, hata alan titrer, bekleyen durur
  const dy = slide !== 0 || m === 'work' ? 1 + (f % 2) : m === 'ok' ? f % 2 : 1
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

function svgOf(canvas: Px[][], w: number, scale: number): string {
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${canvas.length}" width="${w * scale}" height="${canvas.length * scale}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

const STATUS: Record<Mode, string> = {
  idle: 'ready',
  work: 'working',
  ok: 'done',
  err: 'tool failed',
}

const ROWS = H / 2
// Üstte 1 satır boşluk + altta 1 satır zemin çizgisi; yer yoksa ikisi atlanıp yalnız sprite çizilir
const FRAMED_ROWS = ROWS + 2

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pixel-agent',
      description:
        'Show or hide the pixel agent, pick a character (bit, ghost, astronaut, wizard, cloud, next, list) or a color theme (theme <name|next>)',
    })

    // Önceki oturumda seçilen karakteri geri yükle
    const saved = await $.store.get('character')
    if (typeof saved === 'string' && ORDER.includes(saved)) {
      await update($, character, () => saved)
    }

    const savedTheme = await $.store.get('theme')
    if (typeof savedTheme === 'string' && THEME_ORDER.includes(savedTheme)) {
      await update($, theme, () => savedTheme)
    }

    const seen = new Map<string, Seen>()
    // Süresi dolup bantan düşen ajanlar; motor kaydı listede tutsa bile geri eklenmesin
    const dismissed = new Set<string>()
    const typeChar = new Map<string, string>()
    let lastRoster = ''

    // Her alt ajan türü ilk görüldüğü sırayla bir karakter alır; aynı anda çalışan
    // farklı türler karışmaz, aynı tür hep aynı karakterdir
    const charFor = (type: string): string => {
      const known = typeChar.get(type)
      if (known) return known

      const assigned = ORDER[typeChar.size % ORDER.length] ?? 'bit'
      typeChar.set(type, assigned)

      return assigned
    }

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

    // Yalnızca görünürken kare ilerlet ve alt ajanları izle; gizliyken yeniden çizim yok
    $.clock.every(450, () => {
      void read($, isHidden)
        .then(async hidden => {
          if (hidden) return
          await update($, frame, n => (n + 1) % FRAME_WRAP)
          await trackIdle()
          await track()
        })
        .catch(err => {
          // Süs bir mod: hatayı durum satırında göster, oturumu bozma
          $.ui.status(`pixel-agent: ${String(err)}`)
        })
    })

    return next(e)
  })

  on('command.run', { command: 'pixel-agent' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const list = ORDER.map(id => `${id} (${pick(id).title})`).join(', ')
    const [head = '', ...rest] = arg.split(/\s+/)

    if (head === 'theme') {
      const want = rest[0] ?? ''
      const themes = THEME_ORDER.map(id => `${id} (${THEMES[id]?.title ?? id})`).join(', ')

      if (want === '') {
        return { text: `Themes: ${themes}. Pick one with /pixel-agent theme <name>, or switch with /pixel-agent theme next.` }
      }

      let chosen = want
      if (want === 'next') {
        const current = await read($, theme)
        chosen = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length] ?? 'classic'
      }

      if (!THEME_ORDER.includes(chosen)) {
        return { text: `Unknown theme: ${want}. Options: ${themes}.` }
      }

      await update($, theme, () => chosen)
      await update($, isHidden, () => false)
      await $.store.set('theme', chosen)

      return { text: `Theme: ${THEMES[chosen]?.title ?? chosen}.` }
    }

    if (arg === '') {
      const hide = !(await read($, isHidden))
      await update($, isHidden, () => hide)

      return { text: hide ? 'Pixel agent hidden.' : 'Pixel agent is back.' }
    }

    if (arg === 'list') {
      return { text: `Characters: ${list}. Pick one with /pixel-agent <name>, or switch with /pixel-agent next.` }
    }

    let next = arg

    if (arg === 'next') {
      const current = await read($, character)
      next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'bit'
    }

    if (!ORDER.includes(next)) {
      return { text: `Unknown character: ${arg}. Options: ${list}.` }
    }

    await update($, character, () => next)
    await update($, isHidden, () => false)
    await $.store.set('character', next)

    return { text: `Character: ${pick(next).title}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, mode, () => 'work')
    await update($, label, () => '')

    return next(e)
  }).catch(($, e, next) => next(e)) // karakter hata verirse istek engellenmesin

  on('tool.call', async ($, e, next) => {
    await update($, mode, () => 'work')
    await update($, label, () => e.tool)

    const ran = await next(e)

    if ((ran as { isError?: boolean }).isError === true) {
      await update($, mode, () => 'err')
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
    await update($, mode, () => 'ok')
    await update($, label, () => '')
    $.clock.after(4000, () => {
      void read($, mode).then(m => {
        if (m === 'ok') void update($, mode, () => 'idle')
      })
    })

    return next(e)
  })

  // Bağlam doluluğu motordan itilir (her turdan sonra); percent taze oturumda ve
  // /compact sonrası ilk yanıta kadar yoktur, o zaman -1 (çubuk gizli)
  on('session.measure', async ($, e, next) => {
    await update($, ctx, () => e.context.percent ?? -1)

    return next(e)
  }).catch(($, e, next) => next(e)) // ölçüm hatası oturumu bozmasın

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const maxRows = e.props.maxRows

    // Band bu kadar yükseğe sığmıyorsa çizme (yarım karakter göstermesin)
    if (e.props.hasSurvey || (maxRows !== undefined && maxRows < ROWS) || (await read($, isHidden))) {
      return next(e)
    }

    const columns = e.props.bodyColumns ?? 100

    // Sprite'ın kendi genişliğine bile sığmıyorsa çizme; sığmayan satır sarılıp kayardı
    if (columns < W_NARROW) return next(e)

    // Çerçeve (boşluk + zemin çizgisi) için yer yoksa yalnız sprite çizilir
    const framed = maxRows === undefined || maxRows >= FRAMED_ROWS
    const cw = columns >= WIDE_MIN_COLUMNS ? W_WIDE : W_NARROW
    const isTerminal = e.surface === 'terminal'

    const m = await read($, mode)
    const f = await read($, frame)
    const start = await read($, idleStart)
    const idleTicks = start < 0 ? 0 : (f - start + FRAME_WRAP) % FRAME_WRAP
    const tool = await read($, label)
    const themeId = await read($, theme)
    const spec = themed(pick(await read($, character)), themeId)
    const pct = await read($, ctx)
    const { Box, Button, Text } = $.ui.resolve(e)
    // Terminal tablosunda Svg yok; VS Code / masaüstü / mobilde var
    const Svg = e.surface === 'terminal' ? undefined : $.ui.resolve(e).Svg

    const canvas = compose(spec, m, f, { cw, idleTicks, tool, tired: pct >= CTX_TIRED })
    const rows = Array.from({ length: ROWS }, (_, i) =>
      rowRuns(canvas[i * 2] ?? [], canvas[i * 2 + 1] ?? [], cw),
    )
    const roster = await read($, agents)
    // Alt ajan sprite'ları ana karakterin yanına sığacak kadar gösterilir
    const slots = Math.max(0, Math.floor((columns - (cw + 4)) / MW))
    const shown = roster.slice(0, slots)
    const hidden = roster.length - shown.length
    const busy = roster.filter(a => a.mode === 'work').length

    const asleep = m === 'idle' && idleTicks >= SLEEP_AFTER
    const base = asleep ? 'sleeping' : m === 'work' && tool ? `${STATUS[m]} · ${tool}` : STATUS[m]
    const crew =
      roster.length > 0
        ? ` · subagents ${busy} running / ${roster.length} total${hidden > 0 ? ` (+${hidden} hidden)` : ''}`
        : ''

    // Sağ sütun sprite'tan kalan genişliktir; metinler sığmazsa sarılmaz, kesilir
    const rightW = Math.max(10, columns - cw - 2)

    const header = (
      <Text wrap="truncate-end">
        {spec.title} <Text dimColor>· {base}{crew}</Text>
      </Text>
    )
    const hideButton = <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />

    // Bağlam çubuğu: ölçüm gelene kadar gizli; eşikleri aşınca sarı/kırmızı
    const cells = columns >= 90 ? 10 : 6
    const filled = Math.round((Math.min(100, pct) / 100) * cells)
    const ctxBar =
      pct >= 0 && rightW >= 44 ? (
        <Text wrap="truncate-end" color={pct >= CTX_TIRED ? RED : pct >= CTX_WARN ? AMBER : undefined} dimColor={pct < CTX_WARN}>
          ctx {'█'.repeat(filled)}
          {'░'.repeat(cells - filled)} {pct}%
        </Text>
      ) : null

    const minis = shown.map(a => {
      const since = (f - a.enteredFrame + FRAME_WRAP) % FRAME_WRAP
      const left =
        a.endedFrame === undefined ? undefined : HOLD_TICKS - ((f - a.endedFrame + FRAME_WRAP) % FRAME_WRAP)
      const grid = composeMini(a.char, a.mode, f, miniSlide(since, left), themeId)
      const miniRows = Array.from({ length: MH / 2 }, (_, i) =>
        rowRuns(grid[i * 2] ?? [], grid[i * 2 + 1] ?? [], MW),
      )
      // Eklenti önekini at; terminalde sütun hizası bozulmasın diye sabit genişliğe tamamla
      const short = (a.type.split(':').pop() ?? a.type).slice(0, MW - 1)
      const name = isTerminal ? short.padEnd(MW) : short

      return (
        <Box key={`mini-${a.id}`} flexDirection="column" flexShrink={0}>
          {Svg ? (
            <Svg source={svgOf(grid, MW, PX_MINI)} alt={`${short} subagent`} width={MW * PX_MINI} height={MH * PX_MINI} />
          ) : (
            miniRows.map((runs, i) => (
              <Text key={`m-${i}`} wrap="truncate">
                {runs.map((run, j) => (
                  <Text key={`c-${j}`} color={run.color} backgroundColor={run.bg}>
                    {run.text}
                  </Text>
                ))}
              </Text>
            ))
          )}
          <Text dimColor wrap="truncate-end">
            {name}
          </Text>
        </Box>
      )
    })

    // Alt ajan varken sağ sütun sprite yüksekliğini (7 satır) aşmasın diye ipucu metni
    // atlanır, Hide düğmesi başlık satırına alınır
    const right =
      shown.length > 0 ? (
        <Box flexDirection="column" flexShrink={1}>
          <Box gap={2}>
            <Box flexShrink={1}>{header}</Box>
            {ctxBar ? <Box flexShrink={0}>{ctxBar}</Box> : null}
            <Box flexShrink={0}>{hideButton}</Box>
          </Box>
          <Box>{minis}</Box>
        </Box>
      ) : (
        <Box flexDirection="column" flexShrink={1}>
          <Box gap={2}>
            <Box flexShrink={1}>{header}</Box>
            {ctxBar ? <Box flexShrink={0}>{ctxBar}</Box> : null}
          </Box>
          <Box gap={2}>
            {rightW >= 30 ? (
              <Box flexShrink={1}>
                <Text dimColor wrap="truncate-end">
                  /pixel-agent next
                </Text>
              </Box>
            ) : null}
            <Box flexShrink={0}>{hideButton}</Box>
          </Box>
        </Box>
      )

    const rule = '─'.repeat(Math.min(columns, 100))

    return (
      <Box flexDirection="column" marginTop={framed ? 1 : 0}>
        <Box gap={2} alignItems="center">
          {/* Sprite sütunu sabit genişlikte; küçülürse satırlar sarılıp sprite kayar */}
          <Box flexDirection="column" flexShrink={0} width={Svg ? undefined : cw}>
            {Svg ? (
              <Svg source={svgOf(canvas, cw, PX_MAIN)} alt={`${spec.title} pixel agent, ${base}`} width={cw * PX_MAIN} height={H * PX_MAIN} />
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
        {framed && isTerminal ? <Text dimColor wrap="truncate">{rule}</Text> : null}
      </Box>
    )
  })
}
