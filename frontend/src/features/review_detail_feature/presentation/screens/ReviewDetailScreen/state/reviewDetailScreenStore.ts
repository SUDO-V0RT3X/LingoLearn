import { defineStore } from 'pinia';
import { ReviewDetailDataSource } from '@/features/review_detail_feature/datasources/reviewDetailDataSource';
import type { ReviewDetailRow } from '@/features/review_detail_feature/models/ReviewDetailTypes';
import { Exception } from '@/core/exceptions/models/ExceptionType';

// One piece of content under review, and the decision being made on it.
export const reviewDetailScreenStore = defineStore('reviewDetailScreenStore', {
  state: () => ({
    item: null as ReviewDetailRow | null,
    isLoading: false as boolean,
    isDeciding: false as boolean,
    // Why the content could not be loaded.
    error: null as Exception | null,
    // Why the last decision was not saved. The content stays on screen.
    decisionError: null as Exception | null,
  }),

  actions: {
    async load(id: number) {
      this.item = null;
      this.error = null;
      this.decisionError = null;
      this.isLoading = true;
      const response = await ReviewDetailDataSource.getReviewDetail(id);
      if (response.error != null || response.data == null) this.error = response.error;
      else this.item = response.data;
      this.isLoading = false;
    },

    // Approves or rejects the content. The reply carries the new status and the
    // decision history, so the screen shows what was recorded, not what was sent.
    async decide(decision: 'approved' | 'rejected', reason: string): Promise<boolean> {
      if (this.item == null || this.isDeciding) return false;
      this.isDeciding = true;
      this.decisionError = null;
      const response = await ReviewDetailDataSource.decideContent(this.item.id, decision, reason);
      this.isDeciding = false;

      if (response.error != null || response.data == null) {
        this.decisionError = response.error;
        return false;
      }

      this.item = response.data;
      return true;
    },
  },
});
