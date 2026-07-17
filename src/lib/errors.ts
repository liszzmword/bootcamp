// 서버 RPC 예외 코드 → 사용자 문구. 이 매핑이 사실상 서버 계약이다.
const ERR_MAP: Record<string, string> = {
  BAD_PASSWORD: '비밀번호가 일치하지 않습니다.',
  PW_TOO_SHORT: '비밀번호는 4자 이상이어야 합니다.',
  BAD_CODE: '참여코드가 올바르지 않습니다.',
  NO_SESSION: '먼저 교육 세션에 입장해야 합니다.',
  BAD_SESSION: '세션을 찾을 수 없습니다.',
  CODE_TAKEN: '이미 쓰이고 있는 코드입니다. 다른 코드를 정하세요.',
  EMPTY_CODE: '코드를 입력하세요.',
  NO_NAME: '이름을 입력하세요.',
  NO_SNO: '학번을 입력하세요.',
  BAD_MATCH: '이름과 학번이 일치하지 않습니다. 관리자에게 문의하세요.',
  NO_SNO_SET: '이 이름은 명단에 학번이 등록되어 있지 않습니다. 관리자에게 학번 등록을 요청하세요.',
  SNO_TAKEN: '이미 같은 학번이 명단에 있습니다.',
  REG_CLOSED: '신규 등록이 마감되었습니다. 관리자에게 문의하세요.',
  NO_TEAM: '아직 팀이 배정되지 않았습니다. 관리자에게 문의하세요.',
  OWN_TEAM: '자기 팀은 평가할 수 없습니다.',
  EVAL_CLOSED: '관리자가 평가를 연 동안에만 점수를 줄 수 있습니다.',
  STUDENT_EVAL_OFF: '이 세션은 학생 평가가 꺼져 있습니다.',
  BAD_TEAM: '평가 대상 팀이 올바르지 않습니다.',
  BAD_SCORE: '점수는 1~10점 사이여야 합니다.',
  BAD_WEIGHT: '가중치는 0~100 사이여야 합니다.',
  INDIV_CLOSED: '개별활동 모드가 아닙니다.',
  NOT_ADMIN: '관리자 권한이 필요합니다 — 다시 로그인해 주세요.',
  NOT_ALLOWED: '이 작업을 할 권한이 없습니다.',
  NOT_AUTHENTICATED: '연결 세션이 없습니다. 새로고침 후 다시 시도하세요.',
  EMPTY_ROSTER: '명단에서 이름을 찾지 못했습니다.',
  BAD_BODY: '내용을 입력하세요 (2,000자 이내).',
  NO_QUIZ: '퀴즈를 찾을 수 없습니다.',
  ALREADY_OPENED: '이미 출제된 퀴즈입니다.',
  QUIZ_CLOSED: '퀴즈가 마감되었습니다.',
  BAD_CHOICE: '보기를 선택하세요.',
  ALREADY_ANSWERED: '이미 답을 제출했습니다 (변경 불가).',
  BAD_QUESTION: '문항을 입력하세요.',
  BAD_CHOICES: '보기는 2~6개여야 합니다.',
  BAD_CORRECT: '정답 보기를 선택하세요.',
  BAD_STAGE: '잘못된 표시 상태입니다.',
  BAD_PATH: '잘못된 파일 경로입니다.',
  'duplicate key': '같은 이름이 이미 있습니다.',
};

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  for (const k of Object.keys(ERR_MAP)) {
    if (m.includes(k)) return ERR_MAP[k];
  }
  return m;
}

/** 특정 서버 예외 코드인지 검사 (예: CONFIRM_NEW 분기) */
export function isErr(e: unknown, code: string): boolean {
  return (e instanceof Error ? e.message : String(e)).includes(code);
}
