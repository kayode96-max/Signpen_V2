/**
 * The thank-you keepsake. A flat 2D portrait: the shirt, the signatures on it,
 * and a caption. No WebGL.
 */

import { graduateFirstName } from '@/lib/signing/signer-ui';
import { positionOnFront, type ShirtPoint } from '@/lib/shirt/spot';

export const KEEPSAKE_WIDTH = 1080;
export const KEEPSAKE_HEIGHT = 1350;

const SHIRT_VIEW = { width: 200, height: 230 };

export function keepsakeCaption(graduateName: string): string {
  return `For ${graduateFirstName(graduateName)} · signpen.xyz`;
}

export type KeepsakeBox = { x: number; y: number; width: number; height: number };

/** Shirt graphic and the caption baseline inside the 1080×1350 portrait. */
export function keepsakeLayout(): { shirt: KeepsakeBox; captionY: number } {
  const margin = 72;
  const captionBlock = 160;
  const availW = KEEPSAKE_WIDTH - margin * 2;
  const availH = KEEPSAKE_HEIGHT - margin - captionBlock;
  const scale = Math.min(availW / SHIRT_VIEW.width, availH / SHIRT_VIEW.height);
  const width = SHIRT_VIEW.width * scale;
  const height = SHIRT_VIEW.height * scale;
  return {
    shirt: {
      x: (KEEPSAKE_WIDTH - width) / 2,
      y: margin,
      width,
      height,
    },
    captionY: margin + height + 88,
  };
}

/** A signature's pixel box on the keepsake, using the same front-panel map as the flat shirt. */
export function keepsakeMarkBox(position: ShirtPoint): KeepsakeBox | null {
  const local = positionOnFront(position);
  if (!local) return null;
  const { shirt } = keepsakeLayout();
  const chest = {
    x: shirt.x + shirt.width * 0.24,
    y: shirt.y + shirt.height * 0.30,
    width: shirt.width * 0.52,
    height: shirt.height * 0.52,
  };
  const width = chest.width * 0.46;
  const height = chest.height * 0.22;
  return {
    x: chest.x + local.x * chest.width - width / 2,
    y: chest.y + local.y * chest.height - height / 2,
    width,
    height,
  };
}

type Drawable = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  bezierCurveTo: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) => void;
  closePath: () => void;
  fill: () => void;
  stroke: () => void;
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  drawImage: (image: CanvasImageSource, x: number, y: number, w: number, h: number) => void;
};

export type KeepsakeMark = {
  image: CanvasImageSource;
  position: ShirtPoint;
};

/** Draw the portrait into an already-sized 1080×1350 context. */
export function drawKeepsake(
  ctx: Drawable,
  input: { graduateName: string; marks: readonly KeepsakeMark[] },
): void {
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, KEEPSAKE_WIDTH, KEEPSAKE_HEIGHT);

  const { shirt, captionY } = keepsakeLayout();
  const scale = shirt.width / SHIRT_VIEW.width;
  ctx.fillStyle = '#f7f4ee';
  ctx.strokeStyle = '#d9d3c7';
  ctx.lineWidth = 2 * scale;
  traceShirt(ctx, shirt.x, shirt.y, scale);
  ctx.fill();
  ctx.stroke();

  for (const mark of input.marks) {
    const box = keepsakeMarkBox(mark.position);
    if (!box) continue;
    ctx.drawImage(mark.image, box.x, box.y, box.width, box.height);
  }

  ctx.fillStyle = '#1c1c1e';
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(keepsakeCaption(input.graduateName), KEEPSAKE_WIDTH / 2, captionY);
}

function traceShirt(ctx: Drawable, originX: number, originY: number, scale: number): void {
  const x = (value: number) => originX + value * scale;
  const y = (value: number) => originY + value * scale;
  ctx.beginPath();
  ctx.moveTo(x(62), y(46));
  ctx.lineTo(x(28), y(62));
  ctx.lineTo(x(14), y(92));
  ctx.lineTo(x(38), y(108));
  ctx.lineTo(x(48), y(90));
  ctx.lineTo(x(48), y(200));
  ctx.lineTo(x(152), y(200));
  ctx.lineTo(x(152), y(90));
  ctx.lineTo(x(162), y(108));
  ctx.lineTo(x(186), y(92));
  ctx.lineTo(x(172), y(62));
  ctx.lineTo(x(138), y(46));
  ctx.bezierCurveTo(x(128), y(62), x(112), y(70), x(100), y(70));
  ctx.bezierCurveTo(x(88), y(70), x(72), y(62), x(62), y(46));
  ctx.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** 1080×1350 PNG. Marks that fail to load are skipped; the shirt and caption still render. */
export async function renderKeepsakeDataUrl(input: {
  graduateName: string;
  marks: readonly { imageUrl: string; position: ShirtPoint }[];
}): Promise<string> {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = KEEPSAKE_WIDTH;
  canvas.height = KEEPSAKE_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  const marks: KeepsakeMark[] = [];
  for (const mark of input.marks) {
    if (!mark.imageUrl) continue;
    const image = await loadImage(mark.imageUrl);
    if (image) marks.push({ image, position: mark.position });
  }
  drawKeepsake(ctx, { graduateName: input.graduateName, marks });
  return canvas.toDataURL('image/png');
}
