// ABOUTME: Knowledge graph storage — initializes and manages the research PDS
// ABOUTME: Wraps loxodonta-core's PDS for entity, mention, edge, and extraction records

import { join } from 'path';
import { homedir } from 'os';

// Import storage directly to avoid pulling in server dependencies (express, cors)
const { createPDS } = require('loxodonta-core-monorepo/packages/loxodonta-core/src/storage/index.js');

type PDS = ReturnType<typeof createPDS>;

let _pds: PDS | null = null;

export function createResearchPDS(dbPath?: string): PDS {
  const path = dbPath || join(homedir(), '.pullread', 'research.db');
  return createPDS({ db: path, did: 'did:web:pullread.local' });
}

export function getResearchPDS(): PDS {
  if (!_pds) {
    _pds = createResearchPDS();
  }
  return _pds;
}

export function closeResearchPDS(): void {
  if (_pds) {
    _pds.close();
    _pds = null;
  }
}
