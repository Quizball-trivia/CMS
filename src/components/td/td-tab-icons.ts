import {
  CalendarDays,
  FileQuestion,
  FolderKanban,
  ImageIcon,
  LayoutDashboard,
  Rocket,
  Settings,
  Shield,
  Trophy,
  Upload,
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
  clubs: Shield,
  media: ImageIcon,
  import: Upload,
  releases: Rocket,
  players: Users,
  leaderboard: Trophy,
  integration: Webhook,
  team: UserCog,
  settings: Settings,
};
