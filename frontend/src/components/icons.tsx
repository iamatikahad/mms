import React from 'react';
import {
  LayoutDashboard, Users, UsersRound, UtensilsCrossed, ClipboardList, Users2,
  ShoppingBasket, Wallet, Receipt, Calculator, ChartNoAxesCombined, MessageCircle,
  Vote, Workflow, Lock, Bell, BellOff, Home, ShieldCheck, ScrollText, Settings,
  UserRound, Menu, Sun, Moon, Search, X, Pencil, Trash2, Copy, Paperclip,
  SendHorizonal, Check, CheckCheck, Circle, Palette, Volume2, VolumeX,
  Smile, FileText, Ban, Loader2, Eye, EyeOff, LockKeyhole, User, Reply, MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';

/**
 * Central icon system — thin semantic wrappers over official Lucide icons.
 * Consistent stroke width (1.75), sizing via `size`, inherits currentColor.
 */
const MAP = {
  dashboard: LayoutDashboard,
  members: Users,
  users: Users,
  usersRound: UsersRound,
  meals: UtensilsCrossed,
  mealRequests: ClipboardList,
  guests: Users2,
  bazar: ShoppingBasket,
  deposits: Wallet,
  expenses: Receipt,
  bills: Calculator,
  reports: ChartNoAxesCombined,
  chat: MessageCircle,
  polls: Vote,
  flowchart: Workflow,
  closing: Lock,
  notifications: Bell,
  bellOff: BellOff,
  messes: Home,
  admins: ShieldCheck,
  audit: ScrollText,
  settings: Settings,
  profile: UserRound,
  menu: Menu,
  sun: Sun,
  moon: Moon,
  search: Search,
  close: X,
  edit: Pencil,
  delete: Trash2,
  copy: Copy,
  attach: Paperclip,
  send: SendHorizonal,
  check: Check,
  checkCheck: CheckCheck,
  circle: Circle,
  palette: Palette,
  soundOn: Volume2,
  soundOff: VolumeX,
  react: Smile,
  file: FileText,
  blocked: Ban,
  spinner: Loader2,
  eye: Eye,
  eyeOff: EyeOff,
  lock: LockKeyhole,
  user: User,
  reply: Reply,
  more: MoreHorizontal,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof MAP;

export function Icon({ name, size = 18, className = '', strokeWidth = 1.5 }: {
  name: IconName; size?: number; className?: string; strokeWidth?: number;
}) {
  const C = MAP[name];
  return <C size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" focusable="false" />;
}
