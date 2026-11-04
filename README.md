# pixel-agent

A Claude Code mod that puts a small pixel-art agent above your prompt. It reacts to what Claude is doing, and every running subagent gets a tiny companion next to it.

## Install

Mods need Claude Code v2.1.287 or later. `pixel-agent` is listed in the [`diyojenyazilim/plugins`](https://github.com/diyojenyazilim/plugins) marketplace.

```bash
claude plugin marketplace add diyojenyazilim/plugins
claude plugin install pixel-agent@diyojenyazilim
```

Or inside a session:

```text
/plugin marketplace add diyojenyazilim/plugins
/plugin install pixel-agent@diyojenyazilim
```

If you install while a session is open, run `/reload-plugins` in it or start a new session. To get a newer version later:

```bash
claude plugin marketplace update diyojenyazilim
```

## What it shows

| State | When | What you see |
| --- | --- | --- |
| ready | Nothing is running | Slow breathing, an occasional blink |
| working | A prompt or tool call is running | Quick bounce, eyes scanning, "typing" dots, current tool name |
| done | A turn finished | Jump, happy eyes, sparkles for 4 seconds |
| tool failed | A tool call failed | Shake, red X eyes, sweat drop for 1.5 seconds |

### Subagents

Each subagent Claude starts appears as a mini sprite (8x8) beside the main character, labelled with its agent type. The same agent type always gets the same character.

| Subagent status | Mini sprite |
| --- | --- |
| running | Bounces, "typing" dots above |
| completed | Jumps with a smile and sparkles, stays 6 seconds, then leaves |
| failed or killed | Shakes with red eyes, stays 6 seconds, then leaves |
| pending, waiting, idle | Stands still and blinks |

The header shows `subagents N running / M total`: `N` is how many are working right now, `M` is how many are on the band, including ones that just finished and have not left yet. If the band is too narrow for every mini sprite, the rest are counted as `(+N hidden)`.

## Characters

`bit` (robot), `ghost` (cat-ghost), `astronaut`, `wizard` (code wizard), `cloud`.

## Commands

| Command | Does |
| --- | --- |
| `/pixel-agent` | Hide or show the agent |
| `/pixel-agent next` | Switch to the next character |
| `/pixel-agent <name>` | Pick a character: `bit`, `ghost`, `astronaut`, `wizard`, `cloud` |
| `/pixel-agent list` | List the characters |

Your choice is remembered between sessions. The band also has a **Hide** button.

## Requirements

- Claude Code v2.1.287 or later.
- The agent is drawn in the terminal and the Desktop app. In `claude -p`, the VS Code panel and cloud sessions the hooks load but nothing is drawn.
- The band is 8 rows tall. If the terminal gives it fewer rows, the agent hides itself instead of drawing half a sprite.

## What the mod touches

A mod is code that runs with your permissions. This one only uses:

- `$.clock` timers, to animate
- `$.agent.list()`, to read subagent statuses
- `$.command.register`, for `/pixel-agent`
- `$.store`, to remember the chosen character
- `$.state` and `$.ui.resolve` / `$.ui.status`, to draw

It reads no files, starts no processes and makes no network requests. Check it yourself before you install it:

```bash
git clone https://github.com/diyojenyazilim/pixel-agent.git
claude plugin validate ./pixel-agent
```

Its `prompt.submit` and `tool.call` hooks have a `.catch` that passes the event through, so a bug in the mod cannot block a prompt or a tool call.

## Notes on rendering

Pixels are drawn with half blocks (`▀`, `▄`, `█`) so each pixel is square. In Windows Terminal, a thin horizontal line between rows can appear if `font.builtinGlyphs` is off or the line height is not 1.

## Development

```bash
# type-check (the types are written next to the mod when Claude Code loads it)
npx -p typescript tsc -p . --noEmit

# check what the mod hooks and calls
claude plugin validate .

# try it for one session
claude --plugin-dir .
```

All code lives in `hooks/register.tsx`, because a mod has one hooks module. The sprite section between `---SPRITE-START---` and `---SPRITE-END---` is plain TypeScript with no Claude Code imports, so it can be extracted and run in Node to preview the sprites.

## License

MIT, see [LICENSE](LICENSE).
