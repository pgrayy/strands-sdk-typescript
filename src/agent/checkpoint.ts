/**
 * Checkpoint support for the agent loop.
 *
 * Enables durable execution by allowing the agent loop to pause at defined
 * boundaries (after model calls, after tool execution) and resume from
 * where it left off. External orchestrators (Temporal, Step Functions, etc.)
 * can use this to cache step results and recover from crashes.
 */

import type { Message, StopReason } from '../types/messages.js'
import type { JSONValue } from '../types/json.js'

/**
 * Position within the agent loop where execution can be paused and resumed.
 *
 * - `'afterModel'`: Model call completed, tools not yet executed.
 *   The model response is in `modelMessage`. If `stopReason` is `'toolUse'`,
 *   the next resume will execute tools. Otherwise the invocation is complete.
 *
 * - `'afterTools'`: Tool execution completed for this cycle.
 *   The next resume will call the model again with updated messages.
 */
export type CheckpointPosition = 'afterModel' | 'afterTools'

/**
 * Represents a point in the agent loop where execution was paused.
 *
 * This object is returned to the caller when the agent yields a checkpoint.
 * The caller passes it back to resume execution from that point.
 *
 * The checkpoint is intentionally small. Conversation state (messages, appState)
 * is persisted separately via the agent's session/snapshot mechanism. The checkpoint
 * only carries the loop position and the data needed to resume from that position.
 */
export interface Checkpoint {
  /**
   * Where in the loop execution paused.
   */
  readonly position: CheckpointPosition

  /**
   * The stop reason from the model call that preceded this checkpoint.
   * Used to determine whether to execute tools or finish on resume.
   */
  readonly stopReason: StopReason

  /**
   * The model's response message (assistant message with text or tool use blocks).
   * Stored in the checkpoint so it can be appended to messages on resume
   * without re-calling the model.
   */
  readonly modelMessage: Message

  /**
   * The tool result message, present only at `'afterTools'` position.
   * Contains the tool result blocks from executing the tools requested
   * by the model.
   */
  readonly toolResultMessage?: Message

  /**
   * Monotonically increasing cycle index within this invocation.
   * Used to correlate checkpoint positions across resume calls.
   */
  readonly cycleIndex: number

  /**
   * Optional application data that the caller can attach to the checkpoint.
   * Strands does not read or modify this. Useful for external orchestrators
   * to store correlation IDs, workflow run IDs, etc.
   */
  readonly appData?: Record<string, JSONValue>
}

/**
 * Result returned by the agent when running in checkpoint mode.
 *
 * Either the agent completed (done=true, result present) or it paused
 * at a checkpoint (done=false, checkpoint present).
 */
export type CheckpointResult =
  | {
      /** The invocation completed. */
      readonly done: true
      /** The final agent result. */
      readonly result: import('../types/agent.js').AgentResult
    }
  | {
      /** The invocation paused at a checkpoint. */
      readonly done: false
      /** The checkpoint to pass back on the next call to resume. */
      readonly checkpoint: Checkpoint
    }
