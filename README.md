# Moment Share

A guest photo app for events. Guests scan a QR code, take a photo, and post
it to a live shared album. Before posting they can run one of your
pre-approved AI edits, such as adding the couple into the shot. Everything
is also archived to your Google Drive.

- One app, many events: each gets its own link, QR code, colors, AI edits, and album
- No login for guests, no app install
- AI edits run on Google's Nano Banana 2 (via fal.ai), from fixed presets only
- iPhone HEIC photos are converted automatically
- Every photo (and the original behind every AI edit) lands in a Drive folder per event

Everything below is a one-time setup. After that, a new event takes about a
minute from the dashboard.

## 1. Push this to GitHub

Vercel deploys from a Git repo. Create a new **private** GitHub repo and push
this folder to it (the GitHub website's "upload files" works, or
`git init && git add . && git commit -m "init" && git remote add origin ... && git push`).

## 2. Import into Vercel

Vercel dashboard: **Add New → Project → Import** your repo. Leave the framework
preset as Next.js. Don't deploy yet; do steps 3 to 6 first.

## 3. Add storage (your project → Storage)

- **Redis**: from the Marketplace, add **Upstash Redis** (Vercel's own "KV" was
  folded into this). If it asks for an environment variable prefix, use `KV`
  so it creates `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
- **Blob**: adds `BLOB_READ_WRITE_TOKEN` automatically.

## 4. Set up Google Drive access

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project
2. **APIs & Services → Library** → enable the **Google Drive API**
3. **APIs & Services → OAuth consent screen** → "External," then **Publish app**
   to move it to "In production." Don't leave it in Testing: Google expires a
   testing app's Drive connection after 7 days. Since you're the only user, no
   verification is needed; when you connect Drive you'll see an "unverified app"
   warning once. Click **Advanced → Go to (app name)**.
4. **Credentials → Create Credentials → OAuth client ID** → Web application.
   Authorized redirect URI: `https://YOUR-VERCEL-DOMAIN/api/auth/google/callback`
5. Copy the **Client ID** and **Client secret**
6. In Drive, create a folder to hold every event (e.g. "Moment Share"), open it,
   and copy its ID from the URL (`drive.google.com/drive/folders/`**`THIS_PART`**)

## 5. Get a fal.ai key (for AI edits)

1. Sign up at [fal.ai](https://fal.ai) (Google or GitHub sign-in works)
2. Add credit under **Billing**. $10 covers about 125 edits at the default size.
3. **Dashboard → Keys → Add key** and copy it. It's shown once.

The key stays on the server; guests' phones never see it. Without a key the
app still works, just without AI edits.

## 6. Set environment variables in Vercel

Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | the password for your host dashboard |
| `JWT_SECRET` | any long random string |
| `GOOGLE_CLIENT_ID` | from step 4 |
| `GOOGLE_CLIENT_SECRET` | from step 4 |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-VERCEL-DOMAIN/api/auth/google/callback` |
| `DRIVE_ROOT_FOLDER_ID` | from step 4 |
| `FAL_KEY` | from step 5 |
| `FAL_RESOLUTION` | optional: `1K` (default, $0.08/edit), `2K` ($0.12), `4K` ($0.16) |
| `CF_ACCOUNT_ID` | optional, for video clips: Cloudflare account ID (Stream overview page) |
| `CF_STREAM_TOKEN` | optional, for video clips: API token with **Stream: Edit** |

Video clips (up to 20 seconds) upload straight from the phone to Cloudflare
Stream, which converts them so they play on every device. Without the two
`CF_` variables the "Record a video" option simply doesn't appear.

Then click **Deploy**.

## 7. Connect Google Drive (one time)

Visit `https://YOUR-VERCEL-DOMAIN/admin`, sign in, and click **Connect Drive** if
the banner shows. Approve with your Google account. Done for every future event.

## Running an event

1. **Create it**: dashboard → New event → name and date
2. **Add couple reference photos** (for "Add the couple"): 3 to 6 clear photos,
   faces visible, a mix of full-length and closer shots, ideally in the outfits
   you'll wear that day. No background removal needed.
3. **Pick the AI edits** guests can use, and set the limits. The dashboard shows
   the most the event can cost.
4. **Share the QR code** from the event page
5. **Watch the album fill up**. AI edits carry a small "AI" tag, and tapping one
   in the album shows the original.

## The AI edits

All prompts live in `lib/presets.js`. Guests only pick a preset; they never type
instructions. To reword a prompt, add a preset, or switch one preset to the
higher-quality model, edit that file:

| Preset | What it does |
|---|---|
| Add the couple | Adds the couple into the guest's photo using your reference photos |
| Add me in | The photographer takes a selfie and gets added to the group shot they took |
| Fix the lighting | Brightens and cleans up dark reception photos |
| Watercolor | Repaints the photo as a watercolor |
| Lacquer painting | Repaints it in Vietnamese sơn mài style |
| Disposable film | Flash, grain, and warm color |
| Keepsake frame | Adds a border with your names and date |

If "Add the couple" isn't convincing enough with Nano Banana 2, add
`model: 'fal-ai/nano-banana-pro/edit'` to that preset. Pro is slower and costs more.

**Guardrails built in**
- Per-guest and per-event edit limits (defaults 5 and 400)
- fal's safety filter set to strict
- Only the couple's likeness is ever inserted; the model is told not to alter anyone's appearance
- Selfies are sent to the AI for that one edit and never stored
- AI edits are labeled in the album, and originals are kept

## Local development

```
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Redis and Blob need real Vercel-provisioned credentials even locally; the
easiest path is `vercel env pull .env.local` after step 6.
