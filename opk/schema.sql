-- OPK 업무 도구 저장소 (계약서·메일 서명·회사 공통 정보)
CREATE TABLE IF NOT EXISTS docs (
  col TEXT NOT NULL,          -- contracts | signatures | settings
  id TEXT NOT NULL,
  data TEXT NOT NULL,         -- JSON
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (col, id)
);
