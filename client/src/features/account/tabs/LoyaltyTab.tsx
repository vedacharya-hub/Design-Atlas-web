import { useState } from 'react';
import styles from './LoyaltyTab.module.css';
import { Button } from '../../../components/ui/Button';
import { Dropdown } from '../../../components/ui/Dropdown';
import { Clock, Calendar, Pin, Coin, LightbulbFlash } from '../../../components/ui/icons';
import type { Loyalty } from '../../../api/types';
import { formatFull, fromISODate } from '../../../utils/date';

interface Props {
  loyalty: Loyalty;
}

export function LoyaltyTab({ loyalty }: Props) {
  const membership = loyalty.membership;
  const [building, setBuilding] = useState(membership?.building ?? '');

  return (
    <div className={styles.root}>
      {membership && (
        <section className={styles.section}>
          <div className={styles.buildingRow}>
            <Dropdown
              options={[{ value: membership.building, label: membership.building }]}
              value={building}
              onChange={setBuilding}
              icon={<Pin />}
              variant="plain"
            />
            <div className={styles.buildingActions}>
              <Button variant="secondary">Set as default</Button>
              <Button>View details</Button>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Membership details</h3>
            <div className={styles.cardBody}>
              <div className={styles.cardCol}>
                <div className={styles.buildingName}>{membership.building}</div>
                <p className={styles.address}>{membership.address}</p>
                <div className={styles.deskId}>
                  <strong>Desk ID:</strong> {membership.deskId}
                </div>
                <div className={styles.contact}>
                  <span>For mail &amp; packages, physical inspections or booking day pass/conference room</span>
                  <a href={`mailto:${membership.contactEmail}`}>{membership.contactEmail}</a>
                </div>
              </div>
              <div className={styles.cardDivider} />
              <div className={styles.cardCol}>
                <div className={styles.planName}>{membership.planName}</div>
                <div className={styles.planRow}>
                  <Clock className={styles.planIcon} />
                  {membership.durationMonths} Months
                </div>
                <div className={styles.planRow}>
                  <Calendar className={styles.planIcon} />
                  {formatFull(fromISODate(membership.startDate))} – {formatFull(fromISODate(membership.endDate))}
                  <span className={styles.monthsLeft}>({membership.durationMonths} Months left)</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.benefitsHead}>
          <h3 className={styles.cardTitle}>Key benefits of loyalty program</h3>
          <a className={styles.exploreLink} href="#">Explore</a>
        </div>
        <div className={styles.card}>
          <div className={styles.benefits}>
            {loyalty.benefits.map((b) => (
              <div key={b.title} className={styles.benefit}>
                <span className={styles.benefitIcon}>
                  {b.icon === 'discount' ? <Coin /> : <LightbulbFlash />}
                </span>
                <p className={styles.benefitText}>{b.description}</p>
              </div>
            ))}
          </div>
          <div className={styles.cta}>
            {loyalty.isMember ? (
              <>
                <span>You're already part of the World of WeWork.</span>
                <a className={styles.exploreLink} href="#">Explore</a>
              </>
            ) : (
              <>
                <span>Join the World of WeWork</span>
                <Button>Join now</Button>
                <a className={styles.exploreLink} href="#">Explore</a>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
