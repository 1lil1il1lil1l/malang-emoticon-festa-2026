// 기본 모션 8가지. index.html의 motions / motionIdeas 와 id·문장이 같아야 한다.
// idea: 화면에 보이고 서버로 오는 한국어 문장 (학생이 직접 쓰지 않았을 때 그대로 전송됨)
// keyframes: 기본 문장일 때만 AI에 함께 보내는 4컷 설명
// fallback: AI가 실패했을 때 쓰는 기본 움직임 (lib/motion.mjs fallbackGIF 가 아는 값)
export const MOTIONS = {
  bounce: {
    idea: '캐릭터가 제자리에서 리듬감 있게 폴짝폴짝 뛰어요.',
    fallback: 'bounce',
    keyframes: [
      'rest pose standing on the ground',
      'crouches down slightly, squashed, ready to jump',
      'springs upward, body stretched, off the ground',
      'highest point of the jump, happy face',
    ],
  },
  sway: {
    idea: '캐릭터가 좌우로 부드럽게 살랑살랑 흔들려요.',
    fallback: 'sway',
    keyframes: [
      'rest pose, upright',
      'body gently tilts to the left',
      'back to upright with a small bounce',
      'body gently tilts to the right',
    ],
  },
  wave: {
    idea: '캐릭터가 한쪽 손을 흔들며 반갑게 인사해요.',
    fallback: 'sway',
    keyframes: [
      'rest pose with a friendly face',
      'raises one hand to greet (if the drawing has no hands or arms, tilts the body and perks up the ears instead)',
      'the raised hand (or the body) leans to one side, waving, cheerful face',
      'the raised hand (or the body) leans to the other side, waving, big smile',
    ],
  },
  heart: {
    idea: '캐릭터가 손으로 하트를 만들고 하트가 뿅뿅 떠올라요.',
    fallback: 'pulse',
    keyframes: [
      'rest pose with a soft smile',
      'makes a heart shape with its hands (if it has no hands, closes its eyes happily and blushes)',
      'one small heart pops up beside the character',
      'two or three small hearts float around the character, loving face',
    ],
  },
  cheer: {
    idea: '캐릭터가 두 팔을 번쩍 들고 신나게 만세를 해요.',
    fallback: 'bounce',
    keyframes: [
      'rest pose',
      'starts raising its arms (if it has no arms, stretches its body upward and perks up)',
      'arms fully up in a cheer (or body stretched tall), excited open-mouth smile',
      'same cheer pose with a few small sparkles around',
    ],
  },
  bow: {
    idea: '캐릭터가 꾸벅 고개 숙여 고맙다고 인사해요.',
    fallback: 'pulse',
    keyframes: [
      'rest pose, upright and polite',
      'begins to bow, head and upper body tipping forward',
      'deep bow, eyes closed',
      'comes back up with a warm, thankful smile',
    ],
  },
  cry: {
    idea: '캐릭터가 눈물을 뚝뚝 흘리며 엉엉 울어요.',
    fallback: 'sway',
    keyframes: [
      'sad, droopy face',
      'tears welling up in the eyes',
      'tears streaming down both cheeks, mouth open crying',
      'crying hard with big tear drops, body trembling slightly',
    ],
  },
  laugh: {
    idea: '캐릭터가 눈을 감고 몸을 흔들며 깔깔 웃어요.',
    fallback: 'bounce',
    keyframes: [
      'gentle smile',
      'eyes squeezed shut, laughing with an open mouth',
      'body leaning back while laughing',
      'body shaking with laughter, a tiny tear of joy',
    ],
  },
};

export const MOTION_IDS = Object.keys(MOTIONS);

// 예전 링크·작업 호환용 (화면에서는 빠짐)
const LEGACY_FALLBACK = { pulse: 'pulse', spin: 'spin' };
export const ALLOWED_MOTIONS = [...MOTION_IDS, ...Object.keys(LEGACY_FALLBACK)];

export function fallbackMotion(id) {
  return MOTIONS[id]?.fallback || LEGACY_FALLBACK[id] || 'bounce';
}

/** 학생이 문장을 고치지 않고 버튼의 기본 문장을 그대로 보냈을 때만 4컷 설명을 돌려준다 */
export function presetKeyframes(id, prompt) {
  const m = MOTIONS[id];
  if (!m) return null;
  return String(prompt || '').trim() === m.idea ? m.keyframes : null;
}
