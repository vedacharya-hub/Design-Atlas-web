import { memo } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import styles from './SaveButton.module.css';
import { blur, scale, spring, transition } from '../../../lib/motion';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const LABELS: Record<SaveStatus, string> = {
  idle: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Try again',
};

interface Props {
  status: SaveStatus;
  /** The form it submits. */
  form: string;
  className?: string;
}

const swapIn = { opacity: 1, scale: 1, filter: 'blur(0px)', transition: transition.swap };
const swapOut = { opacity: 0, scale: scale.icon, filter: blur.icon, transition: transition.swap };

/**
 * Save → Saving… → Saved, on Animate UI's status button: the label swaps through a light blur, the
 * check gives way to a spinner and pops back, and the button resizes to its label. Under reduced
 * motion the swaps only fade, the button snaps to its size and the spinner holds still.
 */
export const SaveButton = memo(function SaveButton(props: Props) {
  return (
    <MotionConfig reducedMotion="user">
      <SaveButtonMotion {...props} />
    </MotionConfig>
  );
});

function SaveButtonMotion({ status, form, className }: Props) {
  const reduce = useReducedMotion();
  const icon = status === 'saving' ? 'spinner' : status === 'error' ? null : 'check';

  return (
    <motion.button
      type="submit"
      form={form}
      layout
      className={[styles.button, className].filter(Boolean).join(' ')}
      data-status={status}
      disabled={status === 'saving'}
      aria-live="polite"
      // Set here so Motion keeps the pill round while the button resizes.
      style={{ borderRadius: 92 }}
      initial={{ transform: 'scale(1)' }}
      whileTap={{ transform: reduce ? 'scale(1)' : `scale(${scale.press})` }}
      transition={{ ...spring.press, layout: spring.reflow }}
    >
      <span className={styles.slot}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={status}
            layout="position"
            initial={{ opacity: 0, filter: blur.icon }}
            animate={{ opacity: 1, filter: 'blur(0px)', transition: transition.swap }}
            exit={{ opacity: 0, filter: blur.icon, transition: transition.swap }}
            transition={{ layout: spring.reflow }}
          >
            {LABELS[status]}
          </motion.span>
        </AnimatePresence>
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        {icon && (
          <motion.span
            key={icon}
            layout="position"
            className={styles.icon}
            initial={swapOut}
            animate={swapIn}
            exit={swapOut}
            transition={{ layout: spring.reflow }}
          >
            {icon === 'spinner' ? <span className={styles.spinner} /> : <img src="/admin/user/check.svg" alt="" width={24} height={24} />}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
