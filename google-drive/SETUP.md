# 지정 Google Drive 폴더로 자동 보관하기

대상 폴더: https://drive.google.com/drive/folders/1wsIsRFmxzpC7-qzOIM5cpYqfIY_F2q0p

보기 권한 링크만으로는 업로드할 수 없습니다. 폴더 소유자의 권한으로 실행되는 Apps Script 웹앱을 한 번 연결합니다. Netlify에 Google 계정 비밀번호를 저장하지 않습니다.

1. 폴더에 파일을 만들 수 있는 Google 계정으로 https://script.google.com 에서 새 프로젝트를 만듭니다.
2. 이 폴더의 `Code.gs`를 붙여 넣습니다. 대상 폴더 ID는 이미 입력되어 있습니다.
3. 프로젝트 설정 → 스크립트 속성에 `MALANG_ARCHIVE_SECRET`을 추가하고, 추측하기 어려운 긴 임의 값을 정합니다.
4. 배포 → 새 배포 → 웹 앱. 실행 사용자: **나**, 액세스 사용자: **모든 사용자**로 배포하고 Google 권한 요청은 계정 소유자가 검토·승인합니다. 조직 정책상 익명 웹앱이 금지된 계정이면 별도 OAuth 방식이 필요합니다.
5. 생성된 `/exec` 웹앱 주소를 Netlify 환경변수 `DRIVE_WEBHOOK_URL`에 등록합니다.
6. 3번에서 정한 비밀값을 Netlify의 `DRIVE_WEBHOOK_SECRET`에 동일하게 등록합니다. 두 값은 Functions 범위에 적용하고 재배포합니다.
7. 이모티콘 한 건을 만든 뒤 Drive 폴더에 `malang-작업번호.gif`가 생기는지 확인합니다.

이 설정이 없으면 결과는 Netlify Blobs에만 저장되며 QR 수령은 가능합니다. Drive 저장 실패가 GIF 다운로드나 QR 수령을 막지 않도록 구성했습니다. 결과 파일의 Drive 공유 권한은 변경하지 않습니다. QR은 Drive 파일 대신 별도의 결과 페이지를 열기 때문에 참가자의 Google 로그인이 필요하지 않습니다.
