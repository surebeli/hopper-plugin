import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLanguage from 'highlight.js/lib/languages/markdown';
import typescript from 'highlight.js/lib/languages/typescript';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { fetchTask, queryKeys } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import type { FrontmatterValue, TaskDetail } from '@/lib/types';

export const frontmatterFields = [
  'task_id',
  'adapter',
  'status',
  'pid',
  'start_time',
  'end_time',
  'exit_code',
  'duration_ms',
  'mode',
  'host_native',
  'session_id',
  'log',
  'started_by_pid',
] as const;

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdownLanguage);
hljs.registerLanguage('md', markdownLanguage);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('typescript', typescript);

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(value: string, lang: string) {
    const language = lang && hljs.getLanguage(lang) ? lang : '';
    const highlighted = language
      ? hljs.highlight(value, { language, ignoreIllegals: true }).value
      : escapeHtml(value);
    return `<pre class="hljs"><code class="${language ? `language-${language}` : ''}">${withLineNumbers(highlighted)}</code></pre>`;
  },
});

export function TaskDrawer({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isError, isLoading } = useQuery({
    queryKey: queryKeys.task(id),
    queryFn: () => fetchTask(id),
    enabled: Boolean(id),
  });
  useSSE(`/events/task/${id}`, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.task(id) });
  }, { enabled: Boolean(id) });

  return (
    <Sheet open={Boolean(id)} onOpenChange={(open) => !open && navigate('/')}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{id || 'task detail'}</SheetTitle>
          <SheetDescription>frontmatter and output body</SheetDescription>
        </SheetHeader>
        <TaskDetailPanel detail={data} isError={isError} isLoading={isLoading} />
      </SheetContent>
    </Sheet>
  );
}

export function TaskDetailPanel({
  detail,
  isError = false,
  isLoading = false,
}: {
  detail?: TaskDetail;
  isError?: boolean;
  isLoading?: boolean;
}) {
  const bodyHtml = useMemo(() => renderMarkdown(detail?.body || ''), [detail?.body]);

  if (isLoading) {
    return <div className="p-3 font-mono text-sm text-muted-foreground">[··· ] loading task</div>;
  }
  if (isError) {
    return <div className="p-3 font-mono text-sm text-destructive">task request failed</div>;
  }

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
      <section className="border-b border-border">
        <Table className="font-mono text-xs">
          <TableBody>
            {frontmatterFields.map((field) => (
              <TableRow key={field} className="h-8">
                <TableCell className="h-8 w-40 text-muted-foreground">{field}</TableCell>
                <TableCell className="h-8 truncate text-foreground">{formatValue(detail?.frontmatter[field])}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="min-h-0 overflow-auto p-3">
        <div
          className="font-mono text-sm leading-6 text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted/50 [&_code]:px-1 [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_pre]:mb-3 [&_pre]:overflow-auto [&_pre]:rounded-sm [&_pre]:border [&_pre]:border-border [&_pre]:bg-background [&_pre]:p-2 [&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_.hljs-line-code]:min-w-0 [&_.hljs-line-number]:select-none [&_.hljs-line-number]:pr-3 [&_.hljs-line-number]:text-right [&_.hljs-line-number]:text-muted-foreground [&_.hljs-line]:grid [&_.hljs-line]:grid-cols-[2rem_minmax(0,1fr)]"
          dangerouslySetInnerHTML={{ __html: bodyHtml || '<p class="text-muted-foreground">—</p>' }}
        />
      </section>
    </div>
  );
}

export function renderMarkdown(source: string) {
  return markdown.render(source);
}

function formatValue(value: FrontmatterValue | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function withLineNumbers(html: string) {
  const lines = html.replace(/\n$/, '').split('\n');
  return lines.map((line, index) => `<span class="hljs-line"><span class="hljs-line-number">${index + 1}</span><span class="hljs-line-code">${line || ' '}</span></span>`).join('\n');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
