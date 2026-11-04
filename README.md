<div align="center">

# pixel-agents

**A tiny pixel-art companion that lives above your Claude Code prompt.**

It breathes while you think, works while Claude works, and falls asleep when you step away.
Every subagent gets a little companion of its own.

<img src="assets/characters.svg" alt="The twenty characters: Bit, Ghost, Astronaut, Code Wizard, Cloud, Cat, Fox, Frog, Penguin, Owl, Panda, Bunny, Dragon, Pumpkin, Alien, Slime, Mushroom, Knight, Octopus and Cactus" width="560" />

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
- **It gets tired.** Once the context window is more than 85% full, the character looks tired.
- **Each character has its own idle quirk.** The cat swishes its tail, the owl looks around, the slime hops, the dragon puffs smoke. It plays briefly between walks.
- **It talks a little.** A short speech bubble follows the running tool ("into the terminal", "reading up"), three failures in a row, and a nearly full context.
- **A timer in the header.** While Claude works it shows the elapsed time and tool count. Turns longer than 2 minutes get a longer celebration and "done in mm:ss".
- **Subagents have roles.** Known agent types get a fixed character (Explore is the owl, Plan the wizard, `devops-engineer` the knight, `db-architect` the cloud) and a small accessory: binoculars, folder, backpack, wrench, database, phone, palette, flask or gem. Unknown types take the next free character.
- **A bond that grows.** Every finished turn raises the active character's bond, and hats unlock at 10, 25, 50, 100, 200 and 400 turns.
- **Twenty characters, six color themes.** Your choice is remembered between sessions.

## Commands

| Command | Does |
| --- | --- |
| `/pixel-agent` | Hide or show the agent |
| `/pixel-agent switch` | Open the character list above the prompt, pick one with the arrow keys and Enter (run it again to close) |
| `/pixel-agent random` | Switch to a random character |
| `/pixel-agent <name>` | `bit`, `ghost`, `astronaut`, `wizard`, `cloud`, `cat`, `fox`, `frog`, `penguin`, `owl`, `panda`, `bunny`, `dragon`, `pumpkin`, `alien`, `slime`, `mushroom`, `knight`, `octopus` or `cactus` |
| `/pixel-agent list` | List the characters |
| `/pixel-agent hat` | Open the hat list (locked hats show their unlock turn count) |
| `/pixel-agent hat <name>` | `beanie`, `cap`, `bucket`, `crown`, `tophat`, `halo`, or `none` |
| `/pixel-agent bond` | Show the active character's bond and the next hat |
| `/pixel-agent stats` | Session summary: turns, tool calls, errors, top 3 tools, time working |
| `/pixel-agent chatter [on|off]` | Turn the speech bubble on or off (on by default) |
| `/pixel-agent theme next` | Switch to the next color theme |
| `/pixel-agent theme auto` | Follow your local time: morning Ocean, day Classic, evening Ember, night Mono. Picking any theme turns it off |
| `/pixel-agent theme <name>` | `classic`, `mono`, `ember`, `forest`, `ocean` or `rose` |

The band has two buttons: **Hide** in the top-right corner and **Random** in the bottom-right corner, which switches to a random character.

<div align="center">
  <img src="assets/hats.svg" alt="The six hats on the Penguin: beanie, cap, bucket, crown, tophat and halo" width="640" />
  <img src="assets/roles.svg" alt="Subagent roles with their accessories" width="640" />
</div>

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
