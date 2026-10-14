"use client";

import {
  ArrowDownToLine,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarCheck2,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileBarChart,
  FileUp,
  LayoutDashboard,
  Landmark,
  LifeBuoy,
  LogOut,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "PROJECT_USER";
type Section = "dashboard" | "projects" | "workers" | "attendance" | "per-diems" | "expenses" | "petty-cash" | "users" | "reports" | "audit" | "claims" | "support";
interface User { id: string; name: string; email: string; role: Role; projectId: string | null }
interface Project { id: string; code: string; name: string; responsible: string; location: string; status: string; daily_rate_cents: number; deleted_at?: string | null }
interface Worker { id: string; project_id: string; dni: string; first_name: string; last_name: string; job_title: string; phone: string; email: string; address: string; hired_on: string; status: string; deleted_at: string | null }
interface Attendance { id: string; worker_id: string; work_date: string; status: string; note: string | null; first_name: string; last_name: string; dni: string; project_id: string; project_code: string; recorded_by?: string; deleted_at?: string | null; delete_reason?: string | null }
interface PerDiem { id: string; worker_id: string; project_id: string; week_start: string; days_attended: number; daily_rate_cents: number; total_cents: number; stage: string; first_name: string; last_name: string; dni: string; project_code: string; project_name: string; evidence_id?: string | null; evidence_name?: string | null; evidence_document_number?: string | null; evidence_document_date?: string | null }
interface Expense { id: string; project_id: string; expense_date: string; week_start?: string; category: string; description: string; supplier: string | null; receipt_number: string | null; amount_cents: number; stage: string; invoice_status?: string; payment_source?: string; project_code: string; project_name: string; registered_by?: string; deleted_at?: string | null; delete_reason?: string | null; evidence_id?: string | null; evidence_name?: string | null; evidence_document_number?: string | null; evidence_document_date?: string | null }
interface ManagedUser { id: string; name: string; email: string; role: Role; project_id: string | null; active: boolean; project_code: string | null; project_name: string | null; authorized_at?: string | null; authorized_by_name?: string | null }
interface PettyCash { id: string; project_id: string; week_start: string; movement_date: string; movement_type: string; description: string; receipt_number: string | null; amount_cents: number; project_code: string; project_name: string; recorded_by?: string; deleted_at?: string | null; delete_reason?: string | null; evidence_id?: string | null; evidence_name?: string | null; evidence_document_number?: string | null; evidence_document_date?: string | null }
interface WeeklyMovement { id: string; projectId: string; projectCode: string; projectName: string; kind: "GASTO" | "VIATICO" | "CAJA_CHICA"; movementDate: string; category: string; description: string; amountCents: number; stage: string; invoiceStatus: string | null; paymentSource: string | null; receiptNumber: string | null; daysAttended: number | null; cashDirection: "IN" | "OUT" | null }
interface WeeklyReport { weekStart: string; weekEnd: string; movements: WeeklyMovement[]; totals: { expenseCents: number; perDiemCents: number; operationalCents: number; pendingCents: number; paidCents: number; invoiceDoneCents: number; pettyCashInCents: number; pettyCashReturnCents: number; pettyCashExpenseCents: number; pettyCashBalanceCents: number } }
interface Claim { id: string; claim_code: string; full_name: string; email: string; project_code: string | null; claim_type: string; detail: string; request_text: string; status: string; response: string | null; created_at: string }
interface Ticket { id: string; ticket_code: string; name: string; email: string; subject: string; message: string; status: string; mail_status: string; created_at: string }
interface Audit { id: number; action: string; entity_type: string; actor_name: string; project_code: string | null; before_data: unknown; after_data: unknown; reason: string | null; created_at: string }
interface DashboardData { weekStart?: string; weekEnd?: string; summary: { projectCount: number; workerCount: number; expenseTotalCents: number; perDiemTotalCents: number; pendingCents: number; paidCents: number; pendingCount: number; invoiceDoneCents?: number; pettyCashBalanceCents?: number; attendanceThisWeek: { present: number; absent: number; excused: number } }; projects: { id: string; code: string; name: string; responsible?: string; location?: string; status?: string; projectTotalCents: number; daily_rate_cents: number; workers: number }[]; recent: Expense[] }
interface ApiResult { error?: string }

const navigation: { key: Section; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { key: "dashboard", label: "Panel principal", icon: LayoutDashboard },
  { key: "projects", label: "Obras", icon: Building2 },
  { key: "workers", label: "Trabajadores", icon: UsersRound },
  { key: "attendance", label: "Asistencia", icon: CalendarCheck2 },
  { key: "per-diems", label: "Viáticos", icon: Wallet },
  { key: "expenses", label: "Gastos", icon: ReceiptText },
  { key: "petty-cash", label: "Caja chica", icon: Landmark },
  { key: "users", label: "Cuentas", icon: ShieldCheck, adminOnly: true },
  { key: "reports", label: "Reportes", icon: FileBarChart },
  { key: "claims", label: "Reclamaciones", icon: BookOpenCheck },
  { key: "audit", label: "Auditoría", icon: BarChart3 },
  { key: "support", label: "Soporte", icon: LifeBuoy },
];

async function api<T = ApiResult>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) throw new Error((data as ApiResult).error ?? "No se pudo completar la solicitud.");
  return data;
}

