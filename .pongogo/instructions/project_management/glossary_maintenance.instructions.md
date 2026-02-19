---
pongogo_instruction_spec: "0.0.2"
title: "Glossary Maintenance"
description: "Maintain project glossary with consistent terminology across documentation."
applies_to:
  - "**/*"
domains:
  - "project_management"
priority: "P2"
pongogo_version: "2026-02-12"
source: "Original"

routing:
  priority: 1
  triggers:
    keywords:
      - glossary
      - terminology
      - project_glossary
      - PM_ontology
      - term_definition
      - glossary_maintenance
      - taxonomy
      - knowledge_graph
    nlp: "Systematic maintenance of Project Glossary as authoritative source for PM terminology and knowledge graph taxonomy"
evaluation:
  success_signals:
    - Term includes Definition, Category, Relationships, Usage, Example
    - Term added to both category section AND alphabetical index
    - Bidirectional cross-references created (See also)
    - Wiki submodule reference updated in main repo
    - New PM terms added immediately when introduced
  failure_signals:
    - Term missing required sections (Definition, Category)
    - One-location entry (category OR index, not both)
    - Missing cross-references to related terms
    - Forgot wiki submodule update in main repo
    - Vague or circular definitions
---


# Project Glossary Maintenance

**Purpose**: Establish systematic glossary maintenance ensuring Project Glossary remains authoritative, current, and complete as the foundational PM ontology for the knowledge graph.

**Philosophy**: The Project Glossary is a living taxonomy - comprehensive, precise entries enable agents to understand PM concepts consistently and make informed decisions without ambiguity. Glossary is the single source of truth for terminology, relationships, and taxonomy structure.

---

## When to Apply

This instruction applies when:

- **Scenario 1**: Introducing new PM concepts, processes, or terminology (new term requires glossary entry)
- **Scenario 2**: Clarifying existing terminology or resolving ambiguity (term definition needs refinement)
- **Scenario 3**: Discovering missing relationships or cross-references (term connections need documentation)
- **Scenario 4**: Completing Milestones, Epics, or significant Tasks (learning loop may surface new terms)
- **Scenario 5**: Creating or updating instruction files with domain-specific terminology (ensure terms defined)

---

## Quick Reference

**Most Common Patterns**:

**1. Add New Term to Glossary**:
```markdown
### Term Name

**Definition**: Clear, concise definition (1-2 sentences).

**Category**: Taxonomy bucket (PM Hierarchy, GitHub Objects, etc.)

**Relationships**:
- **Parent**: Parent concept (or "None" if top-level)
- **Children**: Child concepts (or "None" if leaf node)
- **Related**: Related terms in other categories

**Usage**: When/where this term is used in practice.

**Example**:
```
Concrete example demonstrating the term
```

**See also**: [[#related-term-1]], [[#related-term-2]]
```

**2. Update Existing Term**:
```bash
# Check current definition
grep -A 20 "^### Term Name" wiki/Project-Glossary.md

# Update with Edit tool maintaining structure
# Preserve Definition, Category, Relationships, Usage, Example, See also
```

**3. Validate Cross-References**:
```bash
# Check all "See also" links resolve
grep -o '\[\[#[a-z-]*\]\]' wiki/Project-Glossary.md | sort -u > refs.txt
grep "^### " wiki/Project-Glossary.md | sed 's/### //' > terms.txt
# Compare refs.txt to terms.txt to find broken links
```

**4. Commit Glossary Changes**:
```bash
cd {project_root}/wiki
git add Project-Glossary.md
git commit -m "Update Project Glossary: [description of changes]"
git push

cd {project_root}
git add wiki
git commit -m "Update wiki submodule: Glossary changes"
git push
```

---

## Core Principles

