import { createComponent } from '@solidtv/solid'
import { defineRoutes } from '../../../../app/router.js'

// Lab builds only (VITE_LAB=1 npx vite build ...): /lab/<name> draws the control a <name>.lab.jsx
// next to this file sets up, as a page of its own, so it can be shot without a screen to hold it.
// Open one with window.__moonfin.router.to('/lab/<name>', data), and the lab gets data as props.
// Release builds never import this.
const labs = import.meta.glob('./*.lab.jsx', { eager: true })

const Lab = (props) => {
  const mod = labs[`./${props.name}.lab.jsx`]
  if (mod) return createComponent(mod.default, props)
  return (
    <text x={96} y={96} fontSize={32}>
      {'No lab named ' + props.name}
    </text>
  )
}

defineRoutes([{ path: '/lab/:name', component: Lab }])
