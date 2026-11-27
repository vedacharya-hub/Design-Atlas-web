import { useEffect, useMemo, useState } from 'react';
import styles from './MembersStep.module.css';
import { Search, Close, Check } from '../../../components/ui/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { bookingApi } from '../../../api/bookingApi';
import type { Member } from '../../../api/types';
import { useBooking } from '../bookingMachine';

export function MembersStep() {
  const { state, dispatch } = useBooking();
  const [all, setAll] = useState<Member[]>([]);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    bookingApi.getMembers().then(setAll).catch(() => setAll([]));
  }, []);

  const selectedIds = useMemo(() => new Set(state.selectedMembers.map((m) => m.id)), [state.selectedMembers]);
  const results = all.filter(
    (m) => !m.isCurrentUser && m.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className={styles.wrap}>
      <span className={styles.sectionLabel}>ADD MEMBERS</span>

      <div className={styles.searchBox}>
        <Search />
        <input
          placeholder="Search team members"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
      </div>

      {focused && results.length > 0 && (
        <ul className={styles.results}>
          {results.map((m) => {
            const added = selectedIds.has(m.id);
            return (
              <li key={m.id}>
                <button
                  className={styles.result}
                  onClick={() =>
                    added
                      ? dispatch({ type: 'REMOVE_MEMBER', memberId: m.id })
                      : dispatch({ type: 'ADD_MEMBER', member: m })
                  }
                >
                  <Avatar name={m.name} color={m.avatarColor} size={28} />
                  <span className={styles.info}>
                    <span className={styles.name}>{m.name}</span>
                    <span className={styles.team}>{m.team}</span>
                  </span>
                  {added && <Check className={styles.checkIcon} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ul className={styles.chips}>
        {state.selectedMembers.map((m) => (
          <li
            key={m.id}
            className={[styles.chip, state.activeMemberId === m.id ? styles.chipActive : ''].join(' ')}
            onClick={() => dispatch({ type: 'SET_ACTIVE_MEMBER', memberId: m.id })}
          >
            <Avatar name={m.name} color={m.avatarColor} size={24} />
            <span className={styles.chipName}>
              {m.name}{m.isCurrentUser ? ' (You)' : ''}
            </span>
            {!m.isCurrentUser && (
              <button
                className={styles.remove}
                aria-label={`Remove ${m.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'REMOVE_MEMBER', memberId: m.id });
                }}
              >
                <Close width={12} height={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
