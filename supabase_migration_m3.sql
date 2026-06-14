-- ─────────────────────────────────────────────────────────────
-- 건대의 기억 — M3 마이그레이션
-- (이미 M2에서 memories 테이블을 만든 경우, 이 델타만 RUN)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 RUN.
-- ─────────────────────────────────────────────────────────────

-- 1) 제목 컬럼 추가 (기존 행은 빈 제목 → 앱에서 내용 일부로 대체 표시)
alter table memories add column if not exists title varchar(40) not null default '';

-- 2) 작성 검증 정책 갱신 (title 포함)
drop policy if exists "insert_anon" on memories;
create policy "insert_anon"
  on memories for insert
  with check (
    char_length(title) between 1 and 40
    and char_length(text) between 1 and 200
    and char_length(nickname) between 1 and 20
    and tag in ('memory', 'tip')
    and is_hidden = false
  );

-- 3) 신고(숨김) 함수: anon이 호출 가능, is_hidden 만 true 로 바꿈.
--    (글 내용 수정은 불가 — 숨김 처리만)
create or replace function report_memory(memory_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update memories set is_hidden = true where id = memory_id;
$$;
grant execute on function report_memory(uuid) to anon;
