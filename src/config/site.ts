// Brand copy for the site. The name can be set at build time with VITE_SITE_NAME.

export const SITE = {
  name: (import.meta.env.VITE_SITE_NAME as string | undefined)?.trim() || 'BOMBASTIC',
  tagline: 'Har ghar mein ek pataka hai.',
  steps: ['Find hidden\npatakas', 'Light them\nvirtually', 'Collect\nDiwali memories'],
  enter: 'Enter the Mohalla',
};
