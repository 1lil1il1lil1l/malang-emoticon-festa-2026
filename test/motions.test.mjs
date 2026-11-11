import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { MOTIONS, MOTION_IDS, ALLOWED_MOTIONS, fallbackMotion, presetKeyframes } from '../lib/motions.mjs';
import { generateSheet, motionPrompt, STYLE_RULES } from '../lib/image-provider.mjs';
import { renderJob } from '../netlify/functions/render-background.mjs';

const tinyPng = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffcc00' } }).png().toBuffer();
async function captureRequest({ prompt, motion }) {
  let body;
  await generateSheet({
    image: await tinyPng(), prompt, motion, apiKey: 'test-only', model: 'gemini-3.1-flash-lite-image',
    fetchImpl: async (url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({ output_image: { data: Buffer.alloc(200).toString('base64') } }) }; },
  });
  return body;
}

test('Eight motions, each with an idea, four keyframes and a known fallback', () => {
  assert.deepEqual(MOTION_IDS, ['bounce', 'sway', 'wave', 'heart', 'cheer', 'bow', 'cry', 'laugh']);
  for (const id of MOTION_IDS) {
    assert.ok(MOTIONS[id].idea.length > 5, id);
    assert.equal(MOTIONS[id].keyframes.length, 4, id);
    assert.ok(['bounce', 'sway', 'pulse', 'spin'].includes(fallbackMotion(id)), id);
  }
  assert.ok(ALLOWED_MOTIONS.includes('pulse') && ALLOWED_MOTIONS.includes('spin'), 'old links keep working');
  assert.equal(fallbackMotion('unknown'), 'bounce');
});

test('Page motion buttons and sentences match the server list exactly', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const ideas = Function(`return ${html.match(/const motionIdeas=(\{[^;]*\});/)[1]}`)();
  const buttons = Function(`return ${html.match(/const motions=(\[[^;]*\]);/)[1]}`)().map((m) => m[0]);
  assert.deepEqual(buttons, MOTION_IDS);
  for (const id of MOTION_IDS) assert.equal(ideas[id], MOTIONS[id].idea, id);
});

test('Preset sentence adds its four keyframes; edited sentence does not', async () => {
  const preset = await captureRequest({ prompt: MOTIONS.wave.idea, motion: 'wave' });
  assert.ok(preset.input[0].text.includes('1. ' + MOTIONS.wave.keyframes[0]));
  assert.ok(preset.input[0].text.includes('4. ' + MOTIONS.wave.keyframes[3]));
  const custom = await captureRequest({ prompt: '공을 차는 모습이에요', motion: 'wave' });
  assert.ok(custom.input[0].text.includes('공을 차는'));
  assert.ok(!custom.input[0].text.includes(MOTIONS.wave.keyframes[1]));
  assert.ok(custom.input[0].text.includes('frame 1 is the rest pose'));
});

test('Every request carries the style lock, including the no-new-limbs rule', async () => {
  const body = await captureRequest({ prompt: '아무 움직임', motion: 'bounce' });
  assert.ok(body.input[0].text.includes(STYLE_RULES));
  assert.match(STYLE_RULES, /NEVER add body parts the drawing does not have/);
  assert.match(motionPrompt('x'), /Do not redraw, clean up, beautify/);
  assert.equal(body.response_format.mime_type, 'image/jpeg');
});

test('Google 400 reason is kept (short, no key) and the job falls back to the mapped motion', async () => {
  const image = await sharp({ create: { width: 120, height: 120, channels: 3, background: '#3770df' } }).png().toBuffer();
  const map = new Map([['inputs/f-id', image.toString('base64')]]);
  const store = { get: async (k) => map.get(k), set: async (k, v) => map.set(k, v), setJSON: async (k, v) => map.set(k, structuredClone(v)), delete: async (k) => map.delete(k) };
  const job = { id: 'f-id', token: 't', prompt: MOTIONS.cry.idea, motion: 'cry' };
  const generate = (args) => generateSheet({
    ...args, apiKey: 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE12345',
    fetchImpl: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "The value 'image/png' is not supported for 'response_format.mime_type'. key AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE12345", code: 'invalid_request' } }) }),
  });
  const origError = console.error; console.error = () => {};
  try { await renderJob({ job, store, generate, apiKey: 'x', model: 'gemini-3.1-flash-lite-image' }); }
  finally { console.error = origError; }
  assert.equal(job.resultMode, 'fallback');
  assert.match(job.fallbackReason, /^IMAGE_API_HTTP_400: The value 'image\/png' is not supported/);
  assert.ok(!job.fallbackReason.includes('AIzaSyFAKE'), 'API key must not be stored');
  assert.ok(map.get('results/f-id.gif').subarray(0, 6).toString().startsWith('GIF8'));
});

test('A JPEG sheet from the model is split into a GIF', async () => {
  const colors = ['#e74b4b', '#4cc472', '#507be5', '#edb94f'];
  const tiles = await Promise.all(colors.map((background) => sharp({ create: { width: 512, height: 512, channels: 3, background } }).png().toBuffer()));
  const jpeg = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#fff' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 2) * 512, top: Math.floor(i / 2) * 512 }))).jpeg().toBuffer();
  const map = new Map([['inputs/j-id', (await tinyPng()).toString('base64')]]);
  const store = { get: async (k) => map.get(k), set: async (k, v) => map.set(k, v), setJSON: async (k, v) => map.set(k, structuredClone(v)), delete: async (k) => map.delete(k) };
  const job = { id: 'j-id', token: 't', prompt: MOTIONS.heart.idea, motion: 'heart' };
  let seenMotion;
  await renderJob({ job, store, generate: async ({ motion }) => { seenMotion = motion; return jpeg; } });
  assert.equal(seenMotion, 'heart');
  assert.equal(job.resultMode, 'ai');
  assert.ok(map.has('results/j-id.gif'));
});
