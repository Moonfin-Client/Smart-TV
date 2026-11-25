import $L from '../../services/i18n.js'
import { batch, createMemo, createSignal, onMount } from 'solid-js'
import LoginField from '../../ui/components/account/LoginField.jsx'
import Keyboard from '../../ui/components/Keyboard.jsx'
import { usesNativeKeyboard } from '../../ui/components/account/nativeInput.js'
import { cssStops, spacingFor, textWidth, themeDy, wrapLines } from '../../ui/components/account/look.js'
import { OverNav } from '../../ui/layers.jsx'
import { fontFor, normalLine, normalShift, textReady, uiFont } from '../../ui/text.js'
import { hex } from '../../ui/color.js'
import { shadowColor, theme } from '../../ui/theme.js'
import { afterPin, forgotPin, submitPin } from '../../state/shell/gate.js'
import { getStore } from '../../state/store.js'
import { getApiKey } from '../../services/jellyfinApi.js'
import { rememberSignInPin, signInPinRemembered } from '../../services/serverPinApi.js'
import { router } from '../../app/router.js'

// While the number pad is up the card moves to the top and the checkbox and buttons step aside,
// since the pad's own Done submits. The card draws in the overNav layer after the keyboard, so it
// stays lit above the pad's dimming, while the page keeps focus.
const NONE = '#00000000'
// Circle at the top, out to the farthest corner, over the theme's background as the page is.
const WASH = { ...cssStops([0x384a6e73, 0x020814f2], [0, 1]), w: 1445.4, h: 1445.4, pivot: [0.5, 0] }
const CARD_SHADOW = { color: shadowColor('#00000073'), x: 0, y: 24, blur: 50, spread: 0 }
const CARD_BORDER = { width: 1, color: hex('#ffffff29') }
const BUTTON_BORDER = { width: 1, color: hex('#ffffff33') }
const REMEMBER_BORDER = { width: 1, color: hex('#ffffff4d') }

