import { PredefinedRole, PredefinedScope } from "../enum/roles";
import { PermissionContext } from "../types/permission.types";

export interface RequestContext {
  orgId: string;
  groupId: string;
  userId: string;
  agentId: string;
  appId: string;
  roles: PredefinedRole[];
  licenses?: Record<string, string>; // License map: { iam: 'full', aiwm: 'limited' }
}

/**
 * Trả về role cao nhất từ danh sách các role
 */
export function getHighestRole(roles: PredefinedRole[]): PredefinedRole | undefined {
  if (!roles || roles.length === 0) return undefined;
  const priority: PredefinedRole[] = [
    PredefinedRole.UniverseOwner,
    PredefinedRole.OrganizationOwner,
    PredefinedRole.OrganizationEditor,
    PredefinedRole.OrganizationViewer,
    PredefinedRole.GroupOwner,
    PredefinedRole.GroupEditor,
    PredefinedRole.GroupViewer,
    PredefinedRole.MemberOwner,
    PredefinedRole.MemberEditor,
    PredefinedRole.MemberViewer,
  ];
  for (const p of priority) {
    if (roles.includes(p)) return p;
  }
  return undefined;
}


export function createRoleBasedPermissions(context: RequestContext): PermissionContext {
  const role = getHighestRole(context.roles) || '';
  const strs = role.split('.');
  const scope = strs[0] || PredefinedScope.Void;
  const roleName = strs[1] || 'unknown';

  let permissions: PermissionContext = {
    allowRead: false,
    allowWrite: false,
    allowDelete: false,
    allowAdministrative: false,
    scope,
    filter: {},
  };

  switch (roleName) {
    case 'owner':
      permissions = {
        allowRead: true,
        allowWrite: true,
        allowDelete: true,
        allowAdministrative: true,
        scope,
        filter: {},
      };
      break;
    case 'editor':
      permissions = {
        allowRead: true,
        allowWrite: true,
        allowDelete: true,
        allowAdministrative: false,
        scope,
        filter: {},
      };
      break;
    case 'viewer':
      permissions = {
        allowRead: true,
        allowWrite: false,
        allowDelete: false,
        allowAdministrative: false,
        scope,
        filter: {},
      };
      break;
    default:
      permissions = {
        allowRead: false,
        allowWrite: false,
        allowDelete: false,
        allowAdministrative: false,
        scope,
        filter: {},
      };
      break;
  }

  switch (scope) {
    case PredefinedScope.Universe: {
      permissions.filter = {};
      break;
    }
    case PredefinedScope.Organization: {
      permissions.filter = { 'owner.orgId': context.orgId };
      break;
    }
    case PredefinedScope.Group: {
      permissions.filter = {
        'owner.orgId': context.orgId,
        'owner.groupId': context.groupId,
      };
      break;
    }
    case PredefinedScope.Member: {
      permissions.filter = {
        'owner.orgId': context.orgId,
        'owner.groupId': context.groupId,
        $or: [
          { 'owner.userId': context.userId },
          { 'owner.agentId': context.agentId },
        ],
      };
      break;
    }
    case PredefinedScope.Void: {
      permissions.filter = { [Math.random()]: new Date().getTime() }; // return empty result
      break;
    }
  }
  return permissions;
}
