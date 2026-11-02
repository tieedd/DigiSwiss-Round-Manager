import React from 'react';
import { UserRole } from '../../types';
import {
  Trophy,
  Swords,
  Timer,
  History,
  BarChart3,
  User,
  Users,
  SlidersHorizontal,
  Flame,
  ListOrdered
} from 'lucide-react';

export type NavTabKey =
  | 'tournaments'
  | 'my_matches'
  | 'history'
  | 'stats'
  | 'profile'
  | 'my_tournaments'
  | 'rounds'
  | 'standings'
  | 'users'
  | 'settings';

interface BottomNavProps {
  role: UserRole;
  activeTab: NavTabKey;
  onTabChange: (tab: NavTabKey) => void;
}

interface NavItemConfig {
  key: NavTabKey;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

export const BottomNav: React.FC<BottomNavProps> = ({ role, activeTab, onTabChange }) => {
  const getNavItems = (): NavItemConfig[] => {
    switch (role) {
      case 'admin':
        return [
          { key: 'users', label: 'Pengguna', icon: Users },
          { key: 'tournaments', label: 'Turnamen', icon: Trophy },
          { key: 'stats', label: 'Statistik', icon: BarChart3 },
          { key: 'settings', label: 'Pengaturan', icon: SlidersHorizontal },
        ];
      case 'organizer':
        return [
          { key: 'my_tournaments', label: 'Turnamen Saya', icon: Trophy },
          { key: 'rounds', label: 'Ronde', icon: Timer },
          { key: 'standings', label: 'Klasemen', icon: ListOrdered },
          { key: 'history', label: 'Riwayat', icon: History },
          { key: 'profile', label: 'Profil', icon: User },
        ];
      case 'player':
      default:
        return [
          { key: 'tournaments', label: 'Turnamen', icon: Swords },
          { key: 'my_matches', label: 'Pertandingan Saya', icon: Flame },
          { key: 'history', label: 'Riwayat', icon: History },
          { key: 'stats', label: 'Statistik', icon: BarChart3 },
          { key: 'profile', label: 'Profil', icon: User },
        ];
    }
  };

  const items = getNavItems();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-dark-bg/95 backdrop-blur-sm border-t border-dark-border safe-bottom">
      <div className="max-w-md mx-auto h-16 flex items-center justify-around px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors duration-150 min-h-[48px] focus:outline-none ${
                isActive ? 'text-accent' : 'text-dark-muted hover:text-dark-text'
              }`}
            >
              <Icon size={19} className="stroke-[1.5] mb-1" />
              <span className={`text-[10px] leading-tight font-medium truncate max-w-[68px] ${isActive ? 'text-accent' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