export default function PinGate(props) {
  const [pin, setPin] = createSignal('')
  const [message, setMessage] = createSignal(props.error || '')
  const [focusId, setFocusId] = createSignal('input')
  const [keyboardOpen, setKeyboardOpen] = createSignal(false)
  // Whether a Silo profile's PIN is remembered on this device, or null where there's no such choice.
  const [remember, setRemember] = createSignal(null)
  const titleFont = uiFont('bold')
  const UNLOCK = $L('Unlock')
  const FORGOT = $L('Forgot PIN?')
  const REMEMBER = $L('Remember PIN on this device')
  const bodyFont = uiFont()
  const account = () => {
    const s = getStore()
    return { serverUrl: s.serverUrl, accessToken: getApiKey(), serverType: s.serverType, userId: s.userId }
  }
  let busy = false
  // Back out of the TV's own keyboard leaves nothing focused, so the next key only brings focus back
  // to the field.
  let dormant = false
  const wake = () => {
    const was = dormant
    dormant = false
    return was
  }
  let own
  let kb
  let field
  const [fontsIn, setFontsIn] = createSignal(false)
  onMount(() => {
    textReady().then(() => setFontsIn(true))
    signInPinRemembered(account()).then(setRemember)
  })
  // A theme's wider face wraps the lines at the card's 640px, and the buttons grow past 220 to fit
  // their labels.
  const lay = createMemo(() => {
    fontsIn()
    const sub = wrapLines($L('This profile is protected by a 4-digit PIN.'), 27.6, 'regular', 640).length * 33
    const msg = message() ? 12 + wrapLines(message(), 24, 'regular', 640).length * 33 : 0
    const fieldY = 1 + 32 + 33 + 10 + sub + 20
    const top = fieldY + 102.2 + msg
    const rememberY = top + 18
    const rememberIn = Math.max(38.4, normalLine(25.2, bodyFont))
    const rememberH = 2 + 28.8 + rememberIn
    const rememberW = 2 + 43.2 + 38.4 + 12 + textWidth(REMEMBER, 25.2, 'regular')
    const buttonsY = (remember() === null ? top : rememberY + rememberH) + 22
    const bh = 2 + 40.8 + normalLine(26.4, titleFont)
    const w = (label) => Math.max(220, textWidth(label, 26.4, 'bold') + 72 + 2)
    const unlockW = w(UNLOCK)
    const forgotW = w(FORGOT)
    const x = 33 + (640 - unlockW - 16 - forgotW) / 2
    const h = (keyboardOpen() ? top : buttonsY + bh) + 32 + 1
    return {
      fieldY, msgY: fieldY + 102.2 + 12, rememberY, rememberH, rememberW, rememberIn, buttonsY, bh, unlockW, forgotW,
      unlockX: x, forgotX: x + unlockW + 16, h,
    }
  })
  const cardH = () => lay().h
  const cardY = () => (keyboardOpen() ? 32 : (1080 - cardH()) / 2)

  const focusZone = () => {
    if (keyboardOpen()) kb.setFocus()
    else own.setFocus()
  }
  const onKeyboardChange = (text) => {
    setPin(String(text || '').replace(/\D/g, '').slice(0, 4))
    if (message()) setMessage('')
  }
  const unlock = async () => {
    if (busy) return
    busy = true
    const refused = await submitPin(pin())
    setPin('')
    if (!refused) {
      // Only the right PIN confirms the choice, which then keeps the proof it brought back or not.
      if (remember() !== null) await rememberSignInPin(account(), remember())
      await afterPin(router)
      return
    }
    busy = false
    batch(() => {
      setMessage(refused)
      setFocusId('input')
    })
  }
  const forgot = async () => {
    if (busy) return
    busy = true
    const outcome = await forgotPin()
    if (outcome.passed) {
      await afterPin(router)
      return
    }
    busy = false
    if (outcome.signIn) router.to('/login', {}, { inHistory: false })
    else setMessage(outcome.error || '')
  }
  const onKeyboardClose = (submitted) => {
    batch(() => {
      setKeyboardOpen(false)
      setFocusId('input')
    })
    own.setFocus()
    if (submitted) unlock()
  }
  // The TV's own keyboard, for Keyboard Style Native or a pick of it in the keyboard. It covers the
  // bottom like the pad, so the card moves up the same way.
  const openNative = () => {
    setKeyboardOpen(true)
    field.openNative({
      value: pin(),
      password: true,
      maxLength: 4,
      onChange: onKeyboardChange,
      onClose: (submitted, key) => {
        onKeyboardClose(submitted)
        dormant = !submitted && !key
      },
    })
  }
  const openKeyboard = () => {
    if (busy) return
    if (usesNativeKeyboard()) {
      openNative()
      return
    }
    setKeyboardOpen(true)
    kb.open({ value: pin(), purpose: 'numeric', password: true, maxLength: 4 })
    kb.setFocus()
  }
  // The Magic Remote's cursor focuses a control, and OK then presses it (app/pointer.js).
  const over = (id) => () => {
    if (!keyboardOpen() && focusId() !== id) setFocusId(id)
  }
  const button = (id, label, x, w, rest) => (
    <view x={x()} width={w()} height={lay().bh} onPointerOver={over(id)}>
      <view width={w()} height={lay().bh} borderRadius={12} color={focusId() === id ? '#4783fff2' : rest} border={BUTTON_BORDER} />
      <text
        fontFamily={titleFont}
        fontSize={26.4}
        lineHeight={30.9}
        x={w() / 2}
        y={23.37 + (lay().bh - 72.8) / 2 + themeDy(26.4, titleFont)}
        mountX={0.5}
        color="#ffffff"
        letterSpacing={spacingFor(titleFont)}
      >
        {label}
      </text>
    </view>
  )
  return (
    <view
      width={1920}
      height={1080}
      color={theme().background}
      radialGradient={WASH}
      forwardFocus={() => {
        focusZone()
        return true
      }}
      onUp={() => {
        if (wake()) return true
        const id = focusId()
        if (id === 'unlock' || id === 'forgot') setFocusId(remember() === null ? 'input' : 'remember')
        else if (id !== 'input') setFocusId('input')
        return true
      }}
      onDown={() => {
        if (wake()) return true
        const id = focusId()
        if (id === 'input' && remember() !== null) {
          setFocusId('remember')
          return true
        }
        // Down takes the button whose middle is nearest the field's or the checkbox's, Unlock on a
        // tie. A wider Forgot PIN? under a theme's face can win.
        if (id === 'input' || id === 'remember') {
          const L = lay()
          const from = id === 'input' ? 353 : 33 + L.rememberW / 2
          const off = (x, w) => Math.abs(x + w / 2 - from)
          setFocusId(off(L.forgotX, L.forgotW) < off(L.unlockX, L.unlockW) ? 'forgot' : 'unlock')
        }
        return true
      }}
      onLeft={() => {
        if (wake()) return true
        if (focusId() === 'forgot') setFocusId('unlock')
        return true
      }}
      onRight={() => {
        if (wake()) return true
        if (focusId() === 'unlock') setFocusId('forgot')
        return true
      }}
      onEnter={() => {
        if (wake()) return true
        if (focusId() === 'input') openKeyboard()
        else if (focusId() === 'remember') setRemember(!remember())
        else if (focusId() === 'unlock') unlock()
        else forgot()
        return true
      }}
      onBack={() => true}
    >
      <view ref={own} width={1} height={1} />
      <Keyboard
        ref={(n) => (kb = n)}
        overlay
        onKeyboardChange={onKeyboardChange}
        onKeyboardClose={onKeyboardClose}
        onKeyboardNative={() => {
          setKeyboardOpen(false)
          openNative()
        }}
      />
      <OverNav>
        <view x={607} y={cardY()} width={706} height={cardH()}>
          <view width={706} height={cardH()} borderRadius={20} color={NONE} shadow={CARD_SHADOW} />
          <view width={706} height={cardH()} borderRadius={20} color="#070e1ee6" border={CARD_BORDER} />
          <text
            fontFamily={titleFont}
            fontSize={48}
            lineHeight={33}
            x={33}
            y={37.41 + themeDy(48, titleFont)}
            color="#ffffff"
            letterSpacing={spacingFor(titleFont)}
          >
            {$L('Enter PIN')}
          </text>
          <text
            fontFamily={bodyFont}
            fontSize={27.6}
            lineHeight={33}
            x={33}
            y={78.53 + themeDy(27.6, bodyFont)}
            maxWidth={640}
            color="#ffffffc2"
            letterSpacing={spacingFor(bodyFont)}
          >
            {$L('This profile is protected by a 4-digit PIN.')}
          </text>
          <LoginField
            ref={(n) => (field = n)}
            look="pin"
            x={33}
            y={lay().fieldY}
            w={640}
            value={pin()}
            placeholder={$L('4 digits')}
            secret
            focused={focusId() === 'input'}
            onPointerOver={over('input')}
            editing={keyboardOpen()}
          />
          <text
            fontFamily={fontFor(message())}
            fontSize={24}
            lineHeight={33}
            x={33}
            y={lay().msgY + 2.2 + themeDy(24, fontFor(message()))}
            maxWidth={640}
            color="#ff9f9f"
            alpha={message() ? 1 : 0}
            letterSpacing={spacingFor(fontFor(message()))}
          >
            {message() || ' '}
          </text>
          <view x={33} y={lay().rememberY} alpha={remember() !== null && !keyboardOpen() ? 1 : 0} onPointerOver={over('remember')}>
            <view
              width={lay().rememberW}
              height={lay().rememberH}
              borderRadius={12}
              color="#ffffff1a"
              border={REMEMBER_BORDER}
              alpha={focusId() === 'remember' ? 1 : 0}
            />
            <view
              x={22.6}
              y={15.4 + (lay().rememberIn - 38.4) / 2}
              width={38.4}
              height={38.4}
              src={remember() ? 'icons/acc_checkBox.webp' : 'icons/acc_checkBoxBlank.webp'}
              color="#ffffffdb"
            />
            <text
              fontFamily={bodyFont}
              fontSize={25.2}
              lineHeight={1}
              x={73}
              y={15.4 + (lay().rememberIn - normalLine(25.2, bodyFont)) / 2 + normalShift(25.2, bodyFont)}
              color="#ffffffdb"
              letterSpacing={spacingFor(bodyFont)}
            >
              {REMEMBER}
            </text>
          </view>
          <view y={lay().buttonsY} alpha={keyboardOpen() ? 0 : 1}>
            {button('unlock', UNLOCK, () => lay().unlockX, () => lay().unlockW, '#2b6ae5e6')}
            {button('forgot', FORGOT, () => lay().forgotX, () => lay().forgotW, '#ffffff14')}
          </view>
        </view>
      </OverNav>
    </view>
  )
}
