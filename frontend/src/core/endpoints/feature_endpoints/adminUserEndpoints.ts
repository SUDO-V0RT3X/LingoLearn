import type { AdminUser, AdminUserQuery, AdminUsersResponse, AdminParentLink, LinkWriteResponse } from '@/features/admin_users_feature/models/AdminUserTypes';
import type { UserRole } from '@/features/auth_feature/state/authStore';
import { RequestMethod } from '@/core/http/functions/httpService';
import { $Endpoint } from '../models/EndpointType';

export class AdminUserEndpoints {
  // Builds the GET request for a filtered page of users.
  listUsers(query: AdminUserQuery): $Endpoint<AdminUsersResponse> {
    const params: Record<string, string> = { page: String(query.page), pageSize: String(query.pageSize) };
    if (query.q) params.q = query.q;
    if (query.role) params.role = query.role;
    return new $Endpoint({ method: RequestMethod.GET, route: '/api/admin/users', queryParameters: params, responseParser: null });
  }

  // Builds the role-change request for one user.
  changeRole(userId: number, role: UserRole, reason: string): $Endpoint<AdminUser> {
    return new $Endpoint({
      method: RequestMethod.PATCH,
      route: '/api/admin/users',
      pathParameters: [String(userId), 'role'],
      jsonBody: { role, reason: reason || undefined },
      responseParser: null,
    });
  }

  // Builds the account-deactivation request for one user.
  deactivate(userId: number, reason: string): $Endpoint<AdminUser> {
    return new $Endpoint({
      method: RequestMethod.POST,
      route: '/api/admin/users',
      pathParameters: [String(userId), 'deactivate'],
      jsonBody: { reason: reason || undefined },
      responseParser: null,
    });
  }

  // Builds the active-link list request for one user.
  getLinks(userId: number): $Endpoint<AdminParentLink[]> {
    return new $Endpoint({ method: RequestMethod.GET, route: '/api/admin/users', pathParameters: [String(userId), 'links'], responseParser: null });
  }

  // Builds a new guardian-learner link request.
  createLink(guardianId: number, childId: number, reason: string): $Endpoint<LinkWriteResponse> {
    return new $Endpoint({
      method: RequestMethod.POST,
      route: '/api/admin/parent-links',
      jsonBody: { guardianId, childId, reason: reason || undefined },
      responseParser: null,
    });
  }

  // Builds a soft-unlink request for one active link.
  unlink(linkId: number, reason: string): $Endpoint<LinkWriteResponse> {
    return new $Endpoint({
      method: RequestMethod.POST,
      route: '/api/admin/parent-links',
      pathParameters: [String(linkId), 'unlink'],
      jsonBody: { reason: reason || undefined },
      responseParser: null,
    });
  }

  // Builds a transactional move-to-guardian request for one active link.
  relink(linkId: number, newGuardianId: number, reason: string): $Endpoint<LinkWriteResponse> {
    return new $Endpoint({
      method: RequestMethod.POST,
      route: '/api/admin/parent-links',
      pathParameters: [String(linkId), 'relink'],
      jsonBody: { newGuardianId, reason: reason || undefined },
      responseParser: null,
    });
  }
}
