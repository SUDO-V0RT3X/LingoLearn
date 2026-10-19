# Cyclomatic Complexity: Learner Setup and Placement

McCabe cyclomatic complexity for the four largest class-like implementation units associated with learner setup and placement, with the calculation for every method.

## Method

The cyclomatic complexity of a method is the number of independent paths through it:

> **CC = D + 1**, where D is the number of decision points in the method.

Each of these adds one decision point: `if`, a ternary `? :`, a loop, a `case`, a `catch`, and each `&&`, `||` or `??` (every extra condition is another path). `else` and `return` add none. Decisions inside callbacks count toward the containing method. Database SQL text is not TypeScript control flow and is not counted.

For a class-like unit:

- **Total** = the sum of CC over its methods.
- **Average** = total ÷ number of methods.
- **Rating** uses the standard McCabe bands on the average: 1–10 low, 11–20 moderate, 21–50 high, over 50 very high. The highest single method is shown separately.

Pinia stores are counted as state classes: getters and actions are their methods. The two exported helper functions in `placementMethods.ts` are reported separately and are **not** included in the `PlacementMethods` class total. Vue screen components are not classes and are not included. The four largest units by source-file line count are listed below. The placement methods file contains the canonical English and Zulu question fixtures as well as the class; those data literals add to file length but are not methods or decision points.

## Results

| Class-like unit | File | Lines | Methods | Total CC | Average CC | Highest method | Average rating |
|---|---|---:|---:|---:|---:|---|---|
| `PlacementMethods` | [placementMethods.ts](../backend/src/routes/api/routes.api/placementRoutes/methods/placementMethods.ts) | 1,563 | 12 | 43 | 3.58 | `submitAnswer` (11) | **Low** |
| `placementTestStore` | [placementTestStore.ts](../frontend/src/features/onboarding_feature/presentation/screens/PlacementTestScreen/state/placementTestStore.ts) | 403 | 13 | 41 | 3.15 | `submitAnswer` (14) | **Low** |
| `PlacementDataSource` | [PlacementTestDataSource.ts](../frontend/src/features/onboarding_feature/datasources/PlacementTestDataSource.ts) | 228 | 4 | 16 | 4.00 | All four methods (4) | **Low** |
| `learnerSetupStore` | [learnerSetupStore.ts](../frontend/src/features/onboarding_feature/presentation/screens/LearnerSetupScreen/state/learnerSetupStore.ts) | 156 | 3 | 11 | 3.67 | `load` (5) | **Low** |

All four **class averages** are low by the attached report's rating rule. The highest individual methods, `placementTestStore.submitAnswer` (14) and `PlacementMethods.submitAnswer` (11), are moderate as individual methods; I have kept those values explicit rather than implying every method is low.

## `PlacementMethods`

Placement orchestration, SQL access, scoring, completion, and level persistence. [`backend/src/routes/api/routes.api/placementRoutes/methods/placementMethods.ts`](../backend/src/routes/api/routes.api/placementRoutes/methods/placementMethods.ts)

| Method | Decision points | Calculation | CC |
|---|---|---:|---:|
| `resolveTargetLanguage` | 2 × `if`, 1 × `&&`, 1 × `catch` | 4 + 1 | 5 |
| `startPlacement` | 1 × `if` | 1 + 1 | 2 |
| `submitAnswer` | 7 × `if`, 2 × `? :`, 1 × `??` | 10 + 1 | 11 |
| `quitPlacement` | 3 × `if`, 1 × `? :`, 1 × `??` | 5 + 1 | 6 |
| `saveLearnerLevel` | none | 0 + 1 | 1 |
| `completeAttempt` | 1 × `if` | 1 + 1 | 2 |
| `getLearnerLevel` | 1 × `??` | 1 + 1 | 2 |
| `incrementLearnerLevel` | 2 × `if`, 1 × `??` | 3 + 1 | 4 |
| `skipPlacement` | none | 0 + 1 | 1 |
| `getQuestions` | 2 × `if`, 1 × `? :` | 3 + 1 | 4 |
| `seedMissingQuestions` | 1 × `? :` | 1 + 1 | 2 |
| `getQuestionById` | 1 × `? :`, 1 × `??` | 2 + 1 | 3 |

**Total** = 5 + 2 + 11 + 6 + 1 + 2 + 2 + 4 + 1 + 4 + 2 + 3 = **43**

**Average** = 43 ÷ 12 = **3.58**, rated **Low**

### File helpers (not included in class total)

| Helper | Decision points | Calculation | CC |
|---|---|---:|---:|
| `formatPlacementResult` | 1 × `??` | 1 + 1 | 2 |
| `calculateAssignedLevel` | 6 × `if`, 1 × `||` | 7 + 1 | 8 |

### Worked example: `submitAnswer`

