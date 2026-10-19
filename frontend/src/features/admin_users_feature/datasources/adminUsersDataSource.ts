import type { AxiosResponse } from 'axios';
import { Endpoints } from '@/core/endpoints/endpoints';
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
import type { UserRole } from '@/features/auth_feature/state/authStore';
import type { AdminParentLink, AdminUser, AdminUserQuery, AdminUsersResponse, LinkWriteResponse } from '../models/AdminUserTypes';

export class AdminUsersDataSource {
  // Parses one endpoint with the parser supplied by the caller.
  private static call<T>(endpoint: { callWithParser: (parser: (response: AxiosResponse) => T) => Promise<$DataSourceResponse<T>> }, parser: (response: AxiosResponse) => T) {
    return endpoint.callWithParser(parser);
  }

  static listUsers(query: AdminUserQuery) {
    return this.call(Endpoints.AdminUsers.listUsers(query), (response) => response.data as AdminUsersResponse);
  }

  static changeRole(userId: number, role: UserRole, reason: string) {
    return this.call(Endpoints.AdminUsers.changeRole(userId, role, reason), (response) => response.data.user as AdminUser);
  }

  static deactivate(userId: number, reason: string) {
    return this.call(Endpoints.AdminUsers.deactivate(userId, reason), (response) => response.data.user as AdminUser);
  }

  static getLinks(userId: number) {
    return this.call(Endpoints.AdminUsers.getLinks(userId), (response) => response.data.links as AdminParentLink[]);
  }

  static createLink(guardianId: number, childId: number, reason: string) {
    return this.call(Endpoints.AdminUsers.createLink(guardianId, childId, reason), (response) => response.data as LinkWriteResponse);
  }

  static unlink(linkId: number, reason: string) {
    return this.call(Endpoints.AdminUsers.unlink(linkId, reason), (response) => response.data as LinkWriteResponse);
  }

  static relink(linkId: number, newGuardianId: number, reason: string) {
    return this.call(Endpoints.AdminUsers.relink(linkId, newGuardianId, reason), (response) => response.data as LinkWriteResponse);
  }
}
