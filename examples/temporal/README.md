# Temporal + Strands Checkpoint Mode Example

This example demonstrates how to use Strands' checkpoint mode with Temporal
for durable agent execution. Each step of the agent loop (model call, tool
execution) becomes a separate Temporal Activity, giving you crash recovery
at the step level.

## Prerequisites

- Node.js 20+
- Temporal CLI (`brew install temporal` or [download](https://docs.temporal.io/cli))
- AWS credentials configured (for Bedrock model access)

## Setup

```bash
npm install
```

## Running

1. Start the Temporal dev server:

```bash
temporal server start-dev
```

2. In another terminal, start the worker:

```bash
npx tsx worker.ts
```

3. In another terminal, start the workflow:

```bash
npx tsx client.ts
```

## How it works

The Temporal Workflow is a simple loop that calls `invokeWithCheckpoint` as
an Activity. Each call does one chunk of work (a model call or tool execution)
and returns a checkpoint. The Workflow passes the checkpoint back on the next
call. Temporal caches each Activity result, so on crash recovery, completed
steps are skipped.

```
Workflow:
  call 1 → model call → checkpoint{afterModel}     ← cached by Temporal
  call 2 → tool execution → checkpoint{afterTools}  ← cached by Temporal
  call 3 → model call → done                        ← cached by Temporal
```

The Agent instance lives on the Worker. It is created once at startup and
reused across Activity calls. Messages and appState are persisted via
SessionManager between calls so the Agent can resume from where it left off.
