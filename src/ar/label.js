import * as THREE from 'three';

// 떠 있는 글 한 개 = 4면에 제목이 적힌 큐브(전광판). 천천히 자전한다.
// 동서남북 어디서 봐도 한 면이 보이도록 옆면 4개에 같은 텍스처를 입힌다.
// 내용은 큐브를 탭하면 상세 모달에서 (M3 동작 유지).

const TAG_STYLE = {
  memory: { emoji: '💌', accent: '#ff9ec4' },
  tip: { emoji: '📍', accent: '#7ee0ff' },
};

const BG = '#141b2b';

export class Label {
  constructor(point) {
    this.point = point; // { id, title, text, lat, lng, tag, nickname }
    this.distance = 0;
    this._brg = 0;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    // 4 옆면 = 텍스트, 위/아래 = 단색.
    // BoxGeometry 머티리얼 순서: [+x(우), -x(좌), +y(위), -y(아래), +z(앞), -z(뒤)]
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.texture });
    const sideMat = new THREE.MeshBasicMaterial({ color: BG });
    this.geom = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.Mesh(this.geom, [
      this.faceMat, // 우
      this.faceMat, // 좌
      sideMat, // 위
      sideMat, // 아래
      this.faceMat, // 앞
      this.faceMat, // 뒤
    ]);
    this.sideMat = sideMat;
    this.mesh.renderOrder = 1;

    this._draw();
  }

  // 거리 갱신 시 뱃지 다시 그리고 큐브 크기 조정.
  setDistance(distM) {
    this.distance = distM;
    this._draw();
    // 멀수록 살짝 키워 가독성 보정 (원근으로는 작아지므로).
    const k = THREE.MathUtils.clamp(distM / 20, 0.7, 2.4);
    const size = 1.5 * k;
    this.mesh.scale.set(size, size, size);
  }

  _draw() {
    const S = 460;
    const dpr = 2;
    this.canvas.width = S * dpr;
    this.canvas.height = S * dpr;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    const style = TAG_STYLE[this.point.tag] || TAG_STYLE.memory;

    // 배경(옆면 단색과 동일) + 안쪽 강조 테두리
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, S, S);
    const pad = 16;
    roundRect(ctx, pad, pad, S - pad * 2, S - pad * 2, 26);
    ctx.lineWidth = 5;
    ctx.strokeStyle = style.accent;
    ctx.stroke();

    // 상단: 태그 이모지(좌) / 탭 안내(우)
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '700 30px -apple-system, sans-serif';
    ctx.fillStyle = style.accent;
    ctx.fillText(style.emoji, pad + 22, pad + 20);
    ctx.textAlign = 'right';
    ctx.font = '600 22px -apple-system, sans-serif';
    ctx.fillStyle = '#8595b3';
    ctx.fillText('👆 탭하여 내용', S - pad - 22, pad + 26);

    // 가운데: 제목 (최대 3줄, 가운데 정렬)
    const title =
      this.point.title && this.point.title.trim()
        ? this.point.title
        : this.point.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 42px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const lines = wrapText(ctx, title, S - pad * 2 - 36, 3);
    const lh = 50;
    const startY = S / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((line, i) => ctx.fillText(line, S / 2, startY + i * lh));

    // 하단: 닉네임
    ctx.textBaseline = 'bottom';
    ctx.font = '500 24px -apple-system, sans-serif';
    ctx.fillStyle = '#8fa3c8';
    ctx.fillText(`— ${this.point.nickname}`, S / 2, S - pad - 64);

    // 하단: 거리 뱃지
    const badge = `약 ${formatDist(this.distance)}`;
    ctx.font = '700 26px -apple-system, sans-serif';
    const bw = ctx.measureText(badge).width + 34;
    const bx = (S - bw) / 2;
    const by = S - pad - 22;
    roundRect(ctx, bx, by - 38, bw, 40, 20);
    ctx.fillStyle = style.accent;
    ctx.fill();
    ctx.fillStyle = '#0a0f1c';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, S / 2, by - 17);

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.faceMat.dispose();
    this.sideMat.dispose();
    this.geom.dispose();
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

// 가운데 정렬용 줄바꿈 (최대 maxLines줄, 마지막 줄 말줄임).
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
  const used = lines.join('').length;
  let rest = chars.slice(used).join('');
  if (lines.length < maxLines) {
    if (ctx.measureText(rest).width > maxWidth) {
      while (ctx.measureText(rest + '…').width > maxWidth && rest.length) {
        rest = rest.slice(0, -1);
      }
      rest += '…';
    }
    if (rest) lines.push(rest);
  }
  return lines;
}
