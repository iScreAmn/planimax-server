import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export const LINK_HREF_MAX_LENGTH = 2048;
export const LINK_TITLE_MAX_LENGTH = 300;
export const LINK_DESCRIPTION_MAX_LENGTH = 500;
export const LINK_SITE_MAX_LENGTH = 100;

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const SOCKET_TIMEOUT_MS = 5000;
const TOTAL_TIMEOUT_MS = 8000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class LinkPreviewError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const invalid = () => new LinkPreviewError('INVALID_URL', 'The link is not a public http(s) address');
const unavailable = () => new LinkPreviewError('UNAVAILABLE', 'The page could not be loaded');

const blocked = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
]) {
  blocked.addSubnet(prefix, bits, 'ipv4');
}
for (const [prefix, bits] of [
  ['::', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blocked.addSubnet(prefix, bits, 'ipv6');
}

export const isPublicAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return !blocked.check(address, 'ipv6');
  return false;
};

export const parsePublicUrl = (value) => {
  if (typeof value !== 'string' || value.length > LINK_HREF_MAX_LENGTH) throw invalid();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.port || url.username || url.password) throw invalid();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw invalid();
  }
  if (net.isIP(host) && !isPublicAddress(host)) throw invalid();
  return url;
};

const guardedLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) return callback(invalid());
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decodeEntities = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });

const cleanText = (value, max) => {
  if (typeof value !== 'string') return null;
  const text = decodeEntities(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, max) : null;
};

const toHref = (value, base) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(decodeEntities(value.trim()), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.length <= LINK_HREF_MAX_LENGTH ? url.href : null;
  } catch {
    return null;
  }
};

const attributesOf = (tag) => {
  const attrs = {};
  for (const match of tag.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[match[1].toLowerCase()] ??= match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
};

export const parseLinkPreview = (html, pageUrl) => {
  const base = new URL(pageUrl);
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributesOf(tag);
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (key && attrs.content !== undefined) meta[key] ??= attrs.content;
  }

  let icon = null;
  let touchIcon = null;
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributesOf(tag);
    const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/);
    if (rel.includes('icon')) icon ??= toHref(attrs.href, base);
    else if (rel.includes('apple-touch-icon')) touchIcon ??= toHref(attrs.href, base);
  }

  const pageTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return {
    title: cleanText(meta['og:title'] ?? meta['twitter:title'] ?? pageTitle, LINK_TITLE_MAX_LENGTH),
    description: cleanText(
      meta['og:description'] ?? meta['twitter:description'] ?? meta.description,
      LINK_DESCRIPTION_MAX_LENGTH,
    ),
    image: toHref(meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['og:image:url'] ?? meta['twitter:image'], base),
    icon: icon ?? touchIcon ?? toHref('/favicon.ico', base),
    site: cleanText(meta['og:site_name'], LINK_SITE_MAX_LENGTH) ?? base.hostname.replace(/^www\./, ''),
  };
};

const charsetOf = (contentType) => contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8';

const decodeBody = (buffer, contentType) => {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(buffer);
  } catch {
    return new TextDecoder().decode(buffer);
  }
};

const requestPage = (url, signal) =>
  new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        timeout: SOCKET_TIMEOUT_MS,
        signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-encoding': 'identity',
          'accept-language': 'en',
          'user-agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (REDIRECT_STATUSES.has(status) && response.headers.location) {
          response.resume();
          return resolve({ redirect: response.headers.location });
        }
        const contentType = String(response.headers['content-type'] ?? '');
        if (status < 200 || status >= 300 || !/html/i.test(contentType)) {
          response.destroy();
          return reject(unavailable());
        }
        const chunks = [];
        let size = 0;
        const finish = () => resolve({ html: decodeBody(Buffer.concat(chunks), contentType) });
        response.on('data', (chunk) => {
          chunks.push(chunk);
          size += chunk.length;
          if (size >= MAX_BYTES) {
            response.destroy();
            finish();
          }
        });
        response.on('end', finish);
        response.on('error', () => (size > 0 ? finish() : reject(unavailable())));
      },
    );
    request.on('timeout', () => request.destroy(unavailable()));
    request.on('error', (error) => reject(error instanceof LinkPreviewError ? error : unavailable()));
    request.end();
  });

export const fetchLinkPreview = async (value) => {
  let url = parsePublicUrl(value);
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await requestPage(url, signal);
    if (result.html !== undefined) return parseLinkPreview(result.html, url.href);
    let next;
    try {
      next = new URL(result.redirect, url).href;
    } catch {
      throw unavailable();
    }
    url = parsePublicUrl(next);
  }
  throw unavailable();
};