- **Single Source of Truth**: `wiki/Project-Glossary.md` is authoritative source for ALL project terminology
- **PM Ontology Foundation**: Glossary defines taxonomy structure for knowledge graph and agent reasoning
- **Structured Entries**: Every term includes Definition, Category, Relationships, Usage, Example, See also
- **Bidirectional Relationships**: Parent-child and related-term connections documented explicitly
- **Consistency Over Time**: Terms maintain consistent meaning; definition changes require decision archaeology
- **Immediate Update**: New terms added when introduced; don't accumulate glossary debt
- **Learning Loop Integration**: Learning loops and retrospectives surface new terms requiring documentation

## Step-by-Step Guidance

### Adding New Term

1. **Identify Terminology Trigger**
   - Introducing new PM concept in instruction files, docs, or wiki
   - Learning loop surfaces undefined term causing ambiguity
   - User introduces term needing formal definition
   - Expected outcome: Term identified as needing glossary entry
   - Rationale: Prevents terminology drift and agent confusion

2. **Validate Term Doesn't Exist**
   - Search glossary for term: `grep -i "### term" wiki/Project-Glossary.md`
   - Check for synonyms or related terms in same category
   - Verify term isn't covered under different name
   - Success indicator: Term confirmed as net-new addition
   - Rationale: Prevents duplicate entries with different names

3. **Determine Category and Relationships**
   - Assign to appropriate category: PM Hierarchy, GitHub Objects, Process Concepts, Agent Roles, Quality Concepts, Knowledge Architecture, Phases & Checklists
   - Identify parent concept (or "None" if top-level)
   - Identify child concepts (or "None" if leaf node)
   - List related terms in other categories
   - Expected outcome: Term positioned correctly in taxonomy
   - Rationale: Maintains ontology structure for knowledge graph

4. **Draft Complete Entry**
   - Write 1-2 sentence definition (clear, precise, unambiguous)
   - Document usage context (where/when term applies)
   - Create concrete example demonstrating term
   - List "See also" cross-references
   - Common variation: Terms with GitHub mappings include mapping details
   - Integration point: Examples reference real files/artifacts when possible

5. **Insert in Glossary (Two Locations)**
   - Add to category section (maintains category grouping)
   - Add to alphabetical index (enables quick lookup)
   - Maintain consistent formatting and structure
   - Success indicator: Term appears in both locations with full structure
   - Rationale: Dual-access pattern (browse by category OR lookup alphabetically)

6. **Update Cross-References**
   - Add "See also" link in new entry pointing to related terms
   - Update related terms' "See also" sections pointing back to new term
   - Verify all cross-reference links resolve (use anchor format: `[[#term-name]]`)
   - Expected outcome: Bidirectional navigation between related concepts
   - Rationale: Glossary as traversable knowledge graph, not flat list

7. **Commit and Push to Wiki**
   - Commit to wiki repository with descriptive message
   - Push to remote wiki
   - Update wiki submodule reference in main repo
   - Commit and push main repo submodule update
   - Success indicator: Changes visible in both wiki and main repo
   - Rationale: Maintains synchronized state across repositories

### Updating Existing Term

1. **Identify Update Trigger**
   - Term definition ambiguous or incomplete
   - Usage context changed
   - Relationships discovered or evolved
   - User feedback indicates confusion
   - Expected outcome: Clear rationale for update documented

2. **Document Change Rationale**
   - If definition changes significantly, create Decision Archive entry
   - Document why change needed (ambiguity, evolution, correction)
   - Preserve historical context if definition evolved over time
   - Success indicator: Change traceable and justified

