import { describe, expect, it } from 'vitest';
import {
  KEEPSAKE_HEIGHT,
  KEEPSAKE_WIDTH,
  drawKeepsake,
  keepsakeCaption,
  keepsakeLayout,
  keepsakeMarkBox,
} from './keepsake';
import { PREFERRED_SPOTS } from './spot';

describe('keepsake portrait', () => {
  it('captions a 1080x1350 portrait with the graduate first name', () => {
    expect(KEEPSAKE_WIDTH).toBe(1080);
    expect(KEEPSAKE_HEIGHT).toBe(1350);
    expect(keepsakeCaption('Bola Adeyemi')).toBe('For Bola · signpen.xyz');
    const layout = keepsakeLayout();
    expect(layout.shirt.width).toBeGreaterThan(0);
    expect(layout.shirt.x).toBeGreaterThan(0);
    expect(layout.captionY).toBeGreaterThan(layout.shirt.y + layout.shirt.height);
    expect(layout.captionY).toBeLessThan(KEEPSAKE_HEIGHT);
  });

  it('draws the shirt, the new signature, and the caption without WebGL', () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: '',
      font: '',
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'top' as CanvasTextBaseline,
      lineWidth: 1,
      strokeStyle: '',
      fillRect: () => calls.push('fillRect'),
      fillText: (text: string) => calls.push(`text:${text}`),
      beginPath: () => calls.push('path'),
      moveTo: () => undefined,
      lineTo: () => undefined,
      bezierCurveTo: () => undefined,
      closePath: () => undefined,
      fill: () => calls.push('fill'),
      stroke: () => calls.push('stroke'),
      drawImage: () => calls.push('image'),
    };
    const box = keepsakeMarkBox(PREFERRED_SPOTS[0]);
    expect(box).not.toBeNull();
    drawKeepsake(ctx, {
      graduateName: 'Bola Adeyemi',
      marks: [{ image: {} as CanvasImageSource, position: PREFERRED_SPOTS[0] }],
    });
    expect(calls).toContain('path');
    expect(calls).toContain('image');
    expect(calls).toContain('text:For Bola · signpen.xyz');
  });
});
