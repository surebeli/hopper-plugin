import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_INITIAL_CHUNK = 1024 * 1024;

export function createTailState(offset = 0) {
  return { offset, lastInode: null, lastSize: null };
}

export function createLogTailer({ hopperDir, suffix = '-output.log' } = {}) {
  const states = new Map();

  return {
    mark(id, offset) {
      const state = states.get(id) || createTailState();
      state.offset = offset;
      states.set(id, state);
    },
    readFrom(id, offset = 0) {
      const { chunk, state } = readTailChunk({
        hopperDir,
        id,
        offset,
        previous: states.get(id),
        suffix,
      });
      states.set(id, state);
      return chunk;
    },
    readNew(id) {
      const offset = states.get(id)?.offset ?? 0;
      return this.readFrom(id, offset);
    },
  };
}

export function createProgressTailer({ hopperDir } = {}) {
  return createLogTailer({ hopperDir, suffix: '-progress.log' });
}

function readTailChunk({ hopperDir, id, offset = 0, previous = null, suffix = '-output.log' } = {}) {
  if (!hopperDir || !isSafeTaskId(id)) {
    const chunk = emptyChunk(id, 0);
    return { chunk, state: createTailState(chunk.nextOffset) };
  }
  const path = join(hopperDir, 'handoffs', `${id}${suffix}`);
  if (!existsSync(path)) {
    const chunk = emptyChunk(id, 0);
    return { chunk, state: createTailState(chunk.nextOffset) };
  }

  const stat = statSync(path);
  let effectiveOffset = offset;
  if (previous) {
    if (stat.size < previous.lastSize) effectiveOffset = 0;
    if (previous.lastInode != null && stat.ino !== previous.lastInode) effectiveOffset = 0;
  }

  const chunk = readLogChunk({ hopperDir, id, offset: effectiveOffset, suffix });
  return {
    chunk,
    state: {
      offset: chunk.nextOffset,
      lastInode: stat.ino,
      lastSize: stat.size,
    },
  };
}

export function readLogChunk({ hopperDir, id, offset = 0, suffix = '-output.log' } = {}) {
  if (!hopperDir || !isSafeTaskId(id)) {
    return emptyChunk(id, 0);
  }
  const path = join(hopperDir, 'handoffs', `${id}${suffix}`);
  if (!existsSync(path)) return emptyChunk(id, 0);

  const size = statSync(path).size;
  const start = Number.isFinite(offset) && offset >= 0 && offset <= size ? Math.floor(offset) : 0;
  const requestedLength = size - start;
  const effectiveStart = requestedLength > MAX_INITIAL_CHUNK ? size - MAX_INITIAL_CHUNK : start;
  const length = size - effectiveStart;
  if (length <= 0) return emptyChunk(id, size);

  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.allocUnsafe(length);
    const bytesRead = readSync(fd, buffer, 0, length, effectiveStart);
    return {
      taskId: id,
      offset: effectiveStart,
      nextOffset: effectiveStart + bytesRead,
      chunk: buffer.subarray(0, bytesRead).toString('utf8'),
    };
  } finally {
    closeSync(fd);
  }
}

function emptyChunk(id, offset) {
  return { taskId: id, offset, nextOffset: offset, chunk: '' };
}

function isSafeTaskId(id) {
  return typeof id === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)
    && !id.includes('..');
}