3. **Update Term Entry**
   - Modify definition, usage, example, or relationships as needed
   - Maintain structure (don't remove required sections)
   - Update version metadata if glossary has version number
   - Expected outcome: Term entry accurate and complete

4. **Validate Cross-References Still Resolve**
   - Check all "See also" links in updated entry
   - Check other entries linking TO updated term
   - Update cross-references if term name changed
   - Success indicator: No broken links after update

5. **Commit with Context-Rich Message**
   - Explain what changed and why in commit message
   - Reference issue/PR/decision if applicable
   - Follow commit message format
   - Success indicator: Future agents understand why change was made

### Maintenance Triggers

**Automatic triggers** (glossary update REQUIRED):
- New PM concept introduced in any instruction file
- New process concept documented in docs/processes/
- New quality concept added to validation frameworks
- New agent role defined in Multi-Agent-Architecture.md
- Learning loop surfaces terminology ambiguity
- Milestone/Epic/Task completion retrospective identifies new terms

**On-demand triggers** (glossary review recommended):
- Quarterly glossary audit (completeness check)
- After major PM methodology changes
- When agents express confusion about term meaning
- After introducing new knowledge architecture patterns

---

## Examples

### Example 1: Adding New Term (Complete Workflow)

**Context**: Learning loop surfaces new term "Design Artifact" that needs formal definition.

```bash
#!/bin/bash
# Complete workflow for adding new glossary term

# Step 1: Validate term doesn't exist
cd {project_root}
grep -i "### Design Artifact" wiki/Project-Glossary.md
# (returns nothing - term is new)

# Step 2: Use Edit tool to add term to category section
# Add to "Process Concepts" section in wiki/Project-Glossary.md
```

```markdown
### Design Artifact

**Definition**: Structured document capturing technical design decisions, architecture diagrams, API contracts, or data models before implementation begins. Core component of design-first development.

**Category**: Process Concepts

**Relationships**:
- **Parent**: Design-First Development
- **Children**: Architecture Diagram, API Contract, Data Model, Technical Spec
- **Related**: [[#mmf-minimum-marketable-feature]], [[#task]], [[#validation]]

**Usage**: Created during Task planning phase before implementation. Referenced throughout development and validation. Required for Tasks introducing new architecture, APIs, or data models.

**Example**:
```
Task: [Task]-implement_user_authentication

Design Artifacts:
- docs/design/authentication-architecture.md (system design)
- docs/design/auth-api-contract.yaml (API specification)
- docs/design/user-session-data-model.md (database schema)

Implementation follows design artifacts, validation verifies implementation matches design.
```

**See also**: [[#design-first-development]], [[#task]], [[#validation-gate]]
```

```bash
# Step 3: Add to alphabetical index
# Insert in alphabetical position maintaining format

# Step 4: Update cross-references
# Add link TO new term in related entries:
# - Design-First Development → See also: [[#design-artifact]]
# - Task → See also: [[#design-artifact]]
# - Validation Gate → See also: [[#design-artifact]]

# Step 5: Commit and push
cd wiki
git add Project-Glossary.md
git commit -m "Add glossary term: Design Artifact

Added formal definition for Design Artifact term surfaced during learning loop.
Positioned in Process Concepts category with bidirectional links to related terms."
git push

cd {project_root}
git add wiki
git commit -m "Update wiki submodule: Design Artifact term added"
git push
```

**Expected Result**: Design Artifact term defined in glossary, accessible via category browsing and alphabetical index, cross-referenced with related terms, changes committed to both wiki and main repo.

### Example 2: Updating Term Definition (Clarification)

**Context**: User feedback indicates "Sub-Task" definition ambiguous regarding GitHub Sub-Issue relationship.

```bash
# Step 1: Document update rationale
# User clarified: "Sub-Tasks are PM concept; Sub-Issues are GitHub objects"
# Need to update glossary to reflect this distinction

# Step 2: Read current definition
cd {project_root}
```

```markdown
# Current definition (ambiguous):
### Sub-Task

**Definition**: Smallest execution detail beneath a Task, may be tracked as GitHub Sub-Issue.
...
```

```markdown
# Updated definition (clarified):
### Sub-Task

**Definition**: Smallest execution detail beneath a Task in PM hierarchy. PM concept (not GitHub object). May be tracked as GitHub Sub-Issue when significant enough to warrant platform tracking (10+ items, multi-session execution, programmatic queries, or multi-agent coordination).

**Category**: PM Hierarchy (Level 4)

**Relationships**:
- **Parent**: [[#task]]
- **Children**: None (leaf node)
- **GitHub Mapping**: May become Sub-Issue (GitHub object) if tracking warranted
- **Related**: [[#sub-issue]], [[#github-issue]]

**Usage**: Used to decompose Task into execution steps. Not all Sub-Tasks need GitHub tracking. Only create Sub-Issues for significant Sub-Tasks.

**Example**:
```
Task: [Task]-implement_authentication (GitHub Issue #45)
  Sub-Tasks (PM concept):
  - Design authentication flow (internal planning - no Sub-Issue)
  - Implement login endpoint (significant - tracked as Sub-Issue)
  - Implement logout endpoint (significant - tracked as Sub-Issue)
  - Write unit tests (significant - tracked as Sub-Issue)
  - Update API docs (internal - no Sub-Issue)

Result: 5 Sub-Tasks, 3 tracked as Sub-Issues
```

**See also**: [[#task]], [[#sub-issue]], [[#github-issue]], [[#mmf-minimum-marketable-feature]]
```

```bash
# Step 3: Use Edit tool to update definition

# Step 4: Validate cross-references
grep -o '\[\[#[a-z-]*\]\]' wiki/Project-Glossary.md | grep -i "sub-task\|sub-issue"
# Verify all links resolve

# Step 5: Commit with context
cd wiki
git add Project-Glossary.md
git commit -m "Clarify Sub-Task vs Sub-Issue distinction in glossary

Updated Sub-Task definition to clarify PM concept vs GitHub object distinction.
Added criteria for when Sub-Tasks warrant Sub-Issue tracking (significance threshold).
Expanded example showing 5 Sub-Tasks with only 3 tracked as Sub-Issues.

Context: User feedback highlighted ambiguity in Sub-Task/Sub-Issue usage."
git push

cd {project_root}
git add wiki
git commit -m "Update wiki submodule: Sub-Task definition clarified"
git push
```

**Expected Result**: Sub-Task definition clarified with explicit distinction from Sub-Issue, significance threshold documented, example expanded, changes committed with full context.

### Example 3: Quarterly Glossary Audit

**Context**: Quarterly maintenance to ensure completeness and consistency.

```bash
#!/bin/bash
# Quarterly glossary audit workflow

cd {project_root}

# Check 1: Verify all instruction files reference defined terms
echo "=== Checking instruction files for undefined terms ==="
# Extract terms from instruction files
grep -h "^\*\*" knowledge/instructions/**/*.instructions.md | \
  sed 's/\*\*//g' | sed 's/:.*$//' | sort -u > instruction_terms.txt

# Extract terms from glossary
grep "^### " wiki/Project-Glossary.md | sed 's/### //' | sort -u > glossary_terms.txt

# Find terms in instructions not in glossary
comm -23 instruction_terms.txt glossary_terms.txt > missing_terms.txt

echo "Found $(wc -l < missing_terms.txt) potentially undefined terms"

# Check 2: Verify cross-references resolve
echo "=== Validating cross-references ==="
grep -o '\[\[#[a-z-]*\]\]' wiki/Project-Glossary.md | \
  sed 's/\[\[#//' | sed 's/\]\]//' | sort -u > referenced_terms.txt

# Check if all referenced terms exist
while read ref; do
  if ! grep -q "^### $(echo $ref | sed 's/-/ /g')" wiki/Project-Glossary.md; then
    echo "Broken reference: [[#$ref]]"
  fi
done < referenced_terms.txt

# Check 3: Validate structure consistency
echo "=== Validating entry structure ==="
# Each term should have: Definition, Category, Relationships, Usage, Example, See also
grep "^### " wiki/Project-Glossary.md | while read term; do
  term_name=$(echo $term | sed 's/### //')

  # Check required sections exist after term
  if ! grep -A 30 "^### $term_name" wiki/Project-Glossary.md | grep -q "^\*\*Definition\*\*:"; then
    echo "Missing Definition: $term_name"
  fi
  if ! grep -A 30 "^### $term_name" wiki/Project-Glossary.md | grep -q "^\*\*Category\*\*:"; then
    echo "Missing Category: $term_name"
  fi
  # ... (similar checks for other required sections)
done

# Check 4: Generate audit report
echo "=== Audit Summary ===" > glossary_audit.txt
echo "Date: $(date)" >> glossary_audit.txt
echo "Total terms: $(grep -c '^### ' wiki/Project-Glossary.md)" >> glossary_audit.txt
echo "Missing terms: $(wc -l < missing_terms.txt)" >> glossary_audit.txt
echo "Broken references: $(grep -c 'Broken reference' glossary_audit.txt || echo 0)" >> glossary_audit.txt

cat glossary_audit.txt
```

**Expected Result**: Audit identifies missing terms, broken cross-references, and structural inconsistencies. Follow-up tasks created to address gaps.

---

## Validation Checklist

- [ ] Glossary repository validated (exists, up-to-date, accessible)
- [ ] Term validated as net-new (no duplicates or synonyms)
- [ ] Category assigned correctly (PM Hierarchy, GitHub Objects, Process Concepts, etc.)
- [ ] Definition clear and concise (1-2 sentences, unambiguous)
- [ ] Relationships documented (parent, children, related terms)
- [ ] Usage context provided (where/when term applies)
- [ ] Concrete example included (demonstrates term in practice)
- [ ] Cross-references added ("See also" links to related terms)
- [ ] Term added to category section (grouped with similar terms)
- [ ] Term added to alphabetical index (enables quick lookup)
- [ ] Related terms updated with bidirectional links (if applicable)
- [ ] All cross-reference links validated (resolve to existing terms)
- [ ] Changes committed with context-rich message (why change made)
- [ ] Wiki repository pushed to remote (changes visible)
- [ ] Main repo submodule reference updated (wiki submodule pointer current)
- [ ] Main repo pushed to remote (submodule update visible)

---

## Common Pitfalls

### Pitfall 1: Adding Term Without Category

- **Problem**: New term added with definition but no category assignment
- **Why it happens**: Focus on definition without considering taxonomy structure
- **Solution**: ALWAYS assign category; glossary is ontology foundation for knowledge graph
- **Example**: "Validation Gate" added without category - agents can't position term in taxonomy structure

### Pitfall 2: One-Location Entry (Category OR Index, Not Both)

- **Problem**: Term added to category section but not alphabetical index (or vice versa)
- **Why it happens**: Forgetting dual-access pattern (browse by category, lookup alphabetically)
- **Solution**: ALWAYS add to both locations; verify term appears in category section AND index
- **Example**: "Design Artifact" in Process Concepts section but not in alphabetical index - users searching alphabetically can't find term

### Pitfall 3: Missing Cross-References

- **Problem**: New term related to existing terms but "See also" links not created
- **Why it happens**: Focus on term definition without considering relationship web
- **Solution**: ALWAYS identify related terms; add bidirectional "See also" links
- **Example**: "Sub-Task" added but doesn't link to "Task" or "Sub-Issue" - agents can't navigate relationship structure

### Pitfall 4: Vague or Circular Definitions

- **Problem**: Definition uses term being defined or references undefined concepts
- **Why it happens**: Assuming reader understands context or related terminology
- **Solution**: Define term clearly without circular reference; link to related concepts
- **Example**: "Epic is a grouping of Tasks" without defining what Task means - reader needs to know Task first

### Pitfall 5: Forgetting Submodule Update

- **Problem**: Wiki changes committed and pushed but main repo submodule reference not updated
- **Why it happens**: Wiki is separate repository; easy to forget main repo tracks submodule pointer
- **Solution**: ALWAYS update main repo after wiki changes; two-step commit process
- **Example**: Glossary updated in wiki but main repo still points to old wiki commit - agents accessing via main repo see stale glossary

---

## Edge Cases

### Edge Case 1: Term Name Conflicts with Existing Term

**When**: Attempting to add new term but name conflicts with existing term in different category

**Approach**:
1. Check if terms are actually synonyms (same concept, different names)
2. If synonyms, update existing term with alternate names section
3. If distinct concepts, use qualified name (e.g., "Validation (Quality)" vs "Validation (GitHub)")
4. Document distinction clearly in definitions

**Example**: "Milestone" as PM concept vs "Milestone (GitHub)" as platform object - qualified names disambiguate.

### Edge Case 2: Term Relationship Evolves (Parent Changes)

**When**: Term's parent concept changes due to taxonomy restructuring

**Approach**:
1. Document restructuring rationale in Decision Archive
2. Update term's Relationships section with new parent
3. Update old parent's Children list (remove term)
4. Update new parent's Children list (add term)
5. Verify all cross-references still valid after restructure

**Example**: "Quality Gate" initially under "Process Concepts" moves to "Quality Concepts" after taxonomy refinement - update parent, children, category.

### Edge Case 3: Term Applies to Multiple Categories

**When**: Term relevant to multiple categories (e.g., spans Process Concepts and Quality Concepts)

**Approach**:
1. Assign primary category (where term most naturally fits)
2. Use "Related" field to link to terms in other categories
3. Consider if term should be split into category-specific variants
4. Document cross-category applicability in Usage section

**Example**: "Validation" applies to both Quality (quality gates) and GitHub (PR validation) - assign to Quality Concepts, link to GitHub-specific validation terms.

### Edge Case 4: Glossary Growing Beyond Single File

**When**: Glossary exceeds 1,000+ terms or 10,000+ lines (not currently, but plan ahead)

**Approach**:
1. Consider splitting by category (one file per category)
2. Create glossary index file linking to category files
3. Maintain alphabetical master index across all files
4. Update maintenance instructions for multi-file structure
5. Preserve single source of truth principle (no duplication)

**Example**: If glossary reaches 1,500 terms, split into Project-Glossary-PM-Hierarchy.md, Project-Glossary-Process-Concepts.md, etc., with Project-Glossary.md as navigation index.

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Cross-reference link broken | Term name changed or typo in anchor | Verify term exists; check anchor format `[[#term-name]]` with hyphens |
| Term not in alphabetical index | Forgot to add to index section | Add term to alphabetical index maintaining alphabetical order |
| Duplicate term definitions | Term added multiple times with slight name variations | Merge duplicates; choose canonical name; add alternate names section |
| Category assignment unclear | Term spans multiple categories | Assign primary category; document cross-category applicability in Usage |
| Wiki submodule not updating | Forgot to commit main repo after wiki push | Run `git add wiki && git commit && git push` in main repo |
| Merge conflict in glossary | Concurrent edits by multiple agents | Pull latest; resolve conflicts preserving both entries; maintain structure |
| Definition too vague | Insufficient context or circular reference | Rewrite with concrete language; link to prerequisite terms |

---

## Related Instructions

- **See also**: [Work Logging](./work_logging.instructions.md) - Work log entries may surface new terms requiring glossary documentation
- **See also**: [Wiki Workflow](../documentation/wiki_workflow.instructions.md) - Complete GitHub wiki workflow for committing and pushing glossary changes
- **See also**: [Knowledge Preservation Framework](../documentation/knowledge_preservation_framework.instructions.md) - Systematic knowledge capture including terminology documentation
- **See also**: [Task Epic Basics](./task_epic_basics.instructions.md) - PM terminology foundations referenced in glossary
- **Prerequisites**: [Wiki Workflow](../documentation/wiki_workflow.instructions.md) - Understanding wiki operations before maintaining glossary
- **Next steps**:
  - [Process Learning Capture](../process/process_learning_capture.instructions.md) - Learning loops surface new terms for glossary
  - [Milestone Governance](./milestone_governance.instructions.md) - Milestone completion may introduce new terminology

---

**Success Criteria**: Glossary maintained as authoritative source for PM terminology with complete entries (Definition, Category, Relationships, Usage, Example, See also), bidirectional cross-references, dual-access pattern (category + alphabetical), and immediate updates when new terms introduced.

**Confidence Check**: Can you explain why terms must appear in both category section and alphabetical index? Do you understand when to update cross-references bidirectionally? Can you articulate the difference between PM terminology and GitHub platform objects?
