import { fetchPageJson, type JsonFetcher } from './page-fetch';
import type { Difficulty, Problem, Submission } from './types';

// By default this runs in the isolated content script on leetcode.com, so requests are
// same-origin and carry the user's session cookie. The dashboard passes remoteJson().
async function gql<T>(query: string, variables: Record<string, unknown>, fetchJson: JsonFetcher = fetchPageJson): Promise<T> {
  const json = await fetchJson('/graphql', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrftoken': csrfToken() },
    body: JSON.stringify({ query, variables }),
  });
  if (json.errors?.length) throw new Error(json.errors[0].message ?? 'LeetCode GraphQL error');
  return json.data as T;
}

function csrfToken(): string {
  return document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? '';
}

const QUESTION_QUERY = `query remcodeQuestion($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId title titleSlug content difficulty topicTags { name }
  }
}`;

interface QuestionData {
  question: {
    questionFrontendId: string;
    title: string;
    titleSlug: string;
    content: string | null;
    difficulty: string;
    topicTags: { name: string }[];
  } | null;
}

export async function fetchLeetcodeProblem(slug: string, fetchJson?: JsonFetcher): Promise<Problem> {
  const { question: q } = await gql<QuestionData>(QUESTION_QUERY, { titleSlug: slug }, fetchJson);
  if (!q) throw new Error(`LeetCode has no problem "${slug}"`);
  return {
    source: 'leetcode',
    slug: q.titleSlug,
    title: q.title,
    url: `https://leetcode.com/problems/${q.titleSlug}/`,
    difficulty: toDifficulty(q.difficulty),
    tags: q.topicTags.map((t) => t.name),
    // Premium problems come back with null content for non-subscribers.
    descriptionHtml: q.content ?? '',
    frontendId: q.questionFrontendId,
  };
}

// LeetCode's own search matches numbers as substrings ("1" finds 1, 191, 1139…),
// so ask for a page of matches and pick the exact one.
const NUMBER_QUERY = `query remcodeNumber($filters: QuestionListFilterInput) {
  questionList(categorySlug: "", limit: 50, skip: 0, filters: $filters) {
    data { questionFrontendId titleSlug }
  }
}`;

interface NumberData {
  questionList: { data: { questionFrontendId: string; titleSlug: string }[] } | null;
}

/** The slug for a problem number like "42", or undefined if there's no such problem. */
export async function findLeetcodeSlug(frontendId: string, fetchJson?: JsonFetcher): Promise<string | undefined> {
  const { questionList } = await gql<NumberData>(NUMBER_QUERY, { filters: { searchKeywords: frontendId } }, fetchJson);
  return questionList?.data.find((q) => q.questionFrontendId === frontendId)?.titleSlug;
}

const SUBMISSIONS_QUERY = `query remcodeSubmissions($questionSlug: String!) {
  questionSubmissionList(offset: 0, limit: 20, questionSlug: $questionSlug, status: 10) {
    submissions { id timestamp }
  }
}`;

const SUBMISSION_DETAILS_QUERY = `query remcodeSubmissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    code timestamp runtimeDisplay memoryDisplay lang { name }
  }
}`;

interface SubmissionsData {
  questionSubmissionList: { submissions: { id: string; timestamp: string }[] | null } | null;
}

interface SubmissionDetailsData {
  submissionDetails: {
    code: string;
    timestamp: number;
    runtimeDisplay?: string;
    memoryDisplay?: string;
    lang: { name: string };
  } | null;
}

/** The user's most recent accepted submission; undefined when logged out or none exists. */
export async function fetchLatestAcceptedSubmission(slug: string): Promise<Submission | undefined> {
  const list = await gql<SubmissionsData>(SUBMISSIONS_QUERY, { questionSlug: slug });
  const latest = [...(list.questionSubmissionList?.submissions ?? [])].sort(
    (a, b) => Number(b.timestamp) - Number(a.timestamp),
  )[0];
  if (!latest) return undefined;
  return fetchSubmission(latest.id);
}

export async function fetchSubmission(id: string): Promise<Submission | undefined> {
  const { submissionDetails: d } = await gql<SubmissionDetailsData>(SUBMISSION_DETAILS_QUERY, {
    submissionId: Number(id),
  });
  if (!d?.code) return undefined;
  return {
    code: d.code,
    lang: d.lang.name,
    at: d.timestamp * 1000,
    runtime: d.runtimeDisplay || undefined,
    memory: d.memoryDisplay || undefined,
  };
}

export function toDifficulty(value: unknown): Difficulty {
  return value === 'Easy' || value === 'Medium' || value === 'Hard' ? value : 'Unknown';
}
