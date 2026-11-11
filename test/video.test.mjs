import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { MOTIONS } from '../lib/motions.mjs';
import { generateVideo, videoPrompt, VIDEO_STYLE_RULES, toWideFrame } from '../lib/video-provider.mjs';
import { videoToGIF, makeTestVideo, GIF_SIZE } from '../lib/video-gif.mjs';
import { renderJob } from '../netlify/functions/render-background.mjs';

await mkdir('test-artifacts', { recursive: true });
const drawing = () => sharp({ create: { width: 512, height: 512, channels: 3, background: '#ffffff' } })
  .composite([{ input: Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="150" fill="#ffd95a" stroke="#222" stroke-width="10"/></svg>'), left: 0, top: 0 }]).png().toBuffer();
const memoryStore = (map) => ({ get: async (k) => map.get(k), set: async (k, v) => map.set(k, v), setJSON: async (k, v) => map.set(k, structuredClone(v)), delete: async (k) => map.delete(k) });

test('Video request: Omni model, same drawing as first and last frame, 16:9 360p 4s', async () => {
  let req;
  const fakeMp4 = Buffer.alloc(5000, 7);
  const out = await generateVideo({
    image: await drawing(), prompt: MOTIONS.wave.idea, motion: 'wave', apiKey: 'test-only',
    fetchImpl: async (url, o) => { req = { url, body: JSON.parse(o.body) }; return { ok: true, json: async () => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: fakeMp4.toString('base64') }] }] }) }; },
  });
  assert.ok(req.url.endsWith('/v1beta/interactions'));
  assert.equal(req.body.model, 'gemini-omni-1.2-flash');
  assert.deepEqual(req.body.response_format, { type: 'video', aspect_ratio: '16:9', resolution: '360p', duration: '4s' });
  const imgs = req.body.input.filter((i) => i.type === 'image');
  assert.equal(imgs.length, 2);
  assert.equal(imgs[0].data, imgs[1].data, 'start and end frame are the same drawing');
  const text = req.body.input.find((i) => i.type === 'text').text;
  assert.ok(text.includes(VIDEO_STYLE_RULES));
  assert.ok(text.includes(MOTIONS.wave.keyframes[1]));
  assert.match(text, /letters, words or numbers in the drawing must stay exactly the same/);
  assert.deepEqual(out, fakeMp4);
});

test('Edited sentence has no preset beats; drawing is centred in a 16:9 white frame', async () => {
  assert.ok(!videoPrompt('공을 차요').includes('Action beats in order'));
  const wide = await toWideFrame(await drawing());
  const { data, info } = await sharp(wide).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1280); assert.equal(info.height, 720);
  const px = (x, y) => data[(y * info.width + x) * info.channels + 2];
  assert.ok(px(40, 360) > 240, 'side margin is white');
  assert.ok(px(640, 360) < 200, 'drawing is in the middle');
});

test('Google error on video request keeps a short reason', async () => {
  await assert.rejects(generateVideo({ image: await drawing(), prompt: 'x', apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 400, text: async () => '{"error":{"message":"bad duration"}}' }) }), /IMAGE_API_HTTP_400: bad duration/);
});

test('ffmpeg turns a 16:9 mp4 into a square, looping 4-second GIF', async () => {
  const mp4 = await makeTestVideo({ seconds: 4 });
  const gif = await videoToGIF(mp4);
  const meta = await sharp(gif, { animated: true }).metadata();
  assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
  assert.equal(meta.width, GIF_SIZE); assert.equal(meta.pageHeight, GIF_SIZE);
  assert.ok(meta.pages >= 30, `frames: ${meta.pages}`);
  const total = meta.delay.reduce((a, b) => a + b, 0);
  assert.ok(total >= 3800 && total <= 4200, `duration ${total}ms`);
  assert.equal(meta.loop, 0, 'loops forever');
  assert.ok(gif.length < 4200000);
  assert.equal(gif.durationMs, 4000);
  await writeFile('test-artifacts/video.gif', gif);
});

test('Video job end-to-end: stored as AI, 360px, 4s, video kept', async () => {
  const mp4 = await makeTestVideo({ seconds: 4 });
  const map = new Map([['inputs/v-id', (await drawing()).toString('base64')]]);
  const job = { id: 'v-id', token: 't', prompt: MOTIONS.cheer.idea, motion: 'cheer' };
  let args;
  await renderJob({ job, store: memoryStore(map), mode: 'video', generate: async (a) => { args = a; return mp4; } });
  assert.equal(args.motion, 'cheer');
  assert.equal(job.resultMode, 'ai');
  assert.equal(job.width, 360); assert.equal(job.durationMs, 4000);
  assert.ok(map.has('videos/v-id.mp4'));
  assert.ok(map.has('results/v-id.gif'));
});

test('Video failure falls back to a 4-second default-motion GIF', async () => {
  const map = new Map([['inputs/vf-id', (await drawing()).toString('base64')]]);
  const job = { id: 'vf-id', token: 't', prompt: MOTIONS.cry.idea, motion: 'cry' };
  const origError = console.error; console.error = () => {};
  try { await renderJob({ job, store: memoryStore(map), mode: 'video', generate: async () => { throw new Error('IMAGE_API_HTTP_429: quota'); } }); }
  finally { console.error = origError; }
  assert.equal(job.resultMode, 'fallback');
  assert.match(job.fallbackReason, /429/);
  assert.equal(job.durationMs, 4000);
  const meta = await sharp(map.get('results/vf-id.gif'), { animated: true }).metadata();
  assert.equal(meta.delay.reduce((a, b) => a + b, 0), 4000);
});
