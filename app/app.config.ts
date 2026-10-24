export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'zinc'
    },
    button: {
      compoundVariants: [
        // Press feedback. The arbitrary transition list replaces the base transition-colors, which would otherwise
        // make tailwind-merge drop a plain transition-transform.
        { variant: 'solid', class: 'transition-[color,background-color,border-color,box-shadow,transform] duration-100 active:scale-[0.97] disabled:active:scale-100 aria-disabled:active:scale-100 motion-reduce:active:scale-100' }
      ]
    }
  }
})
