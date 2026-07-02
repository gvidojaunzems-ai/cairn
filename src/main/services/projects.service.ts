/**
 * `projects.*` service — project CRUD stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface ProjectsService {
  list(): CoreServiceResult<never>;
  create(input: { name: string }): CoreServiceResult<never>;
  remove(input: { projectId: string }): CoreServiceResult<never>;
}

export const projectsService: ProjectsService = {
  list: () => notImplementedResult('projects.list'),
  create: (_input) => notImplementedResult('projects.create'),
  remove: (_input) => notImplementedResult('projects.remove'),
};
