/** The picture at a link an upload file gives, downloaded through the CMS's
 *  own server (app/td/link-image) as a file, to be saved like a chosen one. */
import { tdApi, tdTokens } from './client';
import { t } from './i18n';
import type { LinkImageFailure } from './link-image';

export type LinkPictureFailure = LinkImageFailure | 'signed_out' | 'failed';
export type LinkPictureResult = { ok: true; file: File } | { ok: false; reason: LinkPictureFailure };

const REASONS: Record<LinkPictureFailure, string> = {
  bad_link: t('this is not a web address the CMS can download from'),
  blocked: t('this address cannot be downloaded from'),
  unreachable: t('the site did not answer'),
  busy: t('the site is busy: try again in a minute'),
  not_found: t('the site has no picture at this link'),
  too_big: t('the picture is bigger than 2 MB'),
  not_image: t('the link is not a JPEG, PNG or WebP picture (open the picture itself and copy its address)'),
  signed_out: t('sign in again to download pictures'),
  failed: t('the download failed'),
};

export const linkPictureReason = (reason: LinkPictureFailure) => REASONS[reason];

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** A file name for the picture: the link's last path segment, with the extension of what it is. */
export function linkFileName(link: string, type: string): string {
  let segment = '';
  try {
    segment = decodeURIComponent(new URL(link).pathname.split('/').filter(Boolean).pop() ?? '');
  } catch {
    segment = '';
  }
  const base = segment.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80) || 'picture';
  return `${base}.${EXTENSIONS[type] ?? 'img'}`;
}

export async function downloadLinkPicture(link: string): Promise<LinkPictureResult> {
  const ask = (accessToken: string) =>
    fetch('/td/link-image', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ url: link }), cache: 'no-store' });
  try {
    const session = tdTokens.read();
    if (!session) return { ok: false, reason: 'signed_out' };
    let response = await ask(session.accessToken);
    if (response.status === 401) {
      // An access token that ran out: asking the API who is signed in renews it, once.
      await tdApi.me().catch(() => null);
      const renewed = tdTokens.read();
      if (!renewed || renewed.generation !== session.generation) return { ok: false, reason: 'signed_out' };
      response = await ask(renewed.accessToken);
      if (response.status === 401) return { ok: false, reason: 'signed_out' };
    }
    if (!response.ok) {
      const reason = ((await response.json().catch(() => null)) as { reason?: string } | null)?.reason;
      return { ok: false, reason: reason && reason in REASONS ? (reason as LinkPictureFailure) : 'failed' };
    }
    const blob = await response.blob();
    const type = blob.type.split(';')[0]!.trim();
    if (!EXTENSIONS[type]) return { ok: false, reason: 'not_image' };
    return { ok: true, file: new File([blob], linkFileName(link, type), { type }) };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
