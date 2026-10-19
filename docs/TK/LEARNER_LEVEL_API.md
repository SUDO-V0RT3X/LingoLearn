### Ownership and write path

All `learner_levels` writes now reside in `PlacementMethods`, the onboarding/placement owner. The normal placement result and skip/quit flows use its private `saveLearnerLevel` method; downstream code cannot call that helper directly. A search of backend source confirmed there are no learner-level writes outside this class.

Downstream code can increment a learner’s level through either:

- In-process: `PlacementMethods.incrementLearnerLevel(userId)`
- HTTP: `POST /api/placement/incrementLearnerLevel/{userId}`

The HTTP endpoint requires an authenticated administrator, validates that the learner ID is a positive safe integer, and returns `{ userId, levelNumber }`. Its contract is documented in `openapi.yaml`, and the downstream usage guidance is in `README.md`.

### Increment behavior

The increment uses one atomic PostgreSQL upsert, so concurrent requests cannot lose increments. If the learner has no level record yet, the first increment creates one at Level 2. Otherwise it advances the stored level by one. `LEAST(6, ...)` prevents a value above Level 6; a learner already at Level 6 stays there.

### Verification
One security boundary to be clear about: this prevents other application modules from using the level writer and directs them to the controlled API. It does **not** prevent a separate process with direct write privileges on PostgreSQL from changing the table. That stronger database-level restriction would require a non-owner runtime database role with restricted grants; this project currently configures a shared database connection.
