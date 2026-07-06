# 🎯 부트캠프 팀 보드 (Supabase + Vercel)

팀 배정·팀별 API 키/링크/PPT 파일·전체 공지를 관리하는 웹앱입니다.
모든 데이터가 Supabase에 저장되어 **접속하는 모두에게 공유**되고, 권한(관리자/팀원)은 서버에서 검증됩니다.

| 역할 | 할 수 있는 것 |
|---|---|
| 둘러보기 (기본) | 공지·팀 구성·팀별 링크 열람 |
| 팀원 (이름 + 참여코드) | + 본인 조의 PPT 링크·서비스 링크·메모 수정, PPT 파일 업로드, 본인 조 API 키 열람 |
| 관리자 (비밀번호) | 전부 — 명단(엑셀 업로드), 배정, 팀 수, API 키 발급, 공지, CSV 내보내기 |

---

## 설정 순서 (총 10분 정도)

### 1. Supabase 프로젝트 만들기
1. [supabase.com](https://supabase.com) 가입 → **New project** (Region: `Northeast Asia (Seoul)` 권장, 무료 플랜이면 충분)
2. 프로젝트가 만들어질 때까지 1~2분 대기

### 2. DB 초기화
1. 왼쪽 메뉴 **SQL Editor** → New query
2. `supabase-setup.sql` 파일 내용 **전체**를 붙여넣고 **Run**
   - "Success" 가 나오면 완료 (여러 번 실행해도 안전합니다)
   - 테이블·권한·팀(15개)이 만들어집니다 (명단은 이후 앱에서 엑셀 업로드로 등록)

### 3. 익명 로그인 켜기 (필수!)
1. 왼쪽 메뉴 **Authentication** → **Sign In / Up** (또는 Providers)
2. **Allow anonymous sign-ins** 토글 ON → Save

### 4. 접속 키를 index.html에 넣기
1. **Project Settings → API** 에서 두 값을 복사
   - `Project URL` (예: `https://abcdefg.supabase.co`)
   - `anon` `public` 키 (⚠ `service_role` secret 키가 아닙니다 — 그건 절대 넣지 마세요)
2. `index.html` 상단의 `CONFIG`에 붙여넣기:
   ```js
   const CONFIG = {
     SUPABASE_URL: 'https://abcdefg.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   };
   ```

### 5. Vercel 배포
방법 A — 웹에서 (가장 쉬움):
1. [vercel.com](https://vercel.com) 가입 → **Add New → Project**
2. 이 폴더를 GitHub에 올렸다면 리포 선택, 아니면 [vercel.com/new](https://vercel.com/new)에서 폴더를 드래그 업로드
3. Framework Preset: **Other**, 빌드 설정 없음 → Deploy

방법 B — 터미널에서:
```bash
cd bootcamp-teams
npx vercel --prod
```

배포된 URL(예: `https://bootcamp-teams.vercel.app`)을 학생들에게 공유하면 끝.

### 6. 첫 접속 후 할 일 (관리자)
1. 배포 URL 접속 → 우측 상단 **관리자** 클릭
2. **처음 입력하는 비밀번호가 그대로 관리자 비밀번호로 설정**됩니다 — 바로 만드세요 (누구든 먼저 설정할 수 있으니 배포 직후에!)
3. 왼쪽 사이드바에 **명단 엑셀(.xlsx) 업로드** (성명/소속 열 자동 인식)
4. 툴바의 **참여코드** 버튼으로 코드를 설정하고 학생들에게 공유 (미설정 시 이름만으로 팀원 로그인 가능)
5. 랜덤 배정 → 필요한 학생은 드래그로 조정 → API 키 입력 → 공지 작성

---

## 운영 팁

- **명단 수정**: 관리자 모드 왼쪽 사이드바에 수정된 엑셀을 다시 올리면 됩니다. 같은 이름은 배정 유지, 새 이름 추가, 빠진 이름 제거.
- **PPT 파일**: 팀당 1개, 최대 50MB (Supabase 무료 플랜의 파일당 한도). 새로 올리면 교체됩니다. 파일은 Supabase Storage `ppt` 버킷에 저장됩니다.
- **화면 갱신**: 10초마다 자동 동기화됩니다. 다른 사람이 바꾼 내용이 곧 반영돼요.
- **비밀번호를 잊었을 때**: Supabase SQL Editor에서 아래 실행 후 다시 접속하면 새로 설정할 수 있습니다.
  ```sql
  update private_settings set admin_hash = null where id = 1;
  update settings set admin_set = false where id = 1;
  ```
- **익명 로그인 rate limit**: 같은 와이파이(교육장)에서 수십 명이 동시에 처음 접속하면 Supabase의 익명 가입 제한(기본 30회/시간/IP)에 걸릴 수 있습니다.
  Authentication → Rate Limits에서 **Anonymous users** 한도를 올려두거나, 교육 전날 학생들에게 링크를 미리 한 번 열어보게 하세요. (한 번 접속한 브라우저는 세션이 유지되어 다시 소모하지 않습니다)

## 보안 메모

- `anon` 키는 페이지에 노출되는 게 정상입니다(공개용 키). 실제 권한은 Supabase RLS 정책과 SQL 함수가 강제합니다.
- 관리자 비밀번호는 bcrypt 해시로 DB에 저장되고, API 키는 관리자와 해당 조 팀원 외에는 서버가 아예 내려주지 않습니다.
- 팀원 로그인은 "명단의 이름 + 참여코드" 수준의 인증입니다. 부트캠프 운영 용도로는 충분하지만, 코드가 새면 남의 조 링크를 수정할 수 있으니 참여코드는 수강생에게만 공유하세요.
- 이 저장소가 공개(public)라면 **학생 실명 명단(엑셀·SQL 시드)과 Supabase `service_role` 키는 절대 커밋하지 마세요.** 명단은 앱에서 업로드하면 DB에만 저장됩니다.

## 파일 구성

```
bootcamp-teams/
├── index.html          # 앱 전체 (정적 파일 1개)
├── supabase-setup.sql  # Supabase에서 1회 실행하는 초기화 SQL
└── README.md           # 이 문서
```