async function apiForm<T = ApiResult>(path: string, body: FormData): Promise<T> {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", body });
  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) throw new Error((data as ApiResult).error ?? "No se pudo subir el comprobante.");
  return data;
}
function amount(cents: number | string | null | undefined): string {
  return `S/ ${((Number(cents) || 0) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function monthNow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(new Date());
}

function mondayNow(): string {
  const date = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date())}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function mondayFor(value: string): string {
  if (!value) return mondayNow();
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, count: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function filteredRowsForWeek(rows: Attendance[], projectId: string, monday: string): Attendance[] {
  const sunday = addDays(monday, 6);
  return rows.filter((row) => (!projectId || row.project_id === projectId) && row.work_date.slice(0, 10) >= monday && row.work_date.slice(0, 10) <= sunday);
}

function stageLabel(stage: string): string {
  return ({ PENDING: "Pendiente", APPROVED: "Aprobado", PAID: "Pagado", HECHO: "Factura hecha", DIRECT: "Pago directo", PETTY_CASH: "Caja chica", REGISTERED: "Registrado", FUND: "Fondo asignado", REPLENISHMENT: "Reposición", RETURN: "Devolución", ACTIVE: "Activa", PAUSED: "Pausada", CLOSED: "Cerrada", PRESENT: "Asistió", ABSENT: "Faltó", EXCUSED: "Justificado", REVIEW: "En revisión", RESOLVED: "Resuelto", RECEIVED: "Recibido", RESPONDED: "Respondido", COMPLAINT: "Queja", CLAIM: "Reclamo" } as Record<string, string>)[stage] ?? stage;
}

function StagePill({ value }: { value: string }) {
  return <span className={`stage-pill stage-${value.toLowerCase()}`}>{stageLabel(value)}</span>;
}

type EvidenceEntityType = "EXPENSE" | "PETTY_CASH" | "PER_DIEM";
interface EvidenceTarget { entityType: EvidenceEntityType; entityId: string; projectCode: string; description: string; amountCents: number; date: string; supplier?: string | null }

function EvidenceDialog({ target, busy, perform, onClose }: { target: EvidenceTarget; busy: boolean; perform: PerformHandler; onClose: () => void }) {
  const [fileMessage, setFileMessage] = useState("PDF o imagen JPG, PNG, WEBP, GIF o BMP. Máximo 4 MB.");
  const isExpense = target.entityType === "EXPENSE";
  const onFileChange = (file: File | undefined) => {
    if (!file) return setFileMessage("PDF o imagen JPG, PNG, WEBP, GIF o BMP. Máximo 4 MB.");
    if (file.size > 4 * 1024 * 1024) return setFileMessage("El archivo supera 4 MB. Selecciona uno más pequeño.");
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
    const allowedExtensions = /\.(pdf|jpe?g|png|webp|gif|bmp)$/i;
    if (file.type && !allowedTypes.includes(file.type) && !allowedExtensions.test(file.name)) return setFileMessage("Formato no admitido. Usa PDF, JPG, PNG, WEBP, GIF o BMP.");
    setFileMessage("Archivo listo: " + file.name + " (" + Math.ceil(file.size / 1024) + " KB). Se comprobará el formato al guardar.");
  };
  return <div className="modal-overlay" role="presentation"><form className="modal-card evidence-modal" onSubmit={(event) => { event.preventDefault(); void perform(async () => { const form = new FormData(event.currentTarget); const file = form.get("file"); if (!(file instanceof File) || !file.size) throw new Error("Selecciona el archivo que quieres adjuntar."); await apiForm("/api/evidences", form); onClose(); return "Archivo adjuntado y vinculado al registro financiero."; }); }}><div className="modal-heading"><div><span className="eyebrow">ADJUNTAR COMPROBANTE</span><h2>{target.projectCode} · {amount(target.amountCents)}</h2><p>{target.description}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={15} /></button></div><input type="hidden" name="entityType" value={target.entityType} /><input type="hidden" name="entityId" value={target.entityId} /><div className="evidence-note"><FileUp size={18} /><span>Solo el archivo es obligatorio. El importe del registro se asociará automáticamente; los datos del comprobante que aparecen abajo son opcionales.</span></div><div className="form-grid"><label className="span-two evidence-file-field">Archivo PDF o imagen<input name="file" type="file" accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png,image/webp,.webp,image/gif,.gif,image/bmp,.bmp" required onChange={(event) => onFileChange(event.currentTarget.files?.[0])} /><small>{fileMessage}</small></label><label>Número del comprobante (opcional)<input name="documentNumber" maxLength={100} placeholder="Ej. F001-000123" /></label><label>Importe del documento (opcional)<input name="documentAmount" type="number" min="0.01" max="1000000" step="0.01" placeholder={amount(target.amountCents).replace("S/ ", "")} /></label><label>Fecha del comprobante (opcional)<input name="documentDate" type="date" /></label>{isExpense && <label className="span-two">Proveedor (opcional)<input name="supplier" defaultValue={target.supplier ?? ""} maxLength={160} /></label>}</div><div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>Adjuntar archivo</button></div></form></div>;
}
function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-mark"><Search size={18} /></span><p>{children}</p></div>;
}

export function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>("dashboard");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [perDiems, setPerDiems] = useState<PerDiem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pettyCash, setPettyCash] = useState<PettyCash[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [weekStart, setWeekStart] = useState(mondayNow());
  const [ticketResult, setTicketResult] = useState("");

  const refresh = useCallback(async (activeUser: User) => {
    const requests: Promise<unknown>[] = [
      api<DashboardData>(`/api/dashboard?weekStart=${weekStart}`).then((r) => setDashboard(r)),
      api<{ projects: Project[] }>(activeUser.role === "ADMIN" ? "/api/projects?includeDeleted=true" : "/api/projects").then((r) => setProjects(r.projects)),
      api<{ workers: Worker[] }>("/api/workers?includeDeleted=true").then((r) => setWorkers(r.workers)),
      api<{ attendance: Attendance[] }>(`/api/attendance?weekStart=${weekStart}${activeUser.role === "ADMIN" ? "&includeDeleted=true" : ""}`).then((r) => setAttendance(r.attendance)),
      api<{ perDiems: PerDiem[] }>(`/api/per-diems?weekStart=${weekStart}`).then((r) => setPerDiems(r.perDiems)),
      api<{ expenses: Expense[] }>(`/api/expenses?weekStart=${weekStart}${activeUser.role === "ADMIN" ? "&includeDeleted=true" : ""}`).then((r) => setExpenses(r.expenses)),
      api<{ movements: PettyCash[] }>(`/api/petty-cash?weekStart=${weekStart}${activeUser.role === "ADMIN" ? "&includeDeleted=true" : ""}`).then((r) => setPettyCash(r.movements)),
      api<WeeklyReport>(`/api/reports/weekly?weekStart=${weekStart}`).then((r) => setWeeklyReport(r)),
      api<{ tickets: Ticket[] }>("/api/support").then((r) => setTickets(r.tickets)),
      api<{ claims: Claim[] }>("/api/claims").then((r) => setClaims(r.claims)),
      api<{ audit: Audit[] }>("/api/audit").then((r) => setAudit(r.audit)),
    ];
    if (activeUser.role === "ADMIN") requests.push(api<{ users: ManagedUser[] }>("/api/users").then((r) => setManagedUsers(r.users)));
    await Promise.allSettled(requests);
  }, [weekStart]);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/session")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (user) void refresh(user);
  }, [user, refresh]);

  const notify = (text: string) => { setMessage(text); setError(""); window.setTimeout(() => setMessage(""), 4200); };
  const fail = (reason: unknown) => { setError(reason instanceof Error ? reason.message : "Ocurrió un error."); setMessage(""); };
  const submit = async (event: FormEvent<HTMLFormElement>, operation: () => Promise<string>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await operation();
      if (user) await refresh(user);
      notify(result);
    } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  };
  const perform = async (operation: () => Promise<string>) => {
    setBusy(true); setError("");
    try { const result = await operation(); if (user) await refresh(user); notify(result); }
    catch (reason) { fail(reason); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); }
    finally { setUser(null); setDashboard(null); }
  };

  const visibleNavigation = navigation.filter((item) => !item.adminOnly || user?.role === "ADMIN");
  const activeLabel = navigation.find((item) => item.key === section)?.label ?? "Panel principal";

  if (!ready) return <main className="boot-screen"><div className="boot-orb" /><p>Preparando tu espacio…</p></main>;
  if (!user) return <LoginScreen error={error} onLogin={setUser} onError={fail} />;

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-cube"><span>R</span></span><span className="brand-title">AVENDAÑO <b>RINDE+</b><small>GESTIÓN DE OBRAS</small></span></div>
        <div className="workspace-chip"><span className="workspace-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span><b>{user.name}</b><small>{user.role === "ADMIN" ? "Administración · global" : "Cuenta de obra"}</small></span><ChevronDown size={14} /></div>
        <p className="nav-caption">ESPACIO DE TRABAJO</p>
        <nav className="primary-nav">
          {visibleNavigation.map(({ key, label, icon: Icon }) => (
            <button className={`nav-item ${section === key ? "selected" : ""}`} key={key} onClick={() => { setSection(key); setError(""); }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {key === "expenses" && (dashboard?.summary.pendingCount ?? 0) > 0 && <i className="nav-count">{dashboard?.summary.pendingCount}</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-icon"><LifeBuoy size={16} /></span><b>¿Necesitas ayuda?</b><p>Estamos para ayudarte con la gestión.</p><button onClick={() => setSection("support")}>Contactar soporte <ArrowUpRight size={13} /></button></div>
          <button className="sign-out" onClick={() => void logout()}><LogOut size={16} /> Cerrar sesión</button>
          <small className="sidebar-version">RINDE+ · CONTROL DE OBRA</small>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>AVENDAÑO RINDE+</span><b>/</b><strong>{activeLabel}</strong></div>
          <div className="topbar-right"><span className="secure-label"><ShieldCheck size={14} /> Sesión segura</span><span className="topbar-divider" /><div className="topbar-user"><span className="user-dot">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name}</span></div></div>
        </header>
        <section className="page-content" key={section}>
          {(message || error) && <div className={`toast ${error ? "toast-error" : "toast-success"}`} role="status">{error ? <CircleAlert size={17} /> : <Check size={17} />}{error || message}<button aria-label="Cerrar" onClick={() => { setError(""); setMessage(""); }}><X size={15} /></button></div>}
          {section === "dashboard" && (user.role === "ADMIN" ? <DashboardPage user={user} dashboard={dashboard} onSelect={setSection} /> : <ProjectDashboardPage dashboard={dashboard} onSelect={setSection} />)}
          {section === "projects" && <ProjectsPage admin={user.role === "ADMIN"} projects={projects} busy={busy} submit={submit} perform={perform} />}
          {section === "workers" && <WorkersPage admin={true} projects={projects} workers={workers} busy={busy} submit={submit} perform={perform} />}
          {section === "attendance" && <WeeklyAttendancePage projects={projects} workers={workers} rows={attendance} admin={user.role === "ADMIN"} weekStart={weekStart} setWeekStart={(value) => setWeekStart(mondayFor(value))} busy={busy} submit={submit} perform={perform} />}
          {section === "per-diems" && <WeeklyPerDiemPage projects={projects} rows={perDiems} admin={user.role === "ADMIN"} weekStart={weekStart} setWeekStart={(value) => setWeekStart(mondayFor(value))} busy={busy} perform={perform} />}
          {section === "expenses" && <WeeklyExpensesPage projects={projects} rows={expenses} admin={user.role === "ADMIN"} weekStart={weekStart} setWeekStart={(value) => setWeekStart(mondayFor(value))} busy={busy} submit={submit} perform={perform} />}
          {section === "petty-cash" && <PettyCashPage projects={projects} rows={pettyCash} report={weeklyReport} admin={user.role === "ADMIN"} weekStart={weekStart} setWeekStart={(value) => setWeekStart(mondayFor(value))} busy={busy} submit={submit} perform={perform} />}
          {section === "users" && user.role === "ADMIN" && <AuthorizedAccountsPage projects={projects} rows={managedUsers} busy={busy} submit={submit} perform={perform} />}
          {section === "reports" && <WeeklyReportsPage report={weeklyReport} weekStart={weekStart} setWeekStart={(value) => setWeekStart(mondayFor(value))} />}
          {section === "audit" && <AuditPage rows={audit} />}
          {section === "claims" && <ClaimsPage rows={claims} admin={user.role === "ADMIN"} busy={busy} perform={perform} />}
          {section === "support" && <SupportPage rows={tickets} admin={user.role === "ADMIN"} busy={busy} submit={submit} perform={perform} ticketResult={ticketResult} setTicketResult={setTicketResult} />}
        </section>
      </main>
    </div>
  );
}

function LoginScreen({ error, onLogin, onError }: { error: string; onLogin: (user: User) => void; onError: (reason: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      onLogin(result.user);
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  };
  return (
    <main className="login-wrap">
      <div className="login-visual"><div className="login-visual-top"><span className="brand-cube brand-cube-light"><span>R</span></span><span>AVENDAÑO <b>RINDE+</b></span></div><div className="visual-grid" /><div className="floating-shape shape-one" /><div className="floating-shape shape-two" /><div className="visual-copy"><span className="eyebrow light">CONTROL CON CLARIDAD</span><h1>Cada obra,<br />en buenas manos.</h1><p>Gastos, asistencia y viáticos en un mismo espacio de trabajo.</p></div><div className="visual-footer"><span>Gestión responsable</span><span>·</span><span>Decisiones claras</span></div></div>
      <div className="login-panel"><div className="login-heading"><span className="eyebrow">BIENVENIDO DE VUELTA</span><h2>Inicia sesión</h2><p>Ingresa tus credenciales para continuar.</p></div><form onSubmit={(event) => void handleSubmit(event)} className="form-stack"><label>Correo electrónico<input type="email" name="email" placeholder="nombre@empresa.com" required autoComplete="username" /></label><label>Contraseña<input type="password" name="password" placeholder="••••••••••••" required autoComplete="current-password" /></label><button className="button button-primary button-wide" disabled={busy}>{busy ? "Validando…" : "Ingresar a mi espacio"}<ArrowUpRight size={16} /></button></form>{error && <div className="login-error" role="alert"><CircleAlert size={15} />{error}</div>}<div className="login-foot"><ShieldCheck size={15} /> Acceso protegido y limitado por obra</div><div className="login-legal-links"><a href="/politicas">Política de privacidad</a><a href="/terminos">Términos</a><a href="/libro-reclamaciones">Libro de reclamaciones</a></div><div className="login-brand-small">AVENDAÑO RINDE+ <span>·</span> CONTROL DE GESTIÓN</div></div>
    </main>
  );
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function DashboardPage({ user, dashboard, onSelect }: { user: User; dashboard: DashboardData | null; onSelect: (section: Section) => void }) {
  const summary = dashboard?.summary;
  const maxProject = Math.max(1, ...((dashboard?.projects ?? []).map((item) => item.projectTotalCents)));
  return <>
    <PageHeading eyebrow="RESUMEN DE OPERACIONES" title={user.role === "ADMIN" ? "Tu operación, a primera vista." : "El estado de tu obra."} subtitle={user.role === "ADMIN" ? "Un vistazo a los gastos y viáticos de todas tus obras." : "Consulta la actividad y los movimientos de tu obra asignada."} action={<button className="button button-primary" onClick={() => onSelect("expenses")}><Plus size={16} /> Registrar gasto</button>} />
    <div className="summary-grid">
      <article className="summary-card"><div className="summary-card-top"><span>Obras activas</span><span className="metric-icon metric-amber"><Building2 size={17} /></span></div><strong>{summary?.projectCount ?? "—"}</strong><small>{user.role === "ADMIN" ? "En cartera" : "Obra asignada"}</small></article>
      <article className="summary-card"><div className="summary-card-top"><span>Trabajadores</span><span className="metric-icon metric-blue"><UsersRound size={17} /></span></div><strong>{summary?.workerCount ?? "—"}</strong><small>Personal activo</small></article>
      <article className="summary-card"><div className="summary-card-top"><span>Total registrado</span><span className="metric-icon metric-violet"><BarChart3 size={17} /></span></div><strong>{amount((summary?.expenseTotalCents ?? 0) + (summary?.perDiemTotalCents ?? 0))}</strong><small>Gastos y viáticos</small></article>
      <article className="summary-card summary-card-warm"><div className="summary-card-top"><span>Pendiente de aprobación</span><span className="metric-icon metric-orange"><Clock3 size={17} /></span></div><strong>{amount(summary?.pendingCents)}</strong><small>{summary?.pendingCount ?? 0} solicitudes por revisar</small></article>
    </div>
    <div className="content-grid dashboard-grid">
      <article className="panel-card project-overview"><div className="panel-header"><div><span className="eyebrow">VISTA POR OBRA</span><h2>Actividad financiera</h2></div><button className="text-button" onClick={() => onSelect("projects")}>Ver obras <ArrowUpRight size={14} /></button></div>
        {!dashboard?.projects.length ? <EmptyState>Aún no hay obras registradas. Crea la primera para empezar.</EmptyState> : <div className="project-bars">{dashboard.projects.map((project) => <div className="project-bar-row" key={project.id}><div className="project-bar-label"><span><b>{project.code}</b> {project.name}</span><strong>{amount(project.projectTotalCents)}</strong></div><div className="bar-track"><span style={{ width: `${Math.max(3, project.projectTotalCents / maxProject * 100)}%` }} /></div><small>{project.workers} trabajadores · {amount(project.daily_rate_cents)} por día</small></div>)}</div>}
      </article>
      <article className="panel-card spend-card"><div className="panel-header"><div><span className="eyebrow">FLUJO DE DINERO</span><h2>Estado del gasto</h2></div><span className="soft-icon"><Wallet size={16} /></span></div><div className="spend-total">{amount((summary?.expenseTotalCents ?? 0) + (summary?.perDiemTotalCents ?? 0))}</div><p className="muted-text">Monto total registrado en el sistema</p><div className="spend-breakdown"><div><i className="legend-dot dot-green" /><span>Pagado</span><b>{amount(summary?.paidCents)}</b></div><div><i className="legend-dot dot-orange" /><span>Por aprobar</span><b>{amount(summary?.pendingCents)}</b></div></div><button className="button button-quiet button-wide" onClick={() => onSelect("reports")}>Abrir reportes <ArrowUpRight size={15} /></button></article>
    </div>
    <article className="panel-card recent-card"><div className="panel-header"><div><span className="eyebrow">ÚLTIMOS MOVIMIENTOS</span><h2>Gastos recientes</h2></div><button className="button button-quiet" onClick={() => onSelect("expenses")}>Ver gastos <ArrowUpRight size={15} /></button></div>
      {!dashboard?.recent.length ? <EmptyState>No hay gastos recientes que mostrar.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Descripción</th><th>Obra</th><th>Fecha</th><th>Etapa</th><th className="align-right">Importe</th></tr></thead><tbody>{dashboard.recent.map((item) => <tr key={item.id}><td><b>{item.description}</b><small>{item.category}</small></td><td>{item.project_code}</td><td>{dateLabel(item.expense_date)}</td><td><StagePill value={item.stage} /></td><td className="align-right money-cell">{amount(item.amount_cents)}</td></tr>)}</tbody></table></div>}
    </article>
    <div className="bottom-insight"><span className="insight-icon"><BadgeCheck size={17} /></span><span><b>Todo queda registrado.</b> Los cambios de tarifa, asistencia y viáticos se guardan en la auditoría.</span><button onClick={() => onSelect("audit")}>Consultar historial <ArrowUpRight size={14} /></button></div>
  </>;
}

function ProjectDashboardPage({ dashboard, onSelect }: { dashboard: DashboardData | null; onSelect: (section: Section) => void }) {
  const project = dashboard?.projects[0];
  const summary = dashboard?.summary;
  const attendanceWeek = summary?.attendanceThisWeek;
  return <>
    <PageHeading eyebrow="ESPACIO DE OBRA" title="Tu jornada, bajo control." subtitle="Consulta el trabajo y los movimientos de la obra asignada a tu cuenta." />
    <article className="assigned-hero"><div className="assigned-hero-copy"><span className="eyebrow light">OBRA ASIGNADA</span><span className="assigned-code">{project?.code ?? "—"}</span><h2>{project?.name ?? "Tu obra"}</h2><p>{project?.location ?? "Ubicación por confirmar"} · Responsable: {project?.responsible ?? "—"}</p><span className="assigned-rate"><Wallet size={15} /> Viático diario <b>{amount(project?.daily_rate_cents)} / día</b></span></div><div className="assigned-orb"><span>{project?.code?.slice(-2) ?? "R+"}</span></div><div className="assigned-hero-actions"><button className="button button-light" onClick={() => onSelect("attendance")}><CalendarCheck2 size={15} /> Registrar asistencia</button><button className="assigned-link" onClick={() => onSelect("expenses")}>Ver movimientos <ArrowUpRight size={14} /></button></div></article>
    <div className="assigned-metrics"><article><span>Personal activo</span><strong>{summary?.workerCount ?? 0}</strong><small>En la obra</small></article><article><span>Total registrado</span><strong>{amount((summary?.expenseTotalCents ?? 0) + (summary?.perDiemTotalCents ?? 0))}</strong><small>Gastos y viáticos</small></article><article><span>Pendiente</span><strong>{amount(summary?.pendingCents)}</strong><small>{summary?.pendingCount ?? 0} movimientos</small></article><article><span>Pagado</span><strong>{amount(summary?.paidCents)}</strong><small>Acumulado</small></article></div>
    <div className="content-grid assigned-content-grid"><article className="panel-card week-progress-card"><div className="panel-header"><div><span className="eyebrow">PERSONAL EN CAMPO</span><h2>Asistencia esta semana</h2></div><span className="soft-icon"><CalendarCheck2 size={16} /></span></div><div className="attendance-totals"><div><span className="week-mark mark-present">✓</span><b>{attendanceWeek?.present ?? 0}</b><small>Asistieron</small></div><div><span className="week-mark mark-absent">×</span><b>{attendanceWeek?.absent ?? 0}</b><small>Faltaron</small></div><div><span className="week-mark mark-excused">J</span><b>{attendanceWeek?.excused ?? 0}</b><small>Justificados</small></div></div><button className="button button-quiet button-wide" onClick={() => onSelect("attendance")}>Abrir asistencia <ArrowUpRight size={14} /></button></article><article className="panel-card work-quick-card"><span className="eyebrow">ACCESOS RÁPIDOS</span><h2>Continúa tu trabajo</h2><button onClick={() => onSelect("expenses")}><span className="quick-icon quick-orange"><ReceiptText size={17} /></span><span><b>Registrar un gasto</b><small>Guarda el comprobante y detalle</small></span><ArrowUpRight size={15} /></button><button onClick={() => onSelect("per-diems")}><span className="quick-icon quick-green"><Wallet size={17} /></span><span><b>Consultar viáticos</b><small>Revisa el cálculo de la semana</small></span><ArrowUpRight size={15} /></button><button onClick={() => onSelect("support")}><span className="quick-icon quick-blue"><LifeBuoy size={17} /></span><span><b>Hablar con soporte</b><small>Envía una solicitud de ayuda</small></span><ArrowUpRight size={15} /></button></article></div>
    <article className="panel-card recent-card"><div className="panel-header"><div><span className="eyebrow">ÚLTIMOS MOVIMIENTOS</span><h2>Actividad de la obra</h2></div><button className="text-button" onClick={() => onSelect("expenses")}>Ver gastos <ArrowUpRight size={14} /></button></div>{!dashboard?.recent.length ? <EmptyState>Aún no se han registrado movimientos en esta obra.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Descripción</th><th>Fecha</th><th>Etapa</th><th className="align-right">Importe</th></tr></thead><tbody>{dashboard.recent.map((expense) => <tr key={expense.id}><td><b>{expense.description}</b></td><td>{dateLabel(expense.expense_date)}</td><td><StagePill value={expense.stage} /></td><td className="align-right money-cell">{amount(expense.amount_cents)}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

function ProjectsPage({ admin, projects, busy, submit, perform }: { admin: boolean; projects: Project[]; busy: boolean; submit: (event: FormEvent<HTMLFormElement>, operation: () => Promise<string>) => Promise<void>; perform: (operation: () => Promise<string>) => Promise<void> }) {
  const [editingRate, setEditingRate] = useState("");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const visibleProjects = projects.filter((project) => showDeleted || !project.deleted_at);
  return <>
    <PageHeading eyebrow="CONTROL DE OBRA" title="Obras" subtitle="Tarifas, responsables y ubicación de cada proyecto." action={admin ? <label className="toggle-filter"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Mostrar obras desactivadas</label> : <span className="count-chip">{projects.length} obras</span>} />
    {editingProject && <div className="modal-overlay" role="presentation"><form className="modal-card" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api(`/api/projects/${editingProject.id}`, { method: "PATCH", body: JSON.stringify({ ...body, dailyRate: Number(body.dailyRate) }) }); setEditingProject(null); return "Datos de obra actualizados."; })}><div className="modal-heading"><div><span className="eyebrow">EDITAR PROYECTO</span><h2>{editingProject.code}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setEditingProject(null)}><X size={15} /></button></div><div className="form-grid"><label>Código<input name="code" defaultValue={editingProject.code} required /></label><label>Nombre<input name="name" defaultValue={editingProject.name} required /></label><label>Responsable<input name="responsible" defaultValue={editingProject.responsible} required /></label><label>Ubicación<input name="location" defaultValue={editingProject.location} required /></label><label>Tarifa diaria (S/)<input name="dailyRate" type="number" min="0" step="0.01" defaultValue={(editingProject.daily_rate_cents / 100).toFixed(2)} required /></label><label>Estado<select name="status" defaultValue={editingProject.status}><option value="ACTIVE">Activa</option><option value="PAUSED">Pausada</option><option value="CLOSED">Cerrada</option></select></label></div><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setEditingProject(null)}>Cancelar</button><button className="button button-primary" disabled={busy}>Guardar cambios</button></div></form></div>}
    {admin && <details className="panel-card create-panel"><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Registrar nueva obra</b><small>Completa los datos del proyecto y su tarifa diaria.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/projects", { method: "POST", body: JSON.stringify({ ...body, dailyRate: Number(body.dailyRate) }) }); form.reset(); return "Obra registrada."; })}>
      <label>Código<input name="code" placeholder="OB-001" required /></label><label>Nombre de obra<input name="name" placeholder="Edificio residencial" required /></label><label>Responsable<input name="responsible" placeholder="Nombre del responsable" required /></label><label>Ubicación<input name="location" placeholder="Distrito · ciudad" required /></label><label>Tarifa diaria de viático<input name="dailyRate" type="number" min="0" step="0.01" placeholder="35.00" required /></label><button className="button button-primary form-submit" disabled={busy}>Guardar obra <ArrowUpRight size={15} /></button>
    </form></details>}
    {!visibleProjects.length ? <article className="panel-card"><EmptyState>{admin ? "Todavía no hay obras para mostrar." : "No hay una obra activa asignada a esta cuenta."}</EmptyState></article> : <div className="project-card-grid">{visibleProjects.map((project) => <article className="project-detail-card" key={project.id}><div className="project-card-head"><span className="project-code">{project.code}</span><StagePill value={project.deleted_at ? "CLOSED" : project.status} /></div><h2>{project.name}</h2><p className="project-location">{project.location}</p><div className="project-meta"><span>Responsable</span><b>{project.responsible}</b></div><div className="rate-row"><span>Tarifa diaria</span>{editingRate === project.id && !project.deleted_at ? <form className="inline-edit" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = new FormData(form); await api(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ dailyRate: Number(body.get("dailyRate")) }) }); setEditingRate(""); return "Tarifa actualizada. Los viáticos pendientes se recalcularon."; })}><span>S/</span><input name="dailyRate" type="number" defaultValue={(project.daily_rate_cents / 100).toFixed(2)} min="0" step="0.01" /><button className="icon-button" aria-label="Guardar" type="submit"><Check size={15} /></button></form> : <strong>{amount(project.daily_rate_cents)} <small>/ día</small></strong>}</div>{admin && <div className="project-actions">{project.deleted_at ? <button className="text-button" onClick={() => void perform(async () => { await api(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ action: "RESTORE" }) }); return "Obra reactivada."; })}>Reactivar</button> : <><button className="text-button" onClick={() => setEditingProject(project)}>Editar datos</button><button className="text-button" onClick={() => setEditingRate(editingRate === project.id ? "" : project.id)}>{editingRate === project.id ? "Cancelar" : "Editar tarifa"}</button><button className="text-button danger-text" onClick={() => { const reason = window.prompt("Motivo para desactivar esta obra:"); if (reason) void perform(async () => { await api(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ action: "DELETE", reason }) }); return "Obra desactivada con auditoría."; }); }}>Desactivar</button></>}</div>}</article>)}</div>}
  </>;
}

function WorkersPage({ admin, projects, workers, busy, submit, perform }: { admin: boolean; projects: Project[]; workers: Worker[]; busy: boolean; submit: (event: FormEvent<HTMLFormElement>, operation: () => Promise<string>) => Promise<void>; perform: (operation: () => Promise<string>) => Promise<void> }) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const rows = workers.filter((worker) => showDeleted || !worker.deleted_at);
  return <>
    <PageHeading eyebrow="EQUIPO DE CAMPO" title="Trabajadores" subtitle="Datos del personal, asignación y estado laboral." action={admin && <label className="toggle-filter"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Mostrar dados de baja</label>} />
    {editingWorker && <div className="modal-overlay" role="presentation"><form className="modal-card" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api(`/api/workers/${editingWorker.id}`, { method: "PATCH", body: JSON.stringify(body) }); setEditingWorker(null); return "Datos del trabajador actualizados."; })}><div className="modal-heading"><div><span className="eyebrow">EDITAR TRABAJADOR</span><h2>{editingWorker.first_name} {editingWorker.last_name}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setEditingWorker(null)}><X size={15} /></button></div><div className="form-grid"><label>Obra<select name="projectId" defaultValue={editingWorker.project_id}>{projects.filter((project) => !project.deleted_at).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label><label>DNI<input name="dni" defaultValue={editingWorker.dni} maxLength={8} required /></label><label>Nombres<input name="firstName" defaultValue={editingWorker.first_name} required /></label><label>Apellidos<input name="lastName" defaultValue={editingWorker.last_name} required /></label><label>Cargo<input name="jobTitle" defaultValue={editingWorker.job_title} required /></label><label>Teléfono<input name="phone" defaultValue={editingWorker.phone} required /></label><label>Correo<input name="email" type="email" defaultValue={editingWorker.email} required /></label><label>Ingreso<input name="hiredOn" type="date" defaultValue={editingWorker.hired_on.slice(0, 10)} required /></label><label>Estado<select name="status" defaultValue={editingWorker.status}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label><label className="span-two">Dirección<input name="address" defaultValue={editingWorker.address} required /></label></div><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setEditingWorker(null)}>Cancelar</button><button className="button button-primary" disabled={busy}>Guardar cambios</button></div></form></div>}
    {admin && <details className="panel-card create-panel"><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Agregar trabajador</b><small>El DNI, correo y teléfono deben ser únicos.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/workers", { method: "POST", body: JSON.stringify(body) }); form.reset(); return "Trabajador agregado."; })}>
      <label>Obra<select name="projectId" required defaultValue="">{projects.filter((project) => !project.deleted_at && project.status === "ACTIVE").map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label><label>DNI<input name="dni" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required placeholder="12345678" /></label><label>Nombres<input name="firstName" required /></label><label>Apellidos<input name="lastName" required /></label><label>Cargo<input name="jobTitle" required placeholder="Operario" /></label><label>Teléfono<input name="phone" required /></label><label>Correo electrónico<input name="email" type="email" required /></label><label>Fecha de ingreso<input name="hiredOn" type="date" required /></label><label className="span-two">Dirección<input name="address" required /></label><button className="button button-primary form-submit" disabled={busy}>Guardar trabajador <ArrowUpRight size={15} /></button>
    </form></details>}
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">PADRÓN ACTUAL</span><h2>Personal por obra</h2></div><span className="count-chip">{rows.length} registros</span></div>{!rows.length ? <EmptyState>No hay trabajadores para mostrar.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Trabajador</th><th>DNI</th><th>Obra</th><th>Cargo</th><th>Contacto</th><th>Estado</th>{admin && <th />}</tr></thead><tbody>{rows.map((worker) => <tr key={worker.id}><td><b>{worker.first_name} {worker.last_name}</b><small>Ingreso {dateLabel(worker.hired_on)}</small></td><td>{worker.dni}</td><td>{projects.find((project) => project.id === worker.project_id)?.code ?? "—"}</td><td>{worker.job_title}</td><td><span>{worker.phone}</span><small>{worker.email}</small></td><td><StagePill value={worker.deleted_at ? "CLOSED" : worker.status} /></td>{admin && <td className="align-right">{worker.deleted_at ? <button className="text-button" onClick={() => void perform(async () => { await api(`/api/workers/${worker.id}`, { method: "PATCH", body: JSON.stringify({ action: "RESTORE" }) }); return "Trabajador restaurado."; })}>Restaurar</button> : <><button className="text-button" onClick={() => setEditingWorker(worker)}>Editar</button><button className="text-button danger-text" onClick={() => { const reason = window.prompt("Motivo para dar de baja al trabajador:"); if (reason) void perform(async () => { await api(`/api/workers/${worker.id}`, { method: "PATCH", body: JSON.stringify({ action: "DELETE", reason }) }); return "Trabajador dado de baja. Puedes restaurarlo desde el padrón."; }); }}>Dar de baja</button></>}</td>}</tr>)}</tbody></table></div>}</article>
  </>;
}

function SummaryStrip({ title, summary }: { title: string; summary: { present: number; absent: number; excused: number } }) {
  return <article className="summary-strip"><span className="eyebrow">{title}</span><div><span><i className="legend-dot dot-green" />Asistencias <b>{summary.present}</b></span><span><i className="legend-dot dot-red" />Faltas <b>{summary.absent}</b></span><span><i className="legend-dot dot-blue" />Justificadas <b>{summary.excused}</b></span></div></article>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AttendancePage({ projects, workers, rows, admin, month, setMonth, busy, submit, perform }: { projects: Project[]; workers: Worker[]; rows: Attendance[]; admin: boolean; month: string; setMonth: (value: string) => void; busy: boolean; submit: (event: FormEvent<HTMLFormElement>, operation: () => Promise<string>) => Promise<void>; perform: (operation: () => Promise<string>) => Promise<void> }) {
  const defaultProject = projects[0]?.id ?? "";
  const [projectFilterState, setProjectFilter] = useState("__default__");
  const projectFilter = projectFilterState === "__default__" ? (admin ? "" : defaultProject) : projectFilterState;
  const [selectedWeek, setSelectedWeek] = useState(mondayNow());
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(selectedWeek, index));
  const weekRows = filteredRowsForWeek(rows, projectFilter, selectedWeek);
  const filteredWorkers = workers.filter((worker) => !projectFilter || worker.project_id === projectFilter);
  const filteredRows = rows.filter((row) => !projectFilter || row.project_id === projectFilter);
  const summary = useMemo(() => ({ present: filteredRows.filter((row) => row.status === "PRESENT").length, absent: filteredRows.filter((row) => row.status === "ABSENT").length, excused: filteredRows.filter((row) => row.status === "EXCUSED").length }), [filteredRows]);
  const weeklySummary = useMemo(() => ({ present: weekRows.filter((row) => row.status === "PRESENT").length, absent: weekRows.filter((row) => row.status === "ABSENT").length, excused: weekRows.filter((row) => row.status === "EXCUSED").length }), [weekRows]);
  const attendanceByDay = useMemo(() => new Map(weekRows.map((row) => [`${row.worker_id}:${row.work_date.slice(0, 10)}`, row])), [weekRows]);
  return <>
    <PageHeading eyebrow="REGISTRO DIARIO" title="Asistencia" subtitle="Días trabajados, faltas y justificaciones con fecha y responsable." action={<div className="period-control"><input className="period-select" type="month" aria-label="Mes" value={month} onChange={(event) => { setMonth(event.target.value); setSelectedWeek(mondayFor(`${event.target.value}-01`)); }} /><select className="period-select" aria-label="Filtrar por obra" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>{admin && <option value="">Todas las obras</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.code}</option>)}</select></div>} />
    <div className="attendance-summary-grid"><SummaryStrip title="RESUMEN MENSUAL" summary={summary} /><SummaryStrip title="RESUMEN SEMANAL" summary={weeklySummary} /></div>
    <article className="panel-card weekly-card"><div className="panel-header"><div><span className="eyebrow">DÍAS ESPECÍFICOS</span><h2>Vista semanal de asistencia</h2></div><label className="week-picker">Semana desde<input type="date" value={selectedWeek} onChange={(event) => setSelectedWeek(mondayFor(event.target.value))} /></label></div>{!filteredWorkers.length ? <EmptyState>Agrega trabajadores activos para ver la semana.</EmptyState> : <div className="table-scroll"><table className="week-table"><thead><tr><th>Trabajador</th>{weekDays.map((day, index) => <th key={day}><span>{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][index]}</span><small>{day.slice(-2)}</small></th>)}</tr></thead><tbody>{filteredWorkers.map((worker) => <tr key={worker.id}><td><b>{worker.first_name} {worker.last_name}</b><small>{worker.dni} · {projects.find((project) => project.id === worker.project_id)?.code ?? ""}</small></td>{weekDays.map((day) => { const record = attendanceByDay.get(`${worker.id}:${day}`); return <td key={day}><span className={`attendance-mark ${record ? `mark-${record.status.toLowerCase()}` : "mark-empty"}`} title={record ? `${day}: ${stageLabel(record.status)}` : `${day}: Sin registro`} aria-label={record ? `${day}: ${stageLabel(record.status)}` : `${day}: Sin registro`}>{record?.status === "PRESENT" ? "✓" : record?.status === "ABSENT" ? "×" : record?.status === "EXCUSED" ? "J" : "·"}</span></td>; })}</tr>)}</tbody></table><div className="attendance-legend"><span><i className="legend-dot dot-green" />Asistió</span><span><i className="legend-dot dot-red" />Faltó</span><span><i className="legend-dot dot-blue" />Justificado</span><span><i className="legend-dot dot-muted" />Sin registro</span></div></div>}</article>
    <details className="panel-card create-panel"><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Registrar día trabajado</b><small>Una sola asistencia por persona y fecha.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/attendance", { method: "POST", body: JSON.stringify(body) }); form.reset(); return "Asistencia registrada; los viáticos pendientes se recalcularon."; })}>
      <label>Trabajador<select name="workerId" required defaultValue="">{filteredWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.first_name} {worker.last_name} · {worker.dni}</option>)}</select></label><label>Fecha<input name="workDate" type="date" required max={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date())} /></label><label>Estado<select name="status" defaultValue="PRESENT"><option value="PRESENT">Asistió</option><option value="ABSENT">Faltó</option><option value="EXCUSED">Justificado</option></select></label><label>Nota breve<input name="note" maxLength={300} placeholder="Opcional" /></label><button className="button button-primary form-submit" disabled={busy}>Guardar asistencia</button>
    </form></details>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">DETALLE DEL MES</span><h2>Días registrados</h2></div><span className="count-chip">{filteredRows.length} registros</span></div>{!filteredRows.length ? <EmptyState>No hay asistencias registradas para este mes.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Trabajador</th><th>DNI</th><th>Obra</th><th>Estado</th><th>Nota</th><th>Registró</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id}><td>{dateLabel(row.work_date)}</td><td><b>{row.first_name} {row.last_name}</b></td><td>{row.dni}</td><td>{row.project_code}</td><td><select className="stage-select" aria-label="Cambiar estado" value={row.status} onChange={(event) => { const status = event.target.value; void perform(async () => { await api(`/api/attendance/${row.id}`, { method: "PATCH", body: JSON.stringify({ status, note: row.note ?? "" }) }); return "Asistencia actualizada y viático recalculado."; }); }}><option value="PRESENT">Asistió</option><option value="ABSENT">Faltó</option><option value="EXCUSED">Justificado</option></select></td><td>{row.note || "—"}</td><td>{row.recorded_by || "—"}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PerDiemPage({ projects, rows, admin, weekStart, setWeekStart, busy, perform }: { projects: Project[]; rows: PerDiem[]; admin: boolean; weekStart: string; setWeekStart: (value: string) => void; busy: boolean; perform: (operation: () => Promise<string>) => Promise<void> }) {
  const [projectIdState, setProjectId] = useState("__default__");
  const projectId = projectIdState === "__default__" ? (projects[0]?.id ?? "") : projectIdState;
  const selected = projects.find((project) => project.id === projectId);
  return <>
    <PageHeading eyebrow="CÁLCULO POR ASISTENCIA" title="Viáticos" subtitle="Cálculo automático: días asistidos multiplicados por la tarifa diaria de la obra." action={<div className="period-control"><input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} aria-label="Lunes de la semana" /><select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Obra">{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></div>} />
    <div className="calculation-banner"><span className="calculation-icon"><Wallet size={19} /></span><div><b>Tarifa de {selected?.code ?? "la obra"}: {amount(selected?.daily_rate_cents)} por día</b><small>Solo asistencia marcada como “Asistió” genera viático. El importe lo calcula el servidor.</small></div><button className="button button-primary" disabled={busy || !projectId} onClick={() => void perform(async () => { await api("/api/per-diems", { method: "POST", body: JSON.stringify({ projectId, weekStart }) }); return "Viáticos calculados con la asistencia y tarifa vigentes."; })}>Calcular semana <ArrowUpRight size={15} /></button></div>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">SEMANA DESDE {dateLabel(weekStart).toUpperCase()}</span><h2>Liquidación semanal</h2></div><span className="count-chip">{rows.filter((row) => row.week_start === weekStart).length} personas</span></div>{!rows.filter((row) => row.week_start === weekStart).length ? <EmptyState>No hay viáticos calculados para esta semana.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Trabajador</th><th>Obra</th><th>Días asistidos</th><th>Tarifa diaria</th><th>Etapa</th><th className="align-right">Total</th>{admin && <th />}</tr></thead><tbody>{rows.filter((row) => row.week_start === weekStart && (!projectId || row.project_id === projectId)).map((row) => <tr key={row.id}><td><b>{row.first_name} {row.last_name}</b><small>DNI {row.dni}</small></td><td>{row.project_code}</td><td>{row.days_attended} días</td><td>{amount(row.daily_rate_cents)}</td><td><StagePill value={row.stage} /></td><td className="align-right money-cell">{amount(row.total_cents)}</td>{admin && <td className="align-right">{row.stage === "PENDING" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/per-diems/${row.id}`, { method: "PATCH", body: JSON.stringify({ stage: "APPROVED" }) }); return "Viático aprobado."; })}>Aprobar</button>}{row.stage === "APPROVED" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/per-diems/${row.id}`, { method: "PATCH", body: JSON.stringify({ stage: "PAID" }) }); return "Pago registrado."; })}>Marcar pagado</button>}{row.stage !== "PENDING" && <button className="text-button" onClick={() => { const reason = window.prompt("Motivo para reabrir el viático y corregirlo:"); if (reason) void perform(async () => { await api(`/api/per-diems/${row.id}`, { method: "PATCH", body: JSON.stringify({ stage: "PENDING", reason }) }); return "Viático reabierto con motivo registrado."; }); }}>Reabrir</button>}</td>}</tr>)}</tbody></table></div>}</article>
  </>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ExpensesPage({ projects, rows, admin, busy, submit, perform }: { projects: Project[]; rows: Expense[]; admin: boolean; busy: boolean; submit: (event: FormEvent<HTMLFormElement>, operation: () => Promise<string>) => Promise<void>; perform: (operation: () => Promise<string>) => Promise<void> }) {
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  return <>
    <PageHeading eyebrow="CONTROL FINANCIERO" title="Gastos" subtitle="Registra desembolsos por obra y sigue su aprobación hasta el pago." action={<span className="count-chip">{rows.length} registros</span>} />
    {editingExpense && <div className="modal-overlay" role="presentation"><form className="modal-card" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api(`/api/expenses/${editingExpense.id}`, { method: "PATCH", body: JSON.stringify({ ...body, action: "UPDATE", amount: Number(body.amount) }) }); setEditingExpense(null); return "Gasto corregido y registrado en auditoría."; })}><div className="modal-heading"><div><span className="eyebrow">CORREGIR GASTO PENDIENTE</span><h2>{editingExpense.project_code} · {amount(editingExpense.amount_cents)}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setEditingExpense(null)}><X size={15} /></button></div><div className="form-grid"><label>Fecha<input name="expenseDate" type="date" defaultValue={editingExpense.expense_date.slice(0, 10)} required /></label><label>Categoría<input name="category" defaultValue={editingExpense.category} required /></label><label>Importe (S/)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={(editingExpense.amount_cents / 100).toFixed(2)} required /></label><label className="span-two">Descripción<input name="description" defaultValue={editingExpense.description} required /></label><label>Proveedor<input name="supplier" defaultValue={editingExpense.supplier ?? ""} /></label><label>Número de comprobante<input name="receiptNumber" defaultValue={editingExpense.receipt_number ?? ""} /></label></div><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setEditingExpense(null)}>Cancelar</button><button className="button button-primary" disabled={busy}>Guardar corrección</button></div></form></div>}
    <details className="panel-card create-panel"><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Registrar gasto</b><small>El gasto se crea en etapa pendiente y se audita.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/expenses", { method: "POST", body: JSON.stringify({ ...body, amount: Number(body.amount) }) }); form.reset(); return "Gasto registrado como pendiente."; })}>
      <label>Obra<select name="projectId" required defaultValue="">{projects.filter((project) => !project.deleted_at && project.status === "ACTIVE").map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label><label>Fecha<input name="expenseDate" type="date" required /></label><label>Categoría<input name="category" required placeholder="Materiales" /></label><label>Importe (S/)<input name="amount" type="number" step="0.01" min="0.01" required /></label><label className="span-two">Descripción<input name="description" required placeholder="Detalle del gasto" /></label><label>Proveedor<input name="supplier" /></label><label>Número de comprobante<input name="receiptNumber" /></label><button className="button button-primary form-submit" disabled={busy}>Guardar gasto</button>
    </form></details>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">MOVIMIENTOS DEL MES</span><h2>Registro de gastos</h2></div></div>{!rows.length ? <EmptyState>No hay gastos registrados para este mes.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Descripción</th><th>Obra</th><th>Fecha</th><th>Proveedor</th><th>Etapa</th><th className="align-right">Importe</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.description}</b><small>{row.category}{row.receipt_number ? ` · ${row.receipt_number}` : ""}</small></td><td>{row.project_code}</td><td>{dateLabel(row.expense_date)}</td><td>{row.supplier || "—"}</td><td><StagePill value={row.stage} /></td><td className="align-right money-cell">{amount(row.amount_cents)}</td><td className="align-right">{row.stage === "PENDING" && <><button className="text-button" onClick={() => setEditingExpense(row)}>Editar</button>{admin && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/expenses/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "STAGE", stage: "APPROVED" }) }); return "Gasto aprobado."; })}>Aprobar</button>}</>}{admin && row.stage === "APPROVED" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/expenses/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "STAGE", stage: "PAID" }) }); return "Pago registrado."; })}>Marcar pagado</button>}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function UsersPage({ projects, rows, busy, submit, perform }: { projects: Project[]; rows: ManagedUser[]; busy: boolean; submit: (event: FormEvent<HTMLFormElement>, operation: () => Promise<string>) => Promise<void>; perform: (operation: () => Promise<string>) => Promise<void> }) {
  return <>
    <PageHeading eyebrow="ACCESO Y PERMISOS" title="Cuentas" subtitle="Cada cuenta de obra queda vinculada a un solo proyecto." />
    <div className="role-note"><ShieldCheck size={18} /><span><b>Acceso segmentado por obra.</b> Una cuenta de proyecto no puede consultar ni modificar datos de otras obras; la cuenta administradora conserva la vista global.</span></div>
    <details className="panel-card create-panel" open><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Crear cuenta de obra</b><small>La contraseña debe tener al menos 14 caracteres.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/users", { method: "POST", body: JSON.stringify(body) }); form.reset(); return "Cuenta de obra creada."; })}><label>Nombre<input name="name" required /></label><label>Correo<input name="email" type="email" required /></label><label>Contraseña inicial<input name="password" type="password" minLength={14} required autoComplete="new-password" /></label><label>Obra asignada<select name="projectId" required defaultValue="">{projects.filter((project) => !project.deleted_at && project.status === "ACTIVE").map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label><button className="button button-primary form-submit" disabled={busy}>Crear cuenta</button></form></details>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">CUENTAS REGISTRADAS</span><h2>Usuarios del sistema</h2></div><span className="count-chip">{rows.length} cuentas</span></div>{!rows.length ? <EmptyState>No hay cuentas vinculadas a obras.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Obra</th><th>Permisos</th><th>Estado</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.name}</b></td><td>{row.email}</td><td>{row.project_code ?? "Acceso global"}</td><td>{row.role === "ADMIN" ? "Administración" : "Una obra"}</td><td><StagePill value={row.active ? "ACTIVE" : "CLOSED"} /></td><td className="align-right">{row.role !== "ADMIN" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/users/${row.id}`, { method: "PATCH", body: JSON.stringify({ active: !row.active }) }); return row.active ? "Cuenta desactivada y sesiones cerradas." : "Cuenta reactivada."; })}>{row.active ? "Desactivar" : "Reactivar"}</button>}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReportsPage({ month, setMonth }: { month: string; setMonth: (value: string) => void }) {
  return <>
    <PageHeading eyebrow="ANÁLISIS FINANCIERO" title="Reportes" subtitle="Consulta el gasto total y descarga el detalle en PDF." />
    <article className="report-hero"><div className="report-hero-orb" /><div className="report-hero-content"><span className="eyebrow light">INFORME MENSUAL</span><h2>Todos los movimientos,<br />en un solo reporte.</h2><p>Incluye gastos, viáticos, obra, fecha, etapa e importe.</p><div className="report-controls"><label>Periodo<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><a className="button button-light" href={`/api/reports/pdf?month=${month}`}><ArrowDownToLine size={16} /> Descargar PDF</a></div></div><div className="report-document"><span className="document-line long" /><span className="document-line medium" /><span className="document-highlight" /><span className="document-line" /><span className="document-line short" /><span className="document-chart"><i /><i /><i /><i /><i /></span></div></article>
    <div className="report-footnote"><CircleAlert size={16} /><span>Los importes se calculan en el servidor y se agrupan por la fecha del gasto o inicio de semana del viático. El PDF respeta el acceso global o la obra asignada a tu cuenta.</span></div>
  </>;
}

