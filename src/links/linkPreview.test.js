import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, parseLinkPreview, parsePublicUrl } from './linkPreview.js';

test('accepts only public addresses', () => {
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:2800:220:1:248:1893:25c8:1946']) {
    assert.equal(isPublicAddress(address), true, address);
  }
  for (const address of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '255.255.255.255', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'not-an-ip',
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test('rejects urls that are not plain public http(s) addresses', () => {
  assert.equal(parsePublicUrl('https://example.com/a?b=1').href, 'https://example.com/a?b=1');
  for (const value of [
    undefined, 42, '', 'example.com', 'ftp://example.com', 'javascript:alert(1)', 'file:///etc/passwd',
    'http://localhost/', 'http://app.localhost/', 'http://printer.local/', 'http://127.0.0.1/', 'http://[::1]/',
    'http://169.254.169.254/latest/meta-data', 'http://2130706433/', 'http://0x7f.1/', 'http://example.com:8080/',
    'http://user:pass@example.com/', `https://example.com/${'a'.repeat(2048)}`,
  ]) {
    assert.throws(() => parsePublicUrl(value), { code: 'INVALID_URL' }, String(value));
  }
});

test('reads open graph metadata', () => {
  const html = `<html><head>
    <title>Fallback title</title>
    <meta property="og:title" content="Leading kaolin producer &amp; more">
    <meta content='A trusted
      producer' property='og:description'>
    <meta property=og:image content=/img/cover.png>
    <meta property="og:site_name" content="Sedleck&#253; kaolin">
    <link rel="mask-icon" href="/mask.svg">
    <link rel="shortcut icon" href="//cdn.example.com/favicon.png">
  </head></html>`;
  assert.deepEqual(parseLinkPreview(html, 'https://www.example.com/en/page'), {
    title: 'Leading kaolin producer & more',
    description: 'A trusted producer',
    image: 'https://www.example.com/img/cover.png',
    icon: 'https://cdn.example.com/favicon.png',
    site: 'Sedlecký kaolin',
  });
});

test('falls back to the page title, description and default favicon', () => {
  const html = '<title> Plain\n page </title><meta name="description" content="Plain description">';
  assert.deepEqual(parseLinkPreview(html, 'https://www.example.com/a/b'), {
    title: 'Plain page',
    description: 'Plain description',
    image: null,
    icon: 'https://www.example.com/favicon.ico',
    site: 'example.com',
  });
});

test('drops unsafe urls and limits text length', () => {
  const html = `<meta property="og:title" content="${'t'.repeat(1000)}">
    <meta property="og:image" content="javascript:alert(1)">
    <link rel="icon" href="data:image/png;base64,AAAA">`;
  const preview = parseLinkPreview(html, 'https://example.com/');
  assert.equal(preview.title.length, 300);
  assert.equal(preview.image, null);
  assert.equal(preview.icon, 'https://example.com/favicon.ico');
  assert.equal(parseLinkPreview('', 'https://example.com/').title, null);
});
