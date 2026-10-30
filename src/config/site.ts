// Brand copy for the site. The name can be set at build time with VITE_SITE_NAME.

export const SITE = {
  name: (import.meta.env.VITE_SITE_NAME as string | undefined)?.trim() || 'PATAK!',
  tagline: 'Har ghar mein ek pataka hai.',
  steps: ['Find 8 hidden patakas.', 'Light them virtually.', 'Collect your Diwali memories.'],
  enter: 'Enter the Mohalla',
};