function AuditPage({ rows }: { rows: Audit[] }) {
  return <>
    <PageHeading eyebrow="TRAZABILIDAD" title="Auditoría" subtitle="Acciones, usuario, fecha, motivo y valores antes/después." action={<span className="count-chip">Últimos {rows.length}</span>} />
    <article className="panel-card table-card">{!rows.length ? <EmptyState>El historial aparecerá aquí cuando se registren cambios.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Elemento</th><th>Usuario</th><th>Obra</th><th>Cambios</th><th>Motivo</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}</td><td><StagePill value={row.action} /></td><td>{row.entity_type}</td><td>{row.actor_name ?? "Cuenta desactivada"}</td><td>{row.project_code ?? "Global"}</td><td><details className="audit-details"><summary>Ver valores</summary><pre>{JSON.stringify({ anterior: row.before_data, nuevo: row.after_data }, null, 2)}</pre></details></td><td>{row.reason || "—"}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

function SupportPage({ rows, admin, busy, submit, perform, ticketResult, setTicketResult }: { rows: Ticket[]; admin: boolean; busy: boolean; submit: (event: FormEvent<HTMLFormElement>, operation: () => Promise<string>) => Promise<void>; perform: (operation: () => Promise<string>) => Promise<void>; ticketResult: string; setTicketResult: (value: string) => void }) {
  return <>
    <PageHeading eyebrow="AYUDA Y ACOMPAÑAMIENTO" title="Soporte" subtitle="Cuéntanos qué sucede. El equipo recibirá tu ticket y un código de seguimiento." />
    <div className="support-layout"><article className="panel-card support-form-card"><div className="panel-header"><div><span className="eyebrow">NUEVA SOLICITUD</span><h2>¿En qué podemos ayudarte?</h2></div><span className="soft-icon"><LifeBuoy size={17} /></span></div><form className="form-stack" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); const result = await api<{ ticket: { ticket_code: string; mail_status: string } }>("/api/support", { method: "POST", body: JSON.stringify(body) }); form.reset(); setTicketResult(`${result.ticket.ticket_code} · ${result.ticket.mail_status === "SENT" ? "notificación enviada" : "solicitud guardada"}`); return "Solicitud de soporte registrada."; })}><label>Nombre<input name="name" required maxLength={120} /></label><label>Correo electrónico<input type="email" name="email" required maxLength={254} /></label><label>Asunto<input name="subject" required minLength={4} maxLength={140} /></label><label>Mensaje<textarea name="message" required minLength={10} maxLength={4000} rows={5} placeholder="Describe brevemente lo que necesitas…" /></label><label className="honeypot" aria-hidden="true">Empresa<input name="_company" tabIndex={-1} autoComplete="off" /></label><button className="button button-primary" disabled={busy}>Enviar solicitud <ArrowUpRight size={15} /></button></form>{ticketResult && <p className="ticket-result"><Check size={15} /> Código: {ticketResult}</p>}<p className="support-privacy"><ShieldCheck size={14} /> Tus datos se guardan solo para dar seguimiento a esta solicitud.</p></article>
      <article className="panel-card ticket-list-card"><div className="panel-header"><div><span className="eyebrow">SEGUIMIENTO</span><h2>{admin ? "Tickets recibidos" : "Tus solicitudes"}</h2></div><span className="count-chip">{rows.length}</span></div>{!rows.length ? <EmptyState>Todavía no hay tickets.</EmptyState> : <div className="ticket-list">{rows.map((ticket) => <div className="ticket-row" key={ticket.id}><div className="ticket-code-row"><b>{ticket.ticket_code}</b><StagePill value={ticket.status} /></div><strong>{ticket.subject}</strong><p>{ticket.message}</p><small>{ticket.name} · {dateLabel(ticket.created_at)} · {ticket.mail_status === "SENT" ? "correo enviado" : ticket.mail_status === "FAILED" ? "correo pendiente de envío" : "guardado en el sistema"}</small>{admin && <select className="stage-select ticket-status-select" value={ticket.status} aria-label={`Estado ${ticket.ticket_code}`} onChange={(event) => void perform(async () => { await api("/api/support", { method: "PATCH", body: JSON.stringify({ id: ticket.id, status: event.target.value }) }); return "Estado del ticket actualizado."; })}><option value="PENDING">Pendiente</option><option value="REVIEW">En revisión</option><option value="RESOLVED">Resuelto</option><option value="CLOSED">Cerrado</option></select>}</div>)}</div>}</article></div>
  </>;
}

