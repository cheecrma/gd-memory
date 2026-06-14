-- ─────────────────────────────────────────────────────────────
-- 건대의 기억 — Supabase 스키마 (M2)
-- Supabase 대시보드 → SQL Editor 에 그대로 붙여넣고 RUN.
-- ─────────────────────────────────────────────────────────────

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  title varchar(40) not null default '', -- 목록/지도에 보이는 제목
  text varchar(200) not null,            -- 본문(그 자리 AR에서만 보임)
  lat double precision not null,
  lng double precision not null,
  nickname varchar(20) not null,
  tag varchar(10) default 'memory',   -- 'memory'(기억) | 'tip'(명당·팁)
  created_at timestamptz default now(),
  is_hidden boolean default false      -- 신고/필터 숨김용
);

-- 위치 조회 가속용 인덱스
create index if not exists memories_lat_lng_idx on memories (lat, lng);

-- ── Row Level Security ──
alter table memories enable row level security;

-- 누구나(anon) 숨김 아닌 글을 읽을 수 있음
drop policy if exists "read_visible" on memories;
create policy "read_visible"
  on memories for select
  using (is_hidden = false);

-- 누구나(anon) 글 작성 가능. 기본적인 값 검증을 WITH CHECK으로.
-- (욕설/실명 LLM 필터, 캠퍼스 펜스 DB 강화는 M4)
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

-- 신고(숨김) 함수: anon이 호출 가능, is_hidden 만 true 로.
create or replace function report_memory(memory_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update memories set is_hidden = true where id = memory_id;
$$;
grant execute on function report_memory(uuid) to anon;
