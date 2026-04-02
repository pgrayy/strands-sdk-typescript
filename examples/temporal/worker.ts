/**
 * Temporal Worker that hosts the agent Workflow and Activities.
 *
 * The Worker creates the Strands Agent once at startup and shares it
 * across Activity calls via module-level state. The Agent's model,
 * tools, and configuration never cross Temporal's serialization boundary.
 * Only messages and checkpoint tokens (small, serializable data) flow
 * through Temporal's Event History.
 *
 * Agent state (messages, appState) is persisted to disk via SessionManager
 * after each checkpoint step, so a new Worker can restore and resume.
 */

import { Worker, NativeConnection, bundleWorkflowCode } from '@temporalio/worker'
import { Agent, BedrockModel, SessionManager, FileStorage, tool } from '../../src/index.js'
import { setAgent, crashAfterCall } from './activities.js'
import * as activities from './activities.js'
import { z } from 'zod'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main(): Promise<void> {
  // Session storage for persisting agent state between Activity calls
  const sessionManager = new SessionManager({
    sessionId: 'temporal-demo',
    storage: { snapshot: new FileStorage(path.join(os.tmpdir(), 'strands-temporal-demo')) },
    saveLatestOn: 'trigger', // We save manually in the activity, not via hooks
  })

  // Create the Strands Agent with tools
  const agent = new Agent({
    model: new BedrockModel({ modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0' }),
    tools: [
      tool({
        name: 'get_weather',
        description: 'Get the current weather for a location',
        inputSchema: z.object({
          location: z.string().describe('City name'),
        }),
        callback: async ({ location }) => {
          // Simulated weather lookup
          return `The weather in ${location} is 72°F and sunny.`
        },
      }),
    ],
    printer: false,
  })

  // Share the Agent and SessionManager with Activities
  setAgent(agent, sessionManager)

  // Kill the process after the 2nd activity call (tool execution) completes.
  // The activity result is cached by Temporal BEFORE the process dies.
  // Agent state is saved to disk BEFORE the crash.
  // When you restart the worker:
  //   - Agent state is restored from disk
  //   - Activity #1 (model call): cached by Temporal, not re-executed
  //   - Activity #2 (tool execution): cached by Temporal, not re-executed
  //   - Activity #3 (final model call): executes for real with restored messages
  //
  // Set to 0 to disable.
  crashAfterCall(0)

  // Bundle workflow code (Temporal runs workflows in a V8 isolate)
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: path.resolve(__dirname, './workflows.ts'),
  })

  // Connect to Temporal server
  const connection = await NativeConnection.connect({
    address: 'localhost:7233',
  })

  // Create and start the Worker
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'strands-agent',
    workflowBundle,
    activities,
  })

  console.log('Worker started, polling task queue: strands-agent')
  await worker.run()
}

main().catch((err) => {
  console.error('Worker failed:', err)
  process.exit(1)
})
