import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type { AuthResponse, LinkedGuardian, PublicUser, RedeemParentLinkResponse, SignUpInput } from "@/features/auth_feature/state/authStore";
import type { ChildProgressReport as GuardianChildProgressReport, ReportLanguage } from "@/features/auth_feature/models/childProgressReportType";

export class AuthEndpoints {
    roles(): $Endpoint<{ roles: PublicUser['role'][] }> {
        return new $Endpoint<{ roles: PublicUser['role'][] }>({
            method: RequestMethod.GET,
            route: '/api/auth/roles',
            responseParser: null,
        });
    }

    /**
     * Builds the POST /api/auth/signup request. The payload type allows learner
     * signup with first name + last name + username, while non-learners use
     * first name + last name + email.
     */
    signUp(data: SignUpInput): $Endpoint<AuthResponse> {
        return new $Endpoint<AuthResponse>({
            method: RequestMethod.POST,
            route: '/api/auth/signup',
            jsonBody: data,
            additionalHeaders: {
                'Content-Type': 'application/json',
            },
            responseParser: null,
        });
    }

    /**
     * Builds the POST /api/auth/login request using the shared identifier field
     * so the same screen can support learner usernames and non-learner emails.
     */
    login(data: { identifier: string; password: string }): $Endpoint<AuthResponse> {
        return new $Endpoint<AuthResponse>({
            method: RequestMethod.POST,
            route: '/api/auth/login',
            jsonBody: data,
            additionalHeaders: {
                'Content-Type': 'application/json',
            },
            responseParser: null,
        });
    }

    /**
     * Builds the POST /api/auth/logout request and attaches the bearer token
     * that should be revoked by the backend session store.
     */
    logout(token: string): $Endpoint<void> {
        return new $Endpoint<void>({
            method: RequestMethod.POST,
            route: '/api/auth/logout',
            additionalHeaders: {
                Authorization: `Bearer ${token}`,
            },
            responseParser: null,
        });
    }

    /**
     * Builds the GET /api/auth/me request used to restore a signed-in user from
     * an existing token after a refresh.
     */
    me(token: string): $Endpoint<PublicUser> {
        return new $Endpoint<PublicUser>({
            method: RequestMethod.GET,
            route: '/api/auth/me',
            additionalHeaders: {
                Authorization: `Bearer ${token}`,
            },
            responseParser: null,
        });
    }

    /**
     * Builds the PUT /api/auth/interface-language request that saves the
     * language the signed-in account's menus and buttons are shown in. Any role
     * may call it; the session token comes from the HTTP service.
     */
    saveInterfaceLanguage(interfaceLanguage: 'english' | 'zulu'): $Endpoint<{ interfaceLanguage: 'english' | 'zulu' }> {
        return new $Endpoint<{ interfaceLanguage: 'english' | 'zulu' }>({
            method: RequestMethod.PUT,
            route: '/api/auth/interface-language',
            jsonBody: { interfaceLanguage },
            additionalHeaders: {
                'Content-Type': 'application/json',
            },
            responseParser: null,
        });
    }

    /**
     * Builds the POST /api/auth/link-codes request for learners who need to
     * generate a code for guardian linking.
     */
    createLinkCode(headers: Record<string, string>): $Endpoint<{ code: string; expiresAt: string }> {
        return new $Endpoint<{ code: string; expiresAt: string }>({
            method: RequestMethod.POST,
            route: '/api/auth/link-codes',
            additionalHeaders: headers,
            responseParser: null,
        });
    }

    /**
     * Builds the POST /api/auth/parent-links/redeem request with the entered
     * code and the guardian/admin identity headers.
     */
    redeemParentLink(headers: Record<string, string>, code: string): $Endpoint<RedeemParentLinkResponse> {
        return new $Endpoint<RedeemParentLinkResponse>({
            method: RequestMethod.POST,
            route: '/api/auth/parent-links/redeem',
            jsonBody: { code },
            additionalHeaders: {
                ...headers,
                'Content-Type': 'application/json',
            },
            responseParser: null,
        });
    }

    /**
     * Builds the GET /api/auth/children request that returns only learners
     * already linked to the current guardian/admin.
     */
    getChildren(headers: Record<string, string>): $Endpoint<Array<PublicUser & { linkedAt: string }>> {
        return new $Endpoint<Array<PublicUser & { linkedAt: string }>>({
            method: RequestMethod.GET,
            route: '/api/auth/children',
            additionalHeaders: headers,
            responseParser: null,
        });
    }

    /**
     * Builds the GET /api/auth/my-guardians request: the guardians linked to
     * the signed-in learner, by name, for their "My grown-up" page.
     */
    getMyGuardians(headers: Record<string, string>): $Endpoint<LinkedGuardian[]> {
        return new $Endpoint<LinkedGuardian[]>({
            method: RequestMethod.GET,
            route: '/api/auth/my-guardians',
            additionalHeaders: headers,
            responseParser: null,
        });
    }

    /** Builds the guardian-only GET request for the complete read-only child report. */
    getChildProgressReport(
        headers: Record<string, string>,
        childId: number,
        language?: ReportLanguage,
    ): $Endpoint<GuardianChildProgressReport> {
        // Create the endpoint with the report path and optional language query.
        return new $Endpoint<GuardianChildProgressReport>({
            method: RequestMethod.GET, // Use the only HTTP method supported by this feature.
            route: '/api/guardians/me/children', // Use the guardian report route prefix.
            pathParameters: [String(childId), 'report'], // Append the learner id and report resource.
            queryParameters: language ? { language } : null, // Omit the query so the backend uses the active language.
            additionalHeaders: headers, // Attach the current session bearer token.
            responseParser: null, // Let the datasource install its typed response parser.
        });
    }
}

