import { ForbiddenException } from '@nestjs/common';
import { RequestContext, getHighestRole } from '@hydrabyte/shared';
import { PredefinedRole } from '@hydrabyte/shared';
import { Project, ProjectMember } from './project.schema';

export type MemberRole = 'project.lead' | 'project.member' | 'super-admin' | null;

/**
 * Fields visible to non-members (public summary view)
 */
const PUBLIC_FIELDS = ['_id', 'name', 'summary', 'startDate', 'endDate', 'members', 'status', 'tags', 'createdAt', 'updatedAt'] as const;

/**
 * Get the highest role from a RequestContext
 */
function getRole(context: RequestContext): string | undefined {
  return getHighestRole(context.roles);
}

/**
 * Check if the caller is a super-admin (bypasses all project-level access control)
 */
export function isSuperAdmin(context: RequestContext): boolean {
  const role = getRole(context);
  return role === PredefinedRole.UniverseOwner || role === PredefinedRole.OrganizationOwner;
}

/**
 * Check if the caller belongs to the same org as the project
 */
export function isSameOrg(project: any, context: RequestContext): boolean {
  if (getRole(context) === PredefinedRole.UniverseOwner) return true;
  const projectOrgId = project?.owner?.orgId?.toString?.() ?? project?.owner?.orgId;
  return projectOrgId === context.orgId;
}

/**
 * Get the caller's role in the project.
 * Returns 'super-admin', 'project.lead', 'project.member', or null.
 */
export function getMemberRole(project: any, context: RequestContext): MemberRole {
  const highestRole = getRole(context);

  if (highestRole === PredefinedRole.UniverseOwner) return 'super-admin';

  const projectOrgId = project?.owner?.orgId?.toString?.() ?? project?.owner?.orgId;
  if (highestRole === PredefinedRole.OrganizationOwner && projectOrgId === context.orgId) {
    return 'super-admin';
  }

  if (!context.userId) return null;

  const plain = project.toObject ? project.toObject() : project;
  const member = (plain.members as ProjectMember[])?.find(
    (m) => m.type === 'user' && m.id === context.userId,
  );

  return (member?.role as MemberRole) ?? null;
}

/**
 * Get the list of project leads from a project (for error messages).
 */
function getProjectLeads(project: any): { type: string; id: string }[] {
  const plain = project.toObject ? project.toObject() : project;
  return (plain.members as ProjectMember[])
    ?.filter((m) => m.role === 'project.lead')
    .map((m) => ({ type: m.type, id: m.id })) ?? [];
}

/**
 * Build a descriptive forbidden message referencing project leads.
 */
function buildForbiddenMessage(reason: string, project: any): string {
  const leads = getProjectLeads(project);
  const leadsStr = leads.length > 0
    ? ` Project leads: ${JSON.stringify(leads)}.`
    : ' No project leads are currently assigned.';
  return `${reason}${leadsStr}`;
}

/**
 * Assert that the caller can manage members (project.lead or super-admin).
 * Throws ForbiddenException if not authorized.
 */
export function assertCanManageMembers(project: any, context: RequestContext): void {
  const role = getMemberRole(project, context);
  if (role !== 'super-admin' && role !== 'project.lead') {
    throw new ForbiddenException('Only project leads and organization owners can manage members');
  }
}

/**
 * Assert that the caller can manage project info (update/delete).
 * Only project.lead and super-admin are allowed.
 */
export function assertCanManageProject(project: any, context: RequestContext): void {
  const role = getMemberRole(project, context);
  if (role !== 'super-admin' && role !== 'project.lead') {
    throw new ForbiddenException(
      buildForbiddenMessage(
        'Only project leads and organization owners can modify project information. Please contact the project lead to perform this action.',
        project,
      ),
    );
  }
}

/**
 * Assert that the caller can manage work items (create/update/delete).
 * Only project.lead and super-admin are allowed.
 */
export function assertCanManageWork(project: any, context: RequestContext): void {
  const role = getMemberRole(project, context);
  if (role !== 'super-admin' && role !== 'project.lead') {
    throw new ForbiddenException(
      buildForbiddenMessage(
        'Only project leads and organization owners can create, update, or delete work items. Please contact the project lead to perform this action.',
        project,
      ),
    );
  }
}

/**
 * Assert that the caller can delete a document.
 * Only project.lead and super-admin are allowed.
 */
export function assertCanDeleteDocument(project: any, context: RequestContext): void {
  const role = getMemberRole(project, context);
  if (role !== 'super-admin' && role !== 'project.lead') {
    throw new ForbiddenException(
      buildForbiddenMessage(
        'Only project leads and organization owners can delete documents. Please contact the project lead to perform this action.',
        project,
      ),
    );
  }
}

/**
 * Strip private fields from a project for non-member callers.
 * Returns only public fields.
 */
export function stripToPublicView(project: any): Partial<Project> {
  const plain = project.toObject ? project.toObject() : project;
  const result: any = {};
  for (const field of PUBLIC_FIELDS) {
    if (field in plain) {
      result[field] = plain[field];
    }
  }
  return result as Partial<Project>;
}

/**
 * Apply access control to a single project response.
 * - super-admin: full access
 * - member: full access
 * - non-member same org: public view only
 * - different org: throws ForbiddenException
 */
export function applyProjectAccess(project: any, context: RequestContext): any {
  if (!isSameOrg(project, context)) {
    throw new ForbiddenException('Access denied');
  }

  const role = getMemberRole(project, context);
  if (role === null) {
    return stripToPublicView(project);
  }

  return project.toObject ? project.toObject() : project;
}

/**
 * Apply access control to a list of projects.
 * - Projects from different orgs are excluded.
 * - Non-member projects are stripped to public view.
 */
export function applyProjectListAccess(projects: any[], context: RequestContext): any[] {
  return projects
    .filter((p) => isSameOrg(p, context))
    .map((p) => {
      const role = getMemberRole(p, context);
      return role === null ? stripToPublicView(p) : (p.toObject ? p.toObject() : p);
    });
}

/**
 * Get the set of projectIds where the caller is a member (or super-admin).
 * Used to build membership filter for Document and Work queries.
 *
 * Returns:
 *   isSuperAdmin → undefined (no filter needed — see all)
 *   otherwise    → Set of projectId strings the user can fully access
 */
export function getMemberProjectIds(
  projects: any[],
  context: RequestContext,
): Set<string> | undefined {
  if (isSuperAdmin(context)) return undefined;

  const memberIds = new Set<string>();
  for (const p of projects) {
    if (!isSameOrg(p, context)) continue;
    const role = getMemberRole(p, context);
    if (role !== null) {
      const id = p._id?.toString?.() ?? p._id;
      memberIds.add(id);
    }
  }
  return memberIds;
}
