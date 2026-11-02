// Brand copy for the site. The name can be set at build time with VITE_SITE_NAME.

export const SITE = {
  name: (import.meta.env.VITE_SITE_NAME as string | undefined)?.trim() || 'Phataka Party',
  tagline: 'Har ghar mein ek pataka hai.',
  steps: ['Pick your\npatakas', 'Light them\nwith your hand', 'Collect\nDiwali memories'],
  enter: 'Enter the Mohalla',
};
