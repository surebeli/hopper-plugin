// hopper-async — OpenCode plugin shim for Tier C native async
// Anchor: hosts/opencode/plugins/hopper-async.ts
//
// The repository now enforces a hard host!=vendor rule. This native plugin
// path always routes to OpenCode itself as the worker, so it would violate the
// rule by making host == vendor. Keep the plugin installed as a clear error
// surface that redirects users to the wrapper/dispatcher path instead.

interface ToolArgs {
  taskId: string;
  systemPrompt?: string;
}

export default async function hopperAsync(_ctx: unknown) {
  return {
    tools: [{
      name: 'hopper_dispatch',
      description: 'Disabled shim: use hopper-opencode --background or invoke hopper-dispatch --background from a shell tool to preserve host!=vendor.',
      args: {
        taskId: { type: 'string', description: 'Task ID from .hopper/queue.md.' },
        systemPrompt: { type: 'string', optional: true, description: 'Unused in the disabled shim.' },
      },
      async execute(args: ToolArgs) {
        throw new Error(
          `hopper_dispatch: OpenCode native plugin path is disabled by the host!=vendor rule for task '${args.taskId}'. ` +
          'Use `hopper-opencode <task-id> --background` or invoke `hopper-dispatch --background` from a shell tool instead.'
        );
      },
    }],
    hooks: {},
  };
}
