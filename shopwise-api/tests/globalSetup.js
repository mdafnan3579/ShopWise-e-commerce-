import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

/**
 * Starts one in-memory MongoDB replica set for the whole test run (a replica set, not a
 * standalone server, so transactions work exactly as in production).
 *
 * @param {import('vitest/node').TestProject} project
 */
export async function setup(project) {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  project.provide('mongoUri', replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
}