type SubmitHandler = (event: FormEvent<HTMLFormElement>, operation: () => Promise<string>) => Promise<void>;
type PerformHandler = (operation: () => Promise<string>) => Promise<void>;

function WeeklyAttendancePage({ projects, workers, rows, admin, weekStart, setWeekStart, busy, submit, perform }: { projects: Project[]; workers: Worker[]; rows: Attendance[]; admin: boolean; weekStart: string; setWeekStart: (value: string) => void; busy: boolean; submit: SubmitHandler; perform: PerformHandler }) {
  const [projectId, setProjectId] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const activeProjects = projects.filter((project) => !project.deleted_at && project.status === "ACTIVE");
  const selectedProject = projectId || (admin ? "" : activeProjects[0]?.id ?? "");
  const activeWorkers = workers.filter((worker) => !worker.deleted_at && worker.status === "ACTIVE" && (!selectedProject || worker.project_id === selectedProject));
  const visibleRows = rows.filter((row) => (showDeleted || !row.deleted_at) && (!selectedProject || row.project_id === selectedProject));
  const activeRows = visibleRows.filter((row) => !row.deleted_at);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const matrix = new Map(activeRows.map((row) => [`${row.worker_id}:${String(row.work_date).slice(0, 10)}`, row]));
  const summary = { present: activeRows.filter((row) => row.status === "PRESENT").length, absent: activeRows.filter((row) => row.status === "ABSENT").length, excused: activeRows.filter((row) => row.status === "EXCUSED").length };
  return <>
    <PageHeading eyebrow="REGISTRO SEMANAL" title="Asistencia" subtitle={`Semana del ${dateLabel(weekStart)} al ${dateLabel(addDays(weekStart, 6))}. Cada cambio recalcula los viáticos pendientes.`} action={<div className="period-control"><input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} aria-label="Lunes de la semana" /><select value={selectedProject} onChange={(event) => setProjectId(event.target.value)}>{admin && <option value="">Todas las obras</option>}{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></div>} />
    <div className="attendance-summary-grid"><SummaryStrip title="RESUMEN DE LA SEMANA" summary={summary} /><article className="summary-strip"><span className="eyebrow">CONTROL DE REGISTROS</span><div><span>Personas <b>{activeWorkers.length}</b></span><span>Registros <b>{activeRows.length}</b></span>{admin && <label className="toggle-filter"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Ver eliminados</label>}</div></article></div>
    <article className="panel-card weekly-card"><div className="panel-header"><div><span className="eyebrow">MATRIZ DE LA SEMANA</span><h2>Asistencia por día</h2></div></div>{!activeWorkers.length ? <EmptyState>No hay trabajadores activos en la obra seleccionada.</EmptyState> : <div className="table-scroll"><table className="week-table"><thead><tr><th>Trabajador</th>{weekDays.map((day, index) => <th key={day}><span>{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][index]}</span><small>{day.slice(-2)}</small></th>)}</tr></thead><tbody>{activeWorkers.map((worker) => <tr key={worker.id}><td><b>{worker.first_name} {worker.last_name}</b><small>{worker.dni} · {projects.find((project) => project.id === worker.project_id)?.code ?? ""}</small></td>{weekDays.map((day) => { const record = matrix.get(`${worker.id}:${day}`); return <td key={day}><span className={`attendance-mark ${record ? `mark-${record.status.toLowerCase()}` : "mark-empty"}`} title={record ? stageLabel(record.status) : "Sin registro"}>{record?.status === "PRESENT" ? "✓" : record?.status === "ABSENT" ? "×" : record?.status === "EXCUSED" ? "J" : "·"}</span></td>; })}</tr>)}</tbody></table></div>}</article>
    <details className="panel-card create-panel" open><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Registrar asistencia</b><small>Solo se puede registrar una vez por trabajador y fecha.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/attendance", { method: "POST", body: JSON.stringify(body) }); form.reset(); return "Asistencia guardada y viático pendiente recalculado."; })}><label>Trabajador<select name="workerId" required defaultValue="">{activeWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.first_name} {worker.last_name} · {worker.dni}</option>)}</select></label><label>Fecha<input name="workDate" type="date" min={weekStart} max={addDays(weekStart, 6)} required /></label><label>Estado<select name="status" defaultValue="PRESENT"><option value="PRESENT">Asistió</option><option value="ABSENT">Faltó</option><option value="EXCUSED">Justificado</option></select></label><label className="span-two">Nota<input name="note" maxLength={300} placeholder="Opcional" /></label><button className="button button-primary form-submit" disabled={busy}>Guardar asistencia</button></form></details>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">DETALLE SEMANAL</span><h2>Registros de asistencia</h2></div><span className="count-chip">{visibleRows.length} registros</span></div>{!visibleRows.length ? <EmptyState>No hay asistencias para esta semana.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Trabajador</th><th>Obra</th><th>Estado</th><th>Registró</th><th /></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className={row.deleted_at ? "row-muted" : ""}><td>{dateLabel(row.work_date)}</td><td><b>{row.first_name} {row.last_name}</b><small>{row.dni}</small></td><td>{row.project_code}</td><td>{row.deleted_at ? <StagePill value="CLOSED" /> : <select className="stage-select" value={row.status} onChange={(event) => { const status = event.target.value; void perform(async () => { await api(`/api/attendance/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "UPDATE", status, note: row.note ?? "" }) }); return "Asistencia actualizada y viático recalculado."; }); }}><option value="PRESENT">Asistió</option><option value="ABSENT">Faltó</option><option value="EXCUSED">Justificado</option></select>}</td><td>{row.recorded_by ?? "—"}</td><td className="align-right">{row.deleted_at ? admin && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/attendance/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "RESTORE" }) }); return "Asistencia restaurada y viático recalculado."; })}><Undo2 size={14} /> Restaurar</button> : <button className="text-button danger-text" onClick={() => { const reason = window.prompt("Motivo para eliminar esta asistencia:"); if (reason) void perform(async () => { await api(`/api/attendance/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "DELETE", reason }) }); return "Asistencia eliminada con auditoría."; }); }}><Trash2 size={14} /> Eliminar</button>}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

