import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminTable, PageHeader, Panel, Pill } from '@/components/admin-ui'

import { getStaffGate, roleLabel } from '@/lib/admin-auth'
import { listTeam, type TeamMember } from '@/lib/admin-users'

import { GrantRoleForm, RevokeRoleButton } from './grant-form'

export const metadata: Metadata = {
  title: 'Team',
  robots: { index: false, follow: false },
}

/**
 * Who works here, and what they may do. Super admins only.
 *
 * WHY THIS SCREEN EXISTS AT ALL. Plan §3 lists four staff roles and says capabilities come from
 * memberships — but until now the only way to create one was an operator running
 * scripts/bootstrap-super-admin.mjs against the service-role key. That is the right tool for the
 * first account and the wrong one for the fifth, and it meant "super admin" was a role nobody
 * could actually administer.
 *
 * `notFound()` RATHER THAN A REDIRECT for a non-super staff member. They are already inside the
 * console, so there is no sign-in to send them to; the honest answer is that this section is not
 * theirs. It is also not the security boundary — every write goes through `requireSuper()` in
 * lib/admin-users.ts, which runs on the server whether or not this page ever rendered.
 *
 * `force-dynamic`: the answer depends on the caller's roles and on rows this screen itself
 * changes. A cached copy would show a moderator the team list, or show a revoked role as live.
 */
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const gate = await getStaffGate()
  // The console layout already refused anyone who is not staff; this narrows further.
  if (gate.state !== 'staff' || !gate.identity.roles.includes('super')) notFound()

  const team = await listTeam()

  return (
    <>
      <PageHeader
        title="Team"
        description={
          'Everyone holding a staff role. Granting and revoking here is written to the ' +
          'append-only audit log with your name on it.'
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel>
          <AdminTable<TeamMember>
            rows={team}
            rowKey={(m) => m.profileId}
            empty="Nobody holds a staff role yet."
            columns={[
              {
                key: 'person',
                header: 'Person',
                render: (m) => (
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-ink-900">
                      {m.fullName ?? m.email ?? m.phone ?? 'No name'}
                      {m.profileId === gate.identity.id && (
                        <span className="ml-2 text-xs font-normal text-ink-500">you</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {m.email ?? m.phone ?? m.profileId}
                    </span>
                  </div>
                ),
              },
              {
                key: 'roles',
                header: 'Roles',
                render: (m) => (
                  <div className="flex flex-wrap gap-1.5">
                    {m.roles.map((role) => (
                      <Pill key={role} tone={role === 'super' ? 'amber' : 'neutral'}>
                        {roleLabel(role)}
                      </Pill>
                    ))}
                  </div>
                ),
              },
              {
                key: 'scope',
                header: 'Scope',
                render: (m) => (
                  <span className="text-xs text-ink-500">
                    {/* Empty city_ids is what app.staff_covers_city() reads as "all", so it is
                        a real answer rather than missing data. */}
                    {m.cityIds.length === 0 ? 'All cities' : `${m.cityIds.length} cities`}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (m) => (
                  <div className="flex flex-wrap justify-end gap-3">
                    {m.roles.map((role) => (
                      <RevokeRoleButton
                        key={role}
                        profileId={m.profileId}
                        role={role}
                        label={roleLabel(role)}
                      />
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </Panel>

        <div className="space-y-4">
          <Panel>
            <h2 className="border-b border-ink-200 px-4 py-3 text-sm font-semibold text-ink-900">
              Grant a role
            </h2>
            <GrantRoleForm />
          </Panel>

          <p className="text-xs leading-relaxed text-ink-500">
            Revoking your own super-admin role is refused, and so is revoking the last one held by
            anybody — either would leave a console nobody can administer, recoverable only with
            the service-role key at a terminal.
          </p>
        </div>
      </div>
    </>
  )
}
