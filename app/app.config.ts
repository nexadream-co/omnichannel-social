// Hook classes (app-card, app-fill, app-field, app-chip) restyle these variants inside the creator console only; see the
// "ink rail + paper desk" block in app/assets/css/main.css. Outside `.creator-app` they match nothing.
const field = { variants: { variant: { outline: 'app-field', subtle: 'app-field' } } }

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'zinc'
    },
    // The brand loader (app/assets/icons/loader.svg) everywhere Nuxt UI shows a loading state; main.css stops the spin.
    icons: {
      loading: 'i-socialz-loader'
    },
    button: {
      compoundVariants: [
        // Press feedback. The arbitrary transition list replaces the base transition-colors, which would otherwise
        // make tailwind-merge drop a plain transition-transform.
        { variant: 'solid', class: 'transition-[color,background-color,border-color,box-shadow,transform] duration-100 active:scale-[0.97] disabled:active:scale-100 aria-disabled:active:scale-100 motion-reduce:active:scale-100' },
        { variant: 'outline', class: 'app-fill' }
      ]
    },
    card: {
      variants: { variant: { outline: { root: 'app-card' }, subtle: { root: 'app-card' } } }
    },
    badge: { variants: { variant: { outline: 'app-chip', subtle: 'app-chip' } } },
    alert: { variants: { variant: { outline: { root: 'app-chip' }, subtle: { root: 'app-chip' } } } },
    input: field,
    textarea: field,
    select: field,
    selectMenu: field,
    inputMenu: field,
    inputNumber: field,
    inputTags: field
  }
})
