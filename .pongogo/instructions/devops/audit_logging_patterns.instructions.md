---
pongogo_instruction_spec: "0.0.2"
title: "Audit Logging Patterns"
description: "Audit logging patterns for compliance, debugging, and operational visibility."
applies_to:
  - "**/*"
domains:
  - "devops"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - audit_logging
      - audit_service
      - audit_client
      - decision_logging
      - reasoning_capture
      - causality_chain
      - parent_event_id
      - correlation_id
      - root_event_id
      - rollback_support
      - meta-learning
      - training_dataset
      - decision_event
      - change_tracking
      - before/after
      - alternatives_considered
      - confidence_score
      - structured_logging
    nlp: "Audit service logging patterns for capturing decisions, reasoning, causality chains, and enabling rollback and meta-learning"
evaluation:
  success_signals:
    - All AI decisions logged with reasoning and confidence
    - Correlation IDs propagated across service calls
    - Before/after states captured for changes
    - Rollback strategy defined for reversible operations
    - Alternatives considered documented for decisions
  failure_signals:
    - Decisions logged without reasoning or confidence
    - Missing correlation IDs (can't trace across services)
    - No before/after snapshots for state changes
    - Rollback data insufficient for undo
    - Unstructured log messages (not JSON)
---


# Audit Logging Patterns

## Context

The Audit Service is the **primary training dataset** for meta-learning. Every decision, reasoning step, outcome, and feedback must be captured immutably.

---

## Quick Reference

**Key Audit Logging Patterns (Code Examples)**:

**1. Simple Event Log**:
```typescript
await auditClient.recordEvent({
  event_type: 'knowledge.created',
  service: 'knowledge-extraction',
  correlation_id: correlationId,
  context: {
    artifact_id: 'new-instruction',
    file_path: 'knowledge/instructions/workflow/new.md'
  },
  outcome: {
    status: 'success',
    result: { concept_id: 'new-concept' }
  }
});
```

**2. Decision Event with Reasoning**:
```typescript
await auditClient.recordDecision({
  event_type: 'learning.instruction_proposed',
  service: 'learning-service',
  correlation_id: correlationId,

  decision: {
    decision_type: 'instruction_proposal',
    input: {
      pattern_frequency: 5,
      contexts: ['CI timeout', 'test parallelization']
    },
    reasoning: 'Detected recurring CI timeout pattern across 5 work log entries. Pattern shows consistent solution: test parallelization. High confidence this is generalizable.',
    confidence: 0.87,
    alternatives_considered: [
      {
        option: 'Do not propose (confidence too low)',
        score: 0.87,
        rejected_reason: 'Confidence exceeds threshold of 0.80'
      }
    ],
    model_version: 'pattern-extractor-v1.2'
  },

  outcome: {
    status: 'success',
    result: { proposal_id: 'prop-789' }
  }
});
```

**3. Causality Chain (Parent/Child Events)**:
```typescript
// Root event
const rootEventId = await auditClient.recordEvent({
  event_type: 'routing.request',
  service: 'routing-service',
  correlation_id: correlationId,
  outcome: { status: 'pending' }
});

// Child event (caused by root)
await auditClient.recordEvent({
  event_type: 'routing.candidates_selected',
  service: 'routing-service',
  correlation_id: correlationId,
  parent_event_id: rootEventId,  // Links to root
  root_event_id: rootEventId,
  outcome: {
    status: 'success',
    result: { total_candidates: 23, filtered: 8 }
  }
});
```

**4. Change Tracking (Before/After)**:
```typescript
await auditClient.recordEvent({
  event_type: 'artifact.updated',
  context: { artifact_id: 'inst-123' },
  outcome: {
    status: 'success',
    changes: [{
      entity_type: 'artifact',
      entity_id: 'inst-123',
      operation: 'update',
      before: { status: 'draft', version: '1.0.0' },
      after: { status: 'active', version: '1.1.0' },
      diff: '+ status: active\n- status: draft'
    }]
  },
  rollback: {
    can_rollback: true,
    rollback_strategy: 'revert_to_version_1.0.0'
  }
});
```

**5. Error Logging with Context**:
```typescript
try {
  await processRequest();
} catch (error) {
  await auditClient.recordEvent({
    event_type: 'routing.error',
    service: 'routing-service',
    correlation_id: correlationId,
    context: {
      file_path: request.file_path,
      error_location: 'pattern_matching_phase'
    },
    outcome: {
      status: 'failure',
      error: {
        code: error.code,
        message: error.message,
        stack: error.stack
      }
    }
  });
}
```

**6. Structured Logging (Good vs Bad)**:
```typescript
// ✅ Good: Structured data
await auditClient.recordEvent({
  context: {
    file_path: 'src/api/auth.ts',
    domains: ['backend'],
    languages: ['typescript']
  },
  outcome: { status: 'success', result: { count: 5 } }
});

// ❌ Bad: Unstructured string
await auditClient.recordEvent({
  context: { message: 'Processing src/api/auth.ts' }
});
```

**7. Always Include Alternatives**:
```typescript
// ✅ Good: Shows decision process
alternatives_considered: [
  { option: 'Approve automatically', score: 0.87, rejected_reason: 'N/A - chosen' },
  { option: 'Send for manual review', score: 0.87, rejected_reason: 'Below review threshold' },
  { option: 'Reject', score: 0.87, rejected_reason: 'Above rejection threshold' }
]

// ❌ Bad: No alternatives
alternatives_considered: []
```

---

## Core Principles

1. **Log Everything**: All decisions, outcomes, and state changes
2. **Capture Reasoning**: Record why decisions were made, not just what happened
3. **Maintain Causality**: Link events in chains (parent_event_id, correlation_id)
4. **Enable Rollback**: Include enough data to undo changes
5. **Support Meta-Learning**: Structure events for aggregate analysis

## When to Log to Audit

**Always Log**:
- AI/automated decisions (with confidence, alternatives, reasoning)
- State changes (with before/after snapshots)
- Failures and errors (with full context)
- User feedback (explicit and implicit)
- System threshold/parameter changes

**Examples**:
- Learning Service proposes instruction → Log with pattern analysis
- Routing Service selects instructions → Log with ranking logic
- Registry Service updates artifact → Log with diff
- Auto-approval decision → Log with confidence calculation

## Audit Client Usage

### Setup

```typescript
// services/shared/audit-client.ts
import { AuditClient } from '{package}/audit-client';

export const auditClient = new AuditClient({
  serviceUrl: process.env.AUDIT_SERVICE_URL || 'http://audit:3008',
  serviceName: process.env.SERVICE_NAME
});
```

### Simple Event

```typescript
// Record a basic event
await auditClient.recordEvent({
  event_type: 'knowledge.created',
  service: 'knowledge-extraction',
  correlation_id: correlationId,
  context: {
    artifact_id: 'new-instruction',
    file_path: 'knowledge/instructions/workflow/new.md'
  },
  outcome: {
    status: 'success',
    result: { concept_id: 'new-concept' }
  }
});
```

### Decision Event (with Reasoning)

```typescript
// Record an AI/automated decision
await auditClient.recordDecision({
  event_type: 'learning.instruction_proposed',
  service: 'learning-service',
  correlation_id: correlationId,
  parent_event_id: analysisEventId,

  decision: {
    decision_type: 'instruction_proposal',
    input: {
      pattern_frequency: 5,
      contexts: ['CI timeout', 'test parallelization'],
      source_artifacts: ['work-log-1', 'work-log-2']
    },
    reasoning: 'Detected recurring CI timeout pattern across 5 work log entries in 2 weeks. Pattern shows consistent solution: test parallelization. High confidence this is a generalizable instruction.',
    confidence: 0.87,
    alternatives_considered: [
      {
        option: 'Do not propose (confidence too low)',
        score: 0.87,
        rejected_reason: 'Confidence exceeds threshold of 0.80 for proposal'
      }
    ],
    model_version: 'pattern-extractor-v1.2',
    thresholds_applied: {
      min_frequency: 3,
      min_confidence: 0.80
    }
  },

  outcome: {
    status: 'success',
    result: {
      proposal_id: 'prop-789',
      artifact_candidate: {
        title: 'GitHub Actions Test Parallelization',
        description: 'Parallelize Jest tests to prevent CI timeouts'
      }
    },
    changes: [{
      entity_type: 'learning_proposal',
      entity_id: 'prop-789',
      operation: 'create',
      after: { status: 'pending_review', confidence: 0.87 }
    }]
  },

  rollback: {
    can_rollback: true,
    rollback_strategy: 'delete_proposal'
  }
});
```

### Causality Chain

```typescript
// Start of workflow
const rootEventId = await auditClient.recordEvent({
  event_type: 'routing.request',
  service: 'routing-service',
  correlation_id: correlationId,
  context: { file_path: 'src/api/auth.ts' },
  outcome: { status: 'pending' }
});

// Child event (caused by root)
const candidatesEventId = await auditClient.recordEvent({
  event_type: 'routing.candidates_selected',
  service: 'routing-service',
  correlation_id: correlationId,
  parent_event_id: rootEventId,  // Links to root
  root_event_id: rootEventId,
  outcome: {
    status: 'success',
    result: { total_candidates: 23, filtered: 8 }
  }
});

// Another child event
await auditClient.recordEvent({
  event_type: 'routing.final_ranking',
  service: 'routing-service',
  correlation_id: correlationId,
  parent_event_id: candidatesEventId,  // Links to previous step
  root_event_id: rootEventId,
  outcome: {
    status: 'success',
    result: { selected: ['inst-1', 'inst-2', 'inst-3'] }
  }
});
```

## Event Schema

Full schema:

```typescript
interface AuditEvent {
  // Core
  event_id?: string;  // Auto-generated if not provided
  event_type: string;
  timestamp?: Date;   // Auto-generated if not provided
  service: string;

  // Causality
  correlation_id: string;
  parent_event_id?: string;
  root_event_id?: string;

  // Context
  context?: {
    project_id?: string;
    user_id?: string;
    session_id?: string;
    file_path?: string;
    artifact_ids?: string[];
    [key: string]: any;
  };

  // Decision data (for AI/automated decisions)
  decision?: {
    decision_type: string;
    input: Record<string, any>;
    reasoning: string;
    confidence: number;  // 0-1
    alternatives_considered?: Array<{
      option: string;
      score: number;
      rejected_reason: string;
    }>;
    model_version?: string;
    thresholds_applied?: Record<string, number>;
  };

  // Outcome
  outcome: {
    status: 'success' | 'failure' | 'partial' | 'pending';
    result?: Record<string, any>;
    error?: {
      code: string;
      message: string;
      stack?: string;
    };
    changes?: Array<{
      entity_type: string;
      entity_id: string;
      operation: 'create' | 'update' | 'delete';
      before?: Record<string, any>;
      after?: Record<string, any>;
      diff?: string;
    }>;
  };

  // Rollback support
  rollback?: {
    can_rollback: boolean;
    rollback_strategy: string;
    rollback_event_id?: string;
    rolled_back_by?: string;
  };
}
```

## Best Practices

### 1. Use Structured Logging

```typescript
// ✅ Good: Structured data
await auditClient.recordEvent({
  event_type: 'routing.request',
  context: {
    file_path: 'src/api/auth.ts',
    domains: ['backend'],
    languages: ['typescript']
  },
  outcome: { status: 'success', result: { count: 5 } }
});

// ❌ Bad: Unstructured string
await auditClient.recordEvent({
  event_type: 'routing.request',
  context: { message: 'Processing src/api/auth.ts with backend,typescript' }
});
```

### 2. Always Include Reasoning for Decisions

```typescript
// ✅ Good: Explains why
decision: {
  reasoning: 'Confidence (0.87) exceeds auto-approval threshold (0.85). Pattern frequency (5) meets minimum (3). Context diversity (0.72) is acceptable.',
  confidence: 0.87
}

// ❌ Bad: No explanation
decision: {
  confidence: 0.87
}
```

### 3. Capture Alternatives Considered

```typescript
// ✅ Good: Shows decision process
alternatives_considered: [
  { option: 'Approve automatically', score: 0.87, rejected_reason: 'N/A - chosen' },
  { option: 'Send for manual review', score: 0.87, rejected_reason: 'Below manual review threshold (0.80)' },
  { option: 'Reject', score: 0.87, rejected_reason: 'Above rejection threshold (0.50)' }
]

// ❌ Bad: No alternatives
alternatives_considered: []
```

### 4. Include Enough Data for Rollback

```typescript
// ✅ Good: Can undo
changes: [{
  entity_type: 'artifact',
  entity_id: 'inst-123',
  operation: 'update',
  before: { status: 'draft', version: '1.0.0' },
  after: { status: 'active', version: '1.1.0' }
}]

// ❌ Bad: Can't undo
changes: [{
  entity_type: 'artifact',
  entity_id: 'inst-123',
  operation: 'update'
}]
```

## Validation Checklist

- [ ] All AI decisions logged with reasoning and confidence
- [ ] Correlation IDs propagated across service calls
- [ ] Parent/child relationships maintained for workflows
- [ ] Before/after states captured for all changes
- [ ] Rollback strategy defined for reversible operations
- [ ] Alternatives considered documented for key decisions
- [ ] Model versions and thresholds recorded
- [ ] Error context includes enough detail for debugging

## Related Instructions

- `microservices_development` - Service structure and patterns
- `event_driven_architecture` - Event bus usage
- `rest_api_design` - API logging standards
