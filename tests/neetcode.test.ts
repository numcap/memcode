import { beforeEach, describe, expect, it } from 'vitest';
import { toNeetcodeMeta } from '@/lib/hook';
import { problemFromMeta, readEditorCode } from '@/lib/neetcode';
import neetcodeMetadata from './fixtures/neetcode-metadata.json';

describe('readEditorCode', () => {
  beforeEach(() => localStorage.clear());

  it('reads the active editor tab for the preferred language', () => {
    localStorage.setItem('saved-coding-language', 'java');
    localStorage.setItem('two-integer-sum_python_tabs', JSON.stringify([{ code: 'py code' }]));
    localStorage.setItem('two-integer-sum_java_tabs', JSON.stringify([{ code: 'tab 0' }, { code: 'tab 1' }]));
    localStorage.setItem('two-integer-sum_java_activeTab', '1');
    expect(readEditorCode(localStorage, 'two-integer-sum')).toMatchObject({ code: 'tab 1', lang: 'java' });
  });

  it('falls back to the legacy single-code key', () => {
    localStorage.setItem('two-integer-sum_cpp', 'legacy code');
    expect(readEditorCode(localStorage, 'two-integer-sum')).toMatchObject({ code: 'legacy code', lang: 'cpp' });
  });

  it('returns undefined when nothing is stored', () => {
    localStorage.setItem('other-problem_python_tabs', JSON.stringify([{ code: 'x' }]));
    expect(readEditorCode(localStorage, 'two-integer-sum')).toBeUndefined();
  });
});

describe('problemFromMeta', () => {
  it('maps real NeetCode metadata and renders the Markdown description', () => {
    const problem = problemFromMeta(toNeetcodeMeta(neetcodeMetadata.data));
    expect(problem).toMatchObject({
      source: 'neetcode',
      slug: 'two-integer-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      tags: ['Array', 'Hash Table'],
      url: 'https://neetcode.io/problems/two-integer-sum/question',
    });
    expect(problem.descriptionHtml).toContain('<code>nums</code>');
  });
});
