import { defineStore } from 'pinia';
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { AuthDataSource } from '../datasources/authDataSource';

export type UserRole = 'learner' | 'guardian' | 'moderator' | 'author' | 'administrator';

export type PublicUser = {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  role: UserRole;
  requiresGuardianLink: boolean;
  // The language the account last chose for menus and buttons, or null when it
  // never has. Optional because a user cached before this field existed lacks it.
  interfaceLanguage?: 'english' | 'zulu' | null;
};

export type AuthResponse = {
  user: PublicUser;
  token: string;
};

export type SignUpInput =
  | { role: 'learner'; firstName: string; lastName: string; username: string; password: string }
  | { role: Exclude<UserRole, 'learner'>; firstName: string; lastName: string; email: string; password: string };

export type RedeemParentLinkResponse = {
  child: PublicUser;
  linkedAt: string;
};

/** A guardian linked to the signed-in learner, as the learner sees them: a name only. */
export type LinkedGuardian = {
  firstName: string;
  lastName: string;
  linkedAt: string;
};

/**
 * Reads the last signed-in user from browser storage so a page refresh can keep
 * the local UI in sync with the stored session token.
 */
function readStoredUser(): PublicUser | null {
  const rawUser = window.localStorage.getItem('lingolearn_auth_user');
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as PublicUser;
  } catch {
    window.localStorage.removeItem('lingolearn_auth_user');
    return null;
  }
}

