# pixel-agent

A Claude Code mod that puts a small pixel-art agent above your prompt. It reacts to what Claude is doing, and every running subagent gets a tiny companion next to it.

## Install

```bash
claude plugin marketplace add diyojenyazilim/pixel-agent
claude plugin install pixel-agent@pixel-agents
```

Or inside a session: `/plugin install pixel-agent@pixel-agents`. Start a new session, or run `/reload-plugins`, to load it.

## What it shows

| State | When | What you see |
| --- | --- | --- |
| idle | Nothing is running | Slow 1 px breathing, an occasional blink |
| working | A prompt or tool call is running | Quick bounce, eyes scanning, mouth talking, "typing" dots, current tool name |
| done | A turn finished | Jump, happy eyes, smile, sparkles for 4 seconds |
| error | A tool call failed | Shake, red X eyes, sweat drop for 1.5 seconds |

### Subagents

Each subagent Claude starts appears as a mini sprite (8x8) beside the main character, labelled with its agent type.

| Subagent status | Mini sprite |
| --- | --- |
| running | Bounces, "typing" dots above |
| completed | Jumps with a smile and sparkles, stays 6 seconds, then leaves |
| failed or killed | Shakes with red eyes, stays 6 seconds, then leaves |
| pending, waiting, idle | Stands still and blinks |

The first time an agent type shows up it is given the next character in the list, so different types running together look different and the same type always looks the same. The header counts them as `subagents N running / M total`: `N` is how many are working right now, `M` is how many are on the band (running plus the ones that just finished and have not left yet). If the band is too narrow for every mini sprite, the rest are counted as `(+N hidden)`.

## Characters

`bit` (robot), `ghost` (cat-ghost), `astronaut`, `wizard` (code wizard), `cloud`.

## Commands

| Command | Does |
| --- | --- |
| `/pixel-agent` | Hide or show the agent |
| `/pixel-agent next` | Switch to the next character |
| `/pixel-agent <name>` | Pick a character: `bit`, `ghost`, `astronaut`, `wizard`, `cloud` |
| `/pixel-agent list` | List the characters |

The choice is remembered between sessions. The band also has a **Hide** button that hides it.

## Requirements

- Claude Code v2.1.287 or later (mods).
- The agent is drawn in the terminal and the Desktop app. In `claude -p`, the VS Code panel and cloud sessions, the hooks load but nothing is drawn there.
- The band is 8 rows tall. If the terminal gives the band fewer rows, the agent hides itself instead of drawing half a sprite.

## What the mod touches

A mod is code that runs with your permissions. This one only uses:

- `$.clock` timers, to animate
- `$.agent.list()`, to read subagent statuses
- `$.command.register`, for `/pixel-agent`
- `$.store`, to remember the chosen character
- `$.state` and `$.ui.resolve` / `$.ui.status`, to draw

It reads no files, starts no processes and makes no network requests. You can check this yourself:

```bash
claude plugin validate ./plugins/pixel-agent
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
