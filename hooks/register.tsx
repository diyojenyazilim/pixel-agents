import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, Mode } from '../types'

const mode = atom({ plugin: 'pixel-agent', key: 'mode' } as const, 'idle' as Mode)
const frame = atom({ plugin: 'pixel-agent', key: 'frame' } as const, 0)
const label = atom({ plugin: 'pixel-agent', key: 'label' } as const, '')
const isHidden = atom({ plugin: 'pixel-agent', key: 'isHidden' } as const, false)
const character = atom({ plugin: 'pixel-agent', key: 'character' } as const, 'bit')
const agents = atom({ plugin: 'pixel-agent', key: 'agents' } as const, [] as AgentRow[])

// Biten bir alt ajan bantta bu kadar süre kalır; motor kaydı birkaç saniye sonra düşürüyor
const HOLD_MS = 6000

type Seen = { type: string; char: string; mode: Mode; endedAt?: number }

// ---SPRITE-START---
// Tuval 18x16 piksel (8 metin satırı). Sprite 16x14; kenarlarda ve üstte boşluk
// zıplama/titreme ve parçacıklar için ayrıldı. Her metin satırı iki piksel
// satırını ▀ (ön plan = üst, arka plan = alt) ile çizer: hücre başına iki renk,
// piksel kare.
const W = 18
const H = 16

type Spec = {
  title: string
  palette: Record<string, string>
  // 14 satır x 8 sütun; sağ yarı ayna ile üretilir. '.' saydam.
  half: string[]
  // Sol gözün sol sütunu; sağ göz aynalanır (14 - eyeX)
  eyeX: number
  eyeY: number
  mouthY: number
  eye: string
  line: string
}

const WHITE = '#FFFFFF'
const RED = '#E5484D'
const AMBER = '#F6B93B'
const SWEAT = '#7FE3FF'

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
    '.......a',
    '.......O',
    '..OOOOOO',
    '.Ohhhhhh',
    '.Ohmmmmm',
    '.Omsssss',
    'kOmsssss',
    'kOmsssss',
    '.Omsssss',
    '.Omsssss',
    '.Okkkkkk',
    '..OOOOOO',
    '.Ohmmmmm',
    '..OOOOOO',
  ],
  eyeX: 4,
  eyeY: 6,
  mouthY: 9,
  eye: '#FFB454',
  line: '#C98A3E',
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
    '..O.....',
    '.OmO....',
    '.OpmOOOO',
    '.Ommhhhh',
    'Ommmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Okmmmmmm',
    'Okkkkkkk',
    'O.OO.OO.',
  ],
  eyeX: 4,
  eyeY: 5,
  mouthY: 8,
  eye: '#1B9C8C',
  line: '#3B3A4A',
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
    '....OOOO',
    '..OOhhhh',
    '.Ohhmmmm',
    'Ommsssss',
    'Ommsssss',
    'Ommsssss',
    'Ommsssss',
    'Ommsssss',
    'Ommsssss',
    '.Okkkkkk',
    'bbOmmmmm',
    'bbOmmmrr',
    'bbOmmmmm',
    '.OOkkkkk',
  ],
  eyeX: 4,
  eyeY: 5,
  mouthY: 8,
  eye: '#7FE3FF',
  line: '#5BB8D6',
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
    '.......m',
    '......Om',
    '......hm',
    '.....Ohm',
    '.....mym',
    '....Ohmm',
    '..OOmmmm',
    '.Okkkkkk',
    '...Offff',
    '...Offff',
    '...Offff',
    '..Obbbbb',
    '...Obbbb',
    '....Obbb',
  ],
  eyeX: 5,
  eyeY: 8,
  mouthY: 10,
  eye: '#2A1D16',
  line: '#7A4B3A',
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
    '......OO',
    '....OOhh',
    '...Ohhhh',
    '.OOhhmmm',
    'Ohhmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Ommmmmmm',
    'Okmmmmmm',
    '.Okkkkkk',
    '..OOOOOO',
    '........',
  ],
  eyeX: 4,
  eyeY: 6,
  mouthY: 10,
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

function mirror(row: string): string {
  return row + row.split('').reverse().join('')
}

type Px = string | undefined

