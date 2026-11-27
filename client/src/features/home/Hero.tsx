import styles from './HomePage.module.css';
import { asset } from './asset';

interface Props {
  firstName: string;
  company: string;
  location: string;
}

export function Hero({ firstName, company, location }: Props) {
  return (
    <section className={styles.hero}>
      <img className={styles.heroBg} src={asset('hero-a.jpg')} alt="" />
      <div className={styles.heroPhoto}>
        <img src={asset('hero-photo.jpg')} alt="Members chatting at the café counter" />
      </div>
      <div className={styles.heroShade} />
      <div className={styles.heroCopy}>
        <img className={styles.heroLogo} src={asset('google-logo.png')} width={117} height={36} alt={company} />
        <h1 className={styles.heroTitle}>Hi {firstName}, Welcome to Atlas!</h1>
        <div className={styles.locPill}>
          <div className={styles.locInner}>
            <span className={styles.locName}>
              <img src={asset('i-building.svg')} width={24} height={24} alt="" />
              {location}
            </span>
            <span className={styles.locBtn} aria-hidden="true">
              <img src={asset('i-chev-down.svg')} width={24} height={24} alt="" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
