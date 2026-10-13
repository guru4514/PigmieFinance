import { ScheduledJobsService } from './scheduled-jobs.service';
import { ScheduledTasksService } from '../modules/jobs/scheduled-tasks.service';

it('keeps the legacy import on the active overdue implementation', () => {
  expect(ScheduledJobsService).toBe(ScheduledTasksService);
});