export const authStore = defineStore('authStore', {
  state: () => ({
    currentUser: readStoredUser(),
    token: window.localStorage.getItem('lingolearn_auth_token'),
    linkCode: null as string | null,
    linkCodeExpiresAt: null as string | null,
    children: [] as Array<PublicUser & { linkedAt: string }>,
    hasLoadedChildren: false,
    guardians: [] as LinkedGuardian[],
    isLoading: false,
    error: null as Exception | null,
  }),
  actions: {
    clearError() {
      this.error = null;
    },
    clearTransientState() {
      this.error = null;
      this.linkCode = null;
      this.linkCodeExpiresAt = null;
      this.children = [];
      this.hasLoadedChildren = false;
      this.guardians = [];
    },
    /**
     * Saves the successful authentication response in both Pinia state and
     * localStorage. This gives the rest of the frontend access to the current
     * user and lets refreshes reuse the same session token.
     */
    setSession(session: AuthResponse) {
      this.clearTransientState();
      this.currentUser = session.user;
      this.token = session.token;
      window.localStorage.setItem('lingolearn_auth_token', session.token);
      window.localStorage.setItem('lingolearn_auth_user', JSON.stringify(session.user));
    },
    /**
     * Restores the cached auth token and user from localStorage. If the stored
     * user JSON is corrupt, it clears the local auth data and forces a fresh
     * sign-in instead of leaving the UI in a half-authenticated state.
     */
    restoreLocalSession() {
      const token = window.localStorage.getItem('lingolearn_auth_token');
      const user = window.localStorage.getItem('lingolearn_auth_user');
      if (!token || !user) return false;

      try {
        this.currentUser = JSON.parse(user) as PublicUser;
        this.token = token;
        return true;
      } catch {
        this.token = null;
        window.localStorage.removeItem('lingolearn_auth_token');
        window.localStorage.removeItem('lingolearn_auth_user');
        return false;
      }
    },
    /**
     * Records a language the signed-in user just chose on the cached user, so a
     * refresh applies that choice and not the one they had at sign-in. Changed
     * in place: it is the same user, and nothing watching for a new sign-in
     * should run again.
     */
    rememberInterfaceLanguage(language: 'english' | 'zulu') {
      if (!this.currentUser) return;
      this.currentUser.interfaceLanguage = language;
      window.localStorage.setItem('lingolearn_auth_user', JSON.stringify(this.currentUser));
    },
    /**
     * Revalidates the saved browser session with the backend. This is used on
     * protected page loads so expired demo tokens are cleared immediately after
     * a refresh instead of leaving the onboarding UI signed in from localStorage.
     */
    async restoreServerSession() {
      const token = window.localStorage.getItem('lingolearn_auth_token');
      if (!token) {
        this.currentUser = null;
        this.token = null;
        window.localStorage.removeItem('lingolearn_auth_user');
        this.clearTransientState();
        return false;
      }

      const response = await AuthDataSource.me(token);
      if (response.error || !response.data) {
        this.currentUser = null;
        this.token = null;
        window.localStorage.removeItem('lingolearn_auth_token');
        window.localStorage.removeItem('lingolearn_auth_user');
        this.clearTransientState();
        return false;
      }

      this.currentUser = response.data;
      this.token = token;
      window.localStorage.setItem('lingolearn_auth_user', JSON.stringify(response.data));
      return true;
    },
    /**
     * Sends the role-specific signup form to the backend. On success, the new
     * account is treated as signed in immediately because the backend returns a
     * session token with the created user.
     */
    async signUp(input: SignUpInput) {
      this.isLoading = true;
      this.error = null;

      const response = await AuthDataSource.signUp(input);
      this.isLoading = false;

      if (response.error || !response.data) {
        this.error = response.error;
        return false;
      }

      this.setSession(response.data);
      return true;
    },
    /**
     * Sends username/email credentials to the backend. Learners sign in with a
     * username, while guardians and staff roles sign in with email, but both use
     * the same identifier field in the UI.
     */
    async login(input: { identifier: string; password: string }) {
      this.isLoading = true;
      this.error = null;

      const response = await AuthDataSource.login(input);
      this.isLoading = false;

      if (response.error || !response.data) {
        this.error = response.error;
        return false;
      }

      this.setSession(response.data);
      return true;
    },
    /**
     * Signs the user out by revoking the server-side session when a token is
     * available, then clears the cached user, token, parent-link code, children
     * and any current auth error.
     */
    async logout() {
      const activeToken = this.token;
      if (activeToken) await AuthDataSource.logout(activeToken);

      this.currentUser = null;
      this.token = null;
      window.localStorage.removeItem('lingolearn_auth_token');
      window.localStorage.removeItem('lingolearn_auth_user');
      this.clearTransientState();
    },
    /**
     * Requests a one-minute parent-link code for the signed-in learner. The
     * action refuses to run without a current user so parent-linking cannot be
     * tested with stale demo identities.
     */
    async createLinkCode() {
      if (!this.currentUser) {
        this.error = new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'Please sign in first.',
          statusCode: 401,
        });
        return false;
      }

      this.isLoading = true;
      this.error = null;

      const response = await AuthDataSource.createLinkCode(this.token);
      this.isLoading = false;

      if (response.error || !response.data) {
        this.error = response.error;
        return false;
      }

      this.linkCode = response.data.code;
      this.linkCodeExpiresAt = response.data.expiresAt;
      return true;
    },
    /**
     * Redeems a learner's parent-link code from the signed-in guardian or
     * administrator account. After a successful redemption it immediately reloads
     * the linked-children list so the newly linked learner appears on screen.
     */
    async redeemParentLink(code: string) {
      if (!this.currentUser) {
        this.error = new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'Please sign in first.',
          statusCode: 401,
        });
        return false;
      }

      this.isLoading = true;
      this.error = null;

      const response = await AuthDataSource.redeemParentLink(code, this.token);
      this.isLoading = false;

      if (response.error || !response.data) {
        this.error = response.error;
        return false;
      }

      await this.loadChildren();
      return true;
    },
    /**
     * Loads learners linked to the current guardian/admin account from the
     * backend. The backend reads the parent-child link table, so opening the
     * screen can safely restore existing links without showing learners whose
     * codes have not been redeemed.
     */
    async loadChildren() {
      if (!this.currentUser) {
        this.error = new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'Please sign in first.',
          statusCode: 401,
        });
        return false;
      }

      this.isLoading = true;
      this.error = null;

      const response = await AuthDataSource.getChildren(this.token);
      this.isLoading = false;

      if (response.error || !response.data) {
        this.error = response.error;
        return false;
      }

      this.children = response.data;
      this.hasLoadedChildren = true;
      return true;
    },
    /**
     * Loads the guardians linked to the signed-in learner, so a linked child's
     * page can say who they are linked to. A new guardian on the list means the
     * learner's code has done its job, so it is forgotten; a code a linked child
     * made for one more guardian stays while nobody has used it yet.
     */
    async loadMyGuardians() {
      if (!this.currentUser) return false;

      const response = await AuthDataSource.getMyGuardians(this.token);
      if (response.error || !response.data) return false;

      const grew = response.data.length > this.guardians.length;
      this.guardians = response.data;
      if (grew) {
        this.linkCode = null;
        this.linkCodeExpiresAt = null;
      }
      return true;
    },
  },
});
