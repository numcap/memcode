import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import dart from 'highlight.js/lib/languages/dart';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import kotlin from 'highlight.js/lib/languages/kotlin';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import { useMemo, useState } from 'react';

const LANGUAGES = { c, cpp, csharp, dart, elixir, erlang, go, java, javascript, kotlin, php, python, ruby, rust, scala, sql, swift, typescript };
for (const [name, lang] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, lang);

// LeetCode / NeetCode language ids → highlight.js grammar names.
const ALIASES: Record<string, string> = {
  python3: 'python',
  golang: 'go',
  mysql: 'sql',
  mssql: 'sql',
  oraclesql: 'sql',
  postgresql: 'sql',
};

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => {
    const grammar = ALIASES[lang] ?? lang;
    if (!hljs.getLanguage(grammar)) return null;
    return hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value;
  }, [code, lang]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="code-block">
      <button type="button" className="mc-btn mc-btn-ghost code-copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      {/* highlight.js escapes the source, so its output is safe to inject. */}
      {html !== null ? (
        <pre>
          <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
