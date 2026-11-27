import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createIrisController, type IrisController, type IrisState } from './controller';

const IrisContext = createContext<IrisController | null>(null);

/** One Iris controller for the app: the Iris AI panel drives it, <IrisBot /> shows it. */
export function IrisProvider({ children }: { children: ReactNode }) {
  const [iris] = useState(createIrisController);
  return <IrisContext.Provider value={iris}>{children}</IrisContext.Provider>;
}

export function useIris(): IrisController {
  const iris = useContext(IrisContext);
  if (!iris) throw new Error('useIris() needs an <IrisProvider> above it.');
  return iris;
}

/** The state Iris shows, as React state. */
export function useIrisState(): IrisState {
  const iris = useIris();
  return useSyncExternalStore(iris.subscribe, () => iris.state);
}
