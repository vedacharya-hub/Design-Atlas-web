import { useState, type CSSProperties } from 'react';
import styles from './HomePage.module.css';
import { asset } from './asset';
import { CircleArrows, SectionHeader, useRail } from './SectionHeader';

const SUBTITLE = 'WeWork Prestige Central ·Desk booking';

/* Image placement for each card is copied from the Figma layers so crops match the design. */
const SERVICES: { title: string; tab?: string; icon: string; smallIcon?: boolean; img: string; style: CSSProperties }[] = [
  { title: 'Book a Office Desk', tab: 'Book Office Desk', icon: 'i-desk.svg', smallIcon: true, img: 'qs-3.jpg', style: { left: -123, top: -94, width: 710, height: 313 } },
  { title: 'Book Meeting Room', icon: 'i-meeting.svg', img: 'qs-1.jpg', style: { left: -1, top: -10, width: 364, height: 229 } },
  { title: 'Invite A Guest', icon: 'i-hands.svg', smallIcon: true, img: 'qs-2.jpg', style: { left: -148, top: -108, width: 678, height: 426 } },
  { title: 'Get Support', icon: 'i-community.svg', img: 'qs-support.jpg', style: { left: 'calc(50% + .5px)', top: 'calc(50% - 31.5px)', width: 579, height: 353, transform: 'translate(-50%,-50%)' } },
  { title: 'Book an Office Space', icon: 'i-desk-computer.svg', img: 'qs-office.jpg', style: { left: '50%', top: 'calc(50% - 37px)', width: 420, height: 294, transform: 'translate(-50%,-50%)' } },
];

export function QuickServices({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [ref, scroll] = useRail();
  return (
    <section className={[styles.sec, styles.tint].join(' ')}>
      <div className={styles.wrap}>
        <SectionHeader title="Quick Services" subtitle={SUBTITLE}>
          <CircleArrows onPrev={() => scroll(-1)} onNext={() => scroll(1)} />
        </SectionHeader>
        <div className={styles.rail} ref={ref}>
          {SERVICES.map((s) => (
            <button key={s.title} type="button" className={styles.qs} onClick={() => s.tab && onNavigate(s.tab)}>
              <img className={styles.qsImg} src={asset(s.img)} alt="" style={s.style} />
              <div className={styles.qsShade} />
              <img className={[styles.qsIcon, s.smallIcon ? styles.small : ''].join(' ')} src={asset(s.icon)} alt="" />
              <div className={styles.qsFoot}>
                <span>{s.title}</span>
                <span className={styles.arrowBtn}><img src={asset('i-arrow-btn.svg')} width={20} height={20} alt="" /></span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const BOOKINGS = [
  { tag: 'TODAY', img: 'bk-room-b.jpg', shade: true },
  { tag: 'TOMORROW', img: 'bk-room-c.jpg' },
  { tag: 'UP - COMING', img: 'bk-room-a.jpg' },
  { tag: 'UP - COMING', img: 'bk-room-a.jpg' },
];

export function UpcomingBookings() {
  const [ref, scroll] = useRail();
  return (
    <section className={styles.sec}>
      <div className={styles.wrap}>
        <SectionHeader title="Upcoming Bookings" subtitle={SUBTITLE}>
          <CircleArrows onPrev={() => scroll(-1)} onNext={() => scroll(1)} />
        </SectionHeader>
        <div className={styles.rail} ref={ref}>
          {BOOKINGS.map((b, i) => (
            <article key={i} className={styles.bk}>
              <div className={styles.bkBody}>
                <span className={styles.badgeGreen}>{b.tag}</span>
                <h3 className={styles.bkTitle}>Meeting Room 4A</h3>
                <div className={styles.rows}>
                  <div><img src={asset('i-cal.svg')} alt="" />18th Sept 2024</div>
                  <div><img src={asset('i-clock.svg')} alt="" />10:30 AM - 12:30 PM</div>
                  <div><img src={asset('i-pin.svg')} alt="" />Vaishnavi Signature</div>
                  <div><img src={asset('i-users.svg')} alt="" />Karan +2 more</div>
                </div>
              </div>
              <div className={styles.bkImg}>
                <img src={asset(b.img)} alt="" />
                {b.shade && <img className={styles.bkShade} src={asset('bk-overlay.png')} alt="" />}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const ROOM_PHOTOS: { img: string; style: CSSProperties }[] = [
  { img: 'mr-1.jpg', style: { left: 0, top: 0, width: 277, height: 188 } },
  { img: 'mr-2.jpg', style: { left: 'calc(50% + .5px)', top: 0, width: 301, height: 181, transform: 'translateX(-50%)' } },
  { img: 'mr-3.jpg', style: { left: 'calc(50% - .5px)', top: 0, width: 265, height: 165, transform: 'translateX(-50%)' } },
  ...Array.from({ length: 4 }, () => ({ img: 'mr-4c.jpg', style: { left: -16, top: 0, width: 292, height: 181 } })),
];

export function MeetingRooms() {
  const [ref, scroll] = useRail();
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <section className={[styles.sec, styles.tint].join(' ')}>
      <div className={styles.wrap}>
        <SectionHeader title="Meeting Rooms Available" subtitle={SUBTITLE}>
          <CircleArrows onPrev={() => scroll(-1)} onNext={() => scroll(1)} />
        </SectionHeader>
        <div className={[styles.rail, styles.mrRail].join(' ')} ref={ref}>
          {ROOM_PHOTOS.map((r, i) => (
            <article key={i} className={styles.mr}>
              <div className={styles.mrPic}><img src={asset(r.img)} alt="" style={r.style} /></div>
              <img className={styles.mrEdge} src={asset('mr-overlay.png')} alt="" />
              <div className={styles.mrShade} />
              <div className={styles.mrBody}>
                <div className={styles.mrMeta}>
                  <span className={styles.mrMuted}>Vaishnavi Signature</span>
                  <div className={styles.mrLine}>
                    <span className={styles.mrRoom}>Room 24 A</span>
                    <span className={styles.mrSeat}><img src={asset('i-chair.svg')} alt="" />8 Seater</span>
                  </div>
                  <div className={styles.mrLine}>
                    <span className={styles.mrMuted}>8th Floor</span>
                    <span className={styles.mrCredits}>2 Credits/Hr</span>
                  </div>
                </div>
                <button type="button" className={styles.btnWhite}>Book</button>
              </div>
              <button
                type="button"
                className={styles.heart}
                aria-pressed={saved.has(i)}
                aria-label="Save Room 24 A to favourites"
                onClick={() => toggle(i)}
              >
                <img src={asset('i-heart.svg')} alt="" />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
