# Security notes for contributors

- **Never commit** API keys, tokens, passwords, or `.env` files. This repo’s `.gitignore` excludes them; use `.env.example` only for **names** of variables, not real values.
- **Rotate** any key that was pasted into a file, chat, or commit history—even if you removed it later.
- **BYOK** keys live in the browser (session/local storage) and are sent to **your** API process, which forwards them to the provider. Do not log request bodies in production.
- **Server keys** (`OPENAI_API_KEY`, `NVIDIA_API_KEY`, `GITHUB_TOKEN`, etc.) belong only on the host or secret manager, not in git or Docker images. The `Dockerfile` build should not bake in secrets.
- Report suspected vulnerabilities through your team’s usual channel (do not post secrets in public issues).
