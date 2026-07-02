/**
 * Cairn embedded-store barrel export.
 *
 * Downstream code (bootstrap, service-API, seed runner) imports the DB
 * surface from `src/main/db/` rather than reaching into sub-modules so a
 * later restructuring of the DB tree stays a local refactor.
 */
export {
  openDatabase,
  resolveDatabasePath,
  loadSqliteVec,
  type OpenDatabaseOptions,
} from './connection.js';
export {
  runMigrations,
  readDbSchemaVersion,
  NewerSchemaVersionError,
  type RunMigrationsOptions,
} from './migrations/runner.js';
export { MIGRATIONS, type Migration } from './migrations/index.js';
export {
  CODE_SCHEMA_VERSION,
  VECTOR_DIMENSION,
  VECTOR_BULK_UPSERT_CHUNK_SIZE,
  VEC_ITEMS_TABLE,
  VECTOR_METADATA_TABLE,
  DB_FILE_NAME,
  type RowMeta,
  type VectorEntityType,
} from './schema.js';
export * from './dao/index.js';
export { createFixtureDao } from './fixtures/fixture-dao.js';
