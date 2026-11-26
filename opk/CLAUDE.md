# OPK 업무 도구 — Claude Code 작업 안내

## 고치는 곳
- 화면 소스는 `tool-src/` 에 있어요. **`public/index.html` 은 빌드 결과물이라 직접 고치지 마세요.**
  - `ct.js` `ct.css` 계약서 편집기 · `sg.js` `sg.css` 메일 서명 편집기
  - `lang.js` 계약서 언어(한/영/중)·떠 있는 툴바·사진→계약서·빈칸 추가 메뉴
  - `org.js` 조직도 기본값 + 이름·직함·부서 자동완성 드롭다운
  - `shell1~3.js` 왼쪽 메뉴·테마·백업
  - `build.py` 위 파일을 합치고 CSS 앞에 `#ct`/`#sg` 범위를 붙여요. 원본 문자열을 `rep(...)`로 바꾸는 패치가 많아서, 원본을 바꾸면 빌드가 assert 로 멈출 수 있어요 — 그럴 땐 해당 `rep` 를 같이 고치면 돼요.
- 서버(API·로그인·AI)는 `src/worker.js`.

## 빌드
```
cd opk/tool-src && python3 build.py
```
- `public/index.html` (Cloudflare용, `cf-shim.js` 포함) 과 `tool-src/out/index.html` (claude.ai 아티팩트용) 을 만들어요.
- 로컬 확인: `npx wrangler dev` (D1 로컬, `.dev.vars` 에 `LOGIN_PASSWORD=...`).

## 배포
- `main` 에 푸시하면 Cloudflare Workers Builds 가 자동 배포 (Worker `opk-vitools`, 루트 `/opk`).
- 주소: https://opk-vitools.biz-f12.workers.dev

## 지켜야 할 것
- 공개 저장소예요. 비밀번호·API 키·실제 계약서/계좌/연락처 데이터를 커밋하지 마세요 (`seed.sql`, `.dev.vars` 는 gitignore).
- `LOGIN_PASSWORD` 는 대시보드에서만 관리 (`keep_vars = true`). Cloudflare 의 "wrangler 설정 동기화" 제안은 받지 마세요.
- 홈페이지 저장소/Worker 와 섞지 않아요.
- 디자인: 라이트 = 완전 흰색 + 뉴트럴 쿨그레이, 포인트 초록, 그림자 약하게.
