import type { Pillar } from "@hephaestus/core";
import {
  Banknote,
  Building2,
  FolderKanban,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  pillar?: Pillar;
  /** Tailwind text color class for the pillar accent. */
  tone?: string;
  hint?: string;
}

export const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/people", label: "People", icon: Users, pillar: "people", tone: "text-people", hint: "Directory, departments, leave" },
  { to: "/work", label: "Work", icon: FolderKanban, pillar: "work", tone: "text-work", hint: "Projects, tasks, milestones" },
  { to: "/collab", label: "Collaboration", icon: MessagesSquare, pillar: "collab", tone: "text-collab", hint: "Threads, channels, decisions" },
  { to: "/finance", label: "Finance", icon: Banknote, pillar: "finance", tone: "text-finance", hint: "Clients, invoices, payments" },
];

export const ADMIN_NAV: NavItem[] = [
  { to: "/settings", label: "Organization", icon: Building2 },
  { to: "/settings/audit", label: "Audit log", icon: ScrollText },
  { to: "/settings/preferences", label: "Preferences", icon: Settings },
];
