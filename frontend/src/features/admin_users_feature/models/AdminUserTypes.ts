import type { UserRole } from '@/features/auth_feature/state/authStore';

export type AdminUser = {
  userId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string | null;
  role: UserRole;
  status: 'active' | 'deactivated';
  createdAt: string;
  // From the list: a learner who finished setup and is under 13, the only kind a guardian link may be made for.
  canLinkGuardian?: boolean;
};

export type AdminUserQuery = { q?: string; role?: UserRole; page: number; pageSize: number };
export type AdminUsersResponse = { users: AdminUser[]; page: number; pageSize: number; total: number };

export type AdminParentLink = {
  linkId: number;
  guardianId: number;
  childId: number;
  createdAt: string;
  relationship: 'guardian' | 'child';
  otherUser: { userId: number; firstName: string; lastName: string; role: UserRole };
};

export type LinkWriteResponse = {
  link: { linkId: number; guardianId: number; childId: number; createdAt: string; unlinkedAt?: string | null };
};
