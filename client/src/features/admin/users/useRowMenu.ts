import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

type ElementRef = RefObject<HTMLElement | null>;

/**
 * Closes a popover on a click outside `ref` (or all of `ref`, for one drawn elsewhere) or Escape.
 * Escape stops there, so a side panel underneath stays open.
 */
export function useDismiss(open: boolean, ref: ElementRef | ElementRef[], close: () => void) {
  useEffect(() => {
    if (!open) return;
    const refs = Array.isArray(ref) ? ref : [ref];
    const onDown = (e: MouseEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    document.addEventListener('mousedown', onDown);
    // Capture, so this runs before a panel's own Escape handling.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, ref, close]);
}

/** Above the side panels (401) and their scrims; below the toasts (470). */
const ROW_MENU_Z = 410;

/**
 * A table row's ⋯ menu: opens under its button, or above it near the bottom of the window. It's
 * pinned to the window because tables scroll sideways and would clip it, so it closes rather than
 * drift when the page scrolls or resizes. `height` is roughly the menu's height. Draw it with
 * <RowMenu>: `ref` goes on the button's wrapper, `menuRef` on the menu.
 */
export function useRowMenu(height: number) {
  const [menu, setMenu] = useState<{ id: string; style: CSSProperties } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setMenu(null);
  useDismiss(menu !== null, [ref, menuRef], close);

  useEffect(() => {
    if (!menu) return;
    const shut = () => setMenu(null);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => {
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [menu]);

  function open(id: string, button: HTMLElement) {
    if (menu?.id === id) return setMenu(null);
    const rect = button.getBoundingClientRect();
    const style: CSSProperties = { position: 'fixed', top: 'auto', right: window.innerWidth - rect.right, zIndex: ROW_MENU_Z };
    if (window.innerHeight - rect.bottom < height) style.bottom = window.innerHeight - rect.top + 6;
    else style.top = rect.bottom + 6;
    setMenu({ id, style });
  }

  return { menu, ref, menuRef, open, close };
}

export type RowMenuState = ReturnType<typeof useRowMenu>;

/** Rows as a CSV file, downloaded in the browser. */
export function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const line = (cells: string[]) => cells.map((v) => `"${v.replace(/"/g, '""')}"`).join(',');
  const url = URL.createObjectURL(new Blob([[line(header), ...rows.map(line)].join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
