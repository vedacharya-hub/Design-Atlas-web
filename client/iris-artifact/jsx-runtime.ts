/* react/jsx-runtime on top of the React global from cdnjs: the UMD build has createElement but no
   JSX runtime, so the compiled jsx()/jsxs() calls are routed through createElement here. */
import * as React from 'react';

type Props = Record<string, unknown> | null;

export const Fragment = React.Fragment;

export function jsx(type: React.ElementType, props: Props, key?: React.Key) {
  return React.createElement(type, key === undefined ? props : { ...props, key });
}

export const jsxs = jsx;
