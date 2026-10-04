import {
  CalendarDays,
  FileQuestion,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Trophy,
  UserCog,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { TdTabKey } from '@/lib/td/navigation';

export const TD_TAB_ICONS: Record<TdTabKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  questions: FileQuestion,
  categories: FolderKanban,
  dailies: CalendarDays,
  players: Users,
  leaderboard: Trophy,
  integration: Webhook,
  team: UserCog,
  settings: Settings,
};