function compose(spec: Spec, m: Mode, f: number): Px[][] {
  const canvas: Px[][] = Array.from({ length: H }, () => Array<Px>(W).fill(undefined))

  // Hareket: boşta nefes (1 px), çalışırken hızlı sekme, bitince zıplama, hatada titreme
  const dy = m === 'idle' ? 2 - (f % 8 < 4 ? 0 : 1) : m === 'work' ? 2 - (f % 2) : m === 'ok' ? 1 - (f % 2) : 2
  const dx = m === 'err' ? (f % 2 === 0 ? 0 : 2) : 1

  const put = (x: number, y: number, c: Px) => {
    const row = canvas[y]
    if (row && c && x >= 0 && x < W) row[x] = c
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

  for (const [ex, isRight] of [
    [spec.eyeX, false],
    [14 - spec.eyeX, true],
  ] as const) {
    if (m === 'idle' && f % 8 === 7) {
      // Göz kırpma: tek kare, alt çizgi
      px(ex, ey + 1, spec.line)
      px(ex + 1, ey + 1, spec.line)
    } else if (m === 'idle' || m === 'work') {
      for (const [gx, gy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        px(ex + gx, ey + gy, spec.eye)
      }
      // Parlama pikseli: çalışırken sağa sola bakar
      px(ex + (m === 'work' ? f % 2 : 0), ey, WHITE)
    } else if (m === 'ok') {
      // Mutlu göz: ^ yayı
      px(ex - 1, ey + 1, spec.eye)
      px(ex, ey, spec.eye)
      px(ex + 1, ey, spec.eye)
      px(ex + 2, ey + 1, spec.eye)
    } else {
      // Hata: X göz 3 piksel geniş; iki X birbirine değmesin diye dışa doğru açılır
      const x0 = isRight ? ex : ex - 1
      for (const [gx, gy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]] as const) {
        px(x0 + gx, ey + gy, RED)
      }
    }
  }

  if (m === 'idle') {
    px(7, my, spec.line)
    px(8, my, spec.line)
  } else if (m === 'work') {
    // Konuşur gibi: ağız 2 ile 4 piksel arasında açılıp kapanır
    const cols = f % 2 === 0 ? [7, 8] : [6, 7, 8, 9]
    for (const c of cols) px(c, my, spec.line)
  } else if (m === 'ok') {
    px(6, my, spec.line)
    px(7, my + 1, spec.line)
    px(8, my + 1, spec.line)
    px(9, my, spec.line)
  } else {
    px(6, my + 1, RED)
    px(7, my, RED)
    px(8, my + 1, RED)
    px(9, my, RED)
  }

  // Parçacıklar yalnız boş piksele düşer; sprite her zaman öndedir
  if (m === 'work') {
    for (let i = 0; i < 3; i += 1) spark(14 + i, 0, i === f % 3 ? AMBER : '#4A4440')
  } else if (m === 'ok') {
    spark(0, 3 + (f % 3), AMBER)
    spark(17, 5 - (f % 3), AMBER)
    spark(f % 2 === 0 ? 3 : 14, 0, WHITE)
  } else if (m === 'err') {
    spark(17, 4 + (f % 4), SWEAT)
  }

  return canvas
}

type Run = { text: string; color?: string; bg?: string }

// İki piksel satırını tek metin satırına çevirir; aynı stildeki hücreleri birleştirir.
function rowRuns(top: Px[], bottom: Px[], width: number = W): Run[] {
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

function composeMini(id: string, m: Mode, f: number): Px[][] {
  const spec = pick(id)
  const mini = MINIS[id] ?? MINI_BIT
  const canvas: Px[][] = Array.from({ length: MH }, () => Array<Px>(MW).fill(undefined))

  // Çalışan alt ajan seker, biten zıplar, hata alan titrer, bekleyen durur
  const dy = m === 'work' ? 1 + (f % 2) : m === 'ok' ? f % 2 : 1
  const dx = m === 'err' ? (f % 2 === 0 ? 0 : 2) : 1

  const put = (x: number, y: number, c: Px) => {
    const row = canvas[y]
    if (row && c && x >= 0 && x < MW) row[x] = c
  }
  const px = (x: number, y: number, c: Px) => put(dx + x, dy + y, c)
  const spark = (x: number, y: number, c: string) => {
    if (canvas[y]?.[x] === undefined) put(x, y, c)
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

const STATUS: Record<Mode, string> = {
  idle: 'ready',
  work: 'working',
  ok: 'done',
  err: 'tool failed',
}

const ROWS = H / 2

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pixel-agent',
      description: 'Show or hide the pixel agent, pick a character (bit, ghost, astronaut, wizard, cloud, next, list)',
    })

    // Önceki oturumda seçilen karakteri geri yükle
    const saved = await $.store.get('character')
    if (typeof saved === 'string' && ORDER.includes(saved)) {
      await update($, character, () => saved)
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
      const list = await $.agent.list()
      const alive = new Set<string>()

      for (const a of list) {
        if (dismissed.has(a.id)) continue

        alive.add(a.id)
        const m = modeOf(a.status)
        const isEnded = m === 'ok' || m === 'err'
        const endedAt = isEnded ? (seen.get(a.id)?.endedAt ?? now) : undefined
        seen.set(a.id, { type: a.type, char: charFor(a.type), mode: m, endedAt })
      }

      seen.forEach((s, id) => {
        if (!alive.has(id) && s.endedAt === undefined) {
          seen.set(id, { ...s, mode: 'ok', endedAt: now })
        }

        const entry = seen.get(id)
        if (entry?.endedAt !== undefined && now - entry.endedAt > HOLD_MS) {
          seen.delete(id)
          dismissed.add(id)
        }
      })

      const roster: AgentRow[] = []
      seen.forEach((s, id) => roster.push({ id, type: s.type, char: s.char, mode: s.mode }))

      // Yalnız değişince yaz; aksi halde her tikte gereksiz yeniden çizim olur
      const json = JSON.stringify(roster)
      if (json !== lastRoster) {
        lastRoster = json
        await update($, agents, () => roster)
      }
    }

    // Yalnızca görünürken kare ilerlet ve alt ajanları izle; gizliyken yeniden çizim yok
    $.clock.every(450, () => {
      void read($, isHidden)
        .then(async hidden => {
          if (hidden) return
          await update($, frame, n => (n + 1) % 1000)
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const maxRows = e.props.maxRows

    // Band bu kadar yükseğe sığmıyorsa çizme (yarım karakter göstermesin)
    if (e.props.hasSurvey || (maxRows !== undefined && maxRows < ROWS) || (await read($, isHidden))) {
      return next(e)
    }

    const m = await read($, mode)
    const f = await read($, frame)
    const tool = await read($, label)
    const spec = pick(await read($, character))
    const { Box, Button, Text } = $.ui.resolve(e)

    const canvas = compose(spec, m, f)
    const rows = Array.from({ length: ROWS }, (_, i) =>
      rowRuns(canvas[i * 2] ?? [], canvas[i * 2 + 1] ?? []),
    )
    const roster = await read($, agents)
    // Alt ajan sprite'ları ana karakterin yanına sığacak kadar gösterilir
    const slots = Math.max(0, Math.floor(((e.props.bodyColumns ?? 100) - 22) / MW))
    const shown = roster.slice(0, slots)
    const hidden = roster.length - shown.length
    const busy = roster.filter(a => a.mode === 'work').length

    const base = m === 'work' && tool ? `${STATUS[m]} · ${tool}` : STATUS[m]
    const crew =
      roster.length > 0
        ? ` · subagents ${busy} running / ${roster.length} total${hidden > 0 ? ` (+${hidden} hidden)` : ''}`
        : ''

    const header = (
      <Text>
        {spec.title} <Text dimColor>· {base}{crew}</Text>
      </Text>
    )
    const footer = (
      <Box gap={2}>
        <Text dimColor>/pixel-agent next</Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )

    const minis = shown.map(a => {
      const grid = composeMini(a.char, a.mode, f)
      const miniRows = Array.from({ length: MH / 2 }, (_, i) =>
        rowRuns(grid[i * 2] ?? [], grid[i * 2 + 1] ?? [], MW),
      )
      // Eklenti önekini at, sütun hizası bozulmasın diye sabit genişliğe tamamla
      const name = (a.type.split(':').pop() ?? a.type).slice(0, MW - 1).padEnd(MW)

      return (
        <Box key={`mini-${a.id}`} flexDirection="column">
          {miniRows.map((runs, i) => (
            <Text key={`m-${i}`}>
              {runs.map((run, j) => (
                <Text key={`c-${j}`} color={run.color} backgroundColor={run.bg}>
                  {run.text}
                </Text>
              ))}
            </Text>
          ))}
          <Text dimColor>{name}</Text>
        </Box>
      )
    })

    const right =
      shown.length > 0 ? (
        <Box flexDirection="column">
          {header}
          <Box>{minis}</Box>
          {footer}
        </Box>
      ) : (
        <Box flexDirection="column">
          {header}
          {footer}
        </Box>
      )

    return (
      <Box gap={2} alignItems="center">
        <Box flexDirection="column">
          {rows.map((runs, i) => (
            <Text key={`satir-${i}`}>
              {runs.map((run, j) => (
                <Text key={`hucre-${j}`} color={run.color} backgroundColor={run.bg}>
                  {run.text}
                </Text>
              ))}
            </Text>
          ))}
        </Box>
        {right}
      </Box>
    )
  })
}
