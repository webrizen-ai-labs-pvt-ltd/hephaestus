import { Link } from "@tanstack/react-router";
import {
  Banknote,
  BookOpen,
  Building2,
  CircleHelp,
  FolderKanban,
  Handshake,
  type LucideIcon,
  MessagesSquare,
  ReceiptText,
  Rocket,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

/*
 * The Operant user manual. Each guide is a list of sections; plain words, short
 * steps, and links straight to the page being described.
 */

export interface HelpSection {
  id: string;
  title: string;
  body: ReactNode;
  /** Extra words people might search for. */
  keywords?: string;
}

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  color: string;
  group: "Getting started" | "Using Operant" | "For admins";
  sections: HelpSection[];
}

/** A link to a page in the app, styled for running text. */
export function Go({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-semibold text-brand-secondary underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

/** A link to another guide. */
export function See({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Link to="/help/$slug" params={{ slug }} className="font-semibold text-brand-secondary underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="help-steps my-4 space-y-3">{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <li className="relative pl-10">
      <span className="font-semibold text-primary">{title}</span>
      {children ? <div className="mt-0.5 text-tertiary">{children}</div> : null}
    </li>
  );
}

export function Tip({ children, tone = "tip" }: { children: ReactNode; tone?: "tip" | "note" }) {
  return (
    <div className={tone === "tip" ? "my-4 rounded-xl border border-brand bg-brand-primary px-4 py-3 text-sm text-secondary" : "my-4 rounded-xl border border-secondary bg-secondary px-4 py-3 text-sm text-secondary"}>
      <span className="font-semibold text-primary">{tone === "tip" ? "Tip: " : "Good to know: "}</span>
      {children}
    </div>
  );
}

export function Ui({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[0.9em] font-medium text-primary ring-1 ring-secondary">{children}</span>;
}

const P = ({ children }: { children: ReactNode }) => <p className="my-3">{children}</p>;
const List = ({ children }: { children: ReactNode }) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-quaternary">{children}</ul>;

export const ARTICLES: HelpArticle[] = [
  /* ---------------------------------------------------------------- */
  {
    slug: "start-here",
    title: "Start here",
    summary: "What Operant does, how the screen is laid out, and your first steps, whether you set it up or were invited.",
    icon: Rocket,
    color: "var(--color-brand-600)",
    group: "Getting started",
    sections: [
      {
        id: "what-is-operant",
        title: "What Operant is",
        body: (
          <>
            <P>Operant runs the day-to-day of your business in one place. It has four areas, and your admin can switch off the ones you don't use:</P>
            <List>
              <li>
                <span className="font-semibold text-primary">People</span>: your team directory, org chart, departments, leave and onboarding.
              </li>
              <li>
                <span className="font-semibold text-primary">Work</span>: projects, tasks, milestones, goals and requests from clients.
              </li>
              <li>
                <span className="font-semibold text-primary">Collaboration</span>: channels, direct messages and comments on anything.
              </li>
              <li>
                <span className="font-semibold text-primary">Finance</span>: clients, quotes, GST invoices, payments and receivables.
              </li>
            </List>
            <P>Everything is connected. A client request becomes a project, a finished milestone becomes an invoice, and a leave request shows on the team calendar.</P>
          </>
        ),
      },
      {
        id: "signing-in",
        title: "Signing in",
        keywords: "login password sso webrizen account organization",
        body: (
          <>
            <P>
              You sign in with your Webrizen account, the same one you use at accounts.webrizen.com. There's no separate Operant password. If you belong to more than one organization, choose which one to open when you sign in; you can change it later from your name at the bottom of the sidebar, under <Ui>Switch organization</Ui>.
            </P>
            <Tip tone="note">Who belongs to your organization, and what each person can do, is managed in your Webrizen account. See <See slug="roles">Roles and access</See>.</Tip>
          </>
        ),
      },
      {
        id: "find-your-way",
        title: "Finding your way around",
        keywords: "sidebar search ctrl k shortcut notifications new button breadcrumbs dashboard",
        body: (
          <List>
            <li>
              <span className="font-semibold text-primary">The sidebar</span> on the left lists the four areas. Click one to open its pages. Numbers next to an item show things waiting for you.
            </li>
            <li>
              <span className="font-semibold text-primary">Search</span> (<Ui>Ctrl K</Ui>, or <Ui>⌘ K</Ui> on a Mac) jumps to any page, person, project or invoice.
            </li>
            <li>
              <span className="font-semibold text-primary">The New button</span> at the top right creates a task, invoice, leave request, employee or channel from any page.
            </li>
            <li>
              <span className="font-semibold text-primary">The bell</span> shows your notifications: mentions, assignments, approvals and client messages.
            </li>
            <li>
              <span className="font-semibold text-primary">
                <Go to="/">Home</Go>
              </span>{" "}
              is your daily dashboard: what needs your attention, your tasks, what's coming up and, if you can see Finance, money in and out.
            </li>
          </List>
        ),
      },
      {
        id: "first-steps-admin",
        title: "First steps if you're setting it up",
        keywords: "setup onboarding admin owner new workspace checklist",
        body: (
          <>
            <P>If you created the organization, or you're its admin, do these once. It takes about half an hour, and Home shows your progress until you're done.</P>
            <Steps>
              <Step title="Check your organization settings">
                In <Go to="/settings">Settings → Organization</Go>, turn off any areas you don't need, set your working days, and rename terms if your business uses different words (for example "Engagement" instead of "Project").
              </Step>
              <Step title="Bring in your team">
                Open <Go to="/people/directory">People → Directory</Go>. <Ui>Import from Webrizen</Ui> adds everyone already in your organization. For anyone new, use <Ui>Add employee</Ui> with their work email, then <Ui>Invite to Operant</Ui> on their profile so they can sign in. Set each person's manager and department.
              </Step>
              <Step title="Set up leave">
                In <Go to="/people/leave">People → Leave</Go>, open <Ui>Types and holidays</Ui> to add your leave types and this year's holidays.
              </Step>
              <Step title="Set up Finance">
                In <Go to="/finance/settings">Finance → Finance settings</Go>, add your business name, address and bank details. GSTIN is optional. Connect Razorpay if you want clients to pay online.
              </Step>
              <Step title="Start your first project">
                In <Go to="/work/projects">Work → Projects</Go>, click <Ui>New project</Ui>, add the team and a few tasks.
              </Step>
              <Step title="Open your client portal (optional)">
                List what you offer in <Go to="/work/services">Work → Services</Go> and share your portal link with clients. See <See slug="client-portal">Client portal</See>.
              </Step>
            </Steps>
          </>
        ),
      },
      {
        id: "first-steps-member",
        title: "First steps if you were invited",
        keywords: "new joiner employee team member invited",
        body: (
          <Steps>
            <Step title="Look at Home">See what's assigned to you and anything that needs your attention.</Step>
            <Step title="Open My work">
              <Go to="/work">Work → My work</Go> lists your tasks by due date. Tick them off as you finish.
            </Step>
            <Step title="Say hello">
              Join channels in <Go to="/collab">Collaboration</Go> and use <Ui>@name</Ui> to get someone's attention.
            </Step>
            <Step title="Know how to request leave">
              Use <Go to="/people/leave">People → Leave</Go>, or the New button. Your manager is notified to approve it.
            </Step>
            <Step title="Finish your onboarding steps">
              If your admin started onboarding for you, your checklist is on <Go to="/people">People → Overview</Go>.
            </Step>
          </Steps>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "people",
    title: "People",
    summary: "The directory, org chart, departments and teams, leave, and onboarding new joiners.",
    icon: Users,
    color: "var(--people)",
    group: "Using Operant",
    sections: [
      {
        id: "directory",
        title: "The directory",
        keywords: "employee add import profile staff invite sign in login access password",
        body: (
          <>
            <P>
              <Go to="/people/directory">Directory</Go> lists everyone in the organization. Click a person to see their profile: job title, department, manager, contact details, leave balance and documents.
            </P>
            <List>
              <li>
                <Ui>Import from Webrizen</Ui> adds everyone who is a member of your Webrizen organization.
              </li>
              <li>
                <Ui>Add employee</Ui> adds someone's record. On its own, that doesn't let them sign in.
              </li>
              <li>
                <Ui>Invite to Operant</Ui> on their profile emails them an invitation from Webrizen to their work email. They accept it, set up their Webrizen account, and can sign in; their profile links to them automatically. The directory shows who's <Ui>Invited</Ui>, whose invite expired (after 48 hours), and who isn't invited yet.
              </li>
              <li>
                <Ui>Offboard</Ui> on a profile marks someone as having left. Their history stays.
              </li>
            </List>
          </>
        ),
      },
      {
        id: "org-chart",
        title: "Org chart, departments and teams",
        keywords: "manager reporting structure department team",
        body: (
          <>
            <P>
              The <Go to="/people/org-chart">Org chart</Go> is built from each person's manager, so set managers on profiles and it draws itself.
            </P>
            <P>
              In <Go to="/people/structure">Departments and teams</Go>, a <span className="font-semibold text-primary">department</span> is where someone sits (Tax, Audit, Operations); a person has one. A <span className="font-semibold text-primary">team</span> can mix people from different departments, for example everyone working on one large client.
            </P>
          </>
        ),
      },
      {
        id: "leave",
        title: "Leave",
        keywords: "holiday vacation time off sick approve calendar balance",
        body: (
          <>
            <Steps>
              <Step title="Request leave">
                Click <Ui>Request leave</Ui>, pick the type and dates. Only your organization's working days count, and holidays are skipped. Half days work for single-day requests.
              </Step>
              <Step title="Your manager approves or declines">
                They get a notification and see it under <Ui>Approvals</Ui>. You're notified of the decision.
              </Step>
              <Step title="It shows on the team calendar">So everyone can plan around it.</Step>
            </Steps>
            <P>
              Admins set leave types (with yearly allowances) and holidays under <Ui>Types and holidays</Ui>.
            </P>
          </>
        ),
      },
      {
        id: "onboarding",
        title: "Onboarding new joiners",
        keywords: "checklist joiner template new hire",
        body: (
          <>
            <P>
              In <Go to="/people/onboarding">Onboarding</Go>, make a checklist template once (laptop, accounts, introductions, first-week tasks). When someone joins, click <Ui>Start onboarding</Ui> and choose the person and template. Each step goes to the new joiner or their manager, with a due date counted from the start date.
            </P>
            <P>The joiner sees their own steps on People → Overview, and you can follow progress for everyone who's onboarding.</P>
          </>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "work",
    title: "Work",
    summary: "Projects, tasks, boards, milestones, goals and workload.",
    icon: FolderKanban,
    color: "var(--work)",
    group: "Using Operant",
    sections: [
      {
        id: "my-work",
        title: "My work",
        keywords: "my tasks today overdue",
        body: (
          <P>
            <Go to="/work">My work</Go> is your personal list: everything assigned to you across all projects, grouped by when it's due. Tasks you create here without a project are private to-dos.
          </P>
        ),
      },
      {
        id: "projects",
        title: "Projects",
        keywords: "project key template board list calendar client",
        body: (
          <>
            <P>
              Create one in <Go to="/work/projects">Projects</Go> with <Ui>New project</Ui>. Give it a name, a lead, the team, dates and, if it's for a client, the client. The short <span className="font-semibold text-primary">key</span> (like GST) numbers its tasks: GST-1, GST-2 and so on.
            </P>
            <P>Each project has views across the top:</P>
            <List>
              <li>
                <span className="font-semibold text-primary">Board</span>: drag tasks between stages. You can rename and add stages in the project's Settings.
              </li>
              <li>
                <span className="font-semibold text-primary">List</span> and <span className="font-semibold text-primary">Calendar</span>: the same tasks, sorted or by date.
              </li>
              <li>
                <span className="font-semibold text-primary">Milestones</span>: the big checkpoints, with progress.
              </li>
              <li>
                <span className="font-semibold text-primary">Discussion</span>: the team's conversation about the project.
              </li>
              <li>
                <span className="font-semibold text-primary">Client</span>: for client projects, the conversation and documents shared with the client in the portal.
              </li>
            </List>
            <Tip>
              Doing the same kind of work again and again? Pick an earlier project as a <span className="font-semibold">template</span> when you create a new one. Its stages, milestones and tasks are copied, with dates moved to the new start date.
            </Tip>
          </>
        ),
      },
      {
        id: "tasks",
        title: "Tasks",
        keywords: "subtask assignee label priority due date dependency recurring repeat",
        body: (
          <>
            <P>Click any task to open it on the side. A task can have:</P>
            <List>
              <li>assignees, a priority, a due date and an estimate;</li>
              <li>subtasks, labels and a milestone;</li>
              <li>dependencies ("blocked by"), so nobody starts too early;</li>
              <li>a repeat schedule, for work that comes round every month or quarter;</li>
              <li>comments and files. Mention someone with @ to bring them in.</li>
            </List>
            <P>Everyone assigned is notified, and the task shows in their My work.</P>
          </>
        ),
      },
      {
        id: "milestones",
        title: "Milestones and billing",
        keywords: "milestone invoice billable amount",
        body: (
          <P>
            Give a milestone an amount and it becomes billable: when it's completed, Operant drafts an invoice for the project's client, ready for Finance to check and issue. See <See slug="invoicing">Invoices and payments</See>.
          </P>
        ),
      },
      {
        id: "goals-workload",
        title: "Goals and workload",
        keywords: "goal okr objective capacity",
        body: (
          <>
            <P>
              <Go to="/work/goals">Goals</Go> are the outcomes your projects serve, like "Finish all statutory audits by September". Link projects to a goal and its progress follows theirs.
            </P>
            <P>
              <Go to="/work/workload">Workload</Go> shows each person's open tasks by the week they're due, with approved leave taken into account, so you can spot who's overloaded before assigning more.
            </P>
          </>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "collaboration",
    title: "Collaboration",
    summary: "Channels, direct messages, comments, mentions and recording decisions.",
    icon: MessagesSquare,
    color: "var(--collab)",
    group: "Using Operant",
    sections: [
      {
        id: "channels",
        title: "Channels and direct messages",
        keywords: "chat channel dm private message",
        body: (
          <>
            <P>
              In <Go to="/collab">Collaboration</Go>, channels are for topics or teams (#audit, #general). Anyone can join a public channel; private channels are invite-only. Direct messages are one-to-one or a small group.
            </P>
            <P>Hover over a message to react with an emoji, or to edit or delete your own.</P>
          </>
        ),
      },
      {
        id: "comments",
        title: "Comments on everything",
        keywords: "thread comment discuss task invoice project",
        body: <P>Tasks, projects and invoices each have their own conversation, so talk about the work where the work is. Internal notes on an invoice are never shown to the client.</P>,
      },
      {
        id: "mentions",
        title: "Mentions and notifications",
        keywords: "@ mention notify bell",
        body: (
          <P>
            Type <Ui>@</Ui> and a name to bring someone in; they get a notification. All your mentions are collected under <Go to="/collab/mentions">Mentions</Go>.
          </P>
        ),
      },
      {
        id: "decisions",
        title: "Recording decisions",
        keywords: "decision gavel agreed",
        body: (
          <P>
            When something is agreed in a conversation, hover over the message and mark it as a decision. <Go to="/collab/decisions">Decisions</Go> lists them all, with who marked each one, so nobody has to scroll back through chat to find what was decided.
          </P>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "finance-setup",
    title: "Setting up Finance",
    summary: "Business details, GST, bank details, numbering, Razorpay and invoice email.",
    icon: Banknote,
    color: "var(--finance)",
    group: "For admins",
    sections: [
      {
        id: "business",
        title: "Your business details",
        keywords: "legal name address pan gstin gst registered unregistered",
        body: (
          <>
            <P>
              In <Go to="/finance/settings">Finance settings</Go>, add your legal name, address, PAN, billing email and phone. They appear on every invoice and quote.
            </P>
            <P>
              <span className="font-semibold text-primary">GSTIN is optional.</span> If you're GST-registered, add it: Operant then works out CGST and SGST, or IGST for other states, from each client's place of supply. If you leave it blank, invoices go out titled "Invoice" without GST.
            </P>
          </>
        ),
      },
      {
        id: "numbering",
        title: "Numbering, terms and bank details",
        keywords: "prefix invoice number financial year terms notes bank upi",
        body: (
          <>
            <P>
              Invoices are numbered automatically with no gaps, restarting each financial year, for example INV/26-27/0001. You can change the prefixes for invoices, quotes and credit notes.
            </P>
            <P>Set your default payment terms (in days), notes and terms, and your bank account and UPI ID so clients know how to pay. Tax rates you use often can be saved too.</P>
          </>
        ),
      },
      {
        id: "razorpay",
        title: "Online payments with Razorpay",
        keywords: "razorpay payment link card upi online webhook",
        body: (
          <>
            <Steps>
              <Step title="Add your Razorpay keys">Enter the Key ID and Key secret from your Razorpay dashboard. The secret is stored encrypted and never shown again.</Step>
              <Step title="Add the webhook">In Razorpay, go to Webhooks → Add, paste the webhook URL shown in Operant, choose the event payment_link.paid, and enter the same secret in Operant.</Step>
              <Step title="That's it">Clients can now pay invoices online, and payments are recorded on the invoice automatically.</Step>
            </Steps>
          </>
        ),
      },
      {
        id: "email",
        title: "Invoice email",
        keywords: "email send resend reminder test not sending",
        body: (
          <>
            <P>
              The <Ui>Invoice email</Ui> card shows whether email is set up. When it is, issued invoices, quotes and reminders are emailed to clients, and replies go to your billing email. Use <Ui>Send test email</Ui> to check it reaches you.
            </P>
            <Tip tone="note">If email isn't set up yet, every issued invoice still has a client link you can copy and send yourself.</Tip>
          </>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "invoicing",
    title: "Invoices and payments",
    summary: "Clients, quotes, invoices, payments, reminders, credit notes, retainers and instalments.",
    icon: ReceiptText,
    color: "var(--finance)",
    group: "Using Operant",
    sections: [
      {
        id: "clients",
        title: "Clients",
        keywords: "customer client gstin contact",
        body: (
          <P>
            Add clients in <Go to="/finance/clients">Clients</Go> with their billing address, state and, if they have one, GSTIN (the state is taken from it). A client's page shows their invoices, payments, projects and what they owe.
          </P>
        ),
      },
      {
        id: "quotes",
        title: "Quotes",
        keywords: "quotation estimate proposal accept convert",
        body: (
          <P>
            Create a quote from <Go to="/finance/quotes">Quotes</Go>. Once issued, the client can view it from their link. When they agree, mark it accepted and click <Ui>Convert to invoice</Ui>: nothing needs retyping.
          </P>
        ),
      },
      {
        id: "invoices",
        title: "Creating and issuing an invoice",
        keywords: "invoice create draft issue send pdf print hsn sac",
        body: (
          <>
            <Steps>
              <Step title="Create a draft">
                In <Go to="/finance/invoices">Invoices</Go>, click <Ui>New invoice</Ui>, pick the client and add lines with HSN/SAC codes and GST rates. Totals and tax are worked out as you type.
              </Step>
              <Step title="Issue it">
                <Ui>Save and issue</Ui> gives it its number and emails it to the client with a link to view and pay.
              </Step>
              <Step title="Get paid">Payments are recorded by hand or automatically through Razorpay.</Step>
            </Steps>
            <Tip tone="note">
              An issued invoice is a legal record: only its due date and notes can change. To correct an amount, issue a <span className="font-semibold">credit note</span>, or void it if it was issued by mistake.
            </Tip>
          </>
        ),
      },
      {
        id: "payments",
        title: "Recording payments and reminders",
        keywords: "payment record partial upi cheque reminder overdue",
        body: (
          <>
            <P>
              On an invoice, <Ui>Record payment</Ui> for bank transfers, UPI, cheques or cash. Part payments are fine: the invoice shows what's still due. All payments are listed in <Go to="/finance/payments">Payments</Go>.
            </P>
            <P>Overdue invoices get an automatic reminder the day after they're due, then weekly. You can also send one yourself with Send reminder.</P>
          </>
        ),
      },
      {
        id: "instalments",
        title: "Splitting an invoice into instalments",
        keywords: "emi instalment installment interest reducing balance",
        body: (
          <>
            <P>
              If a client needs to pay over time, open the issued invoice and click <Ui>Split into instalments</Ui>. Choose the number of instalments, monthly or quarterly, the interest rate (worked out on the reducing balance) and the first due date. You'll see the full schedule before saving.
            </P>
            <List>
              <li>The original invoice doesn't change.</li>
              <li>A week before each instalment is due, the interest for it is billed on its own GST invoice, and the client is emailed a link to pay.</li>
              <li>Record payments, create payment links and send reminders per instalment from the schedule on the invoice.</li>
            </List>
          </>
        ),
      },
      {
        id: "retainers",
        title: "Retainers (repeat invoices)",
        keywords: "recurring retainer monthly subscription repeat",
        body: (
          <P>
            For monthly or yearly fees, set up a retainer in <Go to="/finance/retainers">Retainers</Go>. Operant creates the invoice on schedule, as a draft for you to check or issued and emailed automatically, whichever you choose.
          </P>
        ),
      },
      {
        id: "overview",
        title: "Seeing where the money is",
        keywords: "overview chart outstanding overdue receivables aging",
        body: (
          <P>
            The <Go to="/finance">Finance overview</Go> shows billed, collected and still due by month, who owes the most, how old your receivables are, and recent payments.
          </P>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "client-portal",
    title: "Client portal",
    summary: "Let clients request your services, share documents, talk to your team and pay, in their own portal.",
    icon: Handshake,
    color: "var(--color-brand-600)",
    group: "Using Operant",
    sections: [
      {
        id: "what-it-is",
        title: "What clients get",
        keywords: "portal client customer login email code",
        body: (
          <>
            <P>Your clients get their own simple site. They sign in with a code sent to their email (no password) and can:</P>
            <List>
              <li>browse your services and request one;</li>
              <li>talk to the team handling their work, and see their names and photos;</li>
              <li>upload the documents you ask for;</li>
              <li>accept quotes, follow project progress, and view and pay invoices.</li>
            </List>
            <P>Clients only ever see their own company's work. Your team's internal chat and notes never appear there.</P>
          </>
        ),
      },
      {
        id: "services",
        title: "Listing your services",
        keywords: "service catalogue price fixed from quote on request template documents",
        body: (
          <>
            <P>
              In <Go to="/work/services">Work → Services</Go>, click <Ui>New service</Ui>. For each one, choose how the price is shown: a fixed price, "starting from", or on request. Then add:
            </P>
            <List>
              <li>the documents clients will be asked for (a checklist they upload against);</li>
              <li>who new requests go to (otherwise owners and admins);</li>
              <li>a project template, so work starts with the right tasks.</li>
            </List>
            <P>
              On the same page, copy your portal link to share, and switch on <Ui>Show in the public directory</Ui> if you want new clients to find you.
            </P>
          </>
        ),
      },
      {
        id: "requests",
        title: "Handling a request",
        keywords: "request inbox reply quote start project decline",
        body: (
          <Steps>
            <Step title="It arrives in Client requests">
              <Go to="/work/requests">Work → Client requests</Go> shows new requests and unread client messages. You're notified too.
            </Step>
            <Step title="Talk it through">Reply in the conversation (the client gets an email), and ask for any extra documents.</Step>
            <Step title="Send a quote">
              <Ui>Prepare a quote</Ui> drafts one from the service's price. Issue it, and the client can accept it in the portal. They're asked for billing details at that point.
            </Step>
            <Step title="Start the project">
              <Ui>Start project</Ui> creates the project for that client from the service's template. The conversation and documents move to the project's <Ui>Client</Ui> tab.
            </Step>
          </Steps>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "roles",
    title: "Roles and access",
    summary: "Who can see and do what, adding and removing people, and the audit log.",
    icon: ShieldCheck,
    color: "var(--color-fg-quaternary)",
    group: "For admins",
    sections: [
      {
        id: "members",
        title: "Adding and removing people",
        keywords: "invite member remove user add webrizen",
        body: (
          <P>
            The easiest way: add them in the Directory with their work email, then click <Ui>Invite to Operant</Ui> on their profile and pick a role. Webrizen emails them; once they accept, they can sign in. You can also invite people from your Webrizen account (accounts.webrizen.com). Either way there's no Operant password: they sign in with their Webrizen account. When you remove someone in Webrizen, they lose access to Operant straight away.
          </P>
        ),
      },
      {
        id: "roles",
        title: "What each role can do",
        keywords: "permission role owner admin manager member accountant",
        body: (
          <>
            <P>Roles are made of permissions, so you can adjust them in Webrizen. The usual ones:</P>
            <List>
              <li>
                <span className="font-semibold text-primary">Owner and Admin</span>: everything, including settings and the audit log.
              </li>
              <li>
                <span className="font-semibold text-primary">Manager</span>: runs projects and tasks, approves leave, handles client requests.
              </li>
              <li>
                <span className="font-semibold text-primary">Accountant</span>: clients, quotes, invoices and payments.
              </li>
              <li>
                <span className="font-semibold text-primary">Member</span>: their own tasks, projects they're on, chat and leave requests.
              </li>
            </List>
            <Tip tone="note">If someone can't see a page or a button, they're missing the permission for it, or that area is switched off for the organization.</Tip>
          </>
        ),
      },
      {
        id: "audit",
        title: "The audit log",
        keywords: "audit history who changed",
        body: (
          <P>
            <Go to="/settings/audit">Settings → Audit log</Go> records who did what and when: invoices issued, payments recorded or voided, settings changed and more. Only admins can see it.
          </P>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "settings",
    title: "Organization settings",
    summary: "Switching areas on and off, renaming terms, working days, and your own preferences.",
    icon: Building2,
    color: "var(--color-fg-quaternary)",
    group: "For admins",
    sections: [
      {
        id: "pillars",
        title: "Areas, terms and working days",
        keywords: "pillar disable rename term work week weekend",
        body: (
          <>
            <P>
              In <Go to="/settings">Settings → Organization</Go>:
            </P>
            <List>
              <li>switch off areas you don't use, and they disappear from everyone's sidebar;</li>
              <li>rename terms to match how your business talks, for example Project → Engagement;</li>
              <li>set your working days, which leave and due dates follow.</li>
            </List>
          </>
        ),
      },
      {
        id: "preferences",
        title: "Your preferences",
        keywords: "theme dark light mode preferences",
        body: (
          <P>
            <Go to="/settings/preferences">Preferences</Go> is just for you on this device: light, dark, or matching your system. You can also change the theme from your name at the bottom of the sidebar.
          </P>
        ),
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    slug: "faq",
    title: "Common questions",
    summary: "Quick answers to the things people ask most.",
    icon: CircleHelp,
    color: "var(--color-fg-quaternary)",
    group: "Getting started",
    sections: [
      {
        id: "no-org",
        title: "It says \"No organization selected\"",
        keywords: "error no organization sign in",
        body: (
          <P>
            Your Webrizen account isn't in an organization yet, or you chose an account that isn't. Ask your admin to invite you, or sign in again with the right account.
          </P>
        ),
      },
      {
        id: "missing-page",
        title: "I can't see Finance (or another area)",
        keywords: "missing hidden page permission",
        body: <P>Either your role doesn't include it, or your admin switched that area off. Ask your admin; see Roles and access.</P>,
      },
      {
        id: "edit-invoice",
        title: "How do I change an invoice I've already issued?",
        keywords: "edit issued invoice mistake",
        body: <P>Only the due date and notes can change once it's issued. For anything else, issue a credit note against it, or void it if it was a mistake (void its payments first).</P>,
      },
      {
        id: "emails",
        title: "Clients aren't getting our emails",
        keywords: "email not received spam",
        body: (
          <P>
            Check the Invoice email card in <Go to="/finance/settings">Finance settings</Go>: if it says "Not set up", ask your administrator to connect email. Use Send test email to check, and ask clients to look in spam the first time.
          </P>
        ),
      },
      {
        id: "gst",
        title: "We're not GST-registered. Can we still invoice?",
        keywords: "gst unregistered no gstin",
        body: <P>Yes. Leave GSTIN blank in Finance settings. Invoices go out titled "Invoice", without GST.</P>,
      },
      {
        id: "help",
        title: "Something isn't working",
        keywords: "support contact bug",
        body: <P>Tell your organization's admin first; they can check settings and permissions. For anything else, contact Webrizen support from your Webrizen account.</P>,
      },
    ],
  },
];

export const HELP_ICON = BookOpen;

/** Plain text of a section, for search. */
export function sectionText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(sectionText).join(" ");
  if (typeof node === "object" && "props" in node) return sectionText((node as { props: { children?: ReactNode } }).props.children);
  return "";
}
