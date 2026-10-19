# Cyclomatic complexity: content builder

The four largest classes in the content builder.

Each method: **CC = D + 1**, where D counts each `if`, `? :`, loop, `case`, `catch`, `&&`, `\|\|` and `??`. Each class is rated on its average CC per method, using McCabe's bands: 1–10 low, 11–20 moderate, 21–50 high, over 50 very high.

| Class | Methods | Average CC | Result |
|---|---|---|---|
| `contentBuilderScreenState` | 26 | 3.15 | **Low** |
| `ContentMethods` | 9 | 2.44 | **Low** |
| `ContentDataSource` | 9 | 3.67 | **Low** |
| `ContentEndpoints` | 8 | 1.50 | **Low** |

**Result: low** for all four classes.

## `contentBuilderScreenState`

[`state.ts`](../frontend/src/features/content_builder/presentation/state.ts) (a Pinia store: its actions are the methods)

| Method | Decision points | Calculation | CC |
|---|---|---|---|
| `canEdit` | 1 × `\|\|` | 1 + 1 | 2 |
| `loadAvailableTags` | 1 × `if`, 1 × `\|\|` | 2 + 1 | 3 |
| `loadDraft` | 2 × `if`, 1 × `\|\|` | 3 + 1 | 4 |
| `applyRecord` | none | 0 + 1 | 1 |
| `addPage` | 2 × `if` | 2 + 1 | 3 |
| `selectPage` | none | 0 + 1 | 1 |
| `removePage` | 3 × `if`, 3 × `\|\|`, 1 × `&&` | 7 + 1 | 8 |
| `addBlock` | 2 × `if` | 2 + 1 | 3 |
| `selectBlock` | 1 × `? :` | 1 + 1 | 2 |
| `isBlockEditable` | 2 × `&&` | 2 + 1 | 3 |
| `deleteBlock` | 3 × `if` | 3 + 1 | 4 |
| `writeBlock` | 1 × `if` | 1 + 1 | 2 |
| `moveBlock` | 3 × `if`, 2 × `? :` | 5 + 1 | 6 |
| `getLastBlockIndexOnCurrentPage` | none | 0 + 1 | 1 |
| `getTypeForPageAndBlock` | none | 0 + 1 | 1 |
| `touchSavedContent` | none | 0 + 1 | 1 |
| `save` | 2 × `if`, 1 × `? :`, 1 × `\|\|` | 4 + 1 | 5 |
| `setTitle` | 1 × `if` | 1 + 1 | 2 |
| `setLanguage` | 2 × `if` | 2 + 1 | 3 |
| `setChildFriendly` | 1 × `if` | 1 + 1 | 2 |
| `startNewDraft` | none | 0 + 1 | 1 |
| `deleteDraft` | 3 × `if`, 1 × `\|\|` | 4 + 1 | 5 |
| `setLevel` | 2 × `if` | 2 + 1 | 3 |
| `addChosenTag` | 2 × `if`, 1 × `\|\|` | 3 + 1 | 4 |
| `removeChosenTag` | 1 × `if` | 1 + 1 | 2 |
| `submit` | 5 × `if`, 3 × `\|\|`, 1 × `??` | 9 + 1 | 10 |

Average = (2 + 3 + 4 + 1 + 3 + 1 + 8 + 3 + 2 + 3 + 4 + 2 + 6 + 1 + 1 + 1 + 5 + 2 + 3 + 2 + 1 + 5 + 3 + 4 + 2 + 10) ÷ 26 = 82 ÷ 26 = **3.15**, **Low**

## `ContentMethods`

[`contentMethods.ts`](../backend/src/routes/api/routes.api/contentRoutes/methods/contentMethods.ts)

| Method | Decision points | Calculation | CC |
|---|---|---|---|
| `getContent` | 1 × `if` | 1 + 1 | 2 |
| `getMyContent` | none | 0 + 1 | 1 |
| `getPendingContent` | none | 0 + 1 | 1 |
| `getApprovedContent` | 3 × `??` | 3 + 1 | 4 |
| `createContent` | 3 × `??` | 3 + 1 | 4 |
| `editContent` | 3 × `??` | 3 + 1 | 4 |
| `deleteContent` | none | 0 + 1 | 1 |
| `submitContent` | 1 × `if` | 1 + 1 | 2 |
| `setReviewedStatus` | 2 × `if` | 2 + 1 | 3 |

Average = (2 + 1 + 1 + 4 + 4 + 4 + 1 + 2 + 3) ÷ 9 = 22 ÷ 9 = **2.44**, **Low**

## `ContentDataSource`

[`contentDataSource.ts`](../frontend/src/features/shared/datasources/contentDataSource.ts)

| Method | Decision points | Calculation | CC |
|---|---|---|---|
| `getContent` | 1 × `if`, 2 × `\|\|`, 1 × `catch` | 4 + 1 | 5 |
| `getMyContent` | none | 0 + 1 | 1 |
| `getPendingContent` | none | 0 + 1 | 1 |
| `getApprovedContent` | none | 0 + 1 | 1 |
| `list` | 1 × `if`, 2 × `\|\|`, 1 × `catch` | 4 + 1 | 5 |
| `createContent` | 1 × `if`, 2 × `\|\|`, 1 × `catch` | 4 + 1 | 5 |
| `editContent` | 1 × `if`, 2 × `\|\|`, 1 × `catch` | 4 + 1 | 5 |
| `submitContent` | 1 × `if`, 2 × `\|\|`, 1 × `catch` | 4 + 1 | 5 |
| `deleteContent` | 1 × `if`, 2 × `\|\|`, 1 × `catch` | 4 + 1 | 5 |

Average = (5 + 1 + 1 + 1 + 5 + 5 + 5 + 5 + 5) ÷ 9 = 33 ÷ 9 = **3.67**, **Low**

## `ContentEndpoints`

[`contentEndpoints.ts`](../frontend/src/core/endpoints/feature_endpoints/contentEndpoints.ts)

| Method | Decision points | Calculation | CC |
|---|---|---|---|
| `getContent` | none | 0 + 1 | 1 |
| `getMyContent` | none | 0 + 1 | 1 |
| `getPendingContent` | none | 0 + 1 | 1 |
| `getApprovedContent` | 3 × `if`, 1 × `? :` | 4 + 1 | 5 |
| `createContent` | none | 0 + 1 | 1 |
| `editContent` | none | 0 + 1 | 1 |
| `submitContent` | none | 0 + 1 | 1 |
| `deleteContent` | none | 0 + 1 | 1 |

Average = (1 + 1 + 1 + 5 + 1 + 1 + 1 + 1) ÷ 8 = 12 ÷ 8 = **1.50**, **Low**
