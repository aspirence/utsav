import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createAdminClient, hasSupabaseEnv } from '@utsava/db'

/**
 * Accepting an image file from a browser.
 *
 * A file input is a real attack surface, so the rules here are deliberate rather than defensive
 * boilerplate. Everything below assumes the client is hostile, because a Server Action is a public
 * endpoint whatever the form in front of it looks like.
 *
 * ── THE TYPE IS DECIDED BY THE BYTES, NOT BY THE CLIENT ──────────────────────
 * `File.type` and the filename extension are both client-supplied strings. A file called
 * `photo.jpg` with `image/jpeg` on it can contain anything at all, so the first four to twelve
 * bytes are what actually decide — JPEG, PNG and WebP have unambiguous signatures.
 *
 * ── SVG IS REFUSED, AND NOT BECAUSE IT IS AWKWARD TO RESIZE ──────────────────
 * An SVG is a document. It can carry <script>, and served from our own origin that script runs
 * with our origin's privileges — a stored XSS in a portfolio gallery. next.config.ts sets
 * X-Content-Type-Options: nosniff globally, which helps, but the honest fix is not to accept the
 * format. Nothing in a wedding portfolio needs to be a vector.
 *
 * ── THE FILENAME IS GENERATED ────────────────────────────────────────────────
 * Never the client's. A name is the one field that becomes a filesystem path, and `../../` in it
 * is the oldest trick there is. A uuid plus an extension derived from the *detected* type means no
 * caller-controlled string reaches the path at all.
 *
 * ── WHERE IT GOES ───────────────────────────────────────────────────────────
 * Supabase Storage when a project is attached — that is the real destination, and plan §12 renders
 * it through Storage's own CDN transforms rather than Next's optimizer. With no project, it lands
 * in public/uploads so the feature is usable while building. That fallback is development-only in
 * practice: a serverless filesystem is read-only and ephemeral, so uploads there would vanish. The
 * caller is told which happened rather than left to guess.
 */

/** 8 MB. Matches serverActions.bodySizeLimit in next.config.ts — raise both or neither. */
const MAX_BYTES = 8 * 1024 * 1024

const BUCKET = 'vendor-media'

type Detected = { ext: 'jpg' | 'png' | 'webp'; mime: string }

export type UploadResult =
  | { ok: true; storagePath: string; where: 'storage' | 'local' }
  | { ok: false; message: string }

/**
 * Validate the bytes and store them.
 *
 * `folder` is used to group objects and must already be a validated slug — this function does not
 * sanitise it, because the only caller has it from slugSchema and a second half-hearted check here
 * would suggest otherwise.
 */
export async function storeImage(file: File, folder: string): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, message: 'No file was received.' }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: `That image is ${mb(file.size)} MB. The limit is ${mb(MAX_BYTES)} MB — export it smaller and try again.`,
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const detected = detect(bytes)

  if (!detected) {
    return {
      ok: false,
      message:
        'That file is not a JPEG, PNG or WebP. SVGs are refused on purpose — they can carry ' +
        'scripts, and one served from this site would run with this site’s privileges.',
    }
  }

  const name = `${randomUUID()}.${detected.ext}`
  const objectPath = `${folder}/${name}`

  if (hasSupabaseEnv()) {
    try {
      const admin = createAdminClient()
      const { error } = await admin.storage.from(BUCKET).upload(objectPath, bytes, {
        contentType: detected.mime,
        // Never overwrite. The name is a fresh uuid, so a collision means something is wrong and
        // should surface rather than silently replace somebody else's photograph.
        upsert: false,
        cacheControl: '31536000',
      })

      if (error) {
        return {
          ok: false,
          message:
            `Storage refused the upload (${error.message}). If the "${BUCKET}" bucket does not ` +
            'exist yet, create it in the Supabase dashboard and set it public.',
        }
      }

      // A bare object path. storageImageUrl() turns it into a CDN render URL at display time.
      return { ok: true, storagePath: objectPath, where: 'storage' }
    } catch {
      return {
        ok: false,
        message:
          'Uploads need the service-role key, and this server has none configured. ' +
          'Set SUPABASE_SERVICE_ROLE_KEY and restart.',
      }
    }
  }

  /*
   * No Supabase: write into public/ so the feature works while building.
   *
   * `next start` serves public/ from disk per request, so the file is reachable the moment it is
   * written — no rebuild. On a serverless host this branch is unreachable in any useful sense, and
   * the caller says so.
   */
  try {
    const dir = path.join(process.cwd(), 'public', 'uploads', folder)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), bytes)
    return { ok: true, storagePath: `/uploads/${folder}/${name}`, where: 'local' }
  } catch (e) {
    return {
      ok: false,
      message: `Could not write the file: ${e instanceof Error ? e.message : 'unknown error'}`,
    }
  }
}

/**
 * Magic-byte sniffing for the three formats worth accepting.
 *
 * JPEG  FF D8 FF
 * PNG   89 50 4E 47 0D 0A 1A 0A
 * WebP  "RIFF" ---- "WEBP"   (a RIFF container; the fourcc at byte 8 is what makes it an image)
 */
function detect(b: Buffer): Detected | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }

  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' }
  }

  if (
    b.length >= 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }

  return null
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}
