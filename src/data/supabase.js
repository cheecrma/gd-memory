import { createClient } from '@supabase/supabase-js';
import { BBOX_DELTA_DEG } from './config.js';

// 환경변수(.env): VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 키가 없으면 null → main.js가 로컬 더미(test_points)로 폴백.
export const hasSupabase = Boolean(url && key);
export const supabase = hasSupabase ? createClient(url, key) : null;

// PostgrestError를 사람이 읽을 수 있게 (code/details/hint 포함).
function fmt(error) {
  const parts = [error.message];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.details) parts.push(error.details);
  if (error.hint) parts.push(error.hint);
  return parts.join(' | ');
}

// 현재 좌표 기준 bounding box로 주변 메시지 조회 (숨김 제외).
// 정확한 거리 계산은 클라이언트(scene.js Haversine)에서 한다.
export async function fetchNearby(lat, lng) {
  if (!supabase) return [];
  const d = BBOX_DELTA_DEG;
  const { data, error } = await supabase
    .from('memories')
    .select('id, title, text, lat, lng, nickname, tag, created_at')
    .eq('is_hidden', false)
    .gte('lat', lat - d)
    .lte('lat', lat + d)
    .gte('lng', lng - d)
    .lte('lng', lng + d)
    .limit(100);
  if (error) throw new Error(fmt(error));
  return data || [];
}

// 새 메시지 작성.
export async function insertMemory({ title, text, lat, lng, nickname, tag }) {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다 (.env 확인).');
  const { data, error } = await supabase
    .from('memories')
    .insert({ title, text, lat, lng, nickname, tag })
    .select()
    .single();
  if (error) throw new Error(fmt(error));
  return data;
}

// 신고 → 즉시 숨김 (report_memory RPC).
export async function reportMemory(id) {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.');
  const { error } = await supabase.rpc('report_memory', { memory_id: id });
  if (error) throw new Error(fmt(error));
}
