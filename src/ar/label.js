import * as THREE from 'three';

// 떠 있는 텍스트 한 개 = 캔버스 텍스처를 입힌 Sprite.
// Sprite는 항상 카메라를 바라보므로(빌보드) 글이 항상 정면을 향한다.
// CLAUDE.md: 거리에 따라 크기 축소(원근으로 자연 축소) + "약 12m" 거리 뱃지.

const TAG_STYLE = {
  memory: { emoji: '💌', accent: '#ff9ec4' },
  tip: { emoji: '📍', accent: '#7ee0ff' },
};

export class Label {
  constructor(point) {
    this.point = point; // { text, lat, lng, tag, nickname }
    this.distance = 0;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false, // 카메라 배경 위에 항상 그려지도록
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.renderOrder = 1;

    this._draw();
  }

  // 거리 갱신 시 뱃지 텍스트 다시 그리고 월드 스케일 조정.
  setDistance(distM) {
    this.distance = distM;
    this._draw();
    // 월드 높이 ~2.4m 기준. 원근으로 멀수록 작아지지만,
    // 너무 멀면 안 보이므로 거리에 따라 살짝 키워 가독성 보정.
    const k = THREE.MathUtils.clamp(distM / 20, 0.6, 2.2);
    const h = 2.4 * k;
    const aspect = this.canvas.width / this.canvas.height;
    this.sprite.scale.set(h * aspect, h, 1);
  }

  _draw() {
    const dpr = 2;
    const W = 512;
    const H = 192;
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const style = TAG_STYLE[this.point.tag] || TAG_STYLE.memory;

    // 말풍선 배경
    const pad = 18;
    const r = 22;
    roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2 - 14, r);
    ctx.fillStyle = 'rgba(12, 16, 28, 0.82)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = style.accent;
    ctx.stroke();

    // 제목만 표시 (내용은 탭 시 상세 모달에서). 옛 글(제목 없음)은 본문 일부로 대체.
    const title =
      this.point.title && this.point.title.trim()
        ? this.point.title
        : this.point.text;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textBaseline = 'top';
    const lines = wrapText(ctx, `${style.emoji} ${title}`, W - pad * 2 - 28, 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, pad + 16, pad + 16 + i * 38);
    });

    // 닉네임 + 탭 안내
    ctx.fillStyle = '#8fa3c8';
    ctx.font = '500 20px -apple-system, sans-serif';
    ctx.fillText(`— ${this.point.nickname}  ·  👆 탭하여 내용`, pad + 16, H - pad - 46);

    // 거리 뱃지 (우하단 꼬리)
    const badge = `약 ${formatDist(this.distance)}`;
    ctx.font = '700 22px -apple-system, sans-serif';
    const bw = ctx.measureText(badge).width + 28;
    const bx = W - pad - bw;
    const by = H - pad - 6;
    roundRect(ctx, bx, by - 30, bw, 32, 16);
    ctx.fillStyle = style.accent;
    ctx.fill();
    ctx.fillStyle = '#0a0f1c';
    ctx.fillText(badge, bx + 14, by - 26);

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}

function formatDist(m) {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const chars = [...text];
  const lines = [];
  let line = '';
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  // 남은 글자 처리 (마지막 줄 말줄임)
  const used = lines.join('').length;
  let rest = chars.slice(used).join('');
  if (lines.length < maxLines) {
    while (ctx.measureText(rest).width > maxWidth && rest.length) {
      rest = rest.slice(0, -1);
    }
    if (rest) lines.push(rest);
  }
  return lines;
}
