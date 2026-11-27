import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

/* Minimal stand-in for Figma's custom-effect runtime: runs an exported Figma shader fill
   (setup/render over WebGPU) into a canvas clipped by `mask`. Browsers without WebGPU render
   nothing, so callers should keep a static fallback underneath. */

// Only the slice of the WebGPU API this runner touches; the project has no @webgpu/types.
interface GpuDevice {
  destroy(): void;
}
interface GpuAdapter {
  requestDevice(): Promise<GpuDevice>;
}
interface Gpu {
  requestAdapter(): Promise<GpuAdapter | null>;
  getPreferredCanvasFormat(): string;
}
interface GpuCanvasContext {
  configure(config: { device: GpuDevice; format: string; alphaMode: 'premultiplied' | 'opaque' }): void;
  getCurrentTexture(): { createView(): unknown };
}

export interface ShaderFrame {
  state: Record<string, unknown>;
  params: Record<string, unknown>;
  time: number;
  output: { width: number; height: number; format: string; createView(): unknown };
}

export interface ShaderDefinition {
  setup: (device: GpuDevice, frame: ShaderFrame) => void;
  render: (device: GpuDevice, frame: ShaderFrame) => void;
  params: Record<string, unknown>;
  manifest: { isAnimated?: boolean };
}

interface ShaderFillProps {
  /** Must be referentially stable (define it at module scope) or the GPU pipeline is rebuilt. */
  shader: ShaderDefinition;
  /** CSS mask-image value, e.g. `url("/shape.svg")`; it is stretched to the canvas box. */
  mask?: string;
  className?: string;
  style?: CSSProperties;
}

export function ShaderFill({ shader, mask, className, style }: ShaderFillProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
    if (!canvas || !gpu) return;

    let cancelled = false;
    let raf = 0;
    let device: GpuDevice | null = null;

    (async () => {
      const adapter = await gpu.requestAdapter();
      if (!adapter || cancelled) return;
      device = await adapter.requestDevice();
      if (cancelled) {
        device.destroy();
        return;
      }
      const context = canvas.getContext('webgpu') as unknown as GpuCanvasContext | null;
      if (!context) return;
      const format = gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'premultiplied' });

      const frame: ShaderFrame = {
        state: {},
        params: shader.params,
        time: 0,
        output: { width: 1, height: 1, format, createView: () => context.getCurrentTexture().createView() },
      };
      shader.setup(device, frame);

      const animate =
        shader.manifest.isAnimated !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const start = performance.now();
      const draw = (now: number) => {
        if (cancelled || !device) return;
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        frame.time = now - start;
        frame.output.width = width;
        frame.output.height = height;
        shader.render(device, frame);
        if (animate) raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    })().catch(() => {
      // No usable GPU: leave the canvas transparent so the static fallback shows.
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      device?.destroy();
    };
  }, [shader]);

  const maskStyle: CSSProperties = mask
    ? {
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }
    : {};

  return <canvas ref={canvasRef} className={className} style={{ ...maskStyle, ...style }} aria-hidden="true" />;
}
