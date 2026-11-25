import { onMount } from 'solid-js'
import { Dynamic } from '@solidtv/solid'
import Dialog from '../../Dialog.jsx'
import Button from '../../Button.jsx'
import ButtonRow from '../../ButtonRow.jsx'
import OptionList from '../../OptionList.jsx'
import Spinner from '../../Spinner.jsx'
import Grid from '../../Grid.jsx'
import ProfileCarousel from '../../account/ProfileCarousel.jsx'
import PillRow from '../../account/PillRow.jsx'
import CoreDialog from '../CoreDialog.jsx'
import { getStore } from '../../../../state/store.js'

// /lab/controls draws one shared control from data: { what, props, nav }. `what` is dialog,
// button, buttons, options, spinner, grid, carousel, pills or core. The control takes focus, and
// window.__labNode is its node, with its methods. Back reaches App as usual. `nav: false` hides the
// nav.
const KINDS = { dialog: Dialog, button: Button, buttons: ButtonRow, options: OptionList, spinner: Spinner, grid: Grid, carousel: ProfileCarousel, pills: PillRow, core: CoreDialog }

export default function ControlsLab(props) {
  const store = getStore()
  if (props.nav === false) store.navVisible = false
  let node
  onMount(() => {
    window.__labNode = node
    if (node && node.setFocus) node.setFocus()
  })
  const events = {
    onDialog: (id) => (window.__labEvent = 'dialog:' + id),
    onButton: (id) => (window.__labEvent = 'button:' + id),
    onOption: (id) => (window.__labEvent = 'option:' + id),
    onGridSelect: (c, i) => (window.__labEvent = 'grid:' + i),
    onCarouselActivate: (item) => (window.__labEvent = 'carousel:' + item.key),
    onPill: (id) => (window.__labEvent = 'pill:' + id),
  }
  return (
    <view width={1920} height={1080}>
      <Dynamic component={KINDS[props.what] || Dialog} {...events} {...(props.props || {})} ref={(n) => (node = n)} />
    </view>
  )
}
