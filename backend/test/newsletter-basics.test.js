import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, markdownToText } from '../src/markdown.js';
import { makeToken, readToken } from '../src/newsletter-tokens.js';

const env = { NEWSLETTER_SECRET: 'test-secret-value' };
test('markdown escapes HTML and keeps only safe links', () => {
  const html = renderMarkdown('# Title\n\n<script>alert(1)</script> **bold** [NSE](https://www.nseindia.com/x) [bad](javascript:alert(1))\n\n- one\n- two');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<a href="https://www.nseindia.com/x" rel="noopener noreferrer">NSE</a>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('<h2>Title</h2>') && html.includes('<ul>') && html.includes('<strong>bold</strong>'));
});
test('markdown to text writes link targets out', () => {
  assert.equal(markdownToText('See [NSE](https://nseindia.com)'), 'See NSE (https://nseindia.com)');
});
test('confirm token works for 48 hours only, for its own purpose', () => {
  const t = makeToken('confirm', '42', env, 1_000_000);
  assert.equal(readToken('confirm', t, env, 1_000_000 + 47 * 3600_000), '42');
  assert.equal(readToken('confirm', t, env, 1_000_000 + 49 * 3600_000), null);
  assert.equal(readToken('manage', t, env, 1_000_000), null);
});
test('manage token does not expire; tampering fails', () => {
  const t = makeToken('manage', '7', env);
  assert.equal(readToken('manage', t, env, Date.now() + 5 * 365 * 86400_000), '7');
  assert.equal(readToken('manage', t.replace(/^7/, '8'), env), null);
  assert.equal(readToken('manage', t + 'x', env), null);
  assert.equal(readToken('manage', 'garbage', env), null);
  assert.equal(readToken('manage', t, {}), null);
});
