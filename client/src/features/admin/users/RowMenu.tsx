import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RowMenuState } from './useRowMenu';

/**
 * A row's ⋯ menu, drawn at the end of the page so it's on top of everything: inside the row, the
 * sticky ⋯ column would trap it under the rows below. React events still bubble through the row.
 */
export function RowMenu({ state, className, children }: { state: RowMenuState; className: string; children: ReactNode }) {
  if (!state.menu) return null;
  return createPortal(
    <div ref={state.menuRef} className={className} role="menu" style={state.menu.style}>
      {children}
    </div>,
    document.body,
  );
}
