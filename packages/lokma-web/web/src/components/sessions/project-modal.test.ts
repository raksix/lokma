/**
 * project-modal.test.ts — REQ-182 modal contract probe: the two modes
 * (create vs agent-open) and the cancel path.
 * Run: `bun src/components/sessions/project-modal.test.ts` from
 * `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { projectAckMessage } from '@/lib/ws';
import { planProjectAnswer } from './project-answer';
import { ProjectModal } from './project-modal';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const agentHtml = renderToStaticMarkup(
  React.createElement(ProjectModal, {
    open: true,
    mode: 'agent-open',
    agentValue: { name: 'fermag', cwd: '/root/fermag' },
    onClose: () => {},
    onResolve: () => {},
  }),
);
const createHtml = renderToStaticMarkup(
  React.createElement(ProjectModal, { open: true, onClose: () => {}, onCreated: () => {} }),
);

// 1. create mode — the full form, nothing locked.
assert(createHtml.includes('aria-label="New project"'), 'create: titled New project');
assert(createHtml.includes('Create project</button>'), 'create: footer submits with Create');
assert(createHtml.includes('Browse server folders'), 'create: folder browser affordance present');
assert(createHtml.includes('project-visibility'), 'create: visibility picker present');
assert(!createHtml.includes('data-agent-open-banner'), 'create: no agent banner');
assert(!/readOnly/i.test(createHtml), 'create: fields editable');
assert(createHtml.includes('value=""'), 'create: fields start empty');

// 2. agent-open mode — a locked confirmation carrying the agent's values.
assert(agentHtml.includes('aria-label="Open project"'), 'agent-open: titled Open project');
assert(agentHtml.includes('data-agent-open-banner'), 'agent-open: says who is opening');
assert(agentHtml.includes('Open project</span>'), 'agent-open: header names the mode');
assert(agentHtml.includes('Open project</button>'), 'agent-open: footer confirms with Open');
assert(agentHtml.includes('Dismiss the agent-opened project'), 'agent-open: close button names the dismissal');
assert(
  agentHtml.includes('value="fermag"') && agentHtml.includes('value="/root/fermag"'),
  'agent-open: seeded with the agent values at first render',
);
assert((agentHtml.match(/readOnly=""/g) ?? []).length === 2, 'agent-open: both fields locked');
assert(!agentHtml.includes('Browse server folders'), 'agent-open: no folder browser');
assert(!agentHtml.includes('project-visibility'), 'agent-open: no visibility picker');

// 3. cancel path — dismissal answers the agent exactly once, and only acks.
const pending = {
  actionId: 'ui_1',
  projectId: 'proj_1',
  projectName: 'fermag',
  cwd: '/root/fermag',
  targetSessionId: 'sess_1',
};
const cancelled = planProjectAnswer(pending, 'cancelled');
assert(cancelled !== null, 'cancel: a pending modal answers');
if (!cancelled) throw new Error('unreachable');
assert(cancelled.actionId === 'ui_1' && cancelled.outcome === 'cancelled', 'cancel: outcome is cancelled');
assert(
  cancelled.expandProjectId === null && cancelled.switchSessionId === null,
  'cancel: no reveal, no session switch — ack only',
);
const done = planProjectAnswer(pending, 'done');
assert(done !== null && done.outcome === 'done', 'done: confirm outcome');
if (!done) throw new Error('unreachable');
assert(
  done.expandProjectId === 'proj_1' && done.switchSessionId === 'sess_1',
  'done: reveal the group and land in the fresh session',
);
assert(planProjectAnswer(null, 'cancelled') === null, 'first answer wins: a late dismiss is a no-op');
assert(planProjectAnswer(null, 'done') === null, 'first answer wins: a late Open is a no-op');

// 4. the answer is a real wire frame — the server resolves the agent's gate on it.
const cancelFrame = JSON.parse(projectAckMessage('ui_1', 'cancelled')) as {
  type: string;
  actionId: string;
  outcome: string;
};
assert(
  cancelFrame.type === 'project_ack' && cancelFrame.actionId === 'ui_1' && cancelFrame.outcome === 'cancelled',
  'wire: the cancelled answer rides project_ack',
);
const doneFrame = JSON.parse(projectAckMessage('ui_1', 'done')) as { outcome: string };
assert(doneFrame.outcome === 'done', 'wire: the confirmed answer rides project_ack');

console.log('\nproject-modal probe: all checks passed');
