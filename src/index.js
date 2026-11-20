import appHtml from "./pages/app.html";
import appCss from "./client/app.css";
import appJs from "./client/app.js";
import apiJs from "./client/api.js";
import cardsJs from "./client/cards.js";
import copyJs from "./client/copy.js";
import queueJs from "./client/queue.js";
import { createRouter } from "./router.js";
import { handleText } from "./pipeline.js";

const client = {
  "app.js": appJs,
  "app.css": appCss,
  "api.js": apiJs,
  "cards.js": cardsJs,
  "copy.js": copyJs,
  "queue.js": queueJs,
};

export default createRouter({ app: appHtml, client }, { handleText });
