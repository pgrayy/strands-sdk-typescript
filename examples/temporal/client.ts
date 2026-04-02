/**
 * Temporal Client that starts the durable agent Workflow.
 *
 * This is the entry point. It connects to the Temporal server,
 * starts the Workflow, and waits for the result.
 */

import { Client, Connection } from '@temporalio/client'
import { durableAgentWorkflow } from './workflows.js'

async function main(): Promise<void> {
  const connection = await Connection.connect({
    address: 'localhost:7233',
  })

  const client = new Client({ connection })

  const prompt = process.argv[2] ?? "What's the weather in Seattle?"

  console.log(`Starting durable agent workflow with prompt: "${prompt}"`)

  const handle = await client.workflow.start(durableAgentWorkflow, {
    taskQueue: 'strands-agent',
    workflowId: `agent-${Date.now()}`,
    args: [prompt],
  })

  console.log(`Workflow started: ${handle.workflowId}`)
  console.log('Waiting for result...')

  const result = await handle.result()

  console.log('\nAgent response:')
  console.log(result)
}

main().catch((err) => {
  console.error('Client failed:', err)
  process.exit(1)
})
