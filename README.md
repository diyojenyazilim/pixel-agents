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

If a session is already open, run `/reload-plugins` or start a new one.

## Update

A new version only shows up after you refresh the marketplace, then update the plugin:

```bash
claude plugin marketplace update diyojenyazilim
claude plugin update pixel-agents@diyojenyazilim
```

Then restart Claude Code, or run `/reload-plugins` in an open session. The VS Code extension needs a window reload (`Developer: Reload Window`).

Check which version you have with `claude plugin list`. If it does not change, you are already on the latest.

## What you get

<div align="center">
  <img src="assets/states.svg" alt="Ready, working with a book, done, tool failed and sleeping" width="720" />
</div>

- **It reacts to Claude.** Ready, working, done, tool failed, each with its own face and motion.
- **It idles like a living thing.** Blinks, looks around, strolls to the side and back, yawns, and goes to sleep after a couple of minutes.
- **It picks up a prop for the tool at hand.** A book for `Read`, a notepad for `Edit` and `Write`, a terminal for `Bash`, a magnifier for `Grep` and `Glob`, a globe for web tools.
- **Subagents get companions.** Each one walks in beside the main character, works, celebrates or flinches when it ends, and walks out. The same agent type always gets the same character. Each companion shows its full agent name (for example `general-purpose`), and they line up side by side and wrap onto the next row when they do not fit.
- **A context meter.** `ctx` shows how full the context window is. Past 85% the character looks tired.
- **Five characters, six color themes.** Your choice is remembered between sessions.

## Commands

| Command | Does |
| --- | --- |
| `/pixel-agent` | Hide or show the agent |
| `/pixel-agent random` | Switch to a random character |
| `/pixel-agent <name>` | `bit`, `ghost`, `astronaut`, `wizard` or `cloud` |
| `/pixel-agent list` | List the characters |
| `/pixel-agent theme next` | Switch to the next color theme |
| `/pixel-agent theme <name>` | `classic`, `mono`, `ember`, `forest`, `ocean` or `rose` |

The band has two buttons: **Hide** in the top-right corner and **Random** in the bottom-right corner, which switches to a random character.

<div align="center">
  <img src="assets/themes.svg" alt="The Code Wizard in six color themes" width="640" />
</div>

## Requirements

- Claude Code v2.1.287 or later.
- Drawn in the terminal, the Desktop app and the VS Code extension. In `claude -p` and cloud sessions the mod loads but draws nothing. The Desktop app and VS Code draw the sprite as an SVG image, so no font or terminal setting affects it there.
- Needs 7 free rows. With fewer, the agent hides instead of drawing half a sprite. Walking and props need a band at least 76 columns wide.

## Troubleshooting

**The sprite looks shifted, torn or has its rows staggered.** Update the mod (see [Update](#update)). Older versions let a narrow window squeeze the sprite column so its rows wrapped. If it still happens in the terminal, widen the window to at least 40 columns.

A thin line between the rows of the sprite means your terminal is not drawing block characters edge to edge.

- **Windows Terminal:** set `font.builtinGlyphs` to `true` and `font.cellHeight` to `"1.0"` in your profile.
- **VS Code terminal:** set `terminal.integrated.gpuAcceleration` to `"auto"` (the `"off"` renderer leaves gaps), `terminal.integrated.customGlyphs` to `true` and `terminal.integrated.lineHeight` to `1`.

## What the mod touches

A mod is code that runs with your permissions, so here is everything it does:

- Runs timers to animate the sprite
- Reads subagent statuses and how full your context is
- Registers the `/pixel-agent` command
- Remembers your character and theme between sessions
- Draws the band above your prompt

It reads no files, starts no processes and makes no network requests. If the mod ever fails, your prompts and tool calls still go through. The whole source is `hooks/register.tsx` in this repository if you want to read it.

## License

MIT, see [LICENSE](LICENSE).
