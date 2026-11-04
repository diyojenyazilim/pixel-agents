# pixel-agent

A Claude Code mod that puts a small pixel-art agent above your prompt. It reacts to what Claude is doing, and every running subagent gets a tiny companion next to it.

## Install

Mods need Claude Code v2.1.287 or later.

```bash
claude plugin marketplace add diyojenyazilim/pixel-agent
claude plugin install pixel-agent@diyojenyazilim
```

Or inside a session:

```text
/plugin marketplace add diyojenyazilim/pixel-agent
/plugin install pixel-agent@diyojenyazilim
```

If you install while a session is open, run `/reload-plugins` in it or start a new session.

To get a newer version later:

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

Each subagent Claude starts appears as a mini sprite beside the main character, labelled with its agent type. The same agent type always gets the same character.

The header shows `subagents N running / M total`: `N` is how many are working right now, `M` is how many are on the band, including ones that just finished and have not left yet. A finished subagent stays for about 6 seconds. If the band is too narrow, the rest are counted as `(+N hidden)`.

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

## Trust

A mod is code that runs with your permissions. This one reads no files, starts no processes and makes no network requests. See [what `pixel-agent` touches](plugins/pixel-agent/README.md#what-the-mod-touches), and check it yourself before you install it:

```bash
git clone https://github.com/diyojenyazilim/pixel-agent.git
claude plugin validate ./pixel-agent/plugins/pixel-agent
```

## Development

```bash
# try it for one session from a local clone
claude --plugin-dir ./plugins/pixel-agent

# check what the mod hooks and calls
claude plugin validate .
```

All code lives in [`plugins/pixel-agent/hooks/register.tsx`](plugins/pixel-agent/hooks/register.tsx). More in the [plugin README](plugins/pixel-agent/README.md#development).

## License

MIT, see [LICENSE](LICENSE).
