import { presetKeyframes } from './motions.mjs';

export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

// 원본 그림체를 지키기 위한 고정 규칙 (모든 요청에 들어감)
export const STYLE_RULES = `STYLE LOCK - the reference image is the ONLY character source. Treat it as finished artwork to animate, not a sketch to improve.
- Keep the exact drawing style: the same line thickness, the same wobbly hand-drawn lines, the same marker, crayon or pencil texture, and the same flat colours.
- Do not redraw, clean up, beautify or "fix" the drawing. A child's drawing must still look like the same child's drawing.
- No shading, gradients, 3D rendering, glossy highlights or any new art style.
- Keep the same proportions, face, colours and details. Do not add clothes, accessories or new objects.
- NEVER add body parts the drawing does not have (for example arms, hands or legs). If the action needs them, express it with the parts that already exist - ears, head, body tilt, squash and stretch, eyes and mouth - plus small effects.
- Effects such as hearts, tears, sparkles or motion lines are allowed only when the action calls for them. Keep them small and draw them in the same line and colour style as the drawing.`;

export function motionPrompt(idea, keyframes = null) {
  const frames = keyframes
    ? `KEYFRAMES:\n${keyframes.map((k, i) => `${i + 1}. ${k}`).join('\n')}`
    : 'KEYFRAMES: frame 1 is the rest pose, frame 2 starts the action, frame 3 continues it, frame 4 reaches the peak of the action.';
  return `Create ONE square 1024x1024 sprite sheet with exactly FOUR equally sized square frames in a precise 2 by 2 grid. Read order: top-left, top-right, bottom-left, bottom-right. These are successive keyframes of ONE short action by the SAME character, played back as 1-2-3-4-3-2 in a loop. They are not four different characters.

${STYLE_RULES}

FRAMING: same camera, character scale and anchor point in every frame; no zoom or camera movement. Entire character visible with at least 12 percent clean white margin inside EACH frame; no ears, hands, feet or effects crossing frame boundaries. Pure white background. No text, labels, cell numbers, border lines or gutter.

USER MOTION IDEA (may be Korean): ${idea}
${frames}
Animate the character's relevant body parts and face, not just move the entire picture.`;
}

export function extractOutputImage(response) {
  if (response.status && ['failed', 'cancelled', 'incomplete'].includes(response.status)) throw new Error('IMAGE_GENERATION_INCOMPLETE');
  if (response.output_image?.data) return Buffer.from(response.output_image.data, 'base64');
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'image' && typeof node.data === 'string' && node.data.length > 100) found.push(node.data);
    if (Array.isArray(node)) { for (const item of node) walk(item); }
    else for (const [key, value] of Object.entries(node)) { if (key !== 'user_input' && key !== 'input') walk(value); }
  };
  walk(response.steps || response.outputs || response.output || []);
  if (!found.length) throw new Error('NO_GENERATED_IMAGE');
  return Buffer.from(found.at(-1), 'base64');
}

/** Google 오류 응답에서 짧은 이유만 뽑는다. 키·이미지·프롬프트는 남기지 않는다. */
export async function apiError(response) {
  let detail = '';
  try {
    const text = await response.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      const e = Array.isArray(j) ? j[0]?.error : j.error;
      msg = e?.message || e?.code || text;
    } catch { /* not JSON */ }
    detail = String(msg).replace(/AIza[\w-]{20,}|AQ\.[\w.-]{20,}/g, '[key]').replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch { /* ignore */ }
  const err = new Error(`IMAGE_API_HTTP_${response.status}${detail ? ': ' + detail : ''}`);
  err.status = response.status;
  return err;
}

export async function generateSheet({ image, prompt, motion, apiKey, model = DEFAULT_IMAGE_MODEL, fetchImpl = fetch }) {
  if (!apiKey || !/^gemini-[a-zA-Z0-9.-]+$/.test(model)) throw new Error('IMAGE_API_NOT_CONFIGURED');
  const text = motionPrompt(prompt, presetKeyframes(motion, prompt));

  if (model === 'gemini-2.5-flash-image') {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }, { inlineData: { mimeType: 'image/png', data: Buffer.from(image).toString('base64') } }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });
    if (!response.ok) throw await apiError(response);
    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const output = parts.filter((p) => !p.thought && p.inlineData?.mimeType?.startsWith('image/') && p.inlineData?.data).at(-1);
    if (!output) throw new Error('NO_GENERATED_IMAGE');
    const result = Buffer.from(output.inlineData.data, 'base64');
    Object.defineProperty(result, 'generationMetadata', { value: { model, usage: data.usageMetadata || null } });
    return result;
  }

  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model,
      store: false,
      // Gemini 3 계열 이미지 모델은 결과 형식으로 image/jpeg만 받는다 (image/png 요청 시 HTTP 400)
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1', image_size: '1K' },
      generation_config: { thinking_level: 'minimal' },
      input: [
        { type: 'text', text },
        { type: 'image', mime_type: 'image/png', data: Buffer.from(image).toString('base64') },
      ],
    }),
  });
  if (!response.ok) throw await apiError(response);
  const data = await response.json();
  const imageData = extractOutputImage(data);
  Object.defineProperty(imageData, 'generationMetadata', { value: { model, usage: data.usage || data.usage_metadata || null } });
  return imageData;
}
