// Dream Stack 2026 – Squad Factory
// Replaces the generic worker array with a squad of Domain Experts.
// The Dispatcher still runs first and routes each task to the right expert.

import { DispatcherWorker } from "./dispatcher.js";
import { SynxFrontExpert } from "./experts/synx-front-expert.js";
import { SynxMobileExpert } from "./experts/synx-mobile-expert.js";
import { SynxBackExpert } from "./experts/synx-back-expert.js";
import { SynxQAEngineer } from "./experts/synx-qa-engineer.js";
import { SynxSeoSpecialist } from "./experts/synx-seo-specialist.js";

/** Domain-keyed squad map (Dispatcher → Expert → QA loop). */
export const workers = {
  dispatcher: new DispatcherWorker(),
  front: new SynxFrontExpert(),
  mobile: new SynxMobileExpert(),
  back: new SynxBackExpert(),
  qa: new SynxQAEngineer(),
  seo: new SynxSeoSpecialist(),
};

/** Flat list used by the daemon polling loop (start command). */
export const workerList = Object.values(workers);
