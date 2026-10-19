import { ContentEndpoints } from "./feature_endpoints/contentEndpoints";
import { AuthEndpoints } from "./feature_endpoints/authEndpoints";
import { OnboardingEndpoints } from "./feature_endpoints/onboardingEndpoints";
import { PlacementEndpoints } from "./feature_endpoints/placementEndpoints";
import { TaxonomyEndpoints } from "./feature_endpoints/taxonomyEndpoints";
import { MediaEndpoints } from "./feature_endpoints/mediaEndpoints";
import { ReviewQueueEndpoints } from "./feature_endpoints/reviewQueueEndpoints";
import { ReviewDetailEndpoints } from "./feature_endpoints/reviewDetailEndpoints";
import { TestAttemptEndpoints } from "./feature_endpoints/testAttemptEndpoints";
import { ProgressEndpoints } from "./feature_endpoints/progressEndpoints";
import { AdminUserEndpoints } from "./feature_endpoints/adminUserEndpoints";
import { ReadingEndpoints } from "./feature_endpoints/readingEndpoints";
import { RecordingEndpoints } from "./feature_endpoints/recordingEndpoints";

// Central registry: one static instance per resource.
// Add your slice's endpoint class here; never instantiate one elsewhere.
export class Endpoints {
  static Auth = new AuthEndpoints();         // identity and access
  static Onboarding = new OnboardingEndpoints(); // onboarding preferences
  static Placement = new PlacementEndpoints();   // placement test assessment
  static Content = new ContentEndpoints();   // content builder
  static Taxonomy = new TaxonomyEndpoints(); // media and taxonomy
  static Media = new MediaEndpoints();       // media and taxonomy
  static ReviewQueue = new ReviewQueueEndpoints();   // moderation
  static ReviewDetail = new ReviewDetailEndpoints(); // moderation
  static Progress = new ProgressEndpoints(); // learner progress and challenge flow
  static AdminUsers = new AdminUserEndpoints(); // administrator account management
  static TestAttempts = new TestAttemptEndpoints(); // learner experience: tests and My Learning
  static Reading = new ReadingEndpoints();   // learner experience: saved reading progress
  static Recordings = new RecordingEndpoints(); // learner experience: saved read-aloud recordings
}
