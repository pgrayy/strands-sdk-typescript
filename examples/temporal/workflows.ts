/**
 * Temporal Workflow for durable agent execution.
 *
 * This is the entire Workflow. It calls the agent step Activity in a loop,
 * passing checkpoints between calls. Temporal caches each Activity result
 * in its Event History. On crash recovery, completed steps return cached
 * results instantly and the loop resumes from the last incomplete step.
 *
 * The Workflow code is deterministic: it's just a loop that checks a flag
 * and passes data between Activity calls. All non-deterministic work
 * (model calls, tool execution) happens inside the Activity.
 */

import * as workflow from '@temporalio/workflow'
import type * as activities from './activities.js'

const { runAgentStep } = workflow.proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '10 seconds',
  retry: {
    maximumAttempts: 10,
    initialInterval: '5 seconds',
  },
})

/**
 * Runs a Strands agent to completion with per-step durability.
 *
 * @param prompt - The user's input prompt
 * @returns The agent's final text response
 */
export async function durableAgentWorkflow(prompt: string): Promise<string> {
  // First call: start the agent with the user prompt
  let result = await runAgentStep({ prompt })

  // Keep stepping until the agent is done
  while (!result.done) {
    result = await runAgentStep({ checkpoint: result.checkpoint })
  }

  // Extract text from the final message
  const lastMessage = result.result.lastMessage
  const textBlocks = lastMessage.content.filter(
    (block: { type?: string; text?: string }) => block.type === 'textBlock' || ('text' in block && !('toolUse' in block))
  )
  return textBlocks.map((block: { type?: string; text?: string }) => block.text ?? '').join('\n')
}
