import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// 폰에서 같은 와이파이로 접속해 테스트할 수 있게 host 노출 + HTTPS.
// 카메라/GPS/나침반은 HTTPS(또는 localhost)에서만 동작하므로,
// 자체 서명 인증서로 https 개발서버를 띄운다 (basicSsl).
//   → 폰 브라우저에서 "안전하지 않음" 경고가 한 번 뜨면
//      [고급]/[Show Details] → [방문 계속]/[visit website] 으로 통과.
// 더 깔끔한 테스트는 Vercel preview 배포 권장 (CLAUDE.md 참고).
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
    strictPort: true, // 포트 고정(5173). 이미 쓰는 중이면 에러 → 옛 서버 종료 후 재실행.
  },
});
