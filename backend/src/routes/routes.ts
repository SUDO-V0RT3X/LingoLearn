// Composition root — every resource's routes are mounted from here.
// THE MOUNT ORDER IS LOAD-BEARING:
//   1. public routes (no auth)
//   2. auth routes themselves (you can't be authed yet to log in)
//   3. the global auth gate  — app.use('/api/*', ...)
//   4. everything mounted after the gate requires auth
//   5. /api/* 404 catch-all
import type { Express } from 'express';
import { apply_public_api_routes } from './api/routes.api.public/publicRoutes.js';
import { apply_docs_routes } from './api/routes.api.public/docsRoutes.js';
import { apply_authorization_api_routes, apply_auth_session_api_routes } from './api/routes.api/authRoutes/authRoutes.js';
import { apply_auth_check_all_api_requests } from './api/routes.api/authRoutes/authApplyAllRoute.js';
import { apply_content_api_routes } from './api/routes.api/contentRoutes/contentRoutes.js';
import { apply_onboarding_api_routes } from './api/routes.api/onboardingRoutes/onboardingRoutes.js';
import { apply_placement_api_routes } from './api/routes.api/placementRoutes/placementRoutes.js';
import { apply_taxonomy_api_routes } from './api/routes.api/taxonomyRoutes/taxonomyRoutes.js';
import { apply_media_api_routes } from './api/routes.api/mediaRoutes/mediaRoutes.js';
import { apply_reviewQueue_api_routes } from './api/routes.api/reviewQueueRoutes/reviewQueueRoutes.js';
import { apply_reviewDetail_api_routes } from './api/routes.api/reviewDetailRoutes/reviewDetailRoutes.js';
import { apply_progress_api_routes } from './api/routes.api/progressRoutes/progressRoutes.js';
import { apply_child_progress_report_routes } from './api/routes.api/authRoutes/childProgressReportRoutes.js';
import { apply_admin_user_api_routes } from './api/routes.api/adminUserRoutes/adminUserRoutes.js';
import { apply_admin_parent_link_api_routes } from './api/routes.api/adminUserRoutes/adminParentLinkRoutes.js';
import { apply_test_attempts_api_routes } from './api/routes.api/testAttemptsRoutes/testAttemptsRoutes.js';
import { apply_reading_api_routes } from './api/routes.api/readingRoutes/readingRoutes.js';
import { apply_recording_api_routes } from './api/routes.api/recordingRoutes/recordingRoutes.js';

export function apply_api_routes(app: Express) {
    apply_public_api_routes(app);            //    public: no auth
    apply_docs_routes(app);                  //    swagger-ui at /api/docs
    apply_authorization_api_routes(app);     //    get auth tokens
    apply_auth_check_all_api_requests(app);  //    auth check to let the rest pass

    apply_auth_session_api_routes(app);      //    signed in: me, logout, parent links
    apply_child_progress_report_routes(app); //    guardian: read one linked child's progress report
    apply_content_api_routes(app);           //    content builder: drafts, save, submit
    apply_taxonomy_api_routes(app);          //    taxonomy: levels, tags, content tags
    apply_media_api_routes(app);             //    media: audio and image upload
    apply_onboarding_api_routes(app);        //    onboarding: learner settings and access
    apply_placement_api_routes(app);         //    onboarding/placement: placement testing & levels
    apply_reviewQueue_api_routes(app);       //    moderation: the review queue
    apply_reviewDetail_api_routes(app);      //    moderation: one item under review
    apply_progress_api_routes(app);          //    progression: level-up challenge
    apply_test_attempts_api_routes(app);     //    learner experience: tests and My Learning
    apply_reading_api_routes(app);           //    learner experience: saved reading progress
    apply_recording_api_routes(app);         //    learner experience: saved read-aloud recordings
    apply_admin_user_api_routes(app);        // administration: user search and account management
    apply_admin_parent_link_api_routes(app); // administration: parent-link management
    app.all('/api/*', (_req, res) => res.status(404).json({ error: 'no such endpoint' })); // 5
    
}
