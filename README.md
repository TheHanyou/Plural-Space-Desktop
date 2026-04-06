<h1 align="center">Plural Space — Desktop</h1>

<p align="center">
  <strong>Front tracking, system journal & history for plural systems.</strong><br>
  Private. Offline-first. No accounts. No servers.
</p>

<p align="center">
  <a href="https://github.com/TheHanyou/Plural-Space-Desktop/releases/latest">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-DAA520?style=for-the-badge&logo=windows&logoColor=white" alt="Download Latest Release" />
  </a>
  &nbsp;
  <a href="https://www.buymeacoffee.com/PluralSpace">
    <img src="https://img.buymeacoffee.com/button-api/?text=Support+PS&emoji=%E2%98%95&slug=PluralSpace&button_colour=151929&font_colour=ffffff&font_family=Cookie&outline_colour=ffffff&coffee_colour=FFDD00" alt="Support PS on Buy Me a Coffee" />
  </a>
  &nbsp;
  <a href="https://discord.gg/FFQw33cu8m">
    <img src="https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord" />
  </a>
</p>

---

The desktop companion to [Plural Space](https://github.com/TheHanyou/Plural-Space). Built with Electron — your data stays on your machine, the same way it stays on your phone.

> **Simply Plural is being discontinued.** Plural Space is the replacement you own entirely.

---

## Features

**◈ Three-Tier Front Tracking**
Track who's fronting across Primary Front, Co-Front, and Co-Conscious. Each tier has its own member selection, mood, and notes. Primary Front also tracks location. Set all three tiers from a single unified modal.

**◇ Member Profiles**
Build out your system roster with names, pronouns, roles, colors, bios, tags, and named groups. Archive dormant members to keep your active roster clean — their history is fully preserved.

**◷ History & Insights**
A complete timestamped log of every switch, organized by day. Add retroactive history entries manually with full three-tier support.

**⊞ System Statistics**
System-wide stats: total fronting time, session count, top fronters, co-fronters, co-conscious, moods, and locations. Filter by All Time, 7 Days, or 30 Days.

**⌨ System Chat**
Local-only IRC-style chat for your system. Create and organize channels, send messages, share images, reply, and react with emoji.

**◉ System Journal**
Write journal entries with rich text formatting. Tag entries with authors and topic hashtags. Optionally lock entries or the entire journal behind a password.

**⇅ Import & Export**
Export your full system data as JSON or HTML. Import `.txt`, `.md`, or `.json` files as journal entries.

**Other Features**
- Obsidian Blue dark theme and Steel light theme built-in, plus 10 custom palette slots
- Adjustable text size — Normal, Large, or Extra Large
- Custom mood support with preset moods
- Location tagging
- Multilingual: English, Español, Français, Deutsch, Português, Suomi, Norsk

---

## Privacy

Everything lives on your machine. No accounts, no cloud sync, no tracking, no ads. All data is stored locally using `electron-store`.

Full privacy policy: [PRIVACY_POLICY.md](PRIVACY_POLICY.md)

---

## Installation

Download the latest installer from [Releases](https://github.com/TheHanyou/Plural-Space-Desktop/releases):

| Platform | File |
|---|---|
| Windows | `Plural-Space-Setup-x.x.x.exe` (installer) or `Plural-Space-x.x.x-portable.exe` |
| macOS | `Plural-Space-x.x.x.dmg` |
| Linux | `Plural-Space-x.x.x.AppImage` or `.deb` |

**Windows note:** Because the app is not code-signed, Windows Defender SmartScreen may show a warning on first launch. Click "More info" → "Run anyway." The source is fully open and auditable here.

---

## Build from Source

Requirements: Node 22+

```bash
git clone https://github.com/TheHanyou/Plural-Space-Desktop.git
cd Plural-Space-Desktop
npm install
npm run electron:dev       # development
npm run electron:build     # build installer for your platform
```

**Windows:** Run the build as Administrator or enable Developer Mode (Settings → System → For developers) to allow symlink creation during packaging.

---

## Relationship to the Mobile App

This is a separate repository from the [Plural Space mobile app](https://github.com/TheHanyou/Plural-Space). The two apps share the same data model and export format, so JSON exports are cross-compatible — you can move your data between them freely. Features may land on one platform before the other.

---

## License

[GNU Affero General Public License v3.0](LICENSE)

Free and open source. You are free to use, modify, and distribute it under the terms of AGPL-3.0. Any distributed modifications or network-accessible deployments must also be released under AGPL-3.0.

---

## Support

Plural Space is free, always. If it's been useful to you, a contribution helps cover development time.

<a href="https://www.buymeacoffee.com/PluralSpace">
  <img src="https://img.buymeacoffee.com/button-api/?text=Support+PS&emoji=%E2%98%95&slug=PluralSpace&button_colour=151929&font_colour=ffffff&font_family=Cookie&outline_colour=ffffff&coffee_colour=FFDD00" alt="Support PS on Buy Me a Coffee" />
</a>

---

## Contact

**The Hanyou System**
[Discord](https://discord.gg/FFQw33cu8m) · [r/PluralSpace](https://www.reddit.com/r/PluralSpace/) · [GitHub Issues](https://github.com/TheHanyou/Plural-Space-Desktop/issues)
