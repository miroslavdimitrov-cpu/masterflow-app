// Small shared UI state, kept separate to avoid circular imports between UI modules.
export const ui = { cur: 'chat', selP: null, busy: false, ri: 0 };
export const hooks = {}; // shell registers callbacks here (e.g. hooks.beforeSend)

export const RM = [
  'Herding my thoughts into a single file…',
  'Consulting the council of sticky notes…',
  "Sharpening pencils I don't even have…",
  'Asking your to-do list to behave…',
  'Doing math. Mostly arguing with myself.',
  'Persuading the must-win to reveal itself…',
  "Checking if Monday can be moved. It can't.",
];
