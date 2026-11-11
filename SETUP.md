# 말랑모션 · 4컷 AI 이모티콘 · Netlify 배포

공개 사이트: https://malang-emoticon-festa-2026.netlify.app

행사명: 2026 시흥 AI+X 미래교육 페스타

GIF가 완성되면 Netlify Blobs에 보관하고 결과 페이지 링크를 QR로 표시합니다. 참가자는 로그인·재생성 없이 QR로 같은 GIF를 내려받습니다. QR과 실제 수령 페이지는 배포 후 기본 모션으로 확인했습니다.

Drive 자동 저장은 별도 쓰기 인증이 필요합니다. 지정 폴더 ID를 반영한 `google-drive/Code.gs`와 `google-drive/SETUP.md`를 확인하세요. 설정하지 않은 동안은 Netlify에만 저장하며, Drive 저장 실패가 QR 수령을 막지는 않습니다.

## 배포

이 폴더를 Git 저장소에 올린 뒤 Netlify에서 Import an existing project로 연결합니다. 정적 HTML만 드래그해서 올리면 서버 함수가 배포되지 않습니다.

- Node.js 22 이상
- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`
- 테스트: `npm test`

## Netlify 환경변수

Project configuration → Environment variables에서 Functions 범위로 등록한 다음 재배포합니다.

| 이름 | 값 |
| --- | --- |
| GEMINI_API_KEY | Google AI Studio에서 발급받은 API 키 |
| IMAGE_MODEL | `gemini-3.1-flash-lite-image` |
| AI_ENABLED | 처음에는 `false`. 실제 유료 생성 테스트를 시작할 때 `true` |
| BOOTH_CODE | 선택 사항. 방문자가 유료 생성을 시작할 때 입력하는 체험 코드 |

이전 VEO_MODEL은 사용하지 않습니다. 설정되어 있다면 삭제해도 됩니다. API 키를 HTML, Git 또는 채팅에 넣지 마세요. BOOTH_CODE를 비우고 AI_ENABLED=true로 두면 방문자가 유료 생성을 요청할 수 있습니다. 해당 Google 프로젝트에 이미지 모델 사용 권한과 결제 설정이 필요합니다.

## 동작

1. 브라우저에서 그림 전체를 흰색 정사각형 안에 맞춥니다. 임의의 가운데 자르기를 하지 않습니다.
2. 선택한 모션과 사용자가 입력한 움직임 아이디어를 함께 서버로 보냅니다. 기본 모션은 8가지(폴짝폴짝, 살랑살랑, 안녕 인사, 하트 뿅뿅, 만세, 꾸벅 감사, 엉엉 울기, 깔깔 웃기)이며 `lib/motions.mjs`에 정의합니다. 학생이 문장을 고치지 않으면 그 모션의 4컷 설명이 함께 들어가고, 직접 쓴 문장이 있으면 그 문장만 씁니다. 모든 요청에는 원본 그림체 유지 규칙(`STYLE_RULES`)이 붙으며, 그림에 없는 팔·다리는 새로 그리지 않게 합니다. 모션을 추가·수정할 때는 `index.html`의 `motions`·`motionIdeas`도 똑같이 맞춥니다(테스트가 확인).
3. 서버에서 Gemini Interactions API로 캐릭터의 순차 동작 2×2 시트 한 장을 요청합니다. 영상 생성 API는 사용하지 않습니다.
4. 응답 이미지의 실제 크기·형식을 확인하고 4칸을 분할합니다. 각 칸 가장자리 2%를 제외하고 480×480으로 맞춥니다. 빈 칸·정사각형이 아닌 시트·완전히 동일한 4칸은 거절합니다. 자동 검사가 구도·캐릭터 일관성의 모든 오류를 판별하지는 못합니다.
5. 1→2→3→4→3→2를 한 번 왕복하는 정확히 3초 GIF를 만듭니다. 각 구간은 0.5초이며 마지막 0.2초에 짧은 디졸브를 적용합니다. 실제 AI 자세는 네 개이며 전환에는 추가 AI 호출이 없습니다. 움직임을 새로 추론하는 영상 보간은 아닙니다.
6. Sharp/libvips의 적응형 256색 팔레트와 디더링로 GIF를 조립합니다. ffmpeg·MP4 변환은 사용하지 않습니다. 이미지 디코딩·크기 변경은 Sharp를 사용합니다.
7. AI API 오류·90초 요청 시간 초과·유효하지 않은 시트는 원본 그림에 선택한 기본 모션을 적용한 3초 GIF로 대체합니다. 결과 화면에 기본 모션 대체임을 표시합니다. 원본 이미지 자체를 읽을 수 없거나 저장소가 실패하면 오류로 표시합니다.

최종 AI GIF는 480×480, 흰 배경입니다. AI 생성 배경을 자동으로 투명하게 만들지는 않습니다. 샘플 모드 GIF는 기존 512×512입니다. 이미지 호출 지연과 3건 동시 처리 시간은 계정·API 상태에 따라 달라지며, 아직 실제 키를 사용한 소요시간을 측정하지 않았습니다.

## Netlify 처리와 보관

jobs 함수가 작업 번호를 발급하고 render-background 함수가 이미지 생성과 GIF 조립을 수행합니다. 브라우저는 2.5초 간격으로 상태를 확인합니다. Netlify Background Functions와 Blobs를 사용하므로 별도 Google Drive는 필요하지 않습니다.

저장소 `malang-motion`:

- `jobs/`: 프롬프트·상태·결과 유형(`ai` 또는 `fallback`)·대체 원인
- `sheets/`: 성공적으로 처리한 AI 4컷 원본 시트
- `results/`: 최종 GIF
- `inputs/`: 처리 중 입력 이미지. 처리 완료·실패 시 삭제

결과는 자동 삭제하지 않습니다. 전체 관리자 내보내기 화면은 포함되지 않았습니다. 작업 ID를 아는 사람은 해당 결과를 조회할 수 있습니다.

## 검증

로컬에서 실제 Sharp와 GIF 인코더로 다음을 검사합니다: 잘림 없는 입력 맞춤, 4컷 분할과 순서, 480px 출력, 3초 타임라인, 빈 시트 거절, API 요청에 이미지와 프롬프트 포함, AI 성공 저장, API 실패 시 명시적인 대체 결과. 테스트의 API 응답은 모의 응답이며 유료 호출을 하지 않습니다.

실제 Google API 응답·생성 품질·지연시간과 Netlify 배포 빌드는 키 등록 후 검증해야 합니다. 이 프로젝트에는 종료된 Veo 호출 코드가 없습니다.

공식 참고: https://ai.google.dev/gemini-api/docs/image-generation · https://docs.netlify.com/build/functions/background-functions/

## 생성 방식: 4초 영상 (기본)

- 기본값은 **Gemini Omni 1.2 Flash로 4초 영상(360p, 16:9)을 만든 뒤 ffmpeg로 360×360 반복 GIF**로 바꾸는 방식입니다. 공식 단가는 360p 초당 $0.023이라 1건(4초)에 약 $0.09입니다.
- 정사각형 그림을 16:9 흰 화면 가운데에 놓아 보내고, **시작 장면과 끝 장면에 같은 그림**을 넣어 이음매 없이 반복되게 합니다. 결과 영상의 가운데 정사각형만 GIF로 씁니다.
- 영상 생성은 보통 1~2분 걸립니다. 화면은 최대 약 6분 30초까지 기다립니다.
- GIF가 4.2MB를 넘으면 초당 장수와 크기를 줄여 다시 만듭니다.
- 영상이 실패하면 선택한 기본 모션으로 4초 GIF를 대신 만듭니다.
- 원래 방식(2×2 4컷 이미지 → GIF)으로 되돌리려면 Netlify 환경변수 `GENERATION_MODE=sheet`를 넣고 재배포합니다. 코드를 바꿀 필요는 없습니다.
- 영상 모델을 바꾸려면 `VIDEO_MODEL` 환경변수를 넣습니다(기본 `gemini-omni-1.2-flash`).
- ffmpeg는 `@ffmpeg-installer/linux-x64` 패키지로 `render-background` 함수에만 포함됩니다(netlify.toml).

## 현재 모델과 비용 (4컷 방식)

기본 모델은 gemini-3.1-flash-lite-image(Nano Banana 2 Lite)입니다. 기존 GEMINI_API_KEY를 유지합니다. Netlify의 IMAGE_MODEL도 이 값으로 바꾸고 서버 함수까지 재배포해야 적용됩니다.

일반 호출의 이미지 출력은 1K $0.0336/장, 입력 $0.25/백만 토큰, 텍스트·추론 출력 $1.50/백만 토큰입니다. 기본 Nano Banana 2.5의 이미지 출력 $0.039보다 저렴합니다. Batch는 더 저렴하지만 현장 즉시 생성과 달라 사용하지 않습니다. 결과는 JPEG 1K와 minimal 추론으로 요청하며 추가 유료 재시도는 없습니다. (Gemini 3 계열 이미지 모델은 결과 형식으로 image/jpeg만 받습니다. image/png로 요청하면 HTTP 400이 납니다.) Google이 오류를 돌려주면 짧은 이유가 작업 기록의 fallbackReason과 Netlify 함수 로그에 남습니다. 실제 사용량은 작업 generation에 기록합니다.

기본 Lite는 Interactions API로 호출합니다. IMAGE_MODEL을 gemini-2.5-flash-image로 명시하는 경우에만 GenerateContent 경로를 사용합니다.

4컷을 3초로 연결하며 Sharp 적응형 팔레트로 GIF를 저장합니다. 진행 게이지는 준비 → AI 생성 → GIF 연결 → 저장·QR의 실제 상태와 경과 시간을 표시합니다. 테스트는 모의 API 응답이며 Lite의 실제 계정 권한과 생성 품질은 아직 미검증입니다.

공식 가격: https://ai.google.dev/gemini-api/docs/pricing
