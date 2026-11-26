# OPK 업무 도구 (opk)

계약서 편집기와 메일 서명 편집기를 왼쪽 메뉴로 오가는 사내 도구입니다.
Cloudflare Workers + D1 로 돌아가며, **홈페이지(opk-korea-main)와 완전히 분리된 별도 Worker·DB** 입니다.

- **계약서** — A4 계약서 편집, 사진으로 새 계약서 만들기(AI가 읽어 OPK 양식으로), 한국어/English/中文 버전, PDF·PNG·JPG·DOCX 개별 다운로드, 전체 다운로드(ZIP), AI 번역. 관리자만 보고 고칠 수 있어요.
- **메일 서명** — 사람별 서명, 양식 5종, 로고 7종, 서식 복사·HTML 복사. 직원 누구나 검색·복사, 수정은 관리자만.
- 라이트/다크 모드, 메뉴 접기(Ctrl+\\).

## 구조

```
public/            화면 (정적 파일)
  index.html       계약서·메일 서명 화면 전체
  cf-shim.js       화면 ↔ /api 연결부
  fonts/ logos/
src/worker.js      /api (로그인 확인, 권한, D1 저장, AI 번역)
db/schema.sql      D1 테이블
db/seed.example.sql 예시 데이터 (계약서 양식 2개, 서명 1개)
wrangler.toml      Worker 설정
```

## 권한

| 데이터 | 보기 | 고치기 |
|---|---|---|
| 계약서 (`contracts`) | 관리자 | 관리자 |
| 메일 서명 (`signatures`) | 로그인한 직원 모두 | 관리자 |
| 회사 공통 정보 (`settings`) | 로그인한 직원 모두 | 관리자 |

로그인은 **Cloudflare Access**(Zero Trust)로 합니다. Worker 가 Access 토큰을 직접 검증하고,
관리자는 `wrangler.toml` 의 `ADMIN_EMAILS` 에 적은 메일입니다.

## 처음 배포하기

```bash
npm install
npx wrangler login

# 1) D1 만들기 → 나온 database_id 를 wrangler.toml 에 붙여 넣기
npx wrangler d1 create opk-tools
npm run db:init

# 2) 예시 데이터 넣기 (계약서 양식 2개 + 서명 1개, 업체·계좌는 ○○ 예시)
npx wrangler d1 execute opk-tools --remote --file=db/seed.example.sql
#    실제 데이터는 따로 받은 seed.sql 로 (git 에 올리지 않기)
# npx wrangler d1 execute opk-tools --remote --file=seed.sql

# 3) AI 번역·사진으로 만들기를 쓸 때만
npx wrangler secret put ANTHROPIC_API_KEY

# 4) wrangler.toml 의 ADMIN_EMAILS 채우고 배포
npm run deploy
```

5. Cloudflare 대시보드 → **Zero Trust → Access → Applications → Add → Self-hosted**
   - 도메인: 배포된 주소(예: `opk-tools.<계정>.workers.dev` 또는 연결한 사내 도메인)
   - 정책: 허용할 메일 도메인(예: `@opk.co.kr`) 또는 개별 메일
   - 만든 뒤 **Application Audience (AUD) Tag** 와 팀 도메인(`<팀>.cloudflareaccess.com`)을
     `wrangler.toml` 의 `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` 에 넣고 다시 `npm run deploy`

Access 설정 전에는 API 가 전부 401 을 돌려줘서 데이터가 열리지 않습니다.

## 로컬에서 돌려보기

```bash
printf 'DEV_EMAIL=me@opk.co.kr\nADMIN_EMAILS=me@opk.co.kr\n' > .dev.vars
npm run db:init:local
npm run dev     # http://127.0.0.1:8787
```

`DEV_EMAIL` 은 로컬 전용입니다. 배포 환경에는 넣지 마세요.

## 메일 서명 로고

받는 사람 메일에서 로고가 보이려면 로고 PNG 가 **공개 주소**에 있어야 합니다.
이 도구가 Access 뒤에 있으면 `logos/*.png` 도 로그인이 필요하므로, 로고는 홈페이지 등 공개된 곳에 올리고
'회사 공통 정보 → 로고 공개 주소'에 `https://…/로고.png` 형식으로 넣어 주세요.
