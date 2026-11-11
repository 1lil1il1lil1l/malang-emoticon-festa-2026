// mp4 영상 → 반복 GIF (ffmpeg 사용). Netlify(리눅스)와 Windows 로컬 테스트 모두 지원.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, rm, copyFile, chmod, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const VIDEO_SECONDS = 4;
export const GIF_SIZE = 360;
const MAX_GIF_BYTES = 4200000;

let cachedPath = null;
async function ffmpegPath() {
  if (cachedPath) return cachedPath;
  const pkg = `@ffmpeg-installer/${process.platform}-${process.arch}`;
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [process.env.FFMPEG_PATH];
  try { candidates.push(path.join(path.dirname(createRequire(import.meta.url).resolve(`${pkg}/package.json`)), exe)); } catch { /* not resolvable */ }
  candidates.push(path.join(process.cwd(), 'node_modules', pkg, exe), path.join('/var/task/node_modules', pkg, exe));
  for (const c of candidates.filter(Boolean)) {
    try { await access(c, constants.F_OK); } catch { continue; }
    if (process.platform === 'win32') return (cachedPath = c);
    // 배포 환경에서 실행 권한이 빠져 있을 수 있어 /tmp 로 복사해 권한을 준다
    try { await access(c, constants.X_OK); return (cachedPath = c); } catch {
      const tmp = path.join(tmpdir(), 'ffmpeg-malang');
      await copyFile(c, tmp); await chmod(tmp, 0o755);
      return (cachedPath = tmp);
    }
  }
  throw new Error('FFMPEG_NOT_FOUND');
}

function run(bin, args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('FFMPEG_TIMEOUT')); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error('FFMPEG_FAILED: ' + err.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 200))); });
  });
}

/** 가로·세로 어느 비율이든 가운데 정사각형을 잘라 size×size, fps 장/초, seconds 초 GIF로 */
async function encode(bin, input, out, { size, fps, seconds }) {
  const vf = `crop='min(iw,ih)':'min(iw,ih)',fps=${fps},scale=${size}:${size}:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a`;
  await run(bin, ['-y', '-v', 'error', '-i', input, '-t', String(seconds), '-an', '-vf', vf, '-loop', '0', out]);
  return readFile(out);
}

export async function videoToGIF(video, { size = GIF_SIZE, seconds = VIDEO_SECONDS } = {}) {
  const bin = await ffmpegPath();
  const dir = await mkdtemp(path.join(tmpdir(), 'malang-'));
  try {
    const input = path.join(dir, 'in.mp4');
    await writeFile(input, video);
    // 용량이 크면 프레임 수 → 크기 순으로 줄여 다시 만든다
    for (const opt of [{ size, fps: 12 }, { size, fps: 10 }, { size: 300, fps: 10 }, { size: 260, fps: 8 }]) {
      const gif = await encode(bin, input, path.join(dir, `out-${opt.size}-${opt.fps}.gif`), { ...opt, seconds });
      if (gif.length <= MAX_GIF_BYTES) return Object.assign(gif, { width: opt.size, height: opt.size, durationMs: seconds * 1000 });
    }
    throw new Error('GIF_TOO_LARGE');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 테스트용: ffmpeg로 짧은 mp4 만들기 */
export async function makeTestVideo({ seconds = 4, width = 640, height = 360 } = {}) {
  const bin = await ffmpegPath();
  const dir = await mkdtemp(path.join(tmpdir(), 'malang-t-'));
  try {
    const out = path.join(dir, 't.mp4');
    await run(bin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${width}x${height}:rate=24:duration=${seconds}`, '-pix_fmt', 'yuv420p', out]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
