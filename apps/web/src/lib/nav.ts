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
  /** CSS colour for the item's icon chip. */
  color: string;
  hint?: string;
}

export const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: LayoutDashboard, color: "var(--ember)" },
  { to: "/people", label: "People", icon: Users, pillar: "people", tone: "text-people", color: "var(--people)", hint: "Directory, departments, leave" },
  { to: "/work", label: "Work", icon: FolderKanban, pillar: "work", tone: "text-work", color: "var(--work)", hint: "Projects, tasks, milestones" },
  { to: "/collab", label: "Collaboration", icon: MessagesSquare, pillar: "collab", tone: "text-collab", color: "var(--collab)", hint: "Threads, channels, decisions" },
  { to: "/finance", label: "Finance", icon: Banknote, pillar: "finance", tone: "text-finance", color: "var(--finance)", hint: "Clients, invoices, payments" },
];

export const ADMIN_NAV: NavItem[] = [
  { to: "/settings", label: "Organization", icon: Building2, color: "var(--muted-foreground)" },
  { to: "/settings/audit", label: "Audit log", icon: ScrollText, color: "var(--muted-foreground)" },
  { to: "/settings/preferences", label: "Preferences", icon: Settings, color: "var(--muted-foreground)" },
];
