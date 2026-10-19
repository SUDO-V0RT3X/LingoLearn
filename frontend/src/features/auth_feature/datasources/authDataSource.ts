import { Endpoints } from "@/core/endpoints/endpoints";
import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { AxiosResponse } from "axios";
import type { AuthResponse, LinkedGuardian, PublicUser, RedeemParentLinkResponse, SignUpInput } from "../state/authStore";

/**
 * Builds the Authorization header for protected auth calls. The session token
 * is the only identity the backend accepts.
 */
function identityHeaders(token?: string | null): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Converts unexpected request failures into the app's shared datasource
 * response shape, allowing Pinia actions to handle backend and network failures
 * through the same error property.
 */
function failed<T>(message: string): $DataSourceResponse<T> {
    return {
        data: null,
        error: new Exception({
            exceptionType: ExceptionType.FAILED,
            message,
            statusCode: 500,
        }),
    };
}

export class AuthDataSource {
    /**
     * Sends the prepared signup payload to the backend. The returned data
     * includes both the created public user and a session token, so the store can
     * log the user in immediately after account creation.
     */
    static async signUp(input: SignUpInput): Promise<$DataSourceResponse<AuthResponse>> {
        try {
            const parser = (response: AxiosResponse) => response.data as AuthResponse;
            return await Endpoints.Auth.signUp(input).callWithParser(parser);
        } catch (error) {
            console.error('Exception in AuthDataSource.signUp:', error);
            return failed('Failed to create account. Please try again.');
        }
    }

    /**
     * Sends the shared identifier/password login payload to the backend. The
     * identifier may be a learner username or a non-learner email, matching the
     * backend's role-specific account model.
     */
    static async login(input: { identifier: string; password: string }): Promise<$DataSourceResponse<AuthResponse>> {
        try {
            const parser = (response: AxiosResponse) => response.data as AuthResponse;
            return await Endpoints.Auth.login(input).callWithParser(parser);
        } catch (error) {
            console.error('Exception in AuthDataSource.login:', error);
            return failed('Failed to sign in. Please try again.');
        }
    }

    /**
     * Calls the backend logout endpoint with the active token so the session row
     * is revoked server-side instead of only clearing browser state.
     */
    static async logout(token: string): Promise<$DataSourceResponse<void>> {
        try {
            const parser = () => undefined;
            return await Endpoints.Auth.logout(token).callWithParser(parser);
        } catch (error) {
            console.error('Exception in AuthDataSource.logout:', error);
            return failed('Failed to sign out. Please try again.');
        }
    }

    /**
     * Fetches the current public user for a stored session token. This supports
     * refresh/session restore flows without asking the user to sign in again.
     */
    static async me(token: string): Promise<$DataSourceResponse<PublicUser>> {
        try {
            const parser = (response: AxiosResponse) => response.data.user as PublicUser;
            const response = await Endpoints.Auth.me(token).callWithParser(parser);
            return { data: response.data, error: response.error };
        } catch (error) {
            console.error('Exception in AuthDataSource.me:', error);
            return failed('Failed to restore session. Please sign in again.');
        }
    }

    /**
     * Requests a one-time parent-link code for the signed-in learner. Identity
     * is sent through the session token when available, matching the protected
     * backend route.
     */
    static async createLinkCode(token?: string | null): Promise<$DataSourceResponse<{ code: string; expiresAt: string }>> {
        try {
            const parser = (response: AxiosResponse) => response.data as { code: string; expiresAt: string };
            return await Endpoints.Auth.createLinkCode(identityHeaders(token)).callWithParser(parser);
        } catch (error) {
            console.error('Exception in AuthDataSource.createLinkCode:', error);
            return failed('Failed to create link code. Please try again.');
        }
    }

    /**
     * Sends a guardian/admin redemption request for a learner code. The backend
     * decides whether the code is invalid, expired, already used, or valid.
     */
    static async redeemParentLink(code: string, token?: string | null): Promise<$DataSourceResponse<RedeemParentLinkResponse>> {
        try {
            const parser = (response: AxiosResponse) => response.data as RedeemParentLinkResponse;
            return await Endpoints.Auth.redeemParentLink(identityHeaders(token), code).callWithParser(parser);
        } catch (error) {
            console.error('Exception in AuthDataSource.redeemParentLink:', error);
            return failed('Failed to redeem link code. Please try again.');
        }
    }

    /**
     * Retrieves learners already linked to the current guardian/admin account.
     * This is intentionally separate from redemption so the UI can hide children
     * until a valid code has actually been redeemed.
     */
    static async getChildren(token?: string | null): Promise<$DataSourceResponse<Array<PublicUser & { linkedAt: string }>>> {
        try {
            const parser = (response: AxiosResponse) => response.data.children as Array<PublicUser & { linkedAt: string }>;
            return await Endpoints.Auth.getChildren(identityHeaders(token)).callWithParser(parser);
        } catch (error) {
            console.error('Exception in AuthDataSource.getChildren:', error);
            return failed('Failed to load linked children. Please try again.');
        }
    }

    /** Fetches the guardians linked to the signed-in learner (names only). */
    static async getMyGuardians(token?: string | null): Promise<$DataSourceResponse<LinkedGuardian[]>> {
        try {
            const parser = (response: AxiosResponse) => response.data.guardians as LinkedGuardian[];
            return await Endpoints.Auth.getMyGuardians(identityHeaders(token)).callWithParser(parser);
        } catch (error) {
            console.error('Exception in AuthDataSource.getMyGuardians:', error);
            return failed('Failed to load your guardian. Please try again.');
        }
    }
}
