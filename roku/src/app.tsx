import type { AnchorNodeDescriptor, AnchorNodeImplementation } from "@roku-sdk/rsg-ts"
import { defineAnchorNode, FieldType } from "@roku-sdk/rsg-ts"
import type { DomNode } from "@roku-sdk/interfaces"
import { createEffect, onMount } from "@roku-sdk/solid"
import { useLaunchConfig } from "@roku-sdk/runtime/launch-config"

import { deepLink, pressKey, setDeviceCaps, start } from "./bridge/start"

const descriptor: AnchorNodeDescriptor = {
    componentName: "MoonfinApp",
    extends: "Group" as const,
    inputFields: {
        deviceCaps: FieldType.String(),
        remoteKey: FieldType.String()
    },
    outputFields: {
        exitApp: FieldType.Boolean()
    }
}

type Key = { key: string, press: boolean, repeat: boolean, n: number }

// SolidTV draws into the mount group, over the video group, which holds the player's Video node. The
// tweens group holds the tween nodes that run its transitions.
const MoonfinApp: AnchorNodeImplementation<typeof descriptor> = (inputs, outputs) => {
    let video!: DomNode
    let mount!: DomNode
    let tweens!: DomNode
    // The scene sends its last keys with a count each, and only the new ones are pressed. A repeat in
    // the same batch as its key's release is dropped, so a stall doesn't run a scroll on. They're
    // pressed after this effect, because Solid holds back every update made inside one, and a key that
    // opens something and then focuses it would find it not drawn yet.
    let lastKey = 0
    createEffect(() => {
        const raw = inputs.remoteKey
        if (typeof raw !== "string" || !raw) return
        const fresh = (JSON.parse(raw) as Key[]).filter(k => k.n > lastKey)
        if (!fresh.length) return
        lastKey = fresh[fresh.length - 1].n
        queueMicrotask(() =>
            fresh.forEach((k, i) => {
                if (k.repeat && fresh.some((r, j) => j > i && r.key === k.key && !r.press)) return
                pressKey(k.key, k.press, k.repeat)
            })
        )
    })
    const { launchParams } = useLaunchConfig<{ contentId?: string, mediaType?: string }>()
    createEffect(() => deepLink(launchParams()))
    createEffect(() => {
        const caps = inputs.deviceCaps
        if (typeof caps === "string" && caps) setDeviceCaps(caps)
    })
    onMount(() => start(mount, tweens, video, () => outputs.exitApp(true)))
    return (
        <group>
            <group ref={video} />
            <group ref={mount} />
            <group ref={tweens} />
        </group>
    )
}

export default defineAnchorNode(descriptor, MoonfinApp)
