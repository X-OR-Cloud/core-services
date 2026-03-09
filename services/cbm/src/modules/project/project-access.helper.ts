import { ForbiddenException } from '@nestjs/common';
import { RequestContext, getHighestRole } from '@hydrabyte/shared';
import { PredefinedRole } from '@hydrabyte/shared';
import { Project, ProjectMember } from './project.schema';

export type MemberRole = 'project.lead' | 'project.member' | 'super-admin' | null;

/**
 * Get a human-readable caller role string for API responses.
 * Returns the actual role string rather than the internal 'super-admin' alias.
 *
 * Returns:
 *   'project.lead'        — caller is project lead (takes precedence over org roles)
 *   'project.member'      — caller is project member
 *   'universe.owner'      — universe-level super admin, not a project member
 *   'organization.owner'  — org-level owner, not a project member
 *   'none'                — org member with no project membership
 */
export function getCallerRole(project: any, context: RequestContext): string {
  const plain = project.toObject ? project.toObject() : project;
  const members = plain.members as ProjectMember[];

  // Check project membership first (takes precedence)
  const agentMember = context.agentId ? members?.find((m) => m.type === 'agent' && m.id === context.agentId) : undefined;
  const userMember = context.userId ? members?.find((m) => m.type === 'user' && m.id === context.userId) : undefined;
  const projectMember = agentMember ?? userMember;
  if (projectMember) return projectMember.role;

  // Not a project member — check org-level roles
  const highestRole = getRole(context);
  if (highestRole === PredefinedRole.UniverseOwner) return PredefinedRole.UniverseOwner;

  const projectOrgId = project?.owner?.orgId?.toString?.() ?? project?.owner?.orgId;
  if (highestRole === PredefinedRole.OrganizationOwner && projectOrgId === context.orgId) {
    return PredefinedRole.OrganizationOwner;
  }

  return 'none';
}

/**
 * Get myRole for a Work item response.
 * Priority: reporter/assignee > project membership > org-level roles > 'none'
 *
 * work      — the Work document (plain object or Mongoose doc)
 * project   — the raw project document (null if work has no projectId)
 * context   — caller's RequestContext
 *
 * Returns one of: 'reporter' | 'assignee' | 'project.lead' | 'project.member'
 *               | 'universe.owner' | 'organization.owner' | 'none'
 */
export function getWorkCallerRole(work: any, project: any | null, context: RequestContext): string {
  const plain = work.toObject ? work.toObject() : work;
  const callerId = context.agentId || context.userId;
  const callerType = context.agentId ? 'agent' : 'user';

  // Check reporter
  if (plain.reporter?.type === callerType && plain.reporter?.id === callerId) {
    return 'reporter';
  }

  // Check assignee
  if (plain.assignee?.type === callerType && plain.assignee?.id === callerId) {
    return 'assignee';
  }

  // Check project membership if work belongs to a project
  if (project) {
    return getCallerRole(project, context);
  }

  // No project — check org-level roles
  const highestRole = getRole(context);
  if (highestRole === PredefinedRole.UniverseOwner) return PredefinedRole.UniverseOwner;
  if (highestRole === PredefinedRole.OrganizationOwner) return PredefinedRole.OrganizationOwner;

  return 'none';
}

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

  const plain = project.toObject ? project.toObject() : project;
  const members = plain.members as ProjectMember[];

  if (context.agentId) {
    const agentMember = members?.find((m) => m.type === 'agent' && m.id === context.agentId);
    if (agentMember) return agentMember.role as MemberRole;
  }

  if (!context.userId) return null;

  const member = members?.find((m) => m.type === 'user' && m.id === context.userId);

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
  const myRole = getCallerRole(project, context);

  if (role === null) {
    return { ...stripToPublicView(project), myRole };
  }

  const plain = project.toObject ? project.toObject() : project;
  return { ...plain, myRole };
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
      const myRole = getCallerRole(p, context);
      if (role === null) {
        return { ...stripToPublicView(p), myRole };
      }
      const plain = p.toObject ? p.toObject() : p;
      return { ...plain, myRole };
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

/**
 * Check if the caller can view a private document.
 *
 * Rules:
 *   - super-admin (universe.owner / organization.owner): always allowed
 *   - otherwise: caller must be the document creator (createdBy)
 *
 * Note: project-linked documents use membership checks separately;
 * this helper handles the non-project case and the supra-admin bypass.
 */
export function canViewPrivateDocument(doc: any, context: RequestContext): boolean {
  if (isSuperAdmin(context)) return true;
  const callerId = context.agentId || context.userId;
  return doc.createdBy === callerId;
}

/**
 * Assert that the caller can update or delete a document (write access).
 *
 * Rules:
 *   - super-admin (universe.owner / organization.owner): always allowed
 *   - project.lead (when doc belongs to a project): allowed
 *   - document creator (createdBy): always allowed
 *   - others: ForbiddenException
 *
 * @param doc     - the Document plain object
 * @param project - the raw Project (null if doc has no projectId)
 * @param context - caller's RequestContext
 */
export function assertCanWriteDocument(doc: any, project: any | null, context: RequestContext): void {
  if (isSuperAdmin(context)) return;

  const callerId = context.agentId || context.userId;
  if (doc.createdBy === callerId) return;

  if (project) {
    const role = getMemberRole(project, context);
    if (role === 'project.lead') return;
    throw new ForbiddenException(
      buildForbiddenMessage(
        'Only the document creator, project leads, and organization owners can modify or delete this document. Please contact the project lead to perform this action.',
        project,
      ),
    );
  }

  throw new ForbiddenException(
    'Only the document creator and organization owners can modify or delete this document.',
  );
}
