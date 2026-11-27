import { useMemo, useState } from 'react';
// Shared controls, the user table's tags and menus, the side panel's search and pages; this list's rules last.
import ui from './AdminControls.module.css';
import table from './users/UsersPanel.module.css';
import panel from './users/UserDetailsPanel.module.css';
import styles from './MembersSection.module.css';
import type { AdminUser } from '../../api/types';
import { pageList } from './users/UserDetailsPanel';
import { STATUS_LABEL, avatarSrc } from './users/userShared';
import { RowMenu } from './users/RowMenu';
import { useRowMenu } from './users/useRowMenu';

export interface MemberMove {
  id: string;
  /** The menu item, e.g. "Make Manager". */
  label: string;
}

interface Props {
  members: AdminUser[];
  /** Names the section for screen readers, e.g. "Manager members". */
  label: string;
  /** Names the table, e.g. "Users with the Manager role". */
  tableLabel: string;
  /** Shown when nobody is a member. */
  empty: string;
  /** Each member's ⋯ menu: where they can be moved to. With none, the ⋯ is disabled. */
  moves: MemberMove[];
  onMove: (user: AdminUser, moveId: string) => void | Promise<void>;
  pageSize?: number;
  className?: string;
}

/**
 * A details panel's members (Role Details 3120:194062, Access Control 3145:644337): search, the count,
 * and a table of ID, user and status with a ⋯ on each row to move them elsewhere, a page at a time.
 */
export function MembersSection({ members, label, tableLabel, empty, moves, onMove, pageSize = 6, className }: Props) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  // A row per choice, 40px each, plus the menu's padding.
  const rowMenu = useRowMenu(moves.length * 40 + 12);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((u) => `${u.name} ${u.email} ${u.code}`.toLowerCase().includes(q)) : members;
  }, [members, query]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages);
  const rows = shown.slice((current - 1) * pageSize, current * pageSize);

  return (
    <section className={[styles.members, className ?? ''].join(' ').trim()} aria-label={label}>
      <div className={styles.membersBar}>
        <label className={panel.search}>
          <span className={panel.srOnly}>Search members</span>
          <input
            value={query}
            placeholder="Search Members"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
        <span className={styles.count}>
          {members.length} {members.length === 1 ? 'Member' : 'Members'}
        </span>
      </div>

      <div className={styles.card}>
        <div role="table" aria-label={tableLabel}>
          <div className={styles.headRow} role="row">
            <span role="columnheader">ID</span>
            <span role="columnheader">USER</span>
            <span role="columnheader">STATUS</span>
            <span role="columnheader" className={panel.srOnly}>
              Actions
            </span>
          </div>
          {rows.length === 0 && <p className={styles.empty}>{members.length > 0 ? `No members match “${query.trim()}”.` : empty}</p>}
          {rows.map((u) => (
            <div key={u.id} className={[styles.row, u.status === 'inactive' ? table.rowInactive : ''].join(' ').trim()} role="row">
              <span role="cell">
                <span className={table.code}>#{u.code}</span>
              </span>
              <span role="cell" className={table.user}>
                <img className={table.avatar} src={avatarSrc(u)} alt="" width={40} height={40} />
                <span className={table.userText}>
                  <span className={table.name}>{u.name}</span>
                  <span className={table.email} title={u.email}>
                    {u.email}
                  </span>
                </span>
              </span>
              <span role="cell">
                <span className={[ui.badge, table[`status_${u.status}`]].join(' ')}>{STATUS_LABEL[u.status]}</span>
              </span>
              <span role="cell" className={styles.actions}>
                <div className={ui.filterWrap} ref={rowMenu.menu?.id === u.id ? rowMenu.ref : undefined}>
                  <button
                    type="button"
                    className={ui.iconBtn}
                    aria-label={`More actions for ${u.name}`}
                    aria-haspopup="menu"
                    aria-expanded={rowMenu.menu?.id === u.id}
                    disabled={moves.length === 0}
                    onClick={(ev) => rowMenu.open(u.id, ev.currentTarget)}
                  >
                    <img src="/admin/user/more-2-fill.svg" alt="" width={20} height={20} />
                  </button>
                  {rowMenu.menu?.id === u.id && (
                    <RowMenu state={rowMenu} className={table.menu}>
                      {moves.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="menuitem"
                          className={table.menuItem}
                          onClick={() => {
                            rowMenu.close();
                            void onMove(u, m.id);
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </RowMenu>
                  )}
                </div>
              </span>
            </div>
          ))}
        </div>

        {pages > 1 && (
          <nav className={[panel.pagination, styles.pagination].join(' ')} aria-label="Pages">
            <button type="button" className={panel.pageStep} disabled={current === 1} onClick={() => setPage(current - 1)}>
              <img src="/admin/user/arrow-left.svg" alt="" width={20} height={20} />
              Previous
            </button>
            <span className={panel.pageNumbers}>
              {pageList(current, pages).map((p, i) =>
                p === 'gap' ? (
                  <span key={`gap-${i}`} className={panel.pageNumber} aria-hidden="true">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={[panel.pageNumber, p === current ? panel.pageNumberOn : ''].join(' ').trim()}
                    aria-label={`Page ${p}`}
                    aria-current={p === current ? 'page' : undefined}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ),
              )}
            </span>
            <button type="button" className={panel.pageStep} disabled={current === pages} onClick={() => setPage(current + 1)}>
              Next
              <img src="/admin/user/arrow-forward.svg" alt="" width={20} height={20} />
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
