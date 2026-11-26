# OPK 업무 도구 (opk)

계약서 편집기와 메일 서명 편집기를 왼쪽 메뉴로 오가는 사내 도구입니다.
Cloudflare Workers + D1 로 돌아가며, **홈페이지(opk-korea-main)와 완전히 분리된 별도 Worker·DB** 입니다.

- **계약서** — A4 계약서 편집, 사진으로 새 계약서 만들기(AI가 읽어 OPK 양식으로), 한국어/English/中文 버전, PDF·PNG·JPG·DOCX 개별 다운로드, 전체 다운로드(ZIP), AI 번역. 관리자만 보고 고칠 수 있어요.
- **메일 서명** — 사람별 서명, 양식 5종, 로고 7종, 서식 복사·HTML 복사. 직원 누구나 검색·복사, 수정은 관리자만.
- 라이트/다크 모드, 메뉴 접기(Ctrl+\\).

## 구조

```
tool-src/          화면 소스 (여기서 고치고 python3 build.py)
public/            화면 (빌드 결과, 정적 파일)
  index.html       계약서·메일 서명 화면 전체
  cf-shim.js       화면 ↔ /api 연결부
  fonts/ logos/
src/worker.js      /api (로그인, 권한, D1 저장, AI 번역·사진 읽기)
public/example-seed.json  첫 실행 때 자동으로 들어가는 예시 데이터
schema.sql      D1 테이블
seed.example.sql 예시 데이터 (계약서 양식 2개, 서명 1개)
wrangler.toml      Worker 설정
```

## 권한과 로그인

| 데이터 | 보기 | 고치기 |
|---|---|---|
| 계약서 (`contracts`) | 관리자 | 관리자 |
| 메일 서명 (`signatures`) | 로그인한 직원 모두 | 관리자 |
| 회사 공통 정보 (`settings`) | 로그인한 직원 모두 | 관리자 |

로그인은 **아이디·비밀번호 하나**로 합니다.

- 아이디: `wrangler.toml` 의 `LOGIN_ID` (지금 `admin`)
- 비밀번호: Worker 설정 → 변수 및 시크릿 → `LOGIN_PASSWORD` (유형 **Secret**). 저장소에는 절대 적지 않습니다.
- 로그인한 사람은 모두 관리자입니다(계약서·서명 모두 편집). 로그인은 30일 유지되고, 비밀번호를 바꾸면 모두 다시 로그인합니다.
- (선택) 직원용 보기 전용 계정이 필요하면 `STAFF_PASSWORD` 를 추가하면 비밀번호만으로 서명 보기·복사 전용으로 들어옵니다.

비밀번호가 없으면 화면에 "로그인 설정이 필요해요"만 나오고 데이터는 열리지 않습니다.

## 배포 (Cloudflare 대시보드, Git 연결)

1. **D1 만들기** — Storage & Databases → D1 → Create → 이름 `opk-tools` → 만든 뒤 Database ID 를
   `wrangler.toml` 의 `database_id` 에 넣고 커밋. (테이블과 예시 데이터는 첫 접속 때 Worker 가 자동으로 만듭니다)
2. **Worker 만들기** — Workers & Pages → 애플리케이션 생성 → Git 저장소 가져오기 → `dasomkim-create/opk`, 프로젝트 이름 `opk-vitools`
   - Root directory: `opk` (저장소 안 `opk/` 폴더)
   - Deploy command: `npx wrangler deploy`
3. **Secret 넣기** — 만든 Worker → 설정 → 변수 및 비밀 → `LOGIN_PASSWORD`
   (AI 번역·사진으로 만들기를 쓰려면 `ANTHROPIC_API_KEY` 도)
4. 이후 `main` 에 커밋하면 자동으로 다시 배포됩니다.

명령줄로 하려면:

```bash
npm install && npx wrangler login
npx wrangler d1 create opk-tools      # → database_id 를 wrangler.toml 에
npx wrangler secret put LOGIN_PASSWORD
npm run deploy
```

실제 데이터는 화면 왼쪽 아래 **백업** → 복사하기/가져오기로 옮기는 게 가장 쉽습니다. 명령줄로는 따로 받은 `seed.sql` 을 넣습니다. **git 에 올리지 마세요.**

```bash
npx wrangler d1 execute opk-tools --remote --file=seed.sql
```

## 로컬에서 돌려보기

```bash
printf 'LOGIN_PASSWORD=local-test\n' > .dev.vars   # 아이디 admin
npm run db:init:local
npm run dev     # http://127.0.0.1:8787
```

`.dev.vars` 는 로컬 전용이며 git 에 올라가지 않습니다.

## 메일 서명 로고

받는 사람 메일에서 로고가 보이려면 로고 PNG 가 **공개 주소**에 있어야 합니다.
이 도구가 Access 뒤에 있으면 `logos/*.png` 도 로그인이 필요하므로, 로고는 홈페이지 등 공개된 곳에 올리고
'회사 공통 정보 → 로고 공개 주소'에 `https://…/로고.png` 형식으로 넣어 주세요.