function WeeklyPerDiemPage({ projects, rows, admin, weekStart, setWeekStart, busy, perform }: { projects: Project[]; rows: PerDiem[]; admin: boolean; weekStart: string; setWeekStart: (value: string) => void; busy: boolean; perform: PerformHandler }) {
  const [projectIdState, setProjectId] = useState("__default__");
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);
  const activeProjects = projects.filter((project) => !project.deleted_at && project.status === "ACTIVE");
  const projectId = projectIdState === "__default__" ? (admin ? "" : activeProjects[0]?.id ?? "") : projectIdState;
  const selected = activeProjects.find((project) => project.id === projectId);
  const shownRows = rows.filter((row) => (!projectId || row.project_id === projectId) && String(row.week_start).slice(0, 10) === weekStart);
  const days = shownRows.reduce((sum, row) => sum + Number(row.days_attended), 0);
  const total = shownRows.reduce((sum, row) => sum + Number(row.total_cents), 0);
  const pending = shownRows.filter((row) => row.stage === "PENDING").reduce((sum, row) => sum + Number(row.total_cents), 0);
  return <>
    {evidenceTarget && <EvidenceDialog target={evidenceTarget} busy={busy} perform={perform} onClose={() => setEvidenceTarget(null)} />}
    <PageHeading eyebrow="LIQUIDACIÓN SEMANAL" title="Viáticos" subtitle="El servidor calcula cada importe con asistencia marcada como asistió y la tarifa vigente de la obra." action={<div className="period-control"><input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /><select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{admin && <option value="">Todas las obras</option>}{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></div>} />
    <div className="calculation-banner"><span className="calculation-icon"><Wallet size={19} /></span><div><b>{selected ? `Tarifa de ${selected.code}: ${amount(selected.daily_rate_cents)} por día` : "Cálculo por obra"}</b><small>Fórmula visible por trabajador: días asistidos × tarifa diaria = viático semanal.</small></div><button className="button button-primary" disabled={busy || !projectId} onClick={() => void perform(async () => { await api("/api/per-diems", { method: "POST", body: JSON.stringify({ projectId, weekStart }) }); return "Viáticos calculados con asistencia de la semana."; })}>Calcular semana <ArrowUpRight size={15} /></button></div>
    <div className="mini-stats"><div><span>Personas</span><b>{shownRows.length}</b></div><div><span>Días asistidos</span><b>{days}</b></div><div><span>Total calculado</span><b>{amount(total)}</b></div><div><span>Pendiente</span><b>{amount(pending)}</b></div></div>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">SEMANA DEL {dateLabel(weekStart).toUpperCase()}</span><h2>Detalle de cálculo</h2></div></div>{!shownRows.length ? <EmptyState>No hay viáticos calculados para esta semana.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Trabajador</th><th>Obra</th><th>Cálculo</th><th>Etapa</th><th className="align-right">Total</th>{admin && <th />}</tr></thead><tbody>{shownRows.map((row) => <tr key={row.id}><td><b>{row.first_name} {row.last_name}</b><small>DNI {row.dni}</small></td><td>{row.project_code}</td><td><b>{row.days_attended} días</b><small>{row.days_attended} × {amount(row.daily_rate_cents)} = {amount(row.total_cents)}</small></td><td><StagePill value={row.stage} /></td><td className="align-right money-cell">{amount(row.total_cents)}</td>{admin && <td className="align-right">{row.stage === "PENDING" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/per-diems/${row.id}`, { method: "PATCH", body: JSON.stringify({ stage: "APPROVED" }) }); return "Viático aprobado."; })}>Aprobar</button>}{row.stage === "APPROVED" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/per-diems/${row.id}`, { method: "PATCH", body: JSON.stringify({ stage: "PAID" }) }); return "Pago registrado."; })}>Marcar pagado</button>}{row.stage === "PAID" && (row.evidence_id ? <a className="text-button" href={`/api/evidences/${row.evidence_id}`} target="_blank" rel="noreferrer">Ver archivo</a> : <button className="text-button" onClick={() => setEvidenceTarget({ entityType: "PER_DIEM", entityId: row.id, projectCode: row.project_code, description: "Constancia de pago de " + row.first_name + " " + row.last_name, amountCents: row.total_cents, date: row.week_start })}>Adjuntar archivo</button>)}{row.stage !== "PENDING" && <button className="text-button" onClick={() => { const reason = window.prompt("Motivo para reabrir el viático:"); if (reason) void perform(async () => { await api(`/api/per-diems/${row.id}`, { method: "PATCH", body: JSON.stringify({ stage: "PENDING", reason }) }); return "Viático reabierto con motivo registrado."; }); }}>Reabrir</button>}</td>}</tr>)}</tbody></table></div>}</article>
  </>;
}

