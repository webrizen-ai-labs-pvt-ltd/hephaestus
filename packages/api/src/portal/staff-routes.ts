import { addDays, can, todayIn } from "@operant/core";
import {
  clientDocuments,
  clients,
  invoices,
  members,
  orgSettings,
  PRICE_TYPES,
  portalMessages,
  portalUsers,
  projects,
  REQUEST_STATUSES,
  SERVICE_BILLING,
  serviceRequests,
  services,
} from "@operant/db";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { AppEnv } from "../context.ts";
import { loadClient, loadSettings, placeOfSupplyFor, writeLines } from "../finance/service.ts";
import { forbid, notFound, orgWorkSettings, viewerMember } from "../helpers.ts";
import { requirePermission } from "../middleware.ts";
import { validate } from "../validate.ts";
import { conversation, documentChecklist, emailClientPeople, markSeen, portalBase, priceLabel, REQUEST_LABEL, type Scope, staffCards } from "./shared.ts";

/*
 * The team's side of the client portal: the services catalogue, the requests inbox,
 * the client conversation on requests and projects, and the document checklist.
 */

const perms = (c: Context<AppEnv>) => c.get("viewer")?.org?.permissions ?? {};
/** Managers (project:create) and account people (client:update) handle client requests. */
const canHandle = (c: Context<AppEnv>) => can(perms(c), "client", "update") || can(perms(c), "project", "create");
const canSee = (c: Context<AppEnv>) => canHandle(c) || can(perms(c), "client", "read");
const assertHandle = (c: Context<AppEnv>) => {
  if (!canHandle(c)) forbid("You can't respond to client requests");
};

const serviceInput = z.object({
  name: z.string().trim().min(1, "Name the service").max(120),
  summary: z.string().trim().max(200).nullish(),
  description: z.string().trim().max(5000).nullish(),
  category: z.string().trim().max(60).nullish(),
  priceType: z.enum(PRICE_TYPES).default("quote"),
  price: z.number().int().min(0).max(1e13).nullish(),
  billing: z.enum(SERVICE_BILLING).default("one_time"),
  deliveryDays: z.number().int().min(1).max(3650).nullish(),
  requiredDocs: z
    .array(z.object({ name: z.string().trim().min(1).max(120), hint: z.string().trim().max(240).nullish() }))
    .max(30)
    .default([]),
  templateProjectId: z.uuid().nullish(),
  ownerUserId: z.string().max(100).nullish(),
  active: z.boolean().default(true),
  position: z.number().int().min(0).max(10_000).optional(),
});

async function checkServiceRefs(c: Context<AppEnv>, input: Partial<z.infer<typeof serviceInput>>) {
  const { db } = c.get("deps");
  const orgId = c.get("org").id;
  if (input.priceType && input.priceType !== "quote" && input.price == null) throw new HTTPException(422, { message: "Enter a price, or choose 'Price on request'" });
  if (input.templateProjectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.orgId, orgId), eq(projects.id, input.templateProjectId)));
    if (!p) throw new HTTPException(422, { message: "Unknown template project" });
  }
  if (input.ownerUserId) {
    const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, orgId), eq(members.userId, input.ownerUserId), eq(members.status, "active")));
    if (!m) throw new HTTPException(422, { message: "Unknown team member" });
  }
}

async function loadRequest(c: Context<AppEnv>, id: string) {
  if (!z.uuid().safeParse(id).success) notFound("Request not found");
  const [r] = await c.get("deps").db.select().from(serviceRequests).where(and(eq(serviceRequests.orgId, c.get("org").id), eq(serviceRequests.id, id)));
  if (!r) notFound("Request not found");
  return r;
}

async function loadClientProject(c: Context<AppEnv>, id: string) {
  if (!z.uuid().safeParse(id).success) notFound("Project not found");
  const [p] = await c.get("deps").db.select().from(projects).where(and(eq(projects.orgId, c.get("org").id), eq(projects.id, id)));
  if (!p) notFound("Project not found");
  return p;
}

