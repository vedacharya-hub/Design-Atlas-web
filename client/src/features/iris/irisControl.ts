/** Lets the rest of the app drive Iris: open the panel (optionally asking something), the quick bar, or a past chat. */
export type IrisCommand = { type: 'open'; prompt?: string } | { type: 'quick' } | { type: 'chat'; chatId: string };

const COMMAND_EVENT = 'iris:command';

function send(command: IrisCommand) {
  window.dispatchEvent(new CustomEvent<IrisCommand>(COMMAND_EVENT, { detail: command }));
}

/** Opens the Iris panel; with a prompt, starts a new conversation with it. */
export const openIris = (prompt?: string) => send({ type: 'open', prompt });
/** Opens the quick bar, the same as pressing Option/Alt + Space. */
export const openQuickIris = () => send({ type: 'quick' });
/** Reopens a saved conversation from the history. */
export const openIrisChat = (chatId: string) => send({ type: 'chat', chatId });

export function onIrisCommand(handler: (command: IrisCommand) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<IrisCommand>).detail);
  window.addEventListener(COMMAND_EVENT, listener);
  return () => window.removeEventListener(COMMAND_EVENT, listener);
}