function WeeklyExpensesPage({ projects, rows, admin, weekStart, setWeekStart, busy, submit, perform }: { projects: Project[]; rows: Expense[]; admin: boolean; weekStart: string; setWeekStart: (value: string) => void; busy: boolean; submit: SubmitHandler; perform: PerformHandler }) {
  const [editing, setEditing] = useState<{ expense: Expense; invoiceOnly: boolean } | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [projectId, setProjectId] = useState("");
  const activeProjects = projects.filter((project) => !project.deleted_at && project.status === "ACTIVE");
  const selectedProject = projectId || (admin ? "" : activeProjects[0]?.id ?? "");
  const visibleRows = rows.filter((row) => (showDeleted || !row.deleted_at) && (!selectedProject || row.project_id === selectedProject));
  return <>
    {evidenceTarget && <EvidenceDialog target={evidenceTarget} busy={busy} perform={perform} onClose={() => setEvidenceTarget(null)} />}
    <PageHeading eyebrow="CONTROL FINANCIERO SEMANAL" title="Gastos" subtitle="Registra gastos semanales, su fuente de pago y el comprobante para impuestos." action={<div className="period-control"><input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /><select value={selectedProject} onChange={(event) => setProjectId(event.target.value)}>{admin && <option value="">Todas las obras</option>}{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.code}</option>)}</select></div>} />
    {admin && <label className="toggle-filter"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Mostrar gastos eliminados</label>}
    {editing && <div className="modal-overlay" role="presentation"><form className="modal-card" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); if (editing.invoiceOnly) { await api(`/api/expenses/${editing.expense.id}`, { method: "PATCH", body: JSON.stringify({ action: "INVOICE", invoiceStatus: "HECHO", supplier: body.supplier, receiptNumber: body.receiptNumber }) }); } else { await api(`/api/expenses/${editing.expense.id}`, { method: "PATCH", body: JSON.stringify({ action: "UPDATE", expenseDate: body.expenseDate, category: body.category, description: body.description, supplier: body.supplier, receiptNumber: body.receiptNumber, amount: Number(body.amount), paymentSource: body.paymentSource }) }); } setEditing(null); return editing.invoiceOnly ? "Factura marcada como hecha y disponible para control tributario." : "Gasto corregido y registrado en auditoría."; })}><div className="modal-heading"><div><span className="eyebrow">{editing.invoiceOnly ? "REGISTRAR FACTURA" : "EDITAR GASTO PENDIENTE"}</span><h2>{editing.expense.project_code} · {amount(editing.expense.amount_cents)}</h2></div><button type="button" className="icon-button" onClick={() => setEditing(null)}><X size={15} /></button></div>{editing.invoiceOnly ? <div className="form-grid"><label>Proveedor<input name="supplier" defaultValue={editing.expense.supplier ?? ""} required /></label><label>Número de comprobante<input name="receiptNumber" defaultValue={editing.expense.receipt_number ?? ""} required /></label></div> : <div className="form-grid"><label>Fecha<input name="expenseDate" type="date" defaultValue={String(editing.expense.expense_date).slice(0, 10)} required /></label><label>Categoría<input name="category" defaultValue={editing.expense.category} required /></label><label>Importe (S/)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={(editing.expense.amount_cents / 100).toFixed(2)} required /></label><label className="span-two">Descripción<input name="description" defaultValue={editing.expense.description} required /></label><label>Proveedor<input name="supplier" defaultValue={editing.expense.supplier ?? ""} /></label><label>Número de comprobante<input name="receiptNumber" defaultValue={editing.expense.receipt_number ?? ""} /></label><label>Fuente de pago<select name="paymentSource" defaultValue={editing.expense.payment_source ?? "DIRECT"}><option value="DIRECT">Pago directo</option><option value="PETTY_CASH">Caja chica</option></select></label></div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={busy}>{editing.invoiceOnly ? "Confirmar factura" : "Guardar cambios"}</button></div></form></div>}
    <details className="panel-card create-panel" open><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Registrar gasto</b><small>La semana se asigna automáticamente desde la fecha del gasto.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/expenses", { method: "POST", body: JSON.stringify({ ...body, amount: Number(body.amount) }) }); form.reset(); return "Gasto semanal registrado como pendiente."; })}><label>Obra<select name="projectId" required defaultValue={selectedProject}>{activeProjects.filter((project) => !selectedProject || project.id === selectedProject).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label><label>Fecha<input name="expenseDate" type="date" min={weekStart} max={addDays(weekStart, 6)} required /></label><label>Categoría<input name="category" required placeholder="Materiales" /></label><label>Importe (S/)<input name="amount" type="number" step="0.01" min="0.01" required /></label><label>Fuente de pago<select name="paymentSource" defaultValue="DIRECT"><option value="DIRECT">Pago directo</option><option value="PETTY_CASH">Caja chica</option></select></label><label className="span-two">Descripción<input name="description" required placeholder="Detalle del gasto" /></label><label>Proveedor<input name="supplier" /></label><label>Número de comprobante<input name="receiptNumber" /></label><button className="button button-primary form-submit" disabled={busy}>Guardar gasto</button></form></details>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">SEMANA DEL {dateLabel(weekStart).toUpperCase()}</span><h2>Registro de gastos</h2></div><span className="count-chip">{visibleRows.length} registros</span></div>{!visibleRows.length ? <EmptyState>No hay gastos para esta semana.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Descripción</th><th>Obra</th><th>Fecha</th><th>Pago</th><th>Factura</th><th>Etapa</th><th className="align-right">Importe</th><th /></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className={row.deleted_at ? "row-muted" : ""}><td><b>{row.description}</b><small>{row.category}{row.receipt_number ? ` · ${row.receipt_number}` : ""}</small></td><td>{row.project_code}</td><td>{dateLabel(row.expense_date)}</td><td><StagePill value={row.payment_source ?? "DIRECT"} /></td><td>{row.deleted_at ? "—" : <StagePill value={row.invoice_status ?? "PENDING"} />}</td><td><StagePill value={row.deleted_at ? "CLOSED" : row.stage} /></td><td className="align-right money-cell">{amount(row.amount_cents)}</td><td className="align-right">{row.deleted_at ? admin && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/expenses/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "RESTORE" }) }); return "Gasto restaurado."; })}><Undo2 size={14} /> Restaurar</button> : <><button className="text-button" onClick={() => setEditing({ expense: row, invoiceOnly: false })} disabled={row.stage !== "PENDING"}>Editar</button>{admin && row.stage === "PENDING" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/expenses/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "STAGE", stage: "APPROVED" }) }); return "Gasto aprobado."; })}>Aprobar</button>}{admin && row.stage === "APPROVED" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/expenses/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "STAGE", stage: "PAID" }) }); return "Pago registrado."; })}>Marcar pagado</button>}{row.evidence_id ? <a className="text-button" href={`/api/evidences/${row.evidence_id}`} target="_blank" rel="noreferrer">Ver archivo</a> : <button className="text-button" onClick={() => setEvidenceTarget({ entityType: "EXPENSE", entityId: row.id, projectCode: row.project_code, description: row.description, amountCents: row.amount_cents, date: row.expense_date, supplier: row.supplier })}>Adjuntar archivo</button>}{row.stage === "PENDING" && <button className="text-button danger-text" onClick={() => { const reason = window.prompt("Motivo para eliminar este gasto:"); if (reason) void perform(async () => { await api(`/api/expenses/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "DELETE", reason }) }); return "Gasto eliminado con auditoría."; }); }}><Trash2 size={14} /> Eliminar</button>}</>}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

function PettyCashPage({ projects, rows, report, admin, weekStart, setWeekStart, busy, submit, perform }: { projects: Project[]; rows: PettyCash[]; report: WeeklyReport | null; admin: boolean; weekStart: string; setWeekStart: (value: string) => void; busy: boolean; submit: SubmitHandler; perform: PerformHandler }) {
  const [projectId, setProjectId] = useState("");
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const activeProjects = projects.filter((project) => !project.deleted_at && project.status === "ACTIVE");
  const selectedProject = projectId || (admin ? "" : activeProjects[0]?.id ?? "");
  const visibleRows = rows.filter((row) => (showDeleted || !row.deleted_at) && (!selectedProject || row.project_id === selectedProject));
  const totals = report?.totals;
  return <>
    {evidenceTarget && <EvidenceDialog target={evidenceTarget} busy={busy} perform={perform} onClose={() => setEvidenceTarget(null)} />}
    <PageHeading eyebrow="CONTROL DE EFECTIVO SEMANAL" title="Caja chica" subtitle="Fondo, reposiciones y devoluciones. Los gastos pagados con caja chica reducen el saldo sin duplicar el gasto." action={<div className="period-control"><input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /><select value={selectedProject} onChange={(event) => setProjectId(event.target.value)}>{admin && <option value="">Todas las obras</option>}{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.code}</option>)}</select></div>} />
    <div className="mini-stats"><div><span>Ingresos de caja</span><b>{amount(totals?.pettyCashInCents)}</b></div><div><span>Devoluciones</span><b>{amount(totals?.pettyCashReturnCents)}</b></div><div><span>Gastos desde caja</span><b>{amount(totals?.pettyCashExpenseCents)}</b></div><div><span>Saldo acumulado</span><b>{amount(totals?.pettyCashBalanceCents)}</b></div></div>
    {admin && <label className="toggle-filter"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Mostrar movimientos eliminados</label>}
    <details className="panel-card create-panel" open><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Registrar movimiento de caja chica</b><small>El saldo se calcula en el servidor y se cruza con los gastos pagados desde caja chica.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/petty-cash", { method: "POST", body: JSON.stringify({ ...body, amount: Number(body.amount) }) }); form.reset(); return "Movimiento de caja chica registrado."; })}><label>Obra<select name="projectId" required defaultValue={selectedProject}>{activeProjects.filter((project) => !selectedProject || project.id === selectedProject).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label><label>Fecha<input name="movementDate" type="date" min={weekStart} max={addDays(weekStart, 6)} required /></label><label>Movimiento<select name="movementType" defaultValue="FUND"><option value="FUND">Fondo asignado</option><option value="REPLENISHMENT">Reposición</option><option value="RETURN">Devolución</option></select></label><label>Importe (S/)<input name="amount" type="number" min="0.01" step="0.01" required /></label><label className="span-two">Descripción<input name="description" required placeholder="Ej. Fondo asignado para compras menores" /></label><label>Número de comprobante<input name="receiptNumber" /></label><button className="button button-primary form-submit" disabled={busy}>Guardar movimiento</button></form></details>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">MOVIMIENTOS DE LA SEMANA</span><h2>Registro de caja chica</h2></div><span className="count-chip">{visibleRows.length} movimientos</span></div>{!visibleRows.length ? <EmptyState>No hay movimientos de caja chica para esta semana.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Obra</th><th>Movimiento</th><th>Detalle</th><th>Comprobante</th><th className="align-right">Importe</th><th /></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className={row.deleted_at ? "row-muted" : ""}><td>{dateLabel(row.movement_date)}</td><td>{row.project_code}</td><td><StagePill value={row.movement_type} /></td><td>{row.description}</td><td>{row.deleted_at ? "—" : row.evidence_id ? <a className="text-button" href={`/api/evidences/${row.evidence_id}`} target="_blank" rel="noreferrer">Ver archivo</a> : <button className="text-button" onClick={() => setEvidenceTarget({ entityType: "PETTY_CASH", entityId: row.id, projectCode: row.project_code, description: row.description, amountCents: row.amount_cents, date: row.movement_date })}>Adjuntar archivo</button>}<small>{row.receipt_number || "Sin número"}</small></td><td className="align-right money-cell">{amount(row.amount_cents)}</td><td className="align-right">{row.deleted_at ? admin && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/petty-cash/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "RESTORE" }) }); return "Movimiento de caja chica restaurado."; })}><Undo2 size={14} /> Restaurar</button> : <button className="text-button danger-text" onClick={() => { const reason = window.prompt("Motivo para eliminar este movimiento:"); if (reason) void perform(async () => { await api(`/api/petty-cash/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "DELETE", reason }) }); return "Movimiento de caja chica eliminado con auditoría."; }); }}><Trash2 size={14} /> Eliminar</button>}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

