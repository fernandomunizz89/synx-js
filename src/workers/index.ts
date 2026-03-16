// Dream Stack 2026 – Squad Factory
// Replaces the generic worker array with a squad of Domain Experts.
// The Dispatcher still runs first and routes each task to the right expert.
// Legacy workers are preserved on disk but are no longer registered here.

import { DispatcherWorker } from "./dispatcher.js";
import { SinxFrontExpert } from "./experts/sinx-front-expert.js";
import { SinxMobileExpert } from "./experts/sinx-mobile-expert.js";
import { SinxBackExpert } from "./experts/sinx-back-expert.js";
import { SinxQAEngineer } from "./experts/sinx-qa-engineer.js";
import { SinxSeoSpecialist } from "./experts/sinx-seo-specialist.js";

/** Domain-keyed squad map (Dispatcher → Expert → QA loop). */
export const workers = {
  dispatcher: new DispatcherWorker(),
  front: new SinxFrontExpert(),
  mobile: new SinxMobileExpert(),
  back: new SinxBackExpert(),
  qa: new SinxQAEngineer(),
  seo: new SinxSeoSpecialist(),
};

/** Flat list used by the daemon polling loop (start command). */
export const workerList = Object.values(workers);
