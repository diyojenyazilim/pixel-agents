<div align="center">

# pixel-agents

**A tiny pixel-art companion that lives above your Claude Code prompt.**

It breathes while you think, works while Claude works, and falls asleep when you step away.
Every subagent gets a little companion of its own.

<img src="assets/characters.svg" alt="The five characters: Bit, Ghost, Astronaut, Code Wizard and Cloud" width="560" />

</div>

## Install

Mods need Claude Code v2.1.287 or later.

```bash
claude plugin marketplace add diyojenyazilim/claude-plugins
claude plugin install pixel-agents@diyojenyazilim
```

Or inside a session:

```text
/plugin marketplace add diyojenyazilim/claude-plugins
/plugin install pixel-agents@diyojenyazilim
```

If a session is already open, run `/reload-plugins` or start a new one. To get a newer version later, run `claude plugin marketplace update diyojenyazilim`.

## What you get

<div align="center">
  <img src="assets/states.svg" alt="Ready, working with a book, done, tool failed and sleeping" width="720" />
</div>

- **It reacts to Claude.** Ready, working, done, tool failed, each with its own face and motion.
- **It idles like a living thing.** Blinks, looks around, strolls to the side and back, yawns, and goes to sleep after a couple of minutes.
- **It picks up a prop for the tool at hand.** A book for `Read`, a notepad for `Edit` and `Write`, a terminal for `Bash`, a magnifier for `Grep` and `Glob`, a globe for web tools.
- **Subagents get companions.** Each one walks in beside the main character, works, celebrates or flinches when it ends, and walks out. The same agent type always gets the same character.
- **A context meter.** `ctx` shows how full the context window is. Past 85% the character looks tired.
- **Five characters, six color themes.** Your choice is remembered between sessions.

## Commands

| Command | Does |
| --- | --- |
| `/pixel-agent` | Hide or show the agent |
| `/pixel-agent next` | Switch to the next character |
| `/pixel-agent <name>` | `bit`, `ghost`, `astronaut`, `wizard` or `cloud` |
| `/pixel-agent list` | List the characters |
| `/pixel-agent theme next` | Switch to the next color theme |
| `/pixel-agent theme <name>` | `classic`, `mono`, `ember`, `forest`, `ocean` or `rose` |

The band also has a **Hide** button.

<div align="center">
  <img src="assets/themes.svg" alt="The Code Wizard in six color themes" width="640" />
</div>

## Requirements

- Claude Code v2.1.287 or later.
- Drawn in the terminal, the Desktop app and the VS Code extension. In `claude -p` and cloud sessions the mod loads but draws nothing. The Desktop app and VS Code draw the sprite as an SVG image, so no font or terminal setting affects it there.
- Needs 7 free rows. With fewer, the agent hides instead of drawing half a sprite. Walking and props need a band at least 76 columns wide.

## Troubleshooting

**The sprite looks shifted, torn or has its rows staggered.** Update the mod (`claude plugin marketplace update diyojenyazilim`, then `/reload-plugins`). Older versions let a narrow window squeeze the sprite column so its rows wrapped. If it still happens in the terminal, widen the window to at least 40 columns.

A thin line between the rows of the sprite means your terminal is not drawing block characters edge to edge.

- **Windows Terminal:** set `font.builtinGlyphs` to `true` and `font.cellHeight` to `"1.0"` in your profile.
- **VS Code terminal:** set `terminal.integrated.gpuAcceleration` to `"auto"` (the `"off"` renderer leaves gaps), `terminal.integrated.customGlyphs` to `true` and `terminal.integrated.lineHeight` to `1`.

## What the mod touches

A mod is code that runs with your permissions, so here is everything it uses:

- `$.clock` timers, to animate
- `$.agent.list()`, to read subagent statuses
- `$.session` measurements, to read context usage
- `$.command.register`, for `/pixel-agent`
- `$.store`, to remember your character and theme
- `$.state` and `$.ui`, to draw

It reads no files, starts no processes and makes no network requests. Its `prompt.submit` and `tool.call` hooks pass the event through if the mod ever fails, so a bug here cannot block a prompt or a tool call. You can check it yourself:

```bash
git clone https://github.com/diyojenyazilim/pixel-agents.git
claude plugin validate ./pixel-agents
```

## License

MIT, see [LICENSE](LICENSE).
