import 'dotenv/config';
import { createApp } from './app.js';
import { RecordingMethods } from './routes/api/routes.api/recordingRoutes/methods/recordingMethods.js';

const app = createApp();
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`lingolearn backend on :${port}`));

// Recordings whose learner or content was deleted since the last start: their
// rows went with it, their files did not.
RecordingMethods.sweepOrphans()
    .then((removed) => { if (removed > 0) console.log(`removed ${removed} orphaned recording file(s)`); })
    .catch((e) => console.error('could not sweep orphaned recordings:', e));
