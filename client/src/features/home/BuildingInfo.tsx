import { useState } from 'react';
import styles from './HomePage.module.css';
import { asset } from './asset';
import { SectionHeader } from './SectionHeader';

const ABOUT =
  'Introducing WeWork 37 Cunningham Bangalore, an elevated workspace experience in one of Bangalore’s prime locations. It’s situated on Cunningham Road in the city’s Central Business District. With sustainable design, cutting-edge technology, state-of-the-art amenities, and bespoke services, it’s designed for visionaries. From white glove services and curated experiences to dedicated administrative support, this office space in Bangalore is designed to take your workdays to the next level. Save time on the commute with easy access to the rest of the city. Get the leisure of being in close proximity to hospitals, schools, entertainment hubs, and five-star hotels. Come Experience the extraordinary at WeWork 37 Cunningham.';

const THUMBS = [
  { label: 'Common area 1', img: 'exp-t1.jpg' },
  { label: 'Common area 2', img: 'exp-t1.jpg' },
  { label: 'Workstations', img: 'exp-t3.jpg' },
  { label: 'Lounge 1', img: 'exp-t4.jpg' },
  { label: 'Lounge 2', img: 'exp-t4.jpg' },
  { label: 'Lounge 3', img: 'exp-t4.jpg' },
];

const AMENITIES = [
  ['am-restaurant.svg', 'Premium workstations'],
  ['am-gamepad.svg', 'Sustainably designed'],
  ['am-windy.svg', 'Advanced air filtration'],
  ['am-wifi.svg', 'Semi-private dinning area'],
  ['am-userstar.svg', 'Boardroom'],
  ['am-webcam.svg', 'Phonebooths'],
  ['am-parking.svg', 'Artisanal coffee'],
  ['am-mail.svg', 'Game room'],
  ['am-parking.svg', 'Event spaces'],
  ['am-mail.svg', 'Advanced meeting tech'],
];

const EVENTS = [
  { group: 'featured', cta: 'RSVP' },
  { group: 'networking', cta: 'Register', spots: 18 },
  { group: 'networking', cta: 'Register', spots: 18 },
  { group: 'networking', cta: 'RSVP' },
] as const;

