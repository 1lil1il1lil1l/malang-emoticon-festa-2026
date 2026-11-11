// Gemini Omni Flash 이미지→영상. 첫 장면과 끝 장면에 같은 그림을 넣어 이음매 없이 반복되는 4초 영상을 만든다.
import sharp from 'sharp';
import { presetKeyframes } from './motions.mjs';
import { apiError } from './image-provider.mjs';
import { VIDEO_SECONDS } from './video-gif.mjs';

export const DEFAULT_VIDEO_MODEL = 'gemini-omni-1.2-flash';

export const VIDEO_STYLE_RULES = `STYLE LOCK - the reference image is the ONLY character source. Treat it as finished artwork to animate, not a sketch to improve.
- Keep the exact drawing style in every frame: the same line thickness, the same wobbly hand-drawn lines, the same marker, crayon or pencil texture, and the same flat colours. It must look like the same flat 2D drawing coming to life.
- Do not redraw, clean up, beautify or "fix" the drawing. No shading, gradients, 3D rendering, glossy highlights, depth of field or any new art style.
- Keep the same proportions, face, colours and details. Do not add clothes, accessories, objects or characters.
- NEVER add body parts the drawing does not have (for example arms, hands or legs). If the action needs them, express it with the parts that already exist - ears, head, body tilt, squash and stretch, eyes and mouth - plus small effects.
- Any letters, words or numbers in the drawing must stay exactly the same, readable and still for the whole video. Do not add new text.
- Effects such as hearts, tears, sparkles or motion lines are allowed only when the action calls for them; keep them small and in the same drawn style.`;

export function videoPrompt(idea, keyframes = null) {
  const beats = keyframes
    ? `Action beats in order: ${keyframes.map((k, i) => `(${i + 1}) ${k}`).join(', ')}, then smoothly return to the starting pose.`
    : 'Start from the rest pose, perform the action, then smoothly return to the starting pose.';
  return `Animate this hand-drawn character as a cute ${VIDEO_SECONDS}-second looping animated emoticon. The video starts and ends on exactly the reference drawing so it loops seamlessly.

${VIDEO_STYLE_RULES}

SHOT: locked static camera, no zoom, no pan, no cuts. Plain pure white background. The character stays centred and fully inside the middle square of the frame the whole time. Silent - no music, no speech.

USER MOTION IDEA (may be Korean): ${idea}
${beats}`;
}

/** 정사각형 그림을 16:9 흰 화면 가운데에 놓는다 (Omni는 16:9 / 9:16만 지원) */
export async function toWideFrame(image) {
  const h = 720, w = 1280;
  const art = await sharp(image).resize(h, h, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
    .composite([{ input: art, left: (w - h) / 2, top: 0 }]).jpeg({ quality: 92 }).toBuffer();
}

function findVideo(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  const mime = node.mime_type || node.mimeType || '';
  if ((node.type === 'video' || mime.startsWith('video/')) && (typeof node.data === 'string' || typeof node.uri === 'string')) return node;
  for (const [k, v] of Array.isArray(node) ? node.entries() : Object.entries(node)) {
    if (k === 'input' || k === 'user_input') continue;
    const hit = findVideo(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export async function generateVideo({ image, prompt, motion, apiKey, model = DEFAULT_VIDEO_MODEL, fetchImpl = fetch }) {
  if (!apiKey || !/^gemini-[a-zA-Z0-9.-]+$/.test(model)) throw new Error('VIDEO_API_NOT_CONFIGURED');
  const frame = (await toWideFrame(image)).toString('base64');
  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(280000),
    body: JSON.stringify({
      model,
      store: false,
      // 첫 번째 이미지 = 시작 장면, 두 번째 이미지 = 끝 장면 (같은 그림 → 자연스러운 반복)
      input: [
        { type: 'image', mime_type: 'image/jpeg', data: frame },
        { type: 'image', mime_type: 'image/jpeg', data: frame },
        { type: 'text', text: videoPrompt(prompt, presetKeyframes(motion, prompt)) },
      ],
      response_format: { type: 'video', aspect_ratio: '16:9', resolution: '360p', duration: `${VIDEO_SECONDS}s` },
    }),
  });
  if (!response.ok) throw await apiError(response);
  const data = await response.json();
  if (data.status && ['failed', 'cancelled', 'incomplete'].includes(data.status)) throw new Error('VIDEO_GENERATION_INCOMPLETE');
  const item = findVideo(data.steps || data.outputs || data.output || data);
  if (!item) throw new Error('NO_GENERATED_VIDEO');
  let video;
  if (item.data) video = Buffer.from(item.data, 'base64');
  else {
    const dl = await fetchImpl(item.uri, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(60000) });
    if (!dl.ok) throw new Error('VIDEO_DOWNLOAD_HTTP_' + dl.status);
    video = Buffer.from(await dl.arrayBuffer());
  }
  if (video.length < 1000) throw new Error('NO_GENERATED_VIDEO');
  Object.defineProperty(video, 'generationMetadata', { value: { model, usage: data.usage || data.usage_metadata || null } });
  return video;
}
