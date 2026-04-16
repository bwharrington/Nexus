# Nexus

A modern, feature-rich Markdown editor with live preview, AI assistance, and multi-tab support.

## Features

- **Dual View Modes** - Switch between raw editing and rendered preview
- **Multi-Tab Interface** - Work on multiple documents simultaneously
- **GitHub Flavored Markdown** - Full GFM support including tables, task lists, and code blocks
- **reStructuredText Support** - Full RST rendering with dedicated toolbar
- **Mermaid Diagrams** - Embedded diagram support
- **AI Integration** - Chat assistant and AI-powered editing with diff review
- **Cross-Platform** - Available for Windows, macOS, and Linux

## AI Features

Nexus includes integrated AI capabilities:

- **AI Chat Assistant** - Get help with writing and editing
- **AI Edit Mode** - Make AI-powered edits with visual diff review
- **Multiple Providers** - Support for Claude (Anthropic), OpenAI, and xAI

## Quick Start

```bash
# Install dependencies
npm install

# (Optional) Configure AI API keys for development
# Copy .env.example to .env and add your API keys
cp .env.example .env
# Edit .env with your keys

# Start in development mode
npm run dev

# Or build and run
npm start
```

### Development API Keys

For development, you can use a `.env` file to configure AI API keys:

1. Copy `.env.example` to `.env`
2. Add your API keys:
   ```
   ANTHROPIC_API_KEY=your_key_here
   OPENAI_API_KEY=your_key_here
   ```
3. Restart the application

**Note**: In production builds, API keys are stored securely using the system's credential storage (DPAPI/Keychain/libsecret) via the Settings dialog. The `.env` file is only for development convenience.

## Building and Installing

https://github.com/bwharrington/Nexus.git

1 - Clone the repo wherever
2 - Open the project in VS Code the root of your repo
3 - run,  one of the following

```bash
# Windows
npm run package

# macOS
npm run package-mac

# Linux
npm run package-linux
```

4 - Execute the installer in release\Nexus-Setup.exe
(I think you will get a warning about the software your installing)

## Documentation

See [docs/Nexus.md](docs/Nexus.md) for complete documentation.

## Technologies

- Electron
- React
- TypeScript
- Material UI
- Mermaid
- diff (for AI edit review)

## License

ISC
