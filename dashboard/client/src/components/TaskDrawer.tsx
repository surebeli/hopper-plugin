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
import { LiveLog } from '@/components/LiveLog';
import { ProgressTimeline, relativeTime } from '@/components/ProgressTimeline';
import { StatusPill } from '@/components/StatusPill';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { fetchTask, queryKeys } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import type { FrontmatterValue, TaskDetail, TaskStatus } from '@/lib/types';

export const baseFrontmatterFields = [
  'task_id',
  'adapter',
  'status',
  'phase',
  'pid',
  'start_time',
  'end_time',
  'exit_code',
  'duration_ms',
  'mode',
  'host_native',
  'session_id',
  'log',
  'progress_log',
  'raw_log',
  'last_progress',
  'last_progress_at',
  'progress_seq',
  'terminal_event_emitted',
  'vendor_session_id',
  'started_by_pid',
] as const;
export const frontmatterFields = baseFrontmatterFields;

export function effectiveFrontmatterFields(frontmatter: Record<string, FrontmatterValue>) {
  const dynamic = Object.keys(frontmatter).filter((field) => !baseFrontmatterFields.includes(field as typeof baseFrontmatterFields[number]));
  return [...baseFrontmatterFields, ...dynamic];
}

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
        <TaskStatusStrip frontmatter={data?.frontmatter || {}} />
        <TaskDetailPanel detail={data} id={id} isError={isError} isLoading={isLoading} />
      </SheetContent>
    </Sheet>
  );
}

export function TaskDetailPanel({
  detail,
  id = '',
  isError = false,
  isLoading = false,
}: {
  detail?: TaskDetail;
  id?: string;
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
    <Tabs defaultValue="output">
      <TabsList>
        <TabsTrigger value="output">Output</TabsTrigger>
        <TabsTrigger value="progress">Progress</TabsTrigger>
        <TabsTrigger value="live-log">Live log</TabsTrigger>
        <TabsTrigger value="frontmatter">Frontmatter</TabsTrigger>
      </TabsList>
      <TabsContent value="output" className="overflow-auto p-3">
        <div
          className="markdown-body font-mono text-sm leading-6 text-foreground"
          dangerouslySetInnerHTML={{ __html: bodyHtml || '<p class="text-muted-foreground">—</p>' }}
        />
      </TabsContent>
      <TabsContent value="progress" className="flex flex-col overflow-auto p-3">
        <ProgressTimeline id={id || detail?.id || ''} />
      </TabsContent>
      <TabsContent value="live-log" className="flex">
        <LiveLog id={id || detail?.id || ''} />
      </TabsContent>
      <TabsContent value="frontmatter" className="overflow-auto">
        <FrontmatterTable frontmatter={detail?.frontmatter || {}} />
      </TabsContent>
    </Tabs>
  );
}

export function TaskStatusStrip({ frontmatter = {} }: { frontmatter?: TaskDetail['frontmatter'] }) {
  const status = statusValue(frontmatter.status);
  const phase = formatValue(frontmatter.phase);
  const last = formatValue(frontmatter.last_progress);
  const lastAt = typeof frontmatter.last_progress_at === 'string' ? frontmatter.last_progress_at : '';
  const terminal = typeof frontmatter.terminal_event_emitted === 'boolean'
    ? (frontmatter.terminal_event_emitted ? 'yes' : 'no')
    : '—';

  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2 font-mono text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <span>Status:</span>
        {status ? <StatusPill status={status} /> : <span>—</span>}
      </span>
      <span>Phase: <span className="text-foreground">{phase}</span></span>
      <span className="min-w-0 flex-1 truncate" title={last === '—' ? undefined : last}>
        Last: <span className="text-foreground">{truncate(last, 80)}</span>
        {lastAt ? <span> ({relativeTime(lastAt)})</span> : null}
      </span>
      <span>
        Terminal: <span className={terminal === 'yes' ? 'text-primary' : 'text-foreground'}>{terminal}</span>
      </span>
    </div>
  );
}

export function FrontmatterTable({ frontmatter }: { frontmatter: TaskDetail['frontmatter'] }) {
  return (
    <Table className="font-mono text-xs">
      <TableBody>
        {effectiveFrontmatterFields(frontmatter).map((field) => (
          <TableRow key={field} className="h-8">
            <TableCell className="h-8 w-40 text-muted-foreground">{field}</TableCell>
            <TableCell className="h-8 truncate text-foreground">{formatValue(frontmatter[field])}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function renderMarkdown(source: string) {
  return markdown.render(source);
}

function formatValue(value: FrontmatterValue | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function statusValue(value: FrontmatterValue | undefined): TaskStatus | null {
  return value === 'pending' || value === 'in-progress' || value === 'done' || value === 'failed' || value === 'removed'
    ? value
    : null;
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
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
