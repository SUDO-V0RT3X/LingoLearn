import type { UserRole } from '../../authRoutes/types/authType.js';

export type AdminUser = {
    userId: number;
    firstName: string;
    lastName: string;
    email: string | null;
    username: string | null;
    role: UserRole;
    status: 'active' | 'deactivated';
    createdAt: string;
    //Only on the list: true for a learner who finished setup and is under 13,
    //the only learner a guardian link may be made for.
    canLinkGuardian?: boolean;
};

export type AdminUserQuery = {
    q: string | null;
    role: UserRole | null;
    page: number;
    pageSize: number;
};

export type AdminUsersResponse = {
    users: AdminUser[];
    page: number;
    pageSize: number;
    total: number;
};

export type AdminParentLink = {
    linkId: number;
    guardianId: number;
    childId: number;
    createdAt: string;
    relationship: 'guardian' | 'child';
    otherUser: {
        userId: number;
        firstName: string;
        lastName: string;
        role: UserRole;
    };
};