/** Post as the signed-in team member, and let the client know by email. */
async function staffMessage(c: Context<AppEnv>, scope: Scope, body: string, notice: { clientId: string | null; portalUserId: string | null; subject: string; path: string }) {
  const me = await viewerMember(c);
  const [m] = await c
    .get("deps")
    .db.insert(portalMessages)
    .values({
      orgId: c.get("org").id,
      requestId: "requestId" in scope ? scope.requestId : null,
      projectId: "projectId" in scope ? scope.projectId : null,
      authorKind: "staff",
      memberId: me.id,
      body,
    })
    .returning({ id: portalMessages.id });
  await emailClientPeople(c.get("deps"), c.get("org").id, notice, {
    subject: notice.subject,
    lead: `${me.name} wrote: "${body.length > 400 ? `${body.slice(0, 400)}…` : body}"`,
    path: notice.path,
    cta: "Reply in the portal",
  });
  return m!.id;
}

const messageInput = z.object({ body: z.string().trim().max(10_000).default("") });
const docInput = z.object({ name: z.string().trim().min(1, "Name the document").max(120), hint: z.string().trim().max(240).nullish() });

export const portalStaffRoutes = new Hono<AppEnv>()

  /* ---------------- Portal settings ---------------- */

  .get("/portal-settings", requirePermission("client", "read"), async (c) => {
    const [s] = await c.get("deps").db.select({ listed: orgSettings.portalListed, tagline: orgSettings.portalTagline }).from(orgSettings).where(eq(orgSettings.orgId, c.get("org").id));
    return c.json({ listed: s?.listed ?? false, tagline: s?.tagline ?? null, url: `${portalBase(c.get("deps"))}/${c.get("org").slug}`, directoryUrl: portalBase(c.get("deps")) });
  })

  .patch(
    "/portal-settings",
    requirePermission("settings", "manage"),
    validate("json", z.object({ listed: z.boolean().optional(), tagline: z.string().trim().max(160).nullish() })),
    async (c) => {
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const orgId = c.get("org").id;
      await db
        .insert(orgSettings)
        .values({ orgId, portalListed: input.listed ?? false, portalTagline: input.tagline ?? null })
        .onConflictDoUpdate({
          target: orgSettings.orgId,
          set: { ...(input.listed !== undefined ? { portalListed: input.listed } : {}), ...(input.tagline !== undefined ? { portalTagline: input.tagline } : {}) },
        });
      await audit(c, "portal.settings_updated", { type: "org", id: orgId }, input);
      return c.json({ ok: true });
    },
  )

  /* ---------------- Services ---------------- */

  .get("/services", async (c) => {
    if (!canSee(c) && !can(perms(c), "settings", "manage")) forbid();
    const { db } = c.get("deps");
    const rows = await db
      .select({
        service: services,
        requests: sql<number>`(select count(*) from service_requests r where r.service_id = "services"."id")`.mapWith(Number),
        open: sql<number>`(select count(*) from service_requests r where r.service_id = "services"."id" and r.status in ('new','in_discussion','quoted','accepted'))`.mapWith(Number),
      })
      .from(services)
      .where(eq(services.orgId, c.get("org").id))
      .orderBy(desc(services.active), asc(services.position), asc(services.name));
    const [cur] = await db.select({ currency: orgSettings.currency }).from(orgSettings).where(eq(orgSettings.orgId, c.get("org").id));
    return c.json({ services: rows.map((r) => ({ ...r.service, priceLabel: priceLabel(r.service, cur?.currency), requests: r.requests, open: r.open })) });
  })

  .post("/services", requirePermission("settings", "manage"), validate("json", serviceInput), async (c) => {
    const input = c.req.valid("json");
    await checkServiceRefs(c, input);
    const { db } = c.get("deps");
    const orgId = c.get("org").id;
    const [last] = await db.select({ p: sql<number>`coalesce(max(${services.position}), -1)`.mapWith(Number) }).from(services).where(eq(services.orgId, orgId));
    const [row] = await db
      .insert(services)
      .values({ ...input, price: input.priceType === "quote" ? null : (input.price ?? null), orgId, position: input.position ?? (last?.p ?? -1) + 1 })
      .returning({ id: services.id });
    await audit(c, "service.created", { type: "service", id: row!.id }, { name: input.name });
    return c.json({ service: row }, 201);
  })

  .patch("/services/:id", requirePermission("settings", "manage"), validate("json", serviceInput.partial()), async (c) => {
    const input = c.req.valid("json");
    await checkServiceRefs(c, input);
    const [row] = await c
      .get("deps")
      .db.update(services)
      .set({ ...input, ...(input.priceType === "quote" ? { price: null } : {}) })
      .where(and(eq(services.orgId, c.get("org").id), eq(services.id, c.req.param("id"))))
      .returning({ id: services.id });
    if (!row) notFound("Service not found");
    await audit(c, "service.updated", { type: "service", id: row.id }, { fields: Object.keys(input) });
    return c.json({ ok: true });
  })

  .delete("/services/:id", requirePermission("settings", "manage"), async (c) => {
    const { db } = c.get("deps");
    const id = c.req.param("id");
    const [used] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(serviceRequests).where(eq(serviceRequests.serviceId, id));
    // Services with requests are kept (hidden) so the history still makes sense.
    const [row] = used?.n
      ? await db.update(services).set({ active: false }).where(and(eq(services.orgId, c.get("org").id), eq(services.id, id))).returning({ id: services.id })
      : await db.delete(services).where(and(eq(services.orgId, c.get("org").id), eq(services.id, id))).returning({ id: services.id });
    if (!row) notFound("Service not found");
    await audit(c, used?.n ? "service.hidden" : "service.deleted", { type: "service", id });
    return c.json({ ok: true, hidden: Boolean(used?.n) });
  })

  /* ---------------- Requests ---------------- */

  .get(
    "/service-requests",
    validate("query", z.object({ status: z.enum([...REQUEST_STATUSES, "open", "closed"]).optional(), clientId: z.uuid().optional() })),
    async (c) => {
      if (!canSee(c)) forbid();
      const { status, clientId } = c.req.valid("query");
      const { db } = c.get("deps");
      const rows = await db
        .select({
          id: serviceRequests.id,
          number: serviceRequests.number,
          title: serviceRequests.title,
          status: serviceRequests.status,
          createdAt: serviceRequests.createdAt,
          updatedAt: serviceRequests.updatedAt,
          clientId: serviceRequests.clientId,
          clientName: clients.name,
          contactName: portalUsers.name,
          contactEmail: portalUsers.email,
          assigneeUserId: serviceRequests.assigneeUserId,
          projectId: serviceRequests.projectId,
          serviceName: services.name,
          unread: sql<number>`(select count(*) from portal_messages m where m.request_id = ${serviceRequests.id} and m.author_kind = 'client' and m.seen_by_staff_at is null)`.mapWith(Number),
          docsWaiting: sql<number>`(select count(*) from client_documents d where d.request_id = ${serviceRequests.id} and d.status = 'uploaded')`.mapWith(Number),
          lastMessageAt: sql<string | null>`(select max(m.created_at) from portal_messages m where m.request_id = ${serviceRequests.id})`,
        })
        .from(serviceRequests)
        .leftJoin(clients, eq(clients.id, serviceRequests.clientId))
        .leftJoin(portalUsers, eq(portalUsers.id, serviceRequests.portalUserId))
        .leftJoin(services, eq(services.id, serviceRequests.serviceId))
        .where(
          and(
            eq(serviceRequests.orgId, c.get("org").id),
            status === "open"
              ? inArray(serviceRequests.status, ["new", "in_discussion", "quoted", "accepted"])
              : status === "closed"
                ? inArray(serviceRequests.status, ["started", "declined", "withdrawn"])
                : status
                  ? eq(serviceRequests.status, status)
                  : undefined,
            clientId ? eq(serviceRequests.clientId, clientId) : undefined,
          ),
        )
        .orderBy(desc(serviceRequests.updatedAt))
        .limit(500);
      const people = await staffCards(
        db,
        c.get("org").id,
        rows.map((r) => r.assigneeUserId),
      );
      return c.json({ requests: rows.map((r) => ({ ...r, label: REQUEST_LABEL(r.number), assignee: r.assigneeUserId ? (people.get(r.assigneeUserId) ?? null) : null })) });
    },
  )

  .get("/service-requests/:id", async (c) => {
    if (!canSee(c)) forbid();
    const { db } = c.get("deps");
    const orgId = c.get("org").id;
    const r = await loadRequest(c, c.req.param("id"));
    const scope = { requestId: r.id };
    const [service] = r.serviceId ? await db.select().from(services).where(eq(services.id, r.serviceId)) : [];
    const [client] = r.clientId ? await db.select().from(clients).where(eq(clients.id, r.clientId)) : [];
    const [contact] = r.portalUserId ? await db.select().from(portalUsers).where(eq(portalUsers.id, r.portalUserId)) : [];
    const [quote] = r.quoteId ? await db.select({ id: invoices.id, number: invoices.number, status: invoices.status, total: invoices.total, currency: invoices.currency }).from(invoices).where(eq(invoices.id, r.quoteId)) : [];
    const [project] = r.projectId ? await db.select({ id: projects.id, name: projects.name, key: projects.key }).from(projects).where(eq(projects.id, r.projectId)) : [];
    const people = await staffCards(db, orgId, [r.assigneeUserId]);
    const messages = await conversation(db, orgId, scope);
    const documents = await documentChecklist(db, orgId, scope);
    await markSeen(db, orgId, scope, "staff");
    const [cur] = await db.select({ currency: orgSettings.currency }).from(orgSettings).where(eq(orgSettings.orgId, orgId));
    return c.json({
      request: { ...r, label: REQUEST_LABEL(r.number), assignee: r.assigneeUserId ? (people.get(r.assigneeUserId) ?? null) : null },
      service: service ? { ...service, priceLabel: priceLabel(service, cur?.currency) } : null,
      client: client ? { id: client.id, name: client.name, legalName: client.legalName, gstin: client.gstin, email: client.email, billingAddress: client.billingAddress } : null,
      contact: contact ? { name: contact.name, email: contact.email, phone: contact.phone } : null,
      quote: quote ?? null,
      project: project ?? null,
      messages,
      documents,
    });
  })

  .patch(
    "/service-requests/:id",
    validate("json", z.object({ assigneeUserId: z.string().max(100).nullish(), status: z.enum(["in_discussion", "declined"]).optional(), declineReason: z.string().trim().max(1000).nullish() })),
    async (c) => {
      assertHandle(c);
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const r = await loadRequest(c, c.req.param("id"));
      if (input.assigneeUserId) {
        const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, r.orgId), eq(members.userId, input.assigneeUserId), eq(members.status, "active")));
        if (!m) throw new HTTPException(422, { message: "Unknown team member" });
      }
      if (input.status && ["started", "withdrawn"].includes(r.status)) throw new HTTPException(409, { message: "This request is closed" });
      await db.update(serviceRequests).set(input).where(eq(serviceRequests.id, r.id));
      if (input.status === "declined") {
        const me = await viewerMember(c);
        await db.insert(portalMessages).values({ orgId: r.orgId, requestId: r.id, authorKind: "system", body: `${me.name} declined this request.${input.declineReason ? ` ${input.declineReason}` : ""}` });
        await emailClientPeople(c.get("deps"), r.orgId, { clientId: r.clientId, portalUserId: r.portalUserId }, {
          subject: `Update on your request: ${r.title}`,
          lead: `We're unable to take on "${r.title}" right now.${input.declineReason ? ` ${input.declineReason}` : ""}`,
          path: `/requests/${r.id}`,
        });
      }
      await audit(c, "service_request.updated", { type: "service_request", id: r.id }, input);
      return c.json({ ok: true });
    },
  )

  .post("/service-requests/:id/messages", validate("json", messageInput), async (c) => {
    assertHandle(c);
    const r = await loadRequest(c, c.req.param("id"));
    if (r.projectId) throw new HTTPException(409, { message: "This request is now a project. Write on the project's client tab." });
    const id = await staffMessage(c, { requestId: r.id }, c.req.valid("json").body, {
      clientId: r.clientId,
      portalUserId: r.portalUserId,
      subject: `New message about ${r.title}`,
      path: `/requests/${r.id}`,
    });
    const { db } = c.get("deps");
    await db
      .update(serviceRequests)
      .set({ ...(r.status === "new" ? { status: "in_discussion" as const } : {}), ...(!r.assigneeUserId ? { assigneeUserId: c.get("viewer")!.userId } : {}) })
      .where(eq(serviceRequests.id, r.id));
    return c.json({ message: { id } }, 201);
  })

  .post("/service-requests/:id/documents", validate("json", docInput), async (c) => {
    assertHandle(c);
    const r = await loadRequest(c, c.req.param("id"));
    const input = c.req.valid("json");
    const [d] = await c
      .get("deps")
      .db.insert(clientDocuments)
      .values({ orgId: r.orgId, requestId: r.id, projectId: r.projectId, name: input.name, hint: input.hint ?? null, requestedBy: c.get("viewer")!.userId })
      .returning({ id: clientDocuments.id });
    await emailClientPeople(c.get("deps"), r.orgId, { clientId: r.clientId, portalUserId: r.portalUserId }, {
      subject: `Document needed: ${input.name}`,
      lead: `Please upload ${input.name} for "${r.title}".${input.hint ? ` ${input.hint}` : ""}`,
      path: r.projectId ? `/projects/${r.projectId}` : `/requests/${r.id}`,
      cta: "Upload it",
    });
    return c.json({ document: d }, 201);
  })

  /** Draft a quote for the request, priced from the service. The team edits and issues it as usual. */
  .post("/service-requests/:id/quote", requirePermission("invoice", "create"), async (c) => {
    const { db } = c.get("deps");
    const r = await loadRequest(c, c.req.param("id"));
    if (!r.clientId) throw new HTTPException(409, { message: "This request has no client yet" });
    if (r.quoteId) {
      const [q] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, r.quoteId));
      if (q && q.status !== "void" && q.status !== "declined") return c.json({ quote: { id: r.quoteId } });
    }
    const [service] = r.serviceId ? await db.select().from(services).where(eq(services.id, r.serviceId)) : [];
    const settings = await loadSettings(db, r.orgId);
    const client = await loadClient(db, r.orgId, r.clientId);
    const pos = placeOfSupplyFor(settings, client);
    const { timezone } = await orgWorkSettings(db, r.orgId);
    const today = todayIn(timezone);
    const [q] = await db
      .insert(invoices)
      .values({
        orgId: r.orgId,
        kind: "quote",
        clientId: client.id,
        issueDate: today,
        dueDate: addDays(today, 30),
        currency: client.currency,
        ...pos,
        notes: `For your request ${REQUEST_LABEL(r.number)}: ${r.title}.`,
        terms: settings.terms,
        createdBy: c.get("viewer")!.userId,
      })
      .returning({ id: invoices.id });
    await writeLines(db, r.orgId, q!.id, [{ description: service?.name ?? r.title, quantity: 1, unitPrice: service?.price ?? 0, taxRate: 18 }], pos.supplyType, settings);
    await db.update(serviceRequests).set({ quoteId: q!.id, ...(r.status === "new" ? { status: "in_discussion" as const } : {}) }).where(eq(serviceRequests.id, r.id));
    await audit(c, "service_request.quote_drafted", { type: "service_request", id: r.id }, { quote: q!.id });
    return c.json({ quote: q }, 201);
  })

  /** Work starts: link the project (created from the service's template) and move the conversation onto it. */
  .post("/service-requests/:id/project", requirePermission("project", "create"), validate("json", z.object({ projectId: z.uuid() })), async (c) => {
    const { db } = c.get("deps");
    const r = await loadRequest(c, c.req.param("id"));
    if (r.projectId) throw new HTTPException(409, { message: "This request already has a project" });
    if (["declined", "withdrawn"].includes(r.status)) throw new HTTPException(409, { message: "This request is closed" });
    const p = await loadClientProject(c, c.req.valid("json").projectId);
    if (r.clientId && !p.clientId) await db.update(projects).set({ clientId: r.clientId }).where(eq(projects.id, p.id));
    else if (p.clientId !== r.clientId) throw new HTTPException(422, { message: "That project is for a different client" });
    await db.update(serviceRequests).set({ projectId: p.id, status: "started" }).where(eq(serviceRequests.id, r.id));
    await db.update(portalMessages).set({ projectId: p.id }).where(eq(portalMessages.requestId, r.id));
    await db.update(clientDocuments).set({ projectId: p.id }).where(eq(clientDocuments.requestId, r.id));
    await db.insert(portalMessages).values({ orgId: r.orgId, requestId: r.id, projectId: p.id, authorKind: "system", body: `Work has started. This conversation continues on the project ${p.name}.` });
    await emailClientPeople(c.get("deps"), r.orgId, { clientId: r.clientId, portalUserId: r.portalUserId }, {
      subject: `Work has started: ${p.name}`,
      lead: `We've started work on "${r.title}". You can follow progress, share documents and talk to the team in your portal.`,
      path: `/projects/${p.id}`,
      cta: "Follow the project",
    });
    await audit(c, "service_request.started", { type: "service_request", id: r.id }, { project: p.id });
    return c.json({ ok: true });
  })

  /* ---------------- On projects ---------------- */

  .get("/projects/:id/client", requirePermission("project", "read"), async (c) => {
    const { db } = c.get("deps");
    const p = await loadClientProject(c, c.req.param("id"));
    const scope = { projectId: p.id };
    const people = p.clientId
      ? await db.select({ name: portalUsers.name, email: portalUsers.email, lastSignInAt: portalUsers.lastSignInAt }).from(portalUsers).where(eq(portalUsers.clientId, p.clientId))
      : [];
    const messages = await conversation(db, p.orgId, scope);
    const documents = await documentChecklist(db, p.orgId, scope);
    if (canSee(c)) await markSeen(db, p.orgId, scope, "staff");
    const [req] = await db.select({ id: serviceRequests.id, label: serviceRequests.number }).from(serviceRequests).where(eq(serviceRequests.projectId, p.id));
    return c.json({
      clientId: p.clientId,
      portalPeople: people,
      portalUrl: `${portalBase(c.get("deps"))}/${c.get("org").slug}/projects/${p.id}`,
      request: req ? { id: req.id, label: REQUEST_LABEL(req.label) } : null,
      messages,
      documents,
    });
  })

  .post("/projects/:id/client-messages", validate("json", messageInput), async (c) => {
    assertHandle(c);
    const p = await loadClientProject(c, c.req.param("id"));
    if (!p.clientId) throw new HTTPException(409, { message: "Link a client to this project first" });
    const id = await staffMessage(c, { projectId: p.id }, c.req.valid("json").body, { clientId: p.clientId, portalUserId: null, subject: `New message on ${p.name}`, path: `/projects/${p.id}` });
    return c.json({ message: { id } }, 201);
  })

  .post("/projects/:id/client-documents", validate("json", docInput), async (c) => {
    assertHandle(c);
    const p = await loadClientProject(c, c.req.param("id"));
    if (!p.clientId) throw new HTTPException(409, { message: "Link a client to this project first" });
    const input = c.req.valid("json");
    const [d] = await c
      .get("deps")
      .db.insert(clientDocuments)
      .values({ orgId: p.orgId, projectId: p.id, name: input.name, hint: input.hint ?? null, requestedBy: c.get("viewer")!.userId })
      .returning({ id: clientDocuments.id });
    await emailClientPeople(c.get("deps"), p.orgId, { clientId: p.clientId, portalUserId: null }, {
      subject: `Document needed: ${input.name}`,
      lead: `Please upload ${input.name} for ${p.name}.${input.hint ? ` ${input.hint}` : ""}`,
      path: `/projects/${p.id}`,
      cta: "Upload it",
    });
    return c.json({ document: d }, 201);
  })

  /** Accept an uploaded document, or send it back with a note. */
  .patch(
    "/client-documents/:id",
    validate("json", z.object({ status: z.enum(["accepted", "rejected", "requested"]), note: z.string().trim().max(500).nullish() })),
    async (c) => {
      assertHandle(c);
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const [d] = await db
        .update(clientDocuments)
        .set({ status: input.status, note: input.status === "rejected" ? (input.note ?? null) : null, reviewedAt: new Date() })
        .where(and(eq(clientDocuments.orgId, c.get("org").id), eq(clientDocuments.id, c.req.param("id"))))
        .returning();
      if (!d) notFound("Document not found");
      if (input.status === "rejected") {
        const [r] = d.requestId ? await db.select().from(serviceRequests).where(eq(serviceRequests.id, d.requestId)) : [];
        const [p] = d.projectId ? await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, d.projectId)) : [];
        await emailClientPeople(c.get("deps"), d.orgId, { clientId: r?.clientId ?? p?.clientId ?? null, portalUserId: r?.portalUserId ?? null }, {
          subject: `Please upload ${d.name} again`,
          lead: `${d.name} needs another look.${input.note ? ` ${input.note}` : ""}`,
          path: d.projectId ? `/projects/${d.projectId}` : `/requests/${d.requestId}`,
          cta: "Upload it",
        });
      }
      return c.json({ ok: true });
    },
  )

  .delete("/client-documents/:id", async (c) => {
    assertHandle(c);
    const [d] = await c
      .get("deps")
      .db.delete(clientDocuments)
      .where(and(eq(clientDocuments.orgId, c.get("org").id), eq(clientDocuments.id, c.req.param("id")), eq(clientDocuments.status, "requested")))
      .returning({ id: clientDocuments.id });
    if (!d) throw new HTTPException(409, { message: "Only documents that haven't been uploaded can be removed" });
    return c.json({ ok: true });
  })

  /** People from a client who use the portal. */
  .get("/clients/:id/portal-people", requirePermission("client", "read"), async (c) => {
    const { db } = c.get("deps");
    const rows = await db
      .select({ id: portalUsers.id, name: portalUsers.name, email: portalUsers.email, phone: portalUsers.phone, lastSignInAt: portalUsers.lastSignInAt })
      .from(portalUsers)
      .where(and(eq(portalUsers.orgId, c.get("org").id), eq(portalUsers.clientId, c.req.param("id"))))
      .orderBy(desc(portalUsers.lastSignInAt));
    return c.json({ people: rows, portalUrl: `${portalBase(c.get("deps"))}/${c.get("org").slug}` });
  })

  /** Unread client messages and waiting uploads, for the sidebar count. */
  .get("/service-requests-summary", async (c) => {
    if (!canSee(c)) return c.json({ new: 0, unread: 0 });
    const { db } = c.get("deps");
    const orgId = c.get("org").id;
    const [n] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(serviceRequests).where(and(eq(serviceRequests.orgId, orgId), eq(serviceRequests.status, "new")));
    const [u] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(portalMessages)
      .where(and(eq(portalMessages.orgId, orgId), eq(portalMessages.authorKind, "client"), isNull(portalMessages.seenByStaffAt)));
    return c.json({ new: n?.n ?? 0, unread: u?.n ?? 0 });
  });
