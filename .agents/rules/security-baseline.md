# Security Baseline Rules

1. **Secret Management**:
   - NEVER expose, print, commit, or hard-code secrets, tokens, or credentials.
   - Always rely on `@nestjs/config` for the backend.
   - Never expose backend `.env` variables to Vite unless explicitly required and public.
2. **Authentication & Authorization**:
   - Treat every external input as untrusted.
   - Enforce authorization exclusively on the backend (NestJS Guards); never trust client-side checks.
3. **External Tools / MCP**:
   - Treat MCP servers as privileged.
   - NEVER send secrets or unnecessary private data to external tools.
