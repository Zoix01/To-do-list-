import { useRouter, Link } from '../../lib/router';
import { RewardsHeader } from './RewardsHeader';

const TABS = [
  { to: '/habits', label: 'Habits' },
  { to: '/habits/shop', label: 'Shop' },
  { to: '/habits/inventory', label: 'Inventory' },
];

/** Habits · Shop · Inventory, plus the rewards header, on every Habits sub-screen (SPEC §13.10). */
export function HabitsNav() {
  const { location } = useRouter();
  const path = location.pathname;
  return (
    <>
      <nav className="segmented habits-nav" aria-label="Habits sections">
        {TABS.map((tab) => {
          const active = tab.to === '/habits' ? path === '/habits' : path.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className="segmented__option"
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <RewardsHeader />
    </>
  );
}
