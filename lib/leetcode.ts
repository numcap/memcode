import { fetchPageJson } from './page-fetch';
import type { Difficulty, Problem, Submission } from './types';

// Runs in the isolated content script on leetcode.com, so these are same-origin
// requests that carry the user's session cookie.
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const json = await fetchPageJson('/graphql', {
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

const QUESTION_QUERY = `query memcodeQuestion($titleSlug: String!) {
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

export async function fetchLeetcodeProblem(slug: string): Promise<Problem> {
  const { question: q } = await gql<QuestionData>(QUESTION_QUERY, { titleSlug: slug });
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

const SUBMISSIONS_QUERY = `query memcodeSubmissions($questionSlug: String!) {
  questionSubmissionList(offset: 0, limit: 20, questionSlug: $questionSlug, status: 10) {
    submissions { id timestamp }
  }
}`;

const SUBMISSION_DETAILS_QUERY = `query memcodeSubmissionDetails($submissionId: Int!) {
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
