import { logger } from './logger';
import { run } from './run';

run().catch((err: unknown) => {
    logger.error(err, '❌ Failed to start server');
    process.exit(1);
});