function AuthorizedAccountsPage({ projects, rows, busy, submit, perform }: { projects: Project[]; rows: ManagedUser[]; busy: boolean; submit: SubmitHandler; perform: PerformHandler }) {
  const activeProjects = projects.filter((project) => !project.deleted_at && project.status === "ACTIVE");
  return <>
    <PageHeading eyebrow="ACCESO POR OBRA" title="Cuentas autorizadas" subtitle="Autoriza personas por una obra. Sus cambios se guardan en la misma base y aparecen en el registro global y auditoría." />
    <div className="role-note"><ShieldCheck size={18} /><span><b>Permiso local por obra.</b> Cada cuenta autorizada solo puede operar su obra asignada; administración conserva la vista cruzada de todas las obras.</span></div>
    <details className="panel-card create-panel" open><summary><span className="create-summary-icon"><Plus size={16} /></span><span><b>Autorizar cuenta local</b><small>La cuenta podrá registrar trabajadores, asistencia, gastos, viáticos y caja chica de una sola obra.</small></span><ChevronDown size={16} /></summary><form className="form-grid" onSubmit={(event) => void submit(event, async () => { const form = event.currentTarget; const body = Object.fromEntries(new FormData(form)); await api("/api/users", { method: "POST", body: JSON.stringify(body) }); form.reset(); return "Cuenta local autorizada para la obra seleccionada."; })}><label>Nombre<input name="name" required /></label><label>Correo<input name="email" type="email" required /></label><label>Contraseña inicial<input name="password" type="password" minLength={14} required autoComplete="new-password" /></label><label>Obra autorizada<select name="projectId" required defaultValue="">{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label><button className="button button-primary form-submit" disabled={busy}>Crear autorización</button></form></details>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">AUTORIZACIONES ACTIVAS</span><h2>Cuentas y alcance</h2></div><span className="count-chip">{rows.length} cuentas</span></div>{!rows.length ? <EmptyState>No hay cuentas registradas.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Persona</th><th>Correo</th><th>Obra autorizada</th><th>Autorizó</th><th>Estado</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.name}</b><small>{row.role === "ADMIN" ? "Administración global" : "Operación local por obra"}</small></td><td>{row.email}</td><td>{row.project_code ?? "Acceso global"}</td><td>{row.authorized_by_name ?? (row.role === "ADMIN" ? "Sistema" : "Administración")}{row.authorized_at ? <small>{dateLabel(row.authorized_at)}</small> : null}</td><td><StagePill value={row.active ? "ACTIVE" : "CLOSED"} /></td><td className="align-right">{row.role !== "ADMIN" && <button className="text-button" onClick={() => void perform(async () => { await api(`/api/users/${row.id}`, { method: "PATCH", body: JSON.stringify({ active: !row.active }) }); return row.active ? "Cuenta desactivada y sesiones cerradas." : "Cuenta reactivada."; })}>{row.active ? "Desactivar" : "Reactivar"}</button>}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

function WeeklyReportsPage({ report, weekStart, setWeekStart }: { report: WeeklyReport | null; weekStart: string; setWeekStart: (value: string) => void }) {
  const totals = report?.totals;
  return <>
    <PageHeading eyebrow="REGISTRO GENERAL" title="Cruce semanal de información" subtitle="Consolida gastos, viáticos y caja chica de todas las obras autorizadas para tu cuenta." action={<div className="period-control"><input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /><a className="button button-primary" href={`/api/reports/pdf?weekStart=${weekStart}`}><ArrowDownToLine size={16} /> Descargar PDF</a></div>} />
    <div className="mini-stats"><div><span>Gastos</span><b>{amount(totals?.expenseCents)}</b></div><div><span>Viáticos</span><b>{amount(totals?.perDiemCents)}</b></div><div><span>Operación</span><b>{amount(totals?.operationalCents)}</b></div><div><span>Saldo caja chica</span><b>{amount(totals?.pettyCashBalanceCents)}</b></div></div>
    <article className="panel-card report-summary-card"><div className="panel-header"><div><span className="eyebrow">INDICADORES TRIBUTARIOS Y DE PAGO</span><h2>Resumen de la semana</h2></div><span className="count-chip">{report?.movements.length ?? 0} movimientos</span></div><div className="report-kpis"><div><span>Facturas hechas</span><b>{amount(totals?.invoiceDoneCents)}</b><small>Gastos con comprobante registrado</small></div><div><span>Pendiente</span><b>{amount(totals?.pendingCents)}</b><small>Gastos y viáticos por revisar</small></div><div><span>Pagado</span><b>{amount(totals?.paidCents)}</b><small>Gastos y viáticos pagados</small></div><div><span>Ingresos de caja</span><b>{amount(totals?.pettyCashInCents)}</b><small>Fondos y reposiciones de la semana</small></div></div></article>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">VISTA CONSOLIDADA</span><h2>Movimientos cruzados</h2></div><span className="count-chip">{report?.weekStart ? `${dateLabel(report.weekStart)} — ${dateLabel(report.weekEnd)}` : "Cargando"}</span></div>{!report?.movements.length ? <EmptyState>No hay movimientos para esta semana.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Obra</th><th>Detalle</th><th>Estado</th><th>Factura</th><th className="align-right">Importe</th></tr></thead><tbody>{report.movements.map((movement) => <tr key={`${movement.kind}-${movement.id}`}><td>{dateLabel(movement.movementDate)}</td><td><b>{movement.kind === "GASTO" ? "Gasto" : movement.kind === "VIATICO" ? "Viático" : "Caja chica"}</b><small>{movement.category}</small></td><td>{movement.projectCode}</td><td>{movement.description}{movement.daysAttended !== null && <small>{movement.daysAttended} días × tarifa semanal</small>}</td><td><StagePill value={movement.stage} /></td><td>{movement.invoiceStatus ? <StagePill value={movement.invoiceStatus} /> : "—"}</td><td className="align-right money-cell">{movement.cashDirection === "OUT" ? "− " : ""}{amount(movement.amountCents)}</td></tr>)}</tbody></table></div>}</article>
  </>;
}

function ClaimsPage({ rows, admin, busy, perform }: { rows: Claim[]; admin: boolean; busy: boolean; perform: PerformHandler }) {
  return <>
    <PageHeading eyebrow="ATENCIÓN AL USUARIO" title="Libro de reclamaciones" subtitle={admin ? "Registro global de reclamaciones y respuestas." : "Consulta las reclamaciones vinculadas a tu obra autorizada."} action={<a className="button button-primary" href="/libro-reclamaciones"><BookOpenCheck size={16} /> Registrar reclamación</a>} />
    <div className="role-note"><BookOpenCheck size={18} /><span><b>Registro inalterable.</b> Las reclamaciones se conservan con su código, fecha, aceptación de políticas y trazabilidad. No se eliminan desde esta pantalla.</span></div>
    <article className="panel-card table-card"><div className="panel-header"><div><span className="eyebrow">REGISTROS RECIBIDOS</span><h2>Seguimiento</h2></div><span className="count-chip">{rows.length} registros</span></div>{!rows.length ? <EmptyState>Todavía no hay reclamaciones vinculadas a este alcance.</EmptyState> : <div className="table-scroll"><table><thead><tr><th>Código</th><th>Fecha</th><th>Solicitante</th><th>Obra</th><th>Tipo</th><th>Detalle</th><th>Estado</th>{admin && <th />}</tr></thead><tbody>{rows.map((claim) => <tr key={claim.id}><td><b>{claim.claim_code}</b></td><td>{dateLabel(claim.created_at)}</td><td>{claim.full_name}<small>{claim.email}</small></td><td>{claim.project_code ?? "No especificada"}</td><td><StagePill value={claim.claim_type} /></td><td><details className="audit-details"><summary>Ver solicitud</summary><p>{claim.detail}</p><p><b>Pedido:</b> {claim.request_text}</p>{claim.response && <p><b>Respuesta:</b> {claim.response}</p>}</details></td><td><StagePill value={claim.status} /></td>{admin && <td className="align-right"><select className="stage-select" value={claim.status} disabled={busy} onChange={(event) => { const status = event.target.value; const response = status === "RESPONDED" ? window.prompt("Respuesta para la reclamación:", claim.response ?? "") : claim.response ?? ""; if (status !== "RESPONDED" || response !== null) void perform(async () => { await api("/api/claims", { method: "PATCH", body: JSON.stringify({ id: claim.id, status, response }) }); return "Estado de reclamación actualizado."; }); }}><option value="RECEIVED">Recibido</option><option value="REVIEW">En revisión</option><option value="RESPONDED">Respondido</option><option value="CLOSED">Cerrado</option></select></td>}</tr>)}</tbody></table></div>}</article>
    <article className="panel-card legal-links-card"><span className="eyebrow">INFORMACIÓN LEGAL</span><h2>Políticas y condiciones</h2><p>El formulario conserva la versión de política aceptada. Consulta los textos vigentes antes de registrar una solicitud.</p><div><a className="text-button" href="/politicas">Política de privacidad <ArrowUpRight size={14} /></a><a className="text-button" href="/terminos">Términos y condiciones <ArrowUpRight size={14} /></a></div></article>
  </>;
}
