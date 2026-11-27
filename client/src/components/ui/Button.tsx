import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', block, className, children, ...rest }: Props) {
  return (
    <button
      className={[styles.btn, styles[variant], block ? styles.block : '', className ?? ''].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
