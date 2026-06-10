## Repo Talk

A real-time chat system for GitHub repositories, pull requests, and issues. Inject a modern chat sidebar into any GitHub page and collaborate in real-time with your team.

## Features

**Real-Time Chat** - Instant messaging powered by Socket.io
**GitHub OAuth** - Secure login via GitHub
**Context-Aware Rooms** - Automatic chat rooms for repos, PRs, and issues
**Group Chat** - Create private groups for team collaboration
**SQLite Storage** - All data persisted locally
**Chrome Extension** - Seamlessly inject into GitHub UI
**Production-Ready** - Full security, rate limiting, and XSS prevention

### Chrome Extension Setup

1. **Open Chrome Extensions:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right)

2. **Load Extension:**
   - Click "Load unpacked"
   - Select the `extension/` folder
   - Note the Extension ID shown

3. **Update Extension Config:**
   - Edit `extension/manifest.json`
   - In the last `web_accessible_resources` section, if needed adjust permissions
   - The extension will auto-detect the backend at `http://localhost:3000`

4. **First Use:**
   - Click the extension icon (puzzle piece)
   - Click "Login with GitHub"
   - Authorize the OAuth app
   - You're logged in!

5. **Start Chatting:**
   - Navigate to any GitHub repo, PR, or issue
   - Chat sidebar appears on the right side
   - Start messaging in real-time!


## Support & Contribution

Issues and pull requests welcome!

## License

MIT License - Feel free to use and modify