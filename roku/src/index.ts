import "./bridge/globals"
import "./compiled-components/MoonfinScene.xml"

import { main, registerAnchorNode } from "@roku-sdk/rsg-ts"

import MoonfinApp from "./app"

main(() => {
    registerAnchorNode(MoonfinApp)
})
