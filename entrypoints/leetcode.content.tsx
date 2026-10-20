import { defineContentScript } from 'wxt/utils/define-content-script';
import { startCapture } from '@/components/startCapture';
import { fetchLatestAcceptedSubmission, fetchLeetcodeProblem } from '@/lib/leetcode';

// Matches the whole site (not just /problems/*) because LeetCode navigates client-side.
export default defineContentScript({
  matches: ['https://leetcode.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  main(ctx) {
    startCapture(ctx, {
      site: 'leetcode',
      loadProblem: fetchLeetcodeProblem,
      loadLatestCode: fetchLatestAcceptedSubmission,
    });
  },
});
