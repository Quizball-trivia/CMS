// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fetchLinkImage, isPublicAddress, linkUrl, sniffImage } from '../link-image';

describe('downloading the picture at a link', () => {
  it('connects to public addresses only', () => {
    for (const address of ['8.8.8.8', '185.15.59.240', '2606:4700::1111', '2a02:ec80:300:ed1a::2:b', '::ffff:8.8.8.8']) expect(isPublicAddress(address), address).toBe(true);
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1', '2002:a00:1::', 'localhost', 'not-an-ip']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('takes an http(s) link on the usual ports, with no password and no private address written out', () => {
    expect(linkUrl('https://upload.wikimedia.org/a/b.jpg')?.hostname).toBe('upload.wikimedia.org');
    expect(linkUrl('http://pics.test:80/a.png')).not.toBeNull();
    for (const bad of ['ftp://pics.test/a.png', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@pics.test/a.png', 'https://pics.test:8443/a.png', 'http://127.0.0.1/a.png', 'http://[::1]/a.png', 'http://169.254.169.254/latest', 'https://pics.test/a b.png', `https://pics.test/${'a'.repeat(2050)}`, 'not a link']) {
      expect(linkUrl(bad), bad).toBeNull();
    }
  });

  it('tells a picture by its first bytes, whatever the site says it is', () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<!doctype html><html>'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it('refuses a name that resolves to a private address before connecting, and a link it cannot take at all', async () => {
    expect(await fetchLinkImage('http://localhost/a.png')).toEqual({ ok: false, reason: 'blocked' });
    expect(await fetchLinkImage('http://127.0.0.1/a.png')).toEqual({ ok: false, reason: 'bad_link' });
    expect(await fetchLinkImage('ftp://pics.test/a.png')).toEqual({ ok: false, reason: 'bad_link' });
  });
});
