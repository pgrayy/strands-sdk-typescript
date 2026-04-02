import { describe, expect, it } from 'vitest'
import { Agent } from '../agent.js'
import { MockMessageModel } from '../../__fixtures__/mock-message-model.js'
import { createMockTool } from '../../__fixtures__/tool-helpers.js'
import { TextBlock, ToolResultBlock } from '../../types/messages.js'

describe('invokeWithCheckpoint', () => {
  describe('no tool use', () => {
    it('returns done on first call when model responds without tools', async () => {
      const model = new MockMessageModel().addTurn({ type: 'textBlock', text: 'Hello' })
      const agent = new Agent({ model, printer: false })

      const result = await agent.invokeWithCheckpoint('Hi')

      expect(result.done).toBe(true)
      if (result.done) {
        expect(result.result.stopReason).toBe('endTurn')
        expect(result.result.lastMessage.content[0]).toEqual(new TextBlock('Hello'))
      }
    })

    it('appends user message to agent.messages', async () => {
      const model = new MockMessageModel().addTurn({ type: 'textBlock', text: 'Hello' })
      const agent = new Agent({ model, printer: false })

      await agent.invokeWithCheckpoint('Hi')

      expect(agent.messages.length).toBe(2) // user + assistant
      expect(agent.messages[0]!.role).toBe('user')
      expect(agent.messages[1]!.role).toBe('assistant')
    })
  })

  describe('with tool use', () => {
    it('returns afterModel checkpoint when model requests tools', async () => {
      const model = new MockMessageModel()
        .addTurn({ type: 'toolUseBlock', name: 'myTool', toolUseId: 'tool-1', input: { q: 'test' } })
        .addTurn({ type: 'textBlock', text: 'Done' })

      const tool = createMockTool(
        'myTool',
        () =>
          new ToolResultBlock({
            toolUseId: 'tool-1',
            status: 'success',
            content: [new TextBlock('tool output')],
          })
      )

      const agent = new Agent({ model, tools: [tool], printer: false })

      const result = await agent.invokeWithCheckpoint('Use the tool')

      expect(result.done).toBe(false)
      if (!result.done) {
        expect(result.checkpoint.position).toBe('afterModel')
        expect(result.checkpoint.stopReason).toBe('toolUse')
        expect(result.checkpoint.cycleIndex).toBe(0)
        // Messages not yet appended (deferred until after tools)
        expect(agent.messages.length).toBe(1) // only user message
      }
    })

    it('executes tools when resuming from afterModel checkpoint', async () => {
      const model = new MockMessageModel()
        .addTurn({ type: 'toolUseBlock', name: 'myTool', toolUseId: 'tool-1', input: { q: 'test' } })
        .addTurn({ type: 'textBlock', text: 'Done' })

      const tool = createMockTool(
        'myTool',
        () =>
          new ToolResultBlock({
            toolUseId: 'tool-1',
            status: 'success',
            content: [new TextBlock('tool output')],
          })
      )

      const agent = new Agent({ model, tools: [tool], printer: false })

      // First call: model requests tool
      const first = await agent.invokeWithCheckpoint('Use the tool')
      expect(first.done).toBe(false)

      if (!first.done) {
        // Second call: resume from afterModel, execute tools
        const second = await agent.invokeWithCheckpoint(undefined, { checkpoint: first.checkpoint })

        expect(second.done).toBe(false)
        if (!second.done) {
          expect(second.checkpoint.position).toBe('afterTools')
          expect(second.checkpoint.toolResultMessage).toBeDefined()
          // Now messages should include assistant + tool result
          expect(agent.messages.length).toBe(3) // user + assistant + tool result
        }
      }
    })

    it('completes on third call after tools', async () => {
      const model = new MockMessageModel()
        .addTurn({ type: 'toolUseBlock', name: 'myTool', toolUseId: 'tool-1', input: {} })
        .addTurn({ type: 'textBlock', text: 'Final answer' })

      const tool = createMockTool(
        'myTool',
        () =>
          new ToolResultBlock({
            toolUseId: 'tool-1',
            status: 'success',
            content: [new TextBlock('result')],
          })
      )

      const agent = new Agent({ model, tools: [tool], printer: false })

      // Step 1: model call → wants tools
      const step1 = await agent.invokeWithCheckpoint('Go')
      expect(step1.done).toBe(false)

      // Step 2: execute tools
      const step2 = await agent.invokeWithCheckpoint(undefined, {
        checkpoint: (step1 as { done: false; checkpoint: import('../checkpoint.js').Checkpoint }).checkpoint,
      })
      expect(step2.done).toBe(false)

      // Step 3: model call → final answer
      const step3 = await agent.invokeWithCheckpoint(undefined, {
        checkpoint: (step2 as { done: false; checkpoint: import('../checkpoint.js').Checkpoint }).checkpoint,
      })
      expect(step3.done).toBe(true)
      if (step3.done) {
        expect(step3.result.stopReason).toBe('endTurn')
        expect(step3.result.lastMessage.content[0]).toEqual(new TextBlock('Final answer'))
      }

      // Messages: user, assistant(toolUse), toolResult, assistant(final)
      expect(agent.messages.length).toBe(4)
    })
  })

  describe('multi-cycle tool use', () => {
    it('handles multiple tool use cycles via checkpoints', async () => {
      const model = new MockMessageModel()
        .addTurn({ type: 'toolUseBlock', name: 'toolA', toolUseId: 'a-1', input: {} })
        .addTurn({ type: 'toolUseBlock', name: 'toolB', toolUseId: 'b-1', input: {} })
        .addTurn({ type: 'textBlock', text: 'All done' })

      const toolA = createMockTool(
        'toolA',
        () =>
          new ToolResultBlock({
            toolUseId: 'a-1',
            status: 'success',
            content: [new TextBlock('A result')],
          })
      )
      const toolB = createMockTool(
        'toolB',
        () =>
          new ToolResultBlock({
            toolUseId: 'b-1',
            status: 'success',
            content: [new TextBlock('B result')],
          })
      )

      const agent = new Agent({ model, tools: [toolA, toolB], printer: false })

      // Cycle 1: model → toolA
      let result = await agent.invokeWithCheckpoint('Go')
      expect(result.done).toBe(false)

      // Execute toolA
      result = await agent.invokeWithCheckpoint(undefined, {
        checkpoint: (result as { done: false; checkpoint: import('../checkpoint.js').Checkpoint }).checkpoint,
      })
      expect(result.done).toBe(false)

      // Cycle 2: model → toolB
      result = await agent.invokeWithCheckpoint(undefined, {
        checkpoint: (result as { done: false; checkpoint: import('../checkpoint.js').Checkpoint }).checkpoint,
      })
      expect(result.done).toBe(false)

      // Execute toolB
      result = await agent.invokeWithCheckpoint(undefined, {
        checkpoint: (result as { done: false; checkpoint: import('../checkpoint.js').Checkpoint }).checkpoint,
      })
      expect(result.done).toBe(false)

      // Cycle 3: model → final answer
      result = await agent.invokeWithCheckpoint(undefined, {
        checkpoint: (result as { done: false; checkpoint: import('../checkpoint.js').Checkpoint }).checkpoint,
      })
      expect(result.done).toBe(true)
      if (result.done) {
        expect(result.result.lastMessage.content[0]).toEqual(new TextBlock('All done'))
      }

      // user, assistant(toolA), toolResultA, assistant(toolB), toolResultB, assistant(final)
      expect(agent.messages.length).toBe(6)
    })
  })

  describe('simulated crash recovery', () => {
    it('can resume from checkpoint on a fresh agent with restored messages', async () => {
      // Simulate: agent runs model call, gets checkpoint, then "crashes"
      const model1 = new MockMessageModel()
        .addTurn({ type: 'toolUseBlock', name: 'myTool', toolUseId: 'tool-1', input: {} })
        .addTurn({ type: 'textBlock', text: 'Done' })

      const tool = createMockTool(
        'myTool',
        () =>
          new ToolResultBlock({
            toolUseId: 'tool-1',
            status: 'success',
            content: [new TextBlock('result')],
          })
      )

      const agent1 = new Agent({ model: model1, tools: [tool], printer: false })

      // Step 1: model call on agent1
      const step1 = await agent1.invokeWithCheckpoint('Go')
      expect(step1.done).toBe(false)

      // "Crash" — save messages and checkpoint
      const savedMessages = agent1.messages.map((m) => m.toJSON())
      const savedCheckpoint = (step1 as { done: false; checkpoint: import('../checkpoint.js').Checkpoint }).checkpoint

      // "Recovery" — new agent, restore messages, resume from checkpoint
      const model2 = new MockMessageModel()
        // This model only needs to handle the calls after recovery
        .addTurn({ type: 'textBlock', text: 'Done' })

      const agent2 = new Agent({
        model: model2,
        tools: [tool],
        printer: false,
        messages: savedMessages as import('../../types/messages.js').MessageData[],
      })

      // Step 2: execute tools on agent2
      const step2 = await agent2.invokeWithCheckpoint(undefined, { checkpoint: savedCheckpoint })
      expect(step2.done).toBe(false)

      // Step 3: final model call on agent2
      const step3 = await agent2.invokeWithCheckpoint(undefined, {
        checkpoint: (step2 as { done: false; checkpoint: import('../checkpoint.js').Checkpoint }).checkpoint,
      })
      expect(step3.done).toBe(true)
      if (step3.done) {
        expect(step3.result.lastMessage.content[0]).toEqual(new TextBlock('Done'))
      }
    })
  })
})
