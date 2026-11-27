import styles from './Avatar.module.css';

interface Props {
  name: string;
  color: string;
  size?: number;
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ name, color, size = 32 }: Props) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
