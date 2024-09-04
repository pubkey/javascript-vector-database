import './style.css';
import { createDatabase } from './database.js';
import { getVectorFromTextWithWorker } from './worker-scheduler.js';


async function run() {
    const db = await createDatabase();
    const foo = await getVectorFromTextWithWorker(['a', 'b']);
    console.dir({ foo });
}
run();