export function BuildingInfo() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [view, setView] = useState<'photos' | 'plan'>('photos');
  const [thumb, setThumb] = useState(0);
  const [joined, setJoined] = useState<Set<number>>(new Set());

  const stepThumb = (d: number) => setThumb((t) => (t + d + THUMBS.length) % THUMBS.length);
  const toggleJoin = (i: number) =>
    setJoined((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const eventCard = (i: number) => {
    const e = EVENTS[i];
    const on = joined.has(i);
    return (
      <article key={i} className={['spots' in e ? styles.evTall : '', styles.ev].join(' ')}>
        <div className={styles.evPic}>
          <img src={asset('bk-room-a.jpg')} alt="" />
          <div className={styles.evDate}><small>TUE</small><b>24</b><i>SEP</i></div>
        </div>
        <div className={styles.evInfo}>
          <span className={styles.evBadge}>NETWORKING</span>
          <h4 className={styles.evTitle}>WeWork Mixer: Meet Your Neighbours</h4>
          <div className={styles.rows}>
            <div><img src={asset('ev-time.svg')} alt="" />6:00 PM – 8:00 PM GMT +10</div>
            <div><img src={asset('ev-pin.svg')} alt="" />Vaishnavi Signature, Rooftop</div>
            {'spots' in e && <div><img src={asset('ev-team.svg')} alt="" />{e.spots - (on ? 1 : 0)} spots left</div>}
          </div>
          <button type="button" className={styles.btnBlack} aria-pressed={on} onClick={() => toggleJoin(i)}>
            {on ? (e.cta === 'RSVP' ? 'Going' : 'Registered') : e.cta}
            <img src={asset('ev-arrow.svg')} alt="" />
          </button>
        </div>
      </article>
    );
  };

  return (
    <section className={styles.bi}>
      <div className={styles.wrap}>
        <div className={styles.biHead}>
          <SectionHeader title="Building Information" subtitle="WeWork Prestige Central ·Desk booking" />
        </div>
        <div className={styles.biCols}>
          <div className={styles.biLeft}>
            <section className={[styles.about, aboutOpen ? styles.aboutOpen : ''].join(' ')}>
              <h3 className={styles.hBody}>About this space</h3>
              <p className={styles.aboutText}>{ABOUT}</p>
              <button type="button" className={styles.ulink} aria-expanded={aboutOpen} onClick={() => setAboutOpen((o) => !o)}>
                <span>{aboutOpen ? 'Read less' : 'Read more'}</span>
                <img src={asset('i-chev-read.svg')} alt="" />
              </button>
            </section>

            <section>
              <h3 className={styles.hBody}>Experience the space</h3>
              <div className={styles.segFull} role="group" aria-label="View">
                <button type="button" aria-pressed={view === 'photos'} onClick={() => setView('photos')}>Photos</button>
                <button type="button" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>Floor Plan</button>
              </div>
              <div className={styles.exp}>
                <img src={asset('exp-main.jpg')} alt="Common area with lounge seating and a jungle mural" />
                {view === 'plan' ? (
                  <div className={styles.plan}>The floor plan for Vaishnavi Signature hasn't been added yet.</div>
                ) : (
                  <span className={styles.expBadge}>{THUMBS[thumb].label}</span>
                )}
              </div>
              <div className={styles.thumbs}>
                <button type="button" className={[styles.thumbNav, styles.thumbPrev].join(' ')} onClick={() => stepThumb(-1)} aria-label="Previous photo">
                  <img src={asset('i-drop.svg')} alt="" />
                </button>
                <div className={styles.thumbList}>
                  {THUMBS.map((t, i) => (
                    <button key={i} type="button" className={styles.thumb} aria-current={i === thumb} aria-label={t.label} onClick={() => setThumb(i)}>
                      <img src={asset(t.img)} alt="" />
                    </button>
                  ))}
                </div>
                <button type="button" className={[styles.thumbNav, styles.thumbNext].join(' ')} onClick={() => stepThumb(1)} aria-label="Next photo">
                  <img src={asset('i-drop.svg')} alt="" />
                </button>
              </div>
            </section>

            <section>
              <h3 className={styles.hBody}>Amenities</h3>
              <div className={styles.amen}>
                {AMENITIES.map(([icon, label]) => (
                  <div key={label} className={styles.am}>
                    <span className={styles.amBox}><img src={asset(icon)} alt="" /></span>
                    {label}
                  </div>
                ))}
                <a className={styles.ulink} href="#">
                  <span>VIEW ALL</span>
                  <img src={asset('i-arrow-fwd.svg')} alt="" />
                </a>
              </div>
            </section>

            <section>
              <h3 className={styles.hBody}>Location</h3>
              <div className={styles.locRow}>
                <p>Cunningham Road, No. 37, Cunningham Cross Road, SRT Road, Vasanth Nagar, Bangalore, KA 560052</p>
                <a className={styles.tlink} href="https://www.google.com/maps/search/?api=1&query=WeWork+37+Cunningham+Bangalore" target="_blank" rel="noreferrer">
                  Get directions<img src={asset('i-arrow-upright.svg')} alt="" />
                </a>
              </div>
              <div className={styles.map}>
                <img src={asset('map.jpg')} alt="Map of Vasanth Nagar, Bangalore" />
                <div className={styles.pin}>
                  <img src={asset('map-pin.png')} alt="" />
                  <div className={styles.pinCard}>
                    <img src={asset('map-card.jpg')} alt="" />
                    <div className={styles.pinFade} />
                    <div className={styles.pinText}><small>★ 4.5</small><b>WeWork 37 Cunningham</b></div>
                    <span className={styles.pinGo}><img src={asset('i-arrow-btn-sm.svg')} alt="" /></span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className={styles.events} aria-label="Events">
            <div className={styles.evGroup}>
              <h5 className={styles.evLabel}>Events at Vaishnavi Signature</h5>
              {eventCard(0)}
            </div>
            <div className={styles.evGroup}>
              <h5 className={styles.evLabel}>Networking</h5>
              {[1, 2, 3].map(eventCard)}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
