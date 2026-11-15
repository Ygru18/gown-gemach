import { UserPlus, KeyRound, UserX, UserCheck, Pencil, ShieldCheck } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { formatDateTime } from "@/lib/dates";
import { Card, PageHeader, Pill } from "@/components/ui";
import { ModalAction, ActionButton } from "@/components/forms";
import { createStaffAction, resetStaffPasswordAction, setStaffActiveAction, updateStaffAction } from "@/app/actions/admin";

export const metadata = { title: "Staff / Users" };

function RoleFields({ defaultRole = "ASSISTANT" }: { defaultRole?: string }) {
  return (
    <div>
      <label className="label" htmlFor="role">Role</label>
      <select id="role" name="role" defaultValue={defaultRole} className="input">
        <option value="ASSISTANT">Assistant — runs daily operations</option>
        <option value="ADMIN">Administrator — full access</option>
      </select>
    </div>
  );
}

export default async function StaffPage() {
  const me = await requireAdminPage();
  const [staff, settings] = await Promise.all([prisma.staffUser.findMany({ orderBy: [{ isActive: "desc" }, { role: "asc" }, { fullName: "asc" }] }), getSettings()]);
  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Staff & logins"
        subtitle="Create accounts for your assistants. They can run every daily operation; only administrators manage staff, settings and permanent deletions."
        actions={
          <ModalAction label="Add staff member" icon={<UserPlus className="h-4 w-4" />} variant="primary" title="Add a staff member" subtitle="Choose a temporary password and share it privately. They will be asked to set their own when they first sign in." action={createStaffAction} submitLabel="Create account">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="fullName">Full name</label>
                <input id="fullName" name="fullName" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="email">Email (sign-in)</label>
                <input id="email" name="email" type="email" required className="input" autoComplete="off" />
              </div>
              <RoleFields />
              <div>
                <label className="label" htmlFor="temporaryPassword">Temporary password</label>
                <input id="temporaryPassword" name="temporaryPassword" type="text" minLength={10} required className="input" autoComplete="off" />
                <p className="mt-1 text-[12px] text-muted">At least 10 characters.</p>
              </div>
            </div>
          </ModalAction>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="card flex gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-500" />
          <p className="text-sm text-ink-soft"><b className="font-medium text-ink">Assistants can:</b> add and edit gowns and photos, manage customers and donors, create/confirm/cancel reservations, record payments and deposits, process pickups, returns, inspections, cleaning and alterations, archive or dispose of gowns, and view and export all reports.</p>
        </div>
        <div className="card flex gap-3 p-4">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-blush-500" />
          <p className="text-sm text-ink-soft"><b className="font-medium text-ink">Only administrators can:</b> manage staff and logins, change system settings, and permanently delete inventory records{settings.allowAssistantOverride ? "" : " (and override availability conflicts — this can be extended to assistants in Settings)"}.</p>
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-elegant">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.fullName}{s.id === me.id ? <span className="ml-2 text-[12px] text-muted">(you)</span> : null}</td>
                  <td className="text-ink-soft">{s.email}</td>
                  <td><Pill tone={s.role === "ADMIN" ? "gold" : "blush"}>{s.role === "ADMIN" ? "Administrator" : "Assistant"}</Pill></td>
                  <td>{s.isActive ? (s.mustChangePassword ? <Pill tone="champagne">Awaiting first sign-in</Pill> : <Pill tone="green">Active</Pill>) : <Pill tone="grey">Deactivated</Pill>}</td>
                  <td className="whitespace-nowrap text-ink-soft">{s.lastLoginAt ? formatDateTime(s.lastLoginAt, settings.timezone) : "—"}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <ModalAction label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} size="sm" variant="ghost" title={`Edit ${s.fullName}`} action={updateStaffAction.bind(null, s.id)}>
                        <div>
                          <label className="label" htmlFor={`n${s.id}`}>Full name</label>
                          <input id={`n${s.id}`} name="fullName" defaultValue={s.fullName} required className="input" />
                        </div>
                        <div>
                          <label className="label" htmlFor={`e${s.id}`}>Email (sign-in)</label>
                          <input id={`e${s.id}`} name="email" type="email" defaultValue={s.email} required className="input" />
                        </div>
                        <RoleFields defaultRole={s.role} />
                      </ModalAction>
                      <ModalAction label="Reset password" icon={<KeyRound className="h-3.5 w-3.5" />} size="sm" variant="ghost" title={`Reset password for ${s.fullName}`} subtitle="They will be asked to choose a new password when they next sign in." action={resetStaffPasswordAction.bind(null, s.id)} submitLabel="Set temporary password">
                        <div>
                          <label className="label" htmlFor={`p${s.id}`}>Temporary password</label>
                          <input id={`p${s.id}`} name="temporaryPassword" minLength={10} required className="input" autoComplete="off" />
                        </div>
                      </ModalAction>
                      {s.id !== me.id ? (
                        s.isActive ? (
                          <ActionButton action={setStaffActiveAction.bind(null, s.id, false)} label="Deactivate" size="sm" variant="ghost" icon={<UserX className="h-3.5 w-3.5" />} confirm={{ title: `Deactivate ${s.fullName}?`, body: "They will no longer be able to sign in. Everything they recorded stays in the history.", confirmLabel: "Deactivate", danger: true }} />
                        ) : (
                          <ActionButton action={setStaffActiveAction.bind(null, s.id, true)} label="Re-activate" size="sm" variant="ghost" icon={<UserCheck className="h-3.5 w-3.5" />} />
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
