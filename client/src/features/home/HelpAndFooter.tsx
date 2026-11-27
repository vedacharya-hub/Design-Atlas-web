import styles from './HomePage.module.css';
import { asset } from './asset';

export function HelpCards({ memberName }: { memberName: string }) {
  return (
    <section className={[styles.wrap, styles.help].join(' ')}>
      <div className={styles.hc}>
        <div className={styles.hcHead}>
          <span className={styles.hcIcon} style={{ background: '#fff0f0' }}><img src={asset('i-alarm.svg')} alt="" /></span>
          <div>
            <h3 className={styles.hcTitle}>Emergency</h3>
            <p className={styles.hcSub}>For any emergency situations at your buidlings</p>
          </div>
        </div>
        <p className={styles.hcText}>
          Call 112 immediately. Afterwards, please contact the 24/7 emergency hotline at +91 0008001004404. Emergency Action Plans can be found below.
        </p>
        <div className={styles.hcLinks}>
          <a className={styles.tlink} href="#">WeWork Emergency Plan<img src={asset('i-arrow-right.svg')} alt="" /></a>
          <a className={styles.tlink} href="#">Building-specific Emergency Plan<img src={asset('i-arrow-right.svg')} alt="" /></a>
        </div>
      </div>
      <div className={styles.hc}>
        <div className={styles.hcHead}>
          <span className={styles.hcIcon} style={{ background: '#e8f1ff' }}><img src={asset('i-luggage.svg')} alt="" /></span>
          <div>
            <h3 className={styles.hcTitle}>Deliveries</h3>
            <p className={styles.hcSub}>Your delivery address</p>
          </div>
        </div>
        <p className={styles.hcText}>
          WeWork c/o {memberName}
          <br />36 Infantry Road, Sampangi, Tasker Town, Shivaji Nagar
          <br />Bengaluru, KA 560001
        </p>
        <div className={styles.hcLinks}>
          <a className={styles.tlink} href="#">What’s Included with my membership<img src={asset('i-arrow-right.svg')} alt="" /></a>
        </div>
      </div>
    </section>
  );
}

const COMPANY = ['Blogs', 'Careers', 'Brokers', 'Impact', 'Referrals', 'Amenities', 'Trust Centre'];
const SUPPORT = ['COVID-19', 'Privacy policy', 'Need help?'];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.ftPhoto}><img src={asset('ft-photo.jpg')} alt="" /></div>
      <div className={styles.ftWash} />
      <div className={styles.ftDark} />
      <div className={styles.ftInner}>
        <div className={styles.ftCols}>
          <div>
            <div className={styles.ftBrand}>
              <img src={asset('ft-logo2.svg')} alt="WeWork" />
              <p>Workspace that matters, Wework</p>
            </div>
            <div className={styles.social}>
              <a href="#" aria-label="Facebook"><img src={asset('ft-fb.svg')} alt="" /></a>
              <a href="#" aria-label="Instagram"><img src={asset('ft-ig.svg')} alt="" /></a>
              <a href="#" aria-label="LinkedIn"><img src={asset('ft-li.svg')} alt="" /></a>
              <a href="#" className={styles.x} aria-label="X"><img src={asset('ft-x.svg')} alt="" /></a>
            </div>
          </div>
          <div className={styles.ftLinks}>
            <div className={styles.ftCol}>
              <h4>Company</h4>
              {COMPANY.map((l) => <a key={l} href="#">{l}</a>)}
            </div>
            <div className={styles.ftCol}>
              <h4>Support</h4>
              {SUPPORT.map((l) => <a key={l} href="#">{l}</a>)}
            </div>
            <div className={[styles.ftCol, styles.wide].join(' ')}>
              <h4>Contact us</h4>
              <span className={styles.u}>1800 123 777 888</span>
              <span className={styles.u}>support@wework.co.in</span>
              <p>Ground Floor, 36, Infantry Rd, Tasker Town, Shivaji Nagar, Bengaluru, Karnataka 560001</p>
            </div>
          </div>
        </div>
        <div className={styles.ftCopy}>Copyright © 2025 WeWork Companies Inc. All rights reserved</div>
      </div>
      <img className={styles.ftWord} src={asset('ft-wordmark.svg')} alt="" />
    </footer>
  );
}
