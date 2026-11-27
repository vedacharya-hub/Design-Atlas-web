import type { ReactNode } from 'react';
import styles from './AdminPanelHeader.module.css';

interface Props {
  title: string;
  description: string;
  /** Right-hand controls: search, filters, primary action, or section tabs. */
  children?: ReactNode;
  /** A full-width rule 20px below (Users), instead of the table starting 16px below. */
  divider?: boolean;
  className?: string;
}

/** Top of every admin canvas (Figma 8731:270169): serif title and description, controls on the right. */
export function AdminPanelHeader({ title, description, children, divider, className }: Props) {
  return (
    <header className={[styles.header, divider ? styles.headerDivided : '', className ?? ''].join(' ').trim()}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
      </div>
      {children && <div className={styles.controls}>{children}</div>}
    </header>
  );
}
