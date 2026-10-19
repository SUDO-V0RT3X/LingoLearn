import { defineStore } from 'pinia';
import { ReviewQueueDataSource } from '@/features/review_queue_feature/datasources/reviewQueueDataSource';
import type { ReviewQueueRow } from '@/features/review_queue_feature/models/ReviewQueueTypes';
import { Exception } from '@/core/exceptions/models/ExceptionType';

// Everything waiting for a decision, as the queue screen shows it.
export const reviewQueueScreenStore = defineStore('reviewQueueStore', {
  state: () => ({
    items: [] as ReviewQueueRow[] ,
    isLoading: false as boolean,
    error: null as Exception | null,
  }),

  actions: {
    async load() {
      this.isLoading = true;
      this.error = null;
      const response = await ReviewQueueDataSource.getReviewQueue();
      if (response.error != null) this.error = response.error;
      else this.items = response.data ?? [];
      this.isLoading = false;
    },
  },
});
