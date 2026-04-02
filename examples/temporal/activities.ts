/**
 * Temporal Activities for the Strands checkpoint-mode agent.
 *
 * Each Activity call runs one chunk of the agent loop: either a model call
 * or tool execution. The Agent instance is shared across calls via the
 * Worker process (not serialized through Temporal).
 *
 * Agent state (messages, appState) is persisted to disk after each step
 * via SessionManager, so a new Worker process can restore state and resume.
 */

import {
  Agent,
  SessionManager,
  FileStorage,
  type Checkpoint,
  type CheckpointResult,
} from '../../src/index.js'

/**
 * Module-level Agent instance, initialized by the Worker before it starts
 * polling. Activities close over this reference.
 */
let _agent: Agent | undefined
let _sessionManager: SessionManager | undefined

/**
 * Called by the Worker at startup to set the shared Agent instance.
 */
export function setAgent(agent: Agent, sessionManager: SessionManager): void {
  _agent = agent
  _sessionManager = sessionManager
}

function getAgent(): Agent {
  if (!_agent) {
    throw new Error('Agent not initialized. Call setAgent() before starting the Worker.')
  }
  return _agent
}

/**
 * Tracks how many times this activity has been called in this worker process.
 */
let _callCount = 0
let _crashAfterCall = 0

/**
 * Set which call number should kill the process AFTER completing (0 = disabled).
 * The activity succeeds and Temporal caches the result, then the process dies.
 */
export function crashAfterCall(callNumber: number): void {
  _crashAfterCall = callNumber
}

/**
 * Runs one step of the agent loop.
 *
 * On the first call, pass `prompt` with no checkpoint.
 * On subsequent calls, pass the checkpoint from the previous result.
 *
 * Returns a CheckpointResult: either `{ done: true, result }` or
 * `{ done: false, checkpoint }`.
 */
export async function runAgentStep(input: {
  prompt?: string
  checkpoint?: Checkpoint
}): Promise<CheckpointResult> {
  _callCount++
  const agent = getAgent()

  console.log(`[Activity] call #${_callCount}, checkpoint: ${input.checkpoint?.position ?? 'none'}`)

  // Restore agent state from session storage before each step.
  // On the first call this is a no-op (no snapshot exists yet).
  // On subsequent calls (including after a crash), this restores
  // messages and appState from the last saved snapshot.
  if (input.checkpoint && _sessionManager) {
    await _sessionManager.restoreSnapshot({ target: agent })
  }

  const result = await agent.invokeWithCheckpoint(
    input.prompt,
    input.checkpoint ? { checkpoint: input.checkpoint } : undefined
  )

  // Save agent state after each step so a new worker can resume
  if (_sessionManager) {
    await _sessionManager.saveSnapshot({ target: agent, isLatest: true })
  }

  console.log(`[Activity] call #${_callCount} completed: ${result.done ? 'done' : result.checkpoint.position}`)

  if (_crashAfterCall > 0 && _callCount === _crashAfterCall) {
    console.log(`[Activity] KILLING PROCESS to simulate system crash.`)
    console.log(`[Activity] Restart the worker (with crashAfterCall(0)) to resume.`)
    setTimeout(() => process.exit(1), 200)
  }

  return result
}
