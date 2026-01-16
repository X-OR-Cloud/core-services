import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const QUEUE_NAME = 'workflow-executions';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

async function checkQueue() {
  console.log('==========================================');
  console.log('BullMQ Queue Inspector');
  console.log('==========================================');
  console.log(`Queue: ${QUEUE_NAME}`);
  console.log(`Redis: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log('');

  const queue = new Queue(QUEUE_NAME, {
    connection: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
  });

  try {
    // Get queue counts
    console.log('1. Queue Status:');
    console.log('----------------------------------------');
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();
    const delayed = await queue.getDelayedCount();

    console.log(`   Waiting: ${waiting}`);
    console.log(`   Active: ${active}`);
    console.log(`   Completed: ${completed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Delayed: ${delayed}`);
    console.log('');

    // Get waiting jobs
    if (waiting > 0) {
      console.log('2. Waiting Jobs (first 5):');
      console.log('----------------------------------------');
      const waitingJobs = await queue.getJobs(['wait'], 0, 4);
      for (const job of waitingJobs) {
        console.log(`   Job ID: ${job.id}`);
        console.log(`   Job Name: ${job.name}`);
        console.log(`   Job Data:`, JSON.stringify(job.data, null, 2));
        console.log(`   Created: ${new Date(job.timestamp).toISOString()}`);
        console.log('   ---');
      }
      console.log('');
    }

    // Get active jobs
    if (active > 0) {
      console.log('3. Active Jobs:');
      console.log('----------------------------------------');
      const activeJobs = await queue.getJobs(['active'], 0, 4);
      for (const job of activeJobs) {
        console.log(`   Job ID: ${job.id}`);
        console.log(`   Job Name: ${job.name}`);
        console.log(`   Job Data:`, JSON.stringify(job.data, null, 2));
        console.log('   ---');
      }
      console.log('');
    }

    // Get completed jobs
    if (completed > 0) {
      console.log('4. Completed Jobs (last 5):');
      console.log('----------------------------------------');
      const completedJobs = await queue.getJobs(['completed'], 0, 4);
      for (const job of completedJobs) {
        console.log(`   Job ID: ${job.id}`);
        console.log(`   Job Name: ${job.name}`);
        console.log(`   Finished: ${job.finishedOn ? new Date(job.finishedOn).toISOString() : 'N/A'}`);
        console.log('   ---');
      }
      console.log('');
    }

    // Get failed jobs
    if (failed > 0) {
      console.log('5. Failed Jobs (last 5):');
      console.log('----------------------------------------');
      const failedJobs = await queue.getJobs(['failed'], 0, 4);
      for (const job of failedJobs) {
        console.log(`   Job ID: ${job.id}`);
        console.log(`   Job Name: ${job.name}`);
        console.log(`   Failed Reason: ${job.failedReason}`);
        console.log(`   Stack Trace:`, job.stacktrace);
        console.log('   ---');
      }
      console.log('');
    }

    console.log('==========================================');
    console.log('Done!');
    console.log('==========================================');
  } catch (error) {
    console.error('Error checking queue:', error);
  } finally {
    await queue.close();
    process.exit(0);
  }
}

checkQueue();