| Line | Code/branch | Decision points |
|---:|---|---:|
| 1192 | `if (attemptResult.rows.length === 0)` | 1 × `if` |
| 1198 | `if (attempt.completed)` | 1 × `if` |
| 1203 | `condition ? 'zulu' : 'english'` | 1 × `? :` |
| 1208 | `if (!question)` | 1 × `if` |
| 1212 | `if (question.order_index !== attempt.current_question_index)` | 1 × `if` |
| 1221 | `isCorrect ? attempt.score + 1 : attempt.score` | 1 × `? :` |
| 1228 | `if (!isCorrect)` | 1 × `if` |
| 1252 | `... ?? null` | 1 × `??` |
| 1254 | `if (nextQuestion)` | 1 × `if` |
| 1263 | `if (updatedAttempts.length === 0)` | 1 × `if` |

D = 10, so **CC = 10 + 1 = 11**.

## `placementTestStore`

Pinia state class: six progress/result getters and seven actions for start, answer, skip, quit, notice dismissal, answer selection, and reset. [`frontend/src/features/onboarding_feature/presentation/screens/PlacementTestScreen/state/placementTestStore.ts`](../frontend/src/features/onboarding_feature/presentation/screens/PlacementTestScreen/state/placementTestStore.ts)

| Method | Decision points | Calculation | CC |
|---|---|---:|---:|
| `progressPercent` | 1 × `if` | 1 + 1 | 2 |
| `currentLevelNumber` | 1 × `if` | 1 + 1 | 2 |
| `nextLevelNumber` | 1 × `??` | 1 + 1 | 2 |
| `tierQuestionIndex` | none | 0 + 1 | 1 |
| `questionsAnsweredInTier` | none | 0 + 1 | 1 |
| `tierProgressPercent` | none | 0 + 1 | 1 |
| `startTest` | 3 × `if` | 3 + 1 | 4 |
| `submitAnswer` | 8 × `if`, 1 × `||`, 4 × `??` | 13 + 1 | 14 |
| `skipPlacement` | 2 × `if` | 2 + 1 | 3 |
| `quitTest` | 3 × `if`, 2 × `||` | 5 + 1 | 6 |
| `clearUnlockedLevel` | none | 0 + 1 | 1 |
| `selectOption` | 1 × `if`, 1 × `||` | 2 + 1 | 3 |
| `reset` | none | 0 + 1 | 1 |

**Total** = 2 + 2 + 2 + 1 + 1 + 1 + 4 + 14 + 3 + 6 + 1 + 3 + 1 = **41**

**Average** = 41 ÷ 13 = **3.15**, rated **Low**

## `PlacementDataSource`

Frontend network boundary for starting, grading, skipping, and quitting a placement attempt. Each operation converts API/transport outcomes to a non-throwing data-source response. [`frontend/src/features/onboarding_feature/datasources/PlacementTestDataSource.ts`](../frontend/src/features/onboarding_feature/datasources/PlacementTestDataSource.ts)

| Method | Decision points | Calculation | CC |
|---|---|---:|---:|
| `startPlacement` | 1 × `if`, 1 × `||`, 1 × `catch` | 3 + 1 | 4 |
| `submitAnswer` | 1 × `if`, 1 × `||`, 1 × `catch` | 3 + 1 | 4 |
| `skipPlacement` | 1 × `if`, 1 × `||`, 1 × `catch` | 3 + 1 | 4 |
| `quitPlacement` | 1 × `if`, 1 × `||`, 1 × `catch` | 3 + 1 | 4 |

**Total** = 4 + 4 + 4 + 4 = **16**

**Average** = 16 ÷ 4 = **4.00**, rated **Low**

## `learnerSetupStore`

Pinia state class for loading and saving learner setup preferences and refreshing the server-computed access policy. [`frontend/src/features/onboarding_feature/presentation/screens/LearnerSetupScreen/state/learnerSetupStore.ts`](../frontend/src/features/onboarding_feature/presentation/screens/LearnerSetupScreen/state/learnerSetupStore.ts)

| Method | Decision points | Calculation | CC |
|---|---|---:|---:|
| `load` | 3 × `if`, 1 × `??` | 4 + 1 | 5 |
| `save` | 1 × `if`, 1 × `||`, 1 × `??` | 3 + 1 | 4 |
| `checkAccess` | 1 × `if` | 1 + 1 | 2 |

**Total** = 5 + 4 + 2 = **11**

**Average** = 11 ÷ 3 = **3.67**, rated **Low**

## Rating note

The requested “low” result is satisfied for all four classes using the attached document's **class-average** rating rule. The method-level maximums are also reported honestly: `placementTestStore.submitAnswer` is **14** and `PlacementMethods.submitAnswer` is **11**, which are moderate as individual methods under the same bands. The other highest methods are 5 or lower. A low class average does not mean every individual method is low.