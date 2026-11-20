import appHtml from "./pages/app.html";
import appCss from "./client/app.css";
import appJs from "./client/app.js";
import apiJs from "./client/api.js";
import cardsJs from "./client/cards.js";
import clipperJs from "./client/clipper.js";
import copyJs from "./client/copy.js";
import micJs from "./client/mic.js";
import queueJs from "./client/queue.js";
import recorderWorkletJs from "./client/recorder-worklet.js";
import sessionJs from "./client/session.js";
import wavJs from "./client/wav.js";
import { createRouter } from "./router.js";
import { handleText, handleChunk, handleBudget } from "./pipeline.js";

export { MeralionGuard } from "./guard.js";

const client = {
  "app.js": appJs,
  "app.css": appCss,
  "api.js": apiJs,
  "cards.js": cardsJs,
  "clipper.js": clipperJs,
  "copy.js": copyJs,
  "mic.js": micJs,
  "queue.js": queueJs,
  "recorder-worklet.js": recorderWorkletJs,
  "session.js": sessionJs,
  "wav.js": wavJs,
};

export default createRouter({ app: appHtml, client }, { handleText, handleChunk, handleBudget });
