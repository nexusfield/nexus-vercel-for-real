# Nexus — Auth Setup (Google OAuth)

The HTTP 500 error is almost always from missing environment variables. Follow these steps:

---

## 1. Add env vars to `.env.local`

Create or edit `.env.local` in the project root. Add:

```env
# Required for NextAuth (fixes 500)
AUTH_SECRET=your-secret-here
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

**Generate AUTH_SECRET:**
```bash
npx auth secret
```
Copy the output and paste it as the value for `AUTH_SECRET`.

---

## 2. Create Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or pick an existing one)
3. Click **Create credentials** → **OAuth client ID**
4. If prompted, configure the OAuth consent screen:
   - User type: **External** (or Internal for workspace-only)
   - App name: Nexus (or anything)
   - Add your email as a test user if using External
5. Application type: **Web application**
6. Name: Nexus (or anything)
7. **Authorized redirect URIs** — add:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
8. Click **Create**
9. Copy the **Client ID** and **Client secret** into `.env.local`

---

## 3. Restart the dev server

```bash
npm run dev
```

Stop the server (Ctrl+C), then start it again so it picks up the new env vars.

---

## Checklist

- [ ] `AUTH_SECRET` in `.env.local` (from `npx auth secret`)
- [ ] `GOOGLE_CLIENT_ID` in `.env.local`
- [ ] `GOOGLE_CLIENT_SECRET` in `.env.local`
- [ ] Redirect URI `http://localhost:3000/api/auth/callback/google` in Google Console
- [ ] Dev server restarted after editing `.env.local`
