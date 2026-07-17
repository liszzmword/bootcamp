# 🎯 부트캠프 팀 보드 v3 (React + Supabase + Vercel)

교육(세션)별 팀 배정·발표 진행·상호 평가·퀴즈·채팅까지 관리하는 부트캠프 운영 웹앱입니다.
React SPA + Supabase(모든 권한은 서버 RLS·RPC로 강제) + Vercel로 구성됩니다.

## 역할과 입장 방법

| 역할 | 입장 | 화면 |
|---|---|---|
| 학생(팀원) | QR 스캔(`…/#code=참여코드`) → 학번+이름 | 모바일 탭바: 홈 / 내 팀 / 라이브 / 채팅 |
| 평가자(조교) | `/judge/login`에서 **평가자 코드**+이름 | 평가 전용 화면 (발표 순서대로, 항상 입력 가능) |
| 관리자 | `배포URL/#admin` + 비밀번호 | 사이드바 대시보드 (명단·라이브 콘솔·평가·퀴즈·메시지·아카이브·설정) |
| 둘러보기 | 참여코드만 입력 | 읽기 전용 보드 |
| 프로젝터 | `/present` (관리자 창에서 열기) | 다크 초대형 화면 — 대기QR/순서/발표 중+타이머/리더보드, 라이브 콘솔에서 원격 전환 |

## 핵심 기능

- **교육 세션 분리**: 세션마다 명단·팀·평가·채팅·퀴즈 완전 격리. 참여코드/평가자 코드 별도.
- **팀원 로그인**: 이름+학번 정확 일치. 명단에 없으면 "새로 등록할까요?" 확인 후 자체 등록(관리자가 차단 가능).
- **발표 진행**: 순서 추첨/편집 → 라이브 콘솔에서 이전/다음·타이머 → 학생·프로젝터 화면 실시간 반영.
- **평가**: 총점 100 = 심사위원(관리자+조교) w% + 학생 (100−w)% — 가중치·학생 참여 여부는 평가 설정에서. 점수는 관리자만 열람, 주관식 피드백은 익명 공개. 조교는 [평가 열기]와 무관하게 항상 입력 가능, 학생은 열린 동안만.
- **실시간 퀴즈**: 관리자 출제 → 학생 전원 풀스크린 팝업 → 제한시간 내 1회 응답 → 마감 시 일괄 채점(빠를수록 스피드 보너스, 최대 2배) → 리더보드. 정답은 별도 테이블(quiz_keys)에 격리되어 마감 전 어떤 경로로도 학생에게 노출되지 않음.
- **세션 채팅**(전원 공개, Realtime) · **운영자에게 메시지**(학생↔관리자 1:1) · **공지 다건+고정**(새 공지 실시간 반영).
- **자료 아카이브**: 팀 링크/PPT/메모/개별 제출이 수정될 때마다 이력 자동 보관(누가/언제/무엇을), 파일은 버전 경로로 저장되어 덮어쓰지 않음. 관리자 아카이브 페이지에서 열람.

## 개발/배포

```bash
npm install
npm run dev        # 로컬 개발 (.env.local에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
npm run build      # 프로덕션 빌드 (tsc + vite)
```

- **Vercel**: 프로젝트 연결 시 Vite 자동 감지. 환경변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록 필요. `vercel.json`이 SPA 라우팅 처리.
- **Supabase 초기화**: SQL Editor에서 `supabase/01-setup-v2.sql` → `supabase/02-migration-v3.sql` 순서로 실행(모두 여러 번 실행해도 안전). Authentication → "Allow anonymous sign-ins" ON.
- 기존 v2(단일 HTML) 앱은 `legacy/index.v1.html`에 보존. 배포된 QR(`#code=`)과 `#admin` 주소, 기존 로그인 세션·데이터는 v3에서 그대로 호환됩니다.

## 운영 주의사항

- **명단 재업로드**: 업로드 목록에 없는 학생은 제거되며 그 학생의 평가·퀴즈 포인트·메시지 기록도 함께 삭제됩니다(화면에도 경고 표시).
- **평가자 코드**: 코드만 알면 누구나 평가자로 입장하므로 조교에게만 전달하고, 평가 설정의 조교 목록에서 모르는 이름은 즉시 내보내세요. 동명 조교는 서로의 평가를 덮어쓰니 고유한 이름을 쓰게 하세요.
- **참여코드로 입장하면 관리자/조교 세션도 둘러보기로 강등**됩니다(공용 PC 보호). 관리자는 `#admin`, 조교는 `/judge/login`으로 복귀.
- **퀴즈 마감**은 관리자 화면의 [마감] 버튼(또는 다음 퀴즈 출제 시 자동 마감) 기준이며, 제한시간이 지나면 서버가 제출을 차단합니다.
- **익명 로그인 rate limit**: 같은 와이파이에서 수십 명 동시 첫 접속 시 기본 30회/시간/IP 제한 — Authentication → Rate Limits에서 상향 권장.
- **비밀번호 분실**: SQL Editor에서 `update private_settings set admin_hash = null where id = 1; update settings set admin_set = false where id = 1;` 후 재접속해 재설정.

## 구조

```
├── index.html               # Vite 진입
├── src/
│   ├── api/                 # 모든 서버 호출 (RPC/쿼리 래퍼)
│   ├── hooks/               # 프로필·세션 데이터·Realtime·쿼리 훅
│   ├── components/          # 공통 UI (Button/Sheet/Toast/SaveField…) + QuizOverlay
│   ├── routes/              # 역할별 페이지 (student/ judge/ admin/ + Gate·Join·View·Present)
│   ├── styles/tokens.css    # 디자인 토큰 (Layer1 primitive만 교체하면 브랜드 스킨 변경)
│   └── lib/                 # supabase 클라이언트·에러 매핑·xlsx 파서·포맷터
├── supabase/
│   ├── 01-setup-v2.sql      # 기본 스키마 (기존)
│   └── 02-migration-v3.sql  # v3 확장 (조교·발표·퀴즈·채팅·DM·아카이브)
└── legacy/index.v1.html     # 구버전 단일 HTML (참조·롤백용)
```

## 보안 모델 (v2에서 계승)

- 쓰기 RLS 정책 0개 — 모든 쓰기는 security definer RPC로만, 권한 검증은 서버에서.
- 민감 데이터 격리: 학번(관리자만, 뷰 마스킹) · API 키(관리자+해당 팀만) · 퀴즈 정답(관리자만, Realtime 미등록) · 평가 점수(관리자+작성자만) · 참여/평가자 코드(관리자만).
- anon 키는 공개용이 정상. `service_role` 키는 절대 클라이언트/리포에 넣지 마세요.
